// Agregaciones para el dashboard y los reportes. Funciones puras: reciben
// documentos ya leídos de Firestore y no inventan datos.
//
// Criterios:
// - Venta confirmada = documento de `sales` con status "vigente" (pedido pagado).
//   Las ventas anuladas se excluyen de ingresos y unidades.
// - La fecha de una venta es `paidAt` (momento en que se registró el pago).
// - Ingresos por productos = suma de subtotales (sin envío). El envío se informa aparte.
// - Beneficio estimado = ingresos de líneas con costo registrado − costo histórico de esas
//   líneas (congelado al registrar el pago). Las líneas sin costo quedan fuera y se cuentan.
import { toDate } from './format.js';
import { dayKey, monthKey, daysInRange, monthsInRange } from './dates.js';

export function confirmedSales(sales) {
  return sales.filter((sale) => sale.status === 'vigente');
}

export function salesSummary(sales) {
  const valid = confirmedSales(sales);
  const productRevenue = valid.reduce((sum, s) => sum + (s.subtotal ?? 0), 0);
  const shipping = valid.reduce((sum, s) => sum + (s.shippingCost ?? 0), 0);
  const total = valid.reduce((sum, s) => sum + (s.total ?? 0), 0);
  const units = valid.reduce((sum, s) => sum + (s.items ?? []).reduce((u, i) => u + i.quantity, 0), 0);
  return {
    count: valid.length,
    voidedCount: sales.length - valid.length,
    productRevenue,
    shipping,
    total,
    units,
    averageTicket: valid.length ? Math.round(total / valid.length) : 0,
  };
}

export function inRange(value, range) {
  const date = toDate(value);
  return Boolean(date) && date >= range.start && date < range.end;
}

export function salesInRange(sales, range) {
  return sales.filter((sale) => inRange(sale.paidAt, range));
}

// Serie diaria o mensual con ceros donde no hubo ventas.
export function salesSeries(sales, range, granularity = 'day') {
  const keyOf = granularity === 'month' ? (d) => monthKey(d) : (d) => dayKey(d);
  const keys = granularity === 'month' ? monthsInRange(range.fromKey, range.toKey) : daysInRange(range.fromKey, range.toKey);
  const buckets = new Map(keys.map((key) => [key, { key, total: 0, productRevenue: 0, count: 0, units: 0 }]));
  for (const sale of confirmedSales(sales)) {
    const date = toDate(sale.paidAt);
    if (!date) continue;
    const bucket = buckets.get(keyOf(date));
    if (!bucket) continue;
    bucket.total += sale.total ?? 0;
    bucket.productRevenue += sale.subtotal ?? 0;
    bucket.count += 1;
    bucket.units += (sale.items ?? []).reduce((u, i) => u + i.quantity, 0);
  }
  return [...buckets.values()];
}

export function topProducts(sales, { limit = 10, productId = null } = {}) {
  const byProduct = new Map();
  for (const sale of confirmedSales(sales)) {
    for (const item of sale.items ?? []) {
      if (productId && item.productId !== productId) continue;
      const entry = byProduct.get(item.productId) ?? { productId: item.productId, name: item.name, sku: item.sku, units: 0, revenue: 0 };
      entry.units += item.quantity;
      entry.revenue += item.lineTotal;
      byProduct.set(item.productId, entry);
    }
  }
  return [...byProduct.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit);
}

export function ordersByStatus(orders) {
  const counts = { pendiente: 0, confirmado: 0, pagado: 0, entregado: 0, cancelado: 0 };
  for (const order of orders) if (order.status in counts) counts[order.status] += 1;
  return counts;
}

export function profitEstimate(saleCosts) {
  const valid = saleCosts.filter((entry) => entry.status === 'vigente');
  const revenueWithKnownCost = valid.reduce((sum, e) => sum + (e.revenueWithKnownCost ?? 0), 0);
  const knownCost = valid.reduce((sum, e) => sum + (e.knownCost ?? 0), 0);
  const linesWithoutCost = valid.reduce((sum, e) => sum + (e.linesWithoutCost ?? 0), 0);
  return {
    revenueWithKnownCost,
    knownCost,
    grossProfit: revenueWithKnownCost - knownCost,
    margin: revenueWithKnownCost > 0 ? (revenueWithKnownCost - knownCost) / revenueWithKnownCost : null,
    linesWithoutCost,
  };
}

export function stockAlerts(products, settings, lowStockOf) {
  const out = [];
  const low = [];
  for (const product of products) {
    const stock = product.stock ?? 0;
    if (stock <= 0) out.push(product);
    else if (stock <= lowStockOf(product, settings)) low.push(product);
  }
  return { out, low };
}

// Restringe ventas a las líneas de un producto (para reportes por producto).
// Subtotal y total pasan a ser solo lo vendido de ese producto, sin envío.
export function restrictSalesToProduct(sales, productId) {
  if (!productId) return sales;
  return sales
    .map((sale) => {
      const items = (sale.items ?? []).filter((item) => item.productId === productId);
      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      return { ...sale, items, subtotal, shippingCost: 0, total: subtotal };
    })
    .filter((sale) => sale.items.length > 0);
}

// Beneficio estimado de un producto a partir de las líneas de saleCosts.
export function productProfit(saleCosts, productId) {
  let revenueWithKnownCost = 0;
  let knownCost = 0;
  let linesWithoutCost = 0;
  for (const entry of saleCosts) {
    if (entry.status !== 'vigente') continue;
    for (const item of entry.items ?? []) {
      if (item.productId !== productId) continue;
      if (item.unitCost === null || item.unitCost === undefined) linesWithoutCost += 1;
      else {
        knownCost += item.lineCost;
        revenueWithKnownCost += item.unitPrice * item.quantity;
      }
    }
  }
  return {
    revenueWithKnownCost,
    knownCost,
    grossProfit: revenueWithKnownCost - knownCost,
    margin: revenueWithKnownCost > 0 ? (revenueWithKnownCost - knownCost) / revenueWithKnownCost : null,
    linesWithoutCost,
  };
}

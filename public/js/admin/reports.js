// Reportes filtrables por fecha, producto y estado, con exportación CSV.
import { html, setHtml, icon, $ } from '../utils/html.js';
import { formatCLP, formatNumber, pluralize } from '../utils/format.js';
import {
  salesSummary,
  salesSeries,
  topProducts,
  ordersByStatus,
  profitEstimate,
  productProfit,
  restrictSalesToProduct,
  stockAlerts,
} from '../utils/analytics.js';
import { lowStockThreshold } from '../utils/stock.js';
import { ORDER_STATUS } from '../utils/status.js';
import { downloadCsv } from '../utils/csv.js';
import { listAllProducts } from '../services/catalog.js';
import { getSettings } from '../services/settings.js';
import { listSales, listSaleCosts } from '../services/sales.js';
import { listOrdersInRange } from '../services/orders.js';
import { friendlyError } from '../services/errors.js';
import { errorState, loadingState } from '../components/states.js';
import { initAdminPage } from './shell.js';
import { mountRangeFilter, rangeLabel } from './range-filter.js';
import { columnChart, hbarList } from './charts.js';

const { main, isAdmin } = await initAdminPage({ page: 'reportes', title: 'Reportes' });
const state = { range: null, productId: '', status: '', granularity: 'day', data: null };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
let stopChart = () => {};

setHtml(
  main,
  html`<div class="toolbar">
      <div class="toolbar" id="range"></div>
      <div class="field grow"><label for="f-product">Producto</label><select class="select" id="f-product"><option value="">Todos los productos</option></select></div>
      <div class="field"><label for="f-status">Estado de pedidos</label><select class="select" id="f-status"><option value="">Todos</option>${Object.entries(ORDER_STATUS).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div>
      <div class="field"><span class="field-label" id="gran-label">Agrupar ventas por</span>
        <div class="segmented" role="group" aria-labelledby="gran-label"><button type="button" data-gran="day" aria-pressed="true">Día</button><button type="button" data-gran="month" aria-pressed="false">Mes</button></div></div>
    </div>
    <p class="inline-alert is-info">${icon('info')} <span>Ventas e ingresos consideran solo <strong>ventas vigentes</strong> (pedidos pagados, fecha = fecha de pago). Los pedidos pendientes o confirmados no son ingresos. Fechas en hora de Chile.</span></p>
    <div id="report">${loadingState('Calculando reportes…')}</div>`,
);

function label(key, granularity) {
  return granularity === 'month' ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : `${key.slice(8)}-${key.slice(5, 7)}-${key.slice(0, 4)}`;
}

function csvButton(id, text = 'CSV') {
  return html`<button type="button" class="btn btn-sm btn-secondary" data-csv="${id}">${icon('download')} ${text}</button>`;
}

function render() {
  const { sales, costs, orders, products, settings } = state.data;
  const productSales = restrictSalesToProduct(sales, state.productId);
  const summary = salesSummary(productSales);
  const series = salesSeries(productSales, state.range, state.granularity);
  const top = topProducts(sales, { limit: 15, productId: state.productId || null });
  const ordersFiltered = orders.filter((o) => (!state.status || o.status === state.status) && (!state.productId || o.items.some((i) => i.productId === state.productId)));
  const statusCounts = ordersByStatus(ordersFiltered);
  const profit = isAdmin ? (state.productId ? productProfit(costs, state.productId) : profitEstimate(costs)) : null;
  const alerts = stockAlerts(products.filter((p) => p.active), settings, lowStockThreshold);
  const restock = [...alerts.out, ...alerts.low];
  const product = products.find((p) => p.id === state.productId);
  state.computed = { series, top, ordersFiltered, restock };

  setHtml(
    $('#report'),
    html`<section class="kpi-grid" aria-label="Ingresos del período">
        <div class="kpi is-hero"><span class="kpi-label">${icon('payments')} Ingresos confirmados${product ? ` de ${product.name}` : ''}</span><span class="kpi-value">${formatCLP(summary.total)}</span><span class="kpi-sub">${rangeLabel(state.range)}</span></div>
        <div class="kpi tone-menta"><span class="kpi-label">${icon('sell')} Por productos</span><span class="kpi-value">${formatCLP(summary.productRevenue)}</span><span class="kpi-sub">${product ? 'Sin envíos' : `Envíos cobrados: ${formatCLP(summary.shipping)}`}</span></div>
        <div class="kpi tone-lavanda"><span class="kpi-label">${icon('inventory_2')} Unidades vendidas</span><span class="kpi-value">${formatNumber(summary.units)}</span><span class="kpi-sub">${pluralize(summary.count, 'venta')}</span></div>
        ${profit
          ? html`<div class="kpi tone-ambar"><span class="kpi-label">${icon('savings')} Beneficio bruto estimado</span><span class="kpi-value">${formatCLP(profit.grossProfit)}</span>
              <span class="kpi-sub">${profit.margin === null ? 'Sin costos registrados en estas ventas' : `Margen ${Math.round(profit.margin * 100)}% sobre ${formatCLP(profit.revenueWithKnownCost)}`}</span></div>`
          : ''}
      </section>
      ${profit
        ? html`<details class="panel"><summary class="panel-body" style="cursor:pointer;font-weight:700">${icon('help')} ¿Cómo se calcula el beneficio estimado?</summary>
            <div class="panel-body" style="display:grid;gap:.5rem">
              <p>Beneficio bruto = ingresos por productos de las líneas con costo registrado − costo de adquisición de esas mismas líneas.</p>
              <p>El costo es <strong>histórico</strong>: se congela el costo vigente del producto en el momento en que se registró el pago. Cambiar el costo después no altera ventas pasadas.</p>
              <p>No incluye envíos, comisiones, empaque ni otros gastos, porque no están registrados en el sistema. No es la ganancia neta.</p>
              ${profit.linesWithoutCost > 0 ? html`<p class="inline-alert">${icon('warning')} ${pluralize(profit.linesWithoutCost, 'línea')} de venta no tiene costo registrado y quedó fuera del cálculo.</p>` : ''}
            </div></details>`
        : ''}

      <section class="panel" aria-labelledby="series-title">
        <div class="panel-head"><div><h2 id="series-title">Ventas por ${state.granularity === 'month' ? 'mes' : 'día'}</h2><p>${product ? product.name : 'Todos los productos'}</p></div>${csvButton('series')}</div>
        <div class="panel-body">
          <div id="series-chart"></div>
          <div class="table-wrap" style="margin-top:1rem"><table class="table">
            <caption class="sr-only">Ventas por período</caption>
            <thead><tr><th scope="col">${state.granularity === 'month' ? 'Mes' : 'Día'}</th><th scope="col" class="num">Ventas</th><th scope="col" class="num">Unidades</th><th scope="col" class="num">Productos</th><th scope="col" class="num">Total</th></tr></thead>
            <tbody>${series.filter((s) => s.count > 0).map((s) => html`<tr><td>${label(s.key, state.granularity)}</td><td class="num">${s.count}</td><td class="num">${s.units}</td><td class="num">${formatCLP(s.productRevenue)}</td><td class="num">${formatCLP(s.total)}</td></tr>`)}
              ${series.every((s) => s.count === 0) ? html`<tr><td colspan="5" class="text-muted">Sin ventas confirmadas en el período.</td></tr>` : ''}</tbody>
          </table></div>
        </div>
      </section>

      <div class="grid-2 even">
        <section class="panel" aria-labelledby="top-title">
          <div class="panel-head"><h2 id="top-title">Productos con mayores ventas</h2>${csvButton('top')}</div>
          <div class="panel-body">${top.length
            ? html`${hbarList(top.map((t) => ({ label: t.name, value: t.units })), { formatValue: (v) => pluralize(v, 'unidad', 'unidades') })}
                <div class="table-wrap" style="margin-top:1rem"><table class="table"><thead><tr><th scope="col">Producto</th><th scope="col" class="num">Unidades</th><th scope="col" class="num">Ingresos</th></tr></thead>
                <tbody>${top.map((t) => html`<tr><td>${t.name}<br /><small class="text-muted">${t.sku}</small></td><td class="num">${t.units}</td><td class="num">${formatCLP(t.revenue)}</td></tr>`)}</tbody></table></div>`
            : html`<p class="text-muted">Sin ventas confirmadas en el período.</p>`}</div>
        </section>
        <section class="panel" aria-labelledby="status-title">
          <div class="panel-head"><div><h2 id="status-title">Pedidos por estado</h2><p>Pedidos creados en el período${state.status ? ` (${ORDER_STATUS[state.status].label})` : ''}</p></div>${csvButton('orders')}</div>
          <div class="panel-body">${ordersFiltered.length
            ? hbarList(Object.entries(statusCounts).map(([status, value]) => ({ label: ORDER_STATUS[status].label, value, status })), { formatValue: formatNumber, className: (i) => `st-${i.status}` })
            : html`<p class="text-muted">No hay pedidos con estos filtros.</p>`}</div>
        </section>
      </div>

      <div class="grid-2 even">
        <section class="panel" aria-labelledby="restock-title">
          <div class="panel-head"><div><h2 id="restock-title">Productos que requieren reposición</h2><p>Publicados con stock en o bajo su umbral</p></div>${csvButton('restock')}</div>
          <div class="panel-body flush">${restock.length
            ? html`<div class="table-wrap"><table class="table responsive"><thead><tr><th scope="col">Producto</th><th scope="col" class="num">Stock</th><th scope="col" class="num">Umbral</th></tr></thead>
                <tbody>${restock.map((p) => html`<tr><td class="cell-main"><strong>${p.name}</strong><small>${p.sku}</small></td><td data-label="Stock" class="num">${p.stock <= 0 ? html`<span class="badge badge-danger">${icon('block')} 0</span>` : p.stock}</td><td data-label="Umbral" class="num">${lowStockThreshold(p, settings)}</td></tr>`)}</tbody></table></div>`
            : html`<p class="panel-body text-muted">${icon('check_circle')} Ningún producto publicado requiere reposición.</p>`}</div>
        </section>
        <section class="panel" aria-labelledby="stock-title">
          <div class="panel-head"><div><h2 id="stock-title">Existencias actuales</h2><p>${formatNumber(products.reduce((s, p) => s + Math.max(0, p.stock ?? 0), 0))} unidades en ${formatNumber(products.length)} productos</p></div>${csvButton('stock')}</div>
          <div class="panel-body"><p class="text-muted">Descarga el CSV para ver el stock de todos los productos, publicados o no.</p>
            <a class="btn btn-sm btn-ghost" href="/admin/inventario.html">${icon('warehouse')} Ir a inventario</a></div>
        </section>
      </div>`,
  );
  stopChart();
  stopChart = columnChart(
    $('#series-chart'),
    series.map((s) => ({ label: label(s.key, state.granularity), short: state.granularity === 'month' ? MONTHS[Number(s.key.slice(5, 7)) - 1] : String(Number(s.key.slice(8))), value: s.total, detail: pluralize(s.count, 'venta') })),
    { formatValue: formatCLP, ariaLabel: `Ventas confirmadas por ${state.granularity === 'month' ? 'mes' : 'día'}` },
  );
}

async function load(range) {
  state.range = range;
  setHtml($('#report'), loadingState('Calculando reportes…'));
  try {
    const [{ sales }, { orders }, products, settings, costs] = await Promise.all([
      listSales(range),
      listOrdersInRange(range),
      listAllProducts(),
      getSettings({ fresh: true }),
      isAdmin ? listSaleCosts(range).then((r) => r.costs) : Promise.resolve([]),
    ]);
    state.data = { sales, orders, products, settings, costs };
    const select = $('#f-product');
    if (select.options.length <= 1) {
      setHtml(select, html`<option value="">Todos los productos</option>${[...products].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => html`<option value="${p.id}">${p.name} (${p.sku})</option>`)}`);
      select.value = state.productId;
    }
    render();
  } catch (error) {
    setHtml($('#report'), errorState({ text: friendlyError(error) }));
  }
}

function exportCsv(kind) {
  const { products, settings } = state.data;
  const { series, top, ordersFiltered, restock } = state.computed;
  const suffix = `${state.range.fromKey}-a-${state.range.toKey}`;
  const exports = {
    series: () => downloadCsv(`ventas-por-${state.granularity === 'month' ? 'mes' : 'dia'}-${suffix}.csv`, [
      { label: state.granularity === 'month' ? 'Mes' : 'Día', value: (s) => s.key },
      { label: 'Ventas', value: (s) => s.count },
      { label: 'Unidades', value: (s) => s.units },
      { label: 'Ingresos por productos', value: (s) => s.productRevenue },
      { label: 'Total cobrado', value: (s) => s.total },
    ], series),
    top: () => downloadCsv(`productos-mas-vendidos-${suffix}.csv`, [
      { label: 'SKU', value: (t) => t.sku },
      { label: 'Producto', value: (t) => t.name },
      { label: 'Unidades', value: (t) => t.units },
      { label: 'Ingresos', value: (t) => t.revenue },
    ], top),
    orders: () => downloadCsv(`pedidos-por-estado-${suffix}.csv`, [
      { label: 'Pedido', value: (o) => o.orderNumber },
      { label: 'Estado', value: (o) => ORDER_STATUS[o.status]?.label ?? o.status },
      { label: 'Total', value: (o) => o.total },
      { label: 'Unidades', value: (o) => o.itemCount },
    ], ordersFiltered),
    restock: () => downloadCsv('productos-por-reponer.csv', [
      { label: 'SKU', value: (p) => p.sku },
      { label: 'Producto', value: (p) => p.name },
      { label: 'Stock', value: (p) => p.stock },
      { label: 'Umbral', value: (p) => lowStockThreshold(p, settings) },
    ], restock),
    stock: () => downloadCsv('existencias-actuales.csv', [
      { label: 'SKU', value: (p) => p.sku },
      { label: 'Producto', value: (p) => p.name },
      { label: 'Publicado', value: (p) => (p.active ? 'Sí' : 'No') },
      { label: 'Stock', value: (p) => p.stock },
      { label: 'Umbral', value: (p) => lowStockThreshold(p, settings) },
      { label: 'Precio', value: (p) => p.price },
    ], [...products].sort((a, b) => a.name.localeCompare(b.name, 'es'))),
  };
  exports[kind]?.();
}

main.addEventListener('click', (event) => {
  const csv = event.target.closest('[data-csv]');
  if (csv) return exportCsv(csv.dataset.csv);
  const gran = event.target.closest('[data-gran]');
  if (gran) {
    state.granularity = gran.dataset.gran;
    main.querySelectorAll('[data-gran]').forEach((b) => b.setAttribute('aria-pressed', String(b === gran)));
    if (state.data) render();
  }
});
$('#f-product').addEventListener('change', (event) => {
  state.productId = event.target.value;
  render();
});
$('#f-status').addEventListener('change', (event) => {
  state.status = event.target.value;
  render();
});

const filter = mountRangeFilter($('#range'), { initial: 'mes', onChange: (range) => load(range) });
load(filter.getRange());

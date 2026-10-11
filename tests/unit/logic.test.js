import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as clientPricing from '../../public/js/utils/pricing.js';
import * as serverPricing from '../../functions/src/pricing.js';
import { TRANSITIONS as clientTransitions, allowedTransitions } from '../../public/js/utils/status.js';
import { TRANSITIONS as serverTransitions, assertTransition, parseOrderInput } from '../../functions/src/orders.js';
import { CHILE_REGIONS as clientRegions, rules, validate, parseMoney } from '../../public/js/utils/validation.js';
import { CHILE_REGIONS as serverRegions, cleanPhone, cleanEmail, cleanText } from '../../functions/src/validation.js';
import { formatCLP, discountPercent, normalizeText, instagramUrl, whatsappUrl } from '../../public/js/utils/format.js';
import { startOfDay, dayKey, rangeFromKeys, presetRange, daysInRange, monthsInRange } from '../../public/js/utils/dates.js';
import { toCsv } from '../../public/js/utils/csv.js';
import { escapeHtml, html, safeUrl } from '../../public/js/utils/html.js';
import { stockLevel, availabilityLabel } from '../../public/js/utils/stock.js';
import {
  salesSummary,
  salesSeries,
  topProducts,
  ordersByStatus,
  profitEstimate,
  productProfit,
  restrictSalesToProduct,
} from '../../public/js/utils/analytics.js';
import { reconcileCart } from '../../public/js/store/cart-view.js';

const settings = { freeShippingThreshold: 45000 };
const despacho = { cost: 3990, freeShippingEligible: true };
const retiro = { cost: 0, freeShippingEligible: false };

describe('precios y envío', () => {
  it('la vista del navegador calcula lo mismo que la Cloud Function', () => {
    const cases = [
      { lines: [{ unitPrice: 16900, quantity: 1 }], method: despacho },
      { lines: [{ unitPrice: 16900, quantity: 2 }, { unitPrice: 8500, quantity: 1 }], method: despacho },
      { lines: [{ unitPrice: 45000, quantity: 1 }], method: despacho },
      { lines: [{ unitPrice: 44999, quantity: 1 }], method: despacho },
      { lines: [{ unitPrice: 50000, quantity: 1 }], method: retiro },
    ];
    for (const { lines, method } of cases) {
      assert.deepEqual(clientPricing.computeTotals(lines, settings, method), serverPricing.computeTotals(lines, settings, method));
    }
  });

  it('el envío es gratis solo desde el umbral y en métodos elegibles', () => {
    assert.equal(serverPricing.computeShippingCost(settings, despacho, 44999), 3990);
    assert.equal(serverPricing.computeShippingCost(settings, despacho, 45000), 0);
    assert.equal(serverPricing.computeShippingCost({ freeShippingThreshold: null }, despacho, 99999), 3990);
    assert.equal(serverPricing.computeShippingCost(settings, { cost: 2500, freeShippingEligible: false }, 99999), 2500);
    assert.equal(clientPricing.freeShippingGap(settings, 30000), 15000);
    assert.equal(clientPricing.freeShippingGap({ freeShippingThreshold: null }, 30000), null);
  });

  it('formatea pesos chilenos sin decimales y calcula descuentos coherentes', () => {
    assert.equal(formatCLP(16900), '$16.900');
    assert.equal(formatCLP(1234567), '$1.234.567');
    assert.equal(formatCLP(0), '$0');
    assert.equal(discountPercent(16900, 19900), 15);
    assert.equal(discountPercent(16900, 16900), 0);
    assert.equal(discountPercent(16900, null), 0);
    assert.equal(parseMoney('$16.900'), 16900);
    assert.ok(Number.isNaN(parseMoney('16,5')));
  });
});

describe('estados de pedido', () => {
  it('las transiciones del navegador y del servidor son idénticas', () => {
    assert.deepEqual(clientTransitions, JSON.parse(JSON.stringify(serverTransitions)));
  });

  it('solo administración ve la opción de cancelar un pedido pagado', () => {
    assert.deepEqual(allowedTransitions('pagado', 'encargado'), ['entregado']);
    assert.deepEqual(allowedTransitions('pagado', 'admin'), ['entregado', 'cancelado']);
    assert.deepEqual(allowedTransitions('entregado', 'admin'), []);
    assert.throws(() => assertTransition('cancelado', 'pagado', 'admin'), /no puede pasar/);
    assert.throws(() => assertTransition('pendiente', 'pagado', 'sistema'), /no permitida/);
    assert.doesNotThrow(() => assertTransition('pendiente', 'cancelado', 'sistema'));
  });
});

describe('validaciones', () => {
  it('las regiones de Chile coinciden en ambos lados', () => {
    assert.deepEqual(clientRegions, serverRegions);
    assert.equal(clientRegions.length, 16);
  });

  it('valida correo, teléfono y textos en el servidor', () => {
    assert.equal(cleanEmail('  Camila@Correo.CL '), 'camila@correo.cl');
    assert.throws(() => cleanEmail('camila@'), /correo/);
    assert.equal(cleanPhone('+56 9 1234 5678'), '+56 9 1234 5678');
    assert.throws(() => cleanPhone('123'), /teléfono/);
    assert.throws(() => cleanPhone('+56 9 abcd 5678'), /teléfono/);
    assert.equal(cleanText('  hola   mundo ', { field: 'x', label: 'X', max: 20 }), 'hola mundo');
    assert.throws(() => cleanText('a'.repeat(21), { field: 'x', label: 'X', max: 20 }), /no puede superar/);
  });

  it('parseOrderInput rechaza cantidades negativas, decimales y carritos vacíos, y une líneas repetidas', () => {
    const base = {
      requestId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      customer: { name: 'Ana', email: 'ana@correo.cl', phone: '+56912345678' },
      delivery: { methodId: 'retiro' },
      paymentMethodId: 'transferencia',
      expectedTotal: 0,
    };
    assert.throws(() => parseOrderInput({ ...base, items: [] }), /vacío/);
    assert.throws(() => parseOrderInput({ ...base, items: [{ productId: 'a', quantity: -1 }] }), /mayor o igual a 1/);
    assert.throws(() => parseOrderInput({ ...base, items: [{ productId: 'a', quantity: 1.5 }] }), /entero/);
    assert.throws(() => parseOrderInput({ ...base, requestId: 'no-uuid', items: [{ productId: 'a', quantity: 1 }] }), /identificador/);
    const parsed = parseOrderInput({ ...base, items: [{ productId: 'a', quantity: 2 }, { productId: 'a', quantity: 3 }] });
    assert.deepEqual(parsed.lines, [{ productId: 'a', quantity: 5, options: {} }]);
  });

  it('las reglas de formularios del navegador devuelven mensajes en español', () => {
    const errors = validate(
      { name: '', email: 'x', phone: '12', qty: '2.5' },
      {
        name: [rules.required('El nombre')],
        email: [rules.email()],
        phone: [rules.phone()],
        qty: [rules.integer('La cantidad', { min: 1 })],
      },
    );
    assert.equal(errors.name, 'El nombre es obligatorio.');
    assert.equal(errors.email, 'Ingresa un correo electrónico válido.');
    assert.match(errors.phone, /teléfono válido/);
    assert.match(errors.qty, /número entero/);
  });
});

describe('fechas en hora de Chile', () => {
  it('el inicio del día respeta el horario de invierno y de verano', () => {
    // Invierno (UTC-4) y verano (UTC-3).
    assert.equal(startOfDay('2026-07-15').toISOString(), '2026-07-15T04:00:00.000Z');
    assert.equal(startOfDay('2026-01-15').toISOString(), '2026-01-15T03:00:00.000Z');
  });

  it('cada instante pertenece a un único día local, también en los cambios de horario', () => {
    for (const key of ['2026-04-04', '2026-04-05', '2026-09-05', '2026-09-06', '2026-09-07']) {
      const start = startOfDay(key);
      assert.equal(dayKey(start), key, `inicio de ${key}`);
      assert.notEqual(dayKey(new Date(start.getTime() - 1)), key, `instante anterior a ${key}`);
    }
  });

  it('los rangos son semiabiertos y cubren días completos', () => {
    const range = rangeFromKeys('2026-10-01', '2026-10-03');
    assert.equal(dayKey(range.start), '2026-10-01');
    assert.equal(dayKey(new Date(range.end.getTime() - 1)), '2026-10-03');
    assert.equal(dayKey(range.end), '2026-10-04');
    assert.deepEqual(daysInRange('2026-02-27', '2026-03-02'), ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    assert.deepEqual(monthsInRange('2026-11-15', '2027-01-03'), ['2026-11', '2026-12', '2027-01']);
    const month = presetRange('mes', new Date('2026-10-11T15:00:00Z'));
    assert.equal(month.fromKey, '2026-10-01');
    assert.equal(month.toKey, '2026-10-11');
  });
});

describe('reportes', () => {
  const ts = (iso) => ({ toDate: () => new Date(iso) });
  const sales = [
    { status: 'vigente', paidAt: ts('2026-10-01T15:00:00Z'), subtotal: 20000, shippingCost: 3990, total: 23990, items: [{ productId: 'a', name: 'A', sku: 'A', quantity: 2, lineTotal: 20000 }] },
    { status: 'vigente', paidAt: ts('2026-10-02T15:00:00Z'), subtotal: 8500, shippingCost: 0, total: 8500, items: [{ productId: 'b', name: 'B', sku: 'B', quantity: 1, lineTotal: 8500 }] },
    { status: 'anulada', paidAt: ts('2026-10-02T16:00:00Z'), subtotal: 99999, shippingCost: 0, total: 99999, items: [{ productId: 'a', name: 'A', sku: 'A', quantity: 9, lineTotal: 99999 }] },
  ];

  it('solo las ventas vigentes suman ingresos y unidades', () => {
    const summary = salesSummary(sales);
    assert.deepEqual(
      { count: summary.count, voided: summary.voidedCount, total: summary.total, products: summary.productRevenue, units: summary.units },
      { count: 2, voided: 1, total: 32490, products: 28500, units: 3 },
    );
  });

  it('la serie diaria rellena con ceros y usa la fecha de pago', () => {
    const series = salesSeries(sales, rangeFromKeys('2026-09-30', '2026-10-02'));
    assert.deepEqual(series.map((s) => [s.key, s.total]), [['2026-09-30', 0], ['2026-10-01', 23990], ['2026-10-02', 8500]]);
  });

  it('ranking de productos y filtro por producto', () => {
    assert.deepEqual(topProducts(sales).map((t) => [t.productId, t.units]), [['a', 2], ['b', 1]]);
    const onlyA = restrictSalesToProduct(sales, 'a');
    assert.equal(salesSummary(onlyA).total, 20000);
  });

  it('el beneficio usa solo líneas con costo histórico y no inventa gastos', () => {
    const costs = [
      { status: 'vigente', knownCost: 9000, revenueWithKnownCost: 20000, linesWithoutCost: 0, items: [{ productId: 'a', quantity: 2, unitPrice: 10000, unitCost: 4500, lineCost: 9000 }] },
      { status: 'vigente', knownCost: 0, revenueWithKnownCost: 0, linesWithoutCost: 1, items: [{ productId: 'b', quantity: 1, unitPrice: 8500, unitCost: null, lineCost: null }] },
      { status: 'anulada', knownCost: 500, revenueWithKnownCost: 900, linesWithoutCost: 0, items: [] },
    ];
    assert.deepEqual(profitEstimate(costs), { revenueWithKnownCost: 20000, knownCost: 9000, grossProfit: 11000, margin: 0.55, linesWithoutCost: 1 });
    assert.equal(productProfit(costs, 'b').margin, null);
    assert.equal(productProfit(costs, 'b').linesWithoutCost, 1);
  });

  it('cuenta pedidos por estado', () => {
    assert.deepEqual(ordersByStatus([{ status: 'pendiente' }, { status: 'pagado' }, { status: 'pendiente' }]), {
      pendiente: 2, confirmado: 0, pagado: 1, entregado: 0, cancelado: 0,
    });
  });
});

describe('carrito', () => {
  const products = new Map([
    ['p', { id: 'p', price: 16900, stock: 4, options: [{ name: 'Portada', values: ['Rosa', 'Lila'] }] }],
    ['w', { id: 'w', price: 8500, stock: 0, options: [] }],
  ]);

  it('suma subtotales y detecta stock insuficiente sumando todas las opciones', () => {
    const view = reconcileCart(
      [
        { key: '1', productId: 'p', quantity: 3, options: { Portada: 'Rosa' }, priceSeen: 16900 },
        { key: '2', productId: 'p', quantity: 2, options: { Portada: 'Lila' }, priceSeen: 15000 },
      ],
      products,
    );
    assert.equal(view.items[0].valid, true);
    assert.equal(view.items[1].issue, 'quantity');
    assert.equal(view.items[1].free, 1);
    assert.equal(view.items[1].priceChanged, true);
    assert.equal(view.subtotal, 50700);
    assert.equal(view.blocking, true);
  });

  it('marca productos agotados, despublicados u opciones obsoletas', () => {
    const view = reconcileCart(
      [
        { key: '1', productId: 'w', quantity: 1, options: {} },
        { key: '2', productId: 'x', quantity: 1, options: {} },
        { key: '3', productId: 'p', quantity: 1, options: { Portada: 'Verde' } },
      ],
      products,
    );
    assert.deepEqual(view.items.map((i) => i.issue), ['soldout', 'unavailable', 'options']);
    assert.equal(view.subtotal, 0);
  });

  it('niveles de stock con umbral propio o general', () => {
    assert.equal(stockLevel({ stock: 0 }, { lowStockDefault: 5 }), 'agotado');
    assert.equal(stockLevel({ stock: 5 }, { lowStockDefault: 5 }), 'bajo');
    assert.equal(stockLevel({ stock: 6 }, { lowStockDefault: 5 }), 'disponible');
    assert.equal(stockLevel({ stock: 3, lowStockThreshold: 2 }, { lowStockDefault: 5 }), 'disponible');
    assert.equal(availabilityLabel({ stock: 1 }, {}).text, '¡Queda 1 unidad!');
  });
});

describe('seguridad de la interfaz', () => {
  it('escapa HTML de datos externos y bloquea URLs peligrosas', () => {
    assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    const name = '"><script>alert(1)</script>';
    assert.equal(html`<p title="${name}">${name}</p>`.toString(), '<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    assert.equal(safeUrl('javascript:alert(1)'), '#');
    assert.equal(safeUrl('//evil.example/x'), '#');
    assert.equal(safeUrl('https://firebasestorage.googleapis.com/x'), 'https://firebasestorage.googleapis.com/x');
    assert.equal(safeUrl('/producto.html?id=1'), '/producto.html?id=1');
    assert.equal(instagramUrl('@7kilitos.store'), 'https://www.instagram.com/7kilitos.store/');
    assert.equal(instagramUrl('mal usuario<script>'), null);
    assert.equal(whatsappUrl('+56 9 1234 5678'), 'https://wa.me/56912345678');
  });

  it('el CSV neutraliza fórmulas y respeta separadores', () => {
    const csv = toCsv(
      [{ label: 'Cliente', value: (r) => r.name }, { label: 'Total', value: (r) => r.total }, { label: 'Ajuste', value: (r) => r.delta }],
      [{ name: '=HYPERLINK("http://evil")', total: 16900, delta: -3 }, { name: 'Ana; "la del sur"', total: 0, delta: 2 }],
    );
    const [header, first, second] = csv.split('\r\n');
    assert.equal(header, 'Cliente;Total;Ajuste');
    assert.equal(first, `"'=HYPERLINK(""http://evil"")";16900;-3`);
    assert.equal(second, '"Ana; ""la del sur""";0;2');
  });

  it('normaliza texto para búsquedas sin tildes', () => {
    assert.equal(normalizeText('  Bolígrafos   ÑANDÚ '), 'boligrafos nandu');
  });
});

// Resumen: indicadores calculados con ventas confirmadas (sales vigentes) y
// pedidos reales. Si no hay datos, se muestran ceros o estados vacíos.
import { html, setHtml, icon, $ } from '../utils/html.js';
import { formatCLP, formatNumber, formatDateTime, pluralize } from '../utils/format.js';
import { presetRange } from '../utils/dates.js';
import { salesInRange, salesSummary, salesSeries, topProducts, ordersByStatus, stockAlerts } from '../utils/analytics.js';
import { lowStockThreshold } from '../utils/stock.js';
import { ORDER_STATUS } from '../utils/status.js';
import { listAllProducts } from '../services/catalog.js';
import { getSettings } from '../services/settings.js';
import { listSales } from '../services/sales.js';
import { listOrdersInRange, countPendingOrders } from '../services/orders.js';
import { friendlyError } from '../services/errors.js';
import { errorState } from '../components/states.js';
import { initAdminPage, setPendingCount } from './shell.js';
import { mountRangeFilter, rangeLabel } from './range-filter.js';
import { columnChart, hbarList, chartTable } from './charts.js';
import { statusBadge } from '../store/order-summary.js';

const { main } = await initAdminPage({ page: 'dashboard', title: 'Resumen del negocio' });

setHtml(
  main,
  html`<div class="toolbar" id="filters"></div>
    <section class="kpi-grid" id="kpis" aria-label="Indicadores principales" aria-busy="true"></section>
    <section class="panel" aria-labelledby="period-title">
      <div class="panel-head">
        <div><h2 id="period-title">Ventas confirmadas del período</h2><p id="period-label"></p></div>
        <span class="badge badge-neutral">${icon('info')} Solo pedidos pagados (ventas vigentes)</span>
      </div>
      <div class="panel-body" id="period"></div>
    </section>
    <div class="grid-2 even">
      <section class="panel" aria-labelledby="top-title">
        <div class="panel-head"><h2 id="top-title">Productos más vendidos</h2><a class="link-btn" href="/admin/reportes.html">Ver reportes</a></div>
        <div class="panel-body" id="top"></div>
      </section>
      <section class="panel" aria-labelledby="status-title">
        <div class="panel-head"><h2 id="status-title">Pedidos creados en el período</h2><a class="link-btn" href="/admin/pedidos.html">Ver pedidos</a></div>
        <div class="panel-body" id="status"></div>
      </section>
    </div>
    <div class="grid-2 even">
      <section class="panel" aria-labelledby="stock-title">
        <div class="panel-head"><h2 id="stock-title">Requieren reposición</h2><a class="link-btn" href="/admin/inventario.html">Ir a inventario</a></div>
        <div class="panel-body" id="stock"></div>
      </section>
      <section class="panel" aria-labelledby="pending-title">
        <div class="panel-head"><h2 id="pending-title">Pedidos por atender</h2><a class="link-btn" href="/admin/pedidos.html?estado=pendiente">Ver todos</a></div>
        <div class="panel-body flush" id="pending"></div>
      </section>
    </div>`,
);

let base = null; // productos, configuración y pendientes (no dependen del rango)
let stopChart = () => {};

function kpi({ label, value, sub = '', iconName, tone = '', href = null, hero = false }) {
  const body = html`<span class="kpi-label">${icon(iconName)} ${label}</span><span class="kpi-value">${value}</span>${sub ? html`<span class="kpi-sub">${sub}</span>` : ''}`;
  return href
    ? html`<a class="kpi ${tone ? `tone-${tone}` : ''}${hero ? ' is-hero' : ''}" href="${href}">${body}</a>`
    : html`<div class="kpi ${tone ? `tone-${tone}` : ''}${hero ? ' is-hero' : ''}">${body}</div>`;
}

async function loadBase() {
  const [settings, products, pending] = await Promise.all([getSettings({ fresh: true }), listAllProducts(), countPendingOrders()]);
  return { settings, products, pending };
}

async function render(range) {
  main.querySelectorAll('.panel, .kpi-grid').forEach((el) => {
    el.style.opacity = '0.55';
  });
  try {
    base ??= await loadBase();
    const { settings, products, pending } = base;
    const today = presetRange('hoy');
    const month = presetRange('mes');
    const start = new Date(Math.min(range.start, month.start, today.start));
    const end = new Date(Math.max(range.end, month.end, today.end));
    const [{ sales, truncated }, { orders }] = await Promise.all([listSales({ start, end }), listOrdersInRange(range)]);

    const todaySummary = salesSummary(salesInRange(sales, today));
    const monthSummary = salesSummary(salesInRange(sales, month));
    const periodSales = salesInRange(sales, range);
    const period = salesSummary(periodSales);
    const active = products.filter((p) => p.active);
    const alerts = stockAlerts(active, settings, lowStockThreshold);
    setPendingCount(pending.pendiente.length);

    setHtml(
      $('#kpis'),
      html`${kpi({ label: 'Ventas de hoy', value: formatCLP(todaySummary.total), sub: pluralize(todaySummary.count, 'venta'), iconName: 'today', tone: 'menta' })}
        ${kpi({ label: 'Ventas del mes', value: formatCLP(monthSummary.total), sub: pluralize(monthSummary.count, 'venta'), iconName: 'calendar_month', tone: 'menta' })}
        ${kpi({ label: 'Pedidos pendientes', value: formatNumber(pending.pendiente.length), sub: `${pluralize(pending.confirmado.length, 'confirmado')} sin pago`, iconName: 'schedule', tone: 'ambar', href: '/admin/pedidos.html?estado=pendiente' })}
        ${kpi({ label: 'Productos publicados', value: formatNumber(active.length), sub: `${formatNumber(products.length - active.length)} sin publicar`, iconName: 'sell', tone: 'lavanda', href: '/admin/productos.html' })}
        ${kpi({ label: 'Stock bajo', value: formatNumber(alerts.low.length), sub: 'productos publicados', iconName: 'warning', tone: 'ambar', href: '/admin/inventario.html?filtro=bajo' })}
        ${kpi({ label: 'Agotados', value: formatNumber(alerts.out.length), sub: 'productos publicados', iconName: 'block', tone: 'danger', href: '/admin/inventario.html?filtro=agotado' })}`,
    );
    $('#kpis').setAttribute('aria-busy', 'false');

    $('#period-label').textContent = `${rangeLabel(range)} (hora de Chile)`;
    const longRange = (range.end - range.start) / 86400000 > 62;
    const series = salesSeries(periodSales, range, longRange ? 'month' : 'day');
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const pretty = (key) => (longRange ? `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : `${Number(key.slice(8))} ${monthNames[Number(key.slice(5, 7)) - 1]}`);
    setHtml(
      $('#period'),
      html`${truncated ? html`<p class="inline-alert">${icon('warning')} El período tiene demasiadas ventas para mostrarlas todas; acota el rango para totales exactos.</p>` : ''}
        <div class="kpi-grid" style="margin-bottom:1rem">
          ${kpi({ label: 'Total cobrado', value: formatCLP(period.total), sub: `Productos ${formatCLP(period.productRevenue)} + envíos ${formatCLP(period.shipping)}`, iconName: 'payments', hero: true })}
          ${kpi({ label: 'Ventas', value: formatNumber(period.count), sub: period.voidedCount ? `${pluralize(period.voidedCount, 'anulada')} excluidas` : 'Sin anulaciones', iconName: 'receipt_long', tone: 'lavanda' })}
          ${kpi({ label: 'Unidades vendidas', value: formatNumber(period.units), iconName: 'inventory_2', tone: 'ambar' })}
          ${kpi({ label: 'Ticket promedio', value: formatCLP(period.averageTicket), iconName: 'shopping_bag' })}
        </div>
        ${period.count === 0
          ? html`<p class="inline-alert is-info">${icon('info')} No hay ventas confirmadas en este período. Los pedidos pendientes no cuentan como venta hasta registrar su pago.</p>`
          : ''}
        <div id="sales-chart"></div>
        ${chartTable(
          'Ventas confirmadas por ' + (longRange ? 'mes' : 'día'),
          [longRange ? 'Mes' : 'Día', 'Ventas', 'Unidades', 'Total'],
          series.filter((s) => s.count > 0).map((s) => [pretty(s.key), formatNumber(s.count), formatNumber(s.units), formatCLP(s.total)]),
        )}`,
    );
    stopChart();
    stopChart = columnChart(
      $('#sales-chart'),
      series.map((s) => ({ label: pretty(s.key), short: pretty(s.key), value: s.total, detail: pluralize(s.count, 'venta') })),
      { formatValue: formatCLP, ariaLabel: `Total cobrado por ${longRange ? 'mes' : 'día'}` },
    );

    const top = topProducts(periodSales, { limit: 6 });
    setHtml(
      $('#top'),
      top.length
        ? hbarList(top.map((t) => ({ label: t.name, value: t.units, revenue: t.revenue })), { formatValue: (v) => pluralize(v, 'unidad', 'unidades') })
        : html`<p class="text-muted">Sin ventas confirmadas en el período.</p>`,
    );

    const counts = ordersByStatus(orders);
    const totalOrders = orders.length;
    setHtml(
      $('#status'),
      totalOrders
        ? hbarList(
            Object.entries(counts).map(([status, value]) => ({ label: `${ORDER_STATUS[status].label}`, value, status })),
            { formatValue: (v) => formatNumber(v), className: (item) => `st-${item.status}` },
          )
        : html`<p class="text-muted">No se crearon pedidos en el período.</p>`,
    );

    const restock = [...alerts.out, ...alerts.low].slice(0, 8);
    setHtml(
      $('#stock'),
      restock.length
        ? html`<ul class="hbar-list">${restock.map(
            (p) => html`<li class="hbar-meta"><span>${p.name}</span>
              <strong>${p.stock <= 0 ? html`<span class="badge badge-danger">${icon('block')} Agotado</span>` : html`<span class="badge badge-warning">${icon('warning')} ${p.stock} en stock</span>`}</strong></li>`,
          )}</ul>`
        : html`<p class="text-muted">${icon('check_circle')} Todo el catálogo publicado tiene stock sobre el umbral.</p>`,
    );

    const attention = [...pending.pendiente, ...pending.confirmado]
      .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      .slice(0, 6);
    setHtml(
      $('#pending'),
      attention.length
        ? html`<div class="table-wrap"><table class="table responsive"><thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Estado</th><th scope="col" class="num">Total</th></tr></thead>
            <tbody>${attention.map(
              (o) => html`<tr>
                <td class="cell-main"><a href="/admin/pedidos.html?pedido=${encodeURIComponent(o.id)}"><strong>${o.orderNumber}</strong></a><small>${formatDateTime(o.createdAt)}</small></td>
                <td data-label="Cliente">${o.customer?.name}</td>
                <td data-label="Estado">${statusBadge(o.status)}</td>
                <td data-label="Total" class="num">${formatCLP(o.total)}</td>
              </tr>`,
            )}</tbody></table></div>`
        : html`<p class="panel-body text-muted">${icon('celebration')} No hay pedidos pendientes.</p>`,
    );
  } catch (error) {
    setHtml($('#period'), errorState({ text: friendlyError(error), retry: true }));
  } finally {
    main.querySelectorAll('.panel, .kpi-grid').forEach((el) => {
      el.style.opacity = '';
    });
  }
}

const filter = mountRangeFilter($('#filters'), { initial: '30d', onChange: (range) => render(range) });
main.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="retry"]')) {
    base = null;
    render(filter.getRange());
  }
});
render(filter.getRange());

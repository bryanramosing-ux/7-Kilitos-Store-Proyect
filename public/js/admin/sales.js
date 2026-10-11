// Historial de ventas: registros inalterables creados al registrar el pago.
// Las ventas anuladas se muestran (no se borran) y se excluyen de los totales.
import { html, setHtml, icon, $ } from '../utils/html.js';
import { formatCLP, formatDateTime, formatNumber, normalizeText, pluralize } from '../utils/format.js';
import { SALE_STATUS } from '../utils/status.js';
import { salesSummary } from '../utils/analytics.js';
import { downloadCsv } from '../utils/csv.js';
import { listSales, SALES_QUERY_LIMIT } from '../services/sales.js';
import { friendlyError } from '../services/errors.js';
import { errorState, emptyState, loadingState } from '../components/states.js';
import { openDialog } from '../components/dialog.js';
import { initAdminPage } from './shell.js';
import { mountRangeFilter, rangeLabel } from './range-filter.js';
import { paginate, pager } from './table.js';
import { describeOptions } from '../store/cart-view.js';

const { main } = await initAdminPage({ page: 'ventas', title: 'Ventas' });
const state = { sales: [], status: '', q: '', page: 1, range: null, truncated: false };

setHtml(
  main,
  html`<div class="toolbar">
      <div class="toolbar" id="range"></div>
      <div class="field grow"><label for="q">Buscar</label><div class="input-with-icon">${icon('search')}<input class="input" id="q" type="search" placeholder="N.º de pedido, cliente o producto" /></div></div>
      <div class="field"><label for="f-status">Estado</label><select class="select" id="f-status"><option value="">Todas</option><option value="vigente">Vigentes</option><option value="anulada">Anuladas</option></select></div>
      <button type="button" class="btn btn-secondary" id="export">${icon('download')} Exportar CSV (detalle)</button>
    </div>
    <section class="kpi-grid" id="kpis" aria-label="Totales del período"></section>
    <section class="panel" aria-labelledby="sales-title">
      <div class="panel-head"><h2 id="sales-title">Ventas registradas</h2><p id="note"></p></div>
      <div class="panel-body flush" id="list">${loadingState()}</div>
    </section>`,
);

function filtered() {
  const terms = normalizeText(state.q).split(' ').filter(Boolean);
  return state.sales.filter((s) => {
    if (state.status && s.status !== state.status) return false;
    const text = normalizeText([s.orderNumber, s.customerName, ...(s.items ?? []).map((i) => `${i.name} ${i.sku}`)].join(' '));
    return terms.every((t) => text.includes(t));
  });
}

function render() {
  const summary = salesSummary(state.sales);
  setHtml(
    $('#kpis'),
    html`<div class="kpi is-hero"><span class="kpi-label">${icon('payments')} Total cobrado (vigentes)</span><span class="kpi-value">${formatCLP(summary.total)}</span><span class="kpi-sub">${rangeLabel(state.range)}</span></div>
      <div class="kpi tone-menta"><span class="kpi-label">${icon('sell')} Ingresos por productos</span><span class="kpi-value">${formatCLP(summary.productRevenue)}</span><span class="kpi-sub">Envíos: ${formatCLP(summary.shipping)}</span></div>
      <div class="kpi tone-lavanda"><span class="kpi-label">${icon('receipt_long')} Ventas vigentes</span><span class="kpi-value">${formatNumber(summary.count)}</span><span class="kpi-sub">${pluralize(summary.units, 'unidad', 'unidades')}</span></div>
      <div class="kpi tone-danger"><span class="kpi-label">${icon('block')} Anuladas</span><span class="kpi-value">${formatNumber(summary.voidedCount)}</span><span class="kpi-sub">No suman en los totales</span></div>`,
  );
  const list = filtered();
  const view = paginate(list, state.page, 20);
  state.page = view.page;
  $('#note').textContent = state.truncated ? `Se muestran las ${formatNumber(SALES_QUERY_LIMIT)} más recientes; acota el período.` : `${formatNumber(list.length)} registros`;
  if (list.length === 0) {
    setHtml($('#list'), html`<div class="panel-body">${emptyState({ title: 'Sin ventas en el período', text: 'Una venta se registra cuando un pedido pasa a "pagado".', iconName: 'payments' })}</div>`);
    return;
  }
  setHtml(
    $('#list'),
    html`<div class="table-wrap"><table class="table responsive">
      <caption class="sr-only">Ventas</caption>
      <thead><tr><th scope="col">Venta</th><th scope="col">Cliente</th><th scope="col" class="num">Unidades</th><th scope="col">Pago</th><th scope="col">Estado</th><th scope="col" class="num">Total</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${view.rows.map((s) => {
        const status = SALE_STATUS[s.status] ?? { label: s.status, icon: 'help' };
        return html`<tr>
          <td class="cell-main"><strong>${s.orderNumber}</strong><small>Pagada el ${formatDateTime(s.paidAt)}</small></td>
          <td data-label="Cliente">${s.customerName}</td>
          <td data-label="Unidades" class="num">${s.itemCount}</td>
          <td data-label="Pago">${s.paymentMethod}</td>
          <td data-label="Estado"><span class="badge status status-${s.status}">${icon(status.icon)} ${status.label}</span></td>
          <td data-label="Total" class="num"><strong>${s.status === 'anulada' ? html`<s>${formatCLP(s.total)}</s>` : formatCLP(s.total)}</strong></td>
          <td data-label=""><button type="button" class="btn btn-sm btn-secondary" data-open="${s.id}">${icon('visibility')} Detalle</button></td>
        </tr>`;
      })}</tbody></table></div>${pager(view)}`,
  );
}

function openSale(sale) {
  openDialog({
    title: `Venta ${sale.orderNumber}`,
    wide: true,
    body: html`<div style="display:grid;gap:1rem">
      <dl class="dl">
        <dt>Estado</dt><dd>${SALE_STATUS[sale.status]?.label ?? sale.status}${sale.voidReason ? ` (motivo: ${sale.voidReason})` : ''}</dd>
        <dt>Pagada</dt><dd>${formatDateTime(sale.paidAt)}</dd>
        ${sale.voidedAt ? html`<dt>Anulada</dt><dd>${formatDateTime(sale.voidedAt)}</dd>` : ''}
        <dt>Cliente</dt><dd>${sale.customerName}</dd>
        <dt>Pago</dt><dd>${sale.paymentMethod}</dd>
        <dt>Entrega</dt><dd>${sale.deliveryMethod}</dd>
        <dt>Registrada por</dt><dd>${sale.recordedByEmail ?? sale.recordedBy}</dd>
      </dl>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Producto</th><th scope="col" class="num">Cant.</th><th scope="col" class="num">Precio aplicado</th><th scope="col" class="num">Subtotal</th></tr></thead>
        <tbody>${sale.items.map((i) => html`<tr><td>${i.name}<br /><small class="text-muted">SKU ${i.sku}${Object.keys(i.options ?? {}).length ? ` · ${describeOptions(i.options)}` : ''}</small></td><td class="num">${i.quantity}</td><td class="num">${formatCLP(i.unitPrice)}</td><td class="num">${formatCLP(i.lineTotal)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="3" class="num">Envío</td><td class="num">${formatCLP(sale.shippingCost)}</td></tr><tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>${formatCLP(sale.total)}</strong></td></tr></tfoot>
      </table></div>
      <p class="hint">Los precios corresponden al momento del pedido y no cambian si después se modifica el producto.</p>
      <a class="btn btn-secondary" href="/admin/pedidos.html?pedido=${encodeURIComponent(sale.orderId)}">${icon('receipt_long')} Ver pedido</a>
    </div>`,
  });
}

async function load(range) {
  state.range = range;
  setHtml($('#list'), loadingState('Cargando ventas…'));
  try {
    const { sales, truncated } = await listSales(range);
    Object.assign(state, { sales, truncated, page: 1 });
    render();
  } catch (error) {
    setHtml($('#list'), html`<div class="panel-body">${errorState({ text: friendlyError(error) })}</div>`);
  }
}

main.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open]');
  if (open) return openSale(state.sales.find((s) => s.id === open.dataset.open));
  const page = event.target.closest('[data-page]');
  if (page) {
    state.page = Number(page.dataset.page);
    render();
  }
});
$('#q').addEventListener('input', (event) => {
  state.q = event.target.value;
  state.page = 1;
  render();
});
$('#f-status').addEventListener('change', (event) => {
  state.status = event.target.value;
  state.page = 1;
  render();
});
$('#export').addEventListener('click', () => {
  const lines = filtered().flatMap((s) => s.items.map((item) => ({ sale: s, item })));
  downloadCsv(`ventas-detalle-${state.range.fromKey}-a-${state.range.toKey}.csv`, [
    { label: 'Pedido', value: (r) => r.sale.orderNumber },
    { label: 'Fecha de pago', value: (r) => formatDateTime(r.sale.paidAt) },
    { label: 'Estado venta', value: (r) => r.sale.status },
    { label: 'Cliente', value: (r) => r.sale.customerName },
    { label: 'SKU', value: (r) => r.item.sku },
    { label: 'Producto', value: (r) => r.item.name },
    { label: 'Opciones', value: (r) => describeOptions(r.item.options) },
    { label: 'Cantidad', value: (r) => r.item.quantity },
    { label: 'Precio unitario', value: (r) => r.item.unitPrice },
    { label: 'Subtotal línea', value: (r) => r.item.lineTotal },
    { label: 'Método de pago', value: (r) => r.sale.paymentMethod },
  ], lines);
});

const filter = mountRangeFilter($('#range'), { initial: 'mes', onChange: (range) => load(range) });
load(filter.getRange());

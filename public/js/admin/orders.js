// Pedidos: listado por rango de fechas, filtros por estado, búsqueda y detalle.
import { html, setHtml, icon, $ } from '../utils/html.js';
import { formatCLP, formatDateTime, normalizeText, formatNumber } from '../utils/format.js';
import { ORDER_STATUS } from '../utils/status.js';
import { listOrdersInRange, findOrderByNumber, ORDER_QUERY_LIMIT } from '../services/orders.js';
import { friendlyError } from '../services/errors.js';
import { errorState, emptyState, loadingState } from '../components/states.js';
import { downloadCsv } from '../utils/csv.js';
import { initAdminPage } from './shell.js';
import { mountRangeFilter } from './range-filter.js';
import { paginate, pager } from './table.js';
import { openOrderDialog } from './order-dialog.js';
import { statusBadge } from '../store/order-summary.js';

const { main, role } = await initAdminPage({ page: 'pedidos', title: 'Pedidos' });
const params = new URLSearchParams(location.search);
const state = { status: params.get('estado') ?? '', q: '', page: 1, orders: [], truncated: false, range: null };

setHtml(
  main,
  html`<div class="toolbar">
      <div class="toolbar" id="range"></div>
      <div class="field grow">
        <label for="q">Buscar</label>
        <div class="input-with-icon">${icon('search')}<input class="input" id="q" type="search" placeholder="N.º de pedido (7K-000123), nombre, correo o teléfono" /></div>
      </div>
      <button type="button" class="btn btn-secondary" id="export">${icon('download')} Exportar CSV</button>
    </div>
    <div class="chip-row" role="group" aria-label="Filtrar por estado" id="status-chips"></div>
    <section class="panel" aria-labelledby="orders-title">
      <div class="panel-head"><h2 id="orders-title">Pedidos del período</h2><p id="orders-note"></p></div>
      <div class="panel-body flush" id="list">${loadingState()}</div>
    </section>`,
);

function filtered() {
  const terms = normalizeText(state.q).split(' ').filter(Boolean);
  return state.orders.filter((order) => {
    if (state.status && order.status !== state.status) return false;
    if (!terms.length) return true;
    const text = normalizeText(
      [order.orderNumber, order.id, order.customer?.name, order.customer?.email, order.customer?.phone, order.customer?.phone?.replace(/\D/g, '')].join(' '),
    );
    return terms.every((t) => text.includes(t));
  });
}

function renderChips() {
  const counts = Object.fromEntries(Object.keys(ORDER_STATUS).map((s) => [s, 0]));
  state.orders.forEach((o) => {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  });
  setHtml(
    $('#status-chips'),
    html`<button type="button" class="chip" data-status="" aria-pressed="${state.status === ''}">Todos <span class="count">${state.orders.length}</span></button>
      ${Object.entries(ORDER_STATUS).map(
        ([key, info]) => html`<button type="button" class="chip" data-status="${key}" aria-pressed="${state.status === key}">${icon(info.icon)} ${info.label} <span class="count">${counts[key]}</span></button>`,
      )}`,
  );
}

function renderList() {
  const list = filtered();
  const view = paginate(list, state.page, 20);
  state.page = view.page;
  $('#orders-note').textContent = state.truncated
    ? `Se muestran los ${formatNumber(ORDER_QUERY_LIMIT)} más recientes; acota el período.`
    : `${formatNumber(list.length)} de ${formatNumber(state.orders.length)} pedidos`;
  if (list.length === 0) {
    setHtml($('#list'), html`<div class="panel-body">${emptyState({ title: 'No hay pedidos con estos filtros', text: 'Cambia el período, el estado o la búsqueda.', iconName: 'receipt_long' })}</div>`);
    return;
  }
  setHtml(
    $('#list'),
    html`<div class="table-wrap"><table class="table responsive">
        <caption class="sr-only">Pedidos</caption>
        <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col" class="num">Productos</th><th scope="col">Entrega</th><th scope="col">Pago</th><th scope="col">Estado</th><th scope="col" class="num">Total</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          ${view.rows.map(
            (o) => html`<tr>
              <td class="cell-main"><strong>${o.orderNumber}</strong><small>${formatDateTime(o.createdAt)}</small></td>
              <td data-label="Cliente">${o.customer?.name}<br /><small class="text-muted">${o.customer?.email}</small></td>
              <td data-label="Productos" class="num">${o.itemCount}</td>
              <td data-label="Entrega">${o.delivery?.methodName}${o.delivery?.address ? html`<br /><small class="text-muted">${o.delivery.address.comuna}</small>` : ''}</td>
              <td data-label="Pago">${o.payment?.methodName}</td>
              <td data-label="Estado">${statusBadge(o.status)}</td>
              <td data-label="Total" class="num"><strong>${formatCLP(o.total)}</strong></td>
              <td data-label=""><button type="button" class="btn btn-sm btn-secondary" data-open="${o.id}">${icon('visibility')} Ver</button></td>
            </tr>`,
          )}
        </tbody>
      </table></div>
      ${pager(view)}`,
  );
}

async function load(range = state.range) {
  state.range = range;
  setHtml($('#list'), loadingState('Cargando pedidos…'));
  try {
    const { orders, truncated } = await listOrdersInRange(range);
    state.orders = orders;
    state.truncated = truncated;
    renderChips();
    renderList();
  } catch (error) {
    setHtml($('#list'), html`<div class="panel-body">${errorState({ text: friendlyError(error), retry: true })}</div>`);
  }
}

const reload = () => load();

main.addEventListener('click', async (event) => {
  const chip = event.target.closest('[data-status]');
  if (chip) {
    state.status = chip.dataset.status;
    state.page = 1;
    renderChips();
    renderList();
    return;
  }
  const open = event.target.closest('[data-open]');
  if (open) {
    openOrderDialog(open.dataset.open, { role, onChange: reload });
    return;
  }
  const page = event.target.closest('[data-page]');
  if (page) {
    state.page = Number(page.dataset.page);
    renderList();
    $('#orders-title').scrollIntoView({ block: 'start' });
    return;
  }
  if (event.target.closest('[data-action="retry"]')) reload();
});

let debounce;
$('#q').addEventListener('input', (event) => {
  clearTimeout(debounce);
  debounce = setTimeout(async () => {
    state.q = event.target.value.trim();
    state.page = 1;
    renderList();
    // Búsqueda directa por número si el pedido no está en el período cargado.
    const number = state.q.toUpperCase();
    if (/^7K-\d{6}$/.test(number) && !state.orders.some((o) => o.orderNumber === number)) {
      try {
        const order = await findOrderByNumber(number);
        if (order) openOrderDialog(order.id, { role, onChange: reload });
      } catch (error) {
        setHtml($('#list'), html`<div class="panel-body">${errorState({ text: friendlyError(error) })}</div>`);
      }
    }
  }, 250);
});

$('#export').addEventListener('click', () => {
  const rows = filtered();
  downloadCsv(`pedidos-${state.range.fromKey}-a-${state.range.toKey}.csv`, [
    { label: 'Pedido', value: (o) => o.orderNumber },
    { label: 'Fecha', value: (o) => formatDateTime(o.createdAt) },
    { label: 'Estado', value: (o) => ORDER_STATUS[o.status]?.label ?? o.status },
    { label: 'Cliente', value: (o) => o.customer?.name },
    { label: 'Correo', value: (o) => o.customer?.email },
    { label: 'Teléfono', value: (o) => o.customer?.phone },
    { label: 'Entrega', value: (o) => o.delivery?.methodName },
    { label: 'Comuna', value: (o) => o.delivery?.address?.comuna ?? '' },
    { label: 'Pago', value: (o) => o.payment?.methodName },
    { label: 'Unidades', value: (o) => o.itemCount },
    { label: 'Subtotal', value: (o) => o.subtotal },
    { label: 'Envío', value: (o) => o.shippingCost },
    { label: 'Total', value: (o) => o.total },
  ], rows);
});

const filter = mountRangeFilter($('#range'), { initial: '30d', onChange: (range) => load(range) });
await load(filter.getRange());
if (params.get('pedido')) openOrderDialog(params.get('pedido'), { role, onChange: reload });

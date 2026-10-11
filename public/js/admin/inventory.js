// Inventario: existencias, alertas, movimientos manuales y su historial.
import { html, setHtml, icon, $, $$ } from '../utils/html.js';
import { formatNumber, formatDateTime, normalizeText } from '../utils/format.js';
import { availabilityLabel, lowStockThreshold } from '../utils/stock.js';
import { MOVEMENT_TYPES } from '../utils/status.js';
import { rules, validate } from '../utils/validation.js';
import { newRequestId } from '../utils/ids.js';
import { downloadCsv } from '../utils/csv.js';
import { watchAllProducts, listAllCategories } from '../services/catalog.js';
import { getSettings } from '../services/settings.js';
import { adjustStock, listMovements, listProductMovements } from '../services/inventory.js';
import { friendlyError, errorDetails } from '../services/errors.js';
import { errorState, emptyState, loadingState } from '../components/states.js';
import { openDialog } from '../components/dialog.js';
import { notify } from '../components/toast.js';
import { initAdminPage } from './shell.js';
import { mountRangeFilter } from './range-filter.js';
import { paginate, pager } from './table.js';

const { main } = await initAdminPage({ page: 'inventario', title: 'Inventario' });
const params = new URLSearchParams(location.search);
const state = { products: [], categories: [], settings: null, q: '', filter: params.get('filtro') ?? '', page: 1, movements: [], movPage: 1, movType: '', truncated: false };
const REASONS = {
  entrada: ['Compra a proveedor', 'Devolución de cliente', 'Reposición', 'Corrección de registro'],
  salida: ['Merma o producto dañado', 'Uso interno o regalo', 'Muestra para fotos', 'Venta fuera de la web', 'Corrección de registro'],
  ajuste: ['Conteo físico', 'Corrección de registro'],
};

setHtml(
  main,
  html`<div class="toolbar">
      <div class="field grow"><label for="q">Buscar producto</label><div class="input-with-icon">${icon('search')}<input class="input" id="q" type="search" placeholder="Nombre o SKU" /></div></div>
      <div class="field"><label for="f-level">Existencias</label>
        <select class="select" id="f-level"><option value="">Todas</option><option value="bajo">Stock bajo</option><option value="agotado">Agotados</option><option value="disponible">Sobre el umbral</option></select></div>
    </div>
    <section class="kpi-grid" id="stock-kpis" aria-label="Resumen de existencias"></section>
    <section class="panel" aria-labelledby="stock-title">
      <div class="panel-head"><h2 id="stock-title">Existencias por producto</h2><p>Se actualiza en tiempo real.</p></div>
      <div class="panel-body flush" id="stock-list">${loadingState()}</div>
    </section>
    <section class="panel" aria-labelledby="mov-title">
      <div class="panel-head"><h2 id="mov-title">Historial de movimientos</h2>
        <button type="button" class="btn btn-sm btn-secondary" id="export-mov">${icon('download')} Exportar CSV</button></div>
      <div class="panel-body"><div class="toolbar" id="mov-filters"><div class="toolbar" id="mov-range"></div>
        <div class="field"><label for="f-type">Tipo</label><select class="select" id="f-type"><option value="">Todos</option>${Object.entries(MOVEMENT_TYPES).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div></div></div>
      <div class="panel-body flush" id="mov-list">${loadingState()}</div>
    </section>`,
);
$('#f-level').value = state.filter;

function filteredProducts() {
  const terms = normalizeText(state.q).split(' ').filter(Boolean);
  return state.products
    .filter((p) => {
      const level = availabilityLabel(p, state.settings).level;
      if (state.filter && level !== state.filter) return false;
      const text = normalizeText(`${p.name} ${p.sku}`);
      return terms.every((t) => text.includes(t));
    })
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.name.localeCompare(b.name, 'es'));
}

function renderStock() {
  const all = state.products;
  const levels = all.map((p) => availabilityLabel(p, state.settings).level);
  const units = all.reduce((sum, p) => sum + Math.max(0, p.stock ?? 0), 0);
  setHtml(
    $('#stock-kpis'),
    html`<div class="kpi tone-lavanda"><span class="kpi-label">${icon('inventory_2')} Unidades en stock</span><span class="kpi-value">${formatNumber(units)}</span><span class="kpi-sub">${formatNumber(all.length)} productos</span></div>
      <div class="kpi tone-ambar"><span class="kpi-label">${icon('warning')} Stock bajo</span><span class="kpi-value">${formatNumber(levels.filter((l) => l === 'bajo').length)}</span></div>
      <div class="kpi tone-danger"><span class="kpi-label">${icon('block')} Agotados</span><span class="kpi-value">${formatNumber(levels.filter((l) => l === 'agotado').length)}</span></div>`,
  );
  const list = filteredProducts();
  const view = paginate(list, state.page, 15);
  state.page = view.page;
  if (list.length === 0) {
    setHtml($('#stock-list'), html`<div class="panel-body">${emptyState({ title: 'Sin productos con este filtro', iconName: 'inventory_2' })}</div>`);
    return;
  }
  setHtml(
    $('#stock-list'),
    html`<div class="table-wrap"><table class="table responsive">
      <caption class="sr-only">Existencias</caption>
      <thead><tr><th scope="col">Producto</th><th scope="col" class="num">Stock</th><th scope="col" class="num">Umbral</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${view.rows.map((p) => {
        const a = availabilityLabel(p, state.settings);
        return html`<tr>
          <td class="cell-main"><strong>${p.name}</strong><small>SKU ${p.sku}${p.active ? '' : ' · no publicado'}</small></td>
          <td data-label="Stock" class="num"><strong>${formatNumber(p.stock ?? 0)}</strong></td>
          <td data-label="Umbral" class="num">${lowStockThreshold(p, state.settings)}</td>
          <td data-label="Estado"><span class="badge ${a.level === 'agotado' ? 'badge-danger' : a.level === 'bajo' ? 'badge-warning' : 'badge-menta'}">${icon(a.icon)} ${a.level === 'agotado' ? 'Agotado' : a.level === 'bajo' ? 'Stock bajo' : 'Disponible'}</span></td>
          <td data-label=""><div class="row-actions">
            <button type="button" class="btn btn-sm btn-brand" data-move="${p.id}">${icon('swap_vert')} Registrar movimiento</button>
            <button type="button" class="btn btn-sm btn-ghost" data-history="${p.id}">${icon('history')} Historial</button>
          </div></td>
        </tr>`;
      })}</tbody></table></div>${pager(view)}`,
  );
}

function movementsRows(list) {
  return html`${list.map((m) => {
    const type = MOVEMENT_TYPES[m.type] ?? { label: m.type, icon: 'swap_vert' };
    return html`<tr>
      <td class="cell-main"><strong>${m.productName ?? m.productId}</strong><small>${formatDateTime(m.createdAt)}</small></td>
      <td data-label="Tipo"><span class="badge badge-neutral">${icon(type.icon)} ${type.label}</span></td>
      <td data-label="Cantidad" class="num"><strong style="color:${m.quantity < 0 ? 'var(--danger)' : 'var(--mint-ink)'}">${m.quantity > 0 ? '+' : ''}${formatNumber(m.quantity)}</strong></td>
      <td data-label="Stock" class="num">${formatNumber(m.stockBefore)} → ${formatNumber(m.stockAfter)}</td>
      <td data-label="Motivo">${m.reason}${m.orderId ? html`<br /><a class="link-btn" href="/admin/pedidos.html?pedido=${encodeURIComponent(m.orderId)}">Ver pedido</a>` : ''}</td>
      <td data-label="Responsable">${m.userEmail ?? (m.userUid === 'sistema' ? 'Proceso automático' : m.userRole === 'cliente' ? 'Cliente (pedido web)' : m.userUid)}</td>
    </tr>`;
  })}`;
}

function renderMovements() {
  const list = state.movements.filter((m) => !state.movType || m.type === state.movType);
  const view = paginate(list, state.movPage, 20);
  state.movPage = view.page;
  if (list.length === 0) {
    setHtml($('#mov-list'), html`<div class="panel-body">${emptyState({ title: 'Sin movimientos en el período', iconName: 'history' })}</div>`);
    return;
  }
  setHtml(
    $('#mov-list'),
    html`${state.truncated ? html`<p class="inline-alert" style="margin:1rem">${icon('warning')} Se muestran los 1.000 movimientos más recientes del período.</p>` : ''}
      <div class="table-wrap"><table class="table responsive">
      <caption class="sr-only">Movimientos de inventario</caption>
      <thead><tr><th scope="col">Producto y fecha</th><th scope="col">Tipo</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Stock</th><th scope="col">Motivo</th><th scope="col">Responsable</th></tr></thead>
      <tbody>${movementsRows(view.rows)}</tbody></table></div>
      <div data-mov-pager>${pager(view)}</div>`,
  );
}

async function loadMovements(range) {
  state.range = range;
  setHtml($('#mov-list'), loadingState('Cargando movimientos…'));
  try {
    const { movements, truncated } = await listMovements(range);
    Object.assign(state, { movements, truncated, movPage: 1 });
    renderMovements();
  } catch (error) {
    setHtml($('#mov-list'), html`<div class="panel-body">${errorState({ text: friendlyError(error) })}</div>`);
  }
}

function openMovementForm(product) {
  const requestId = newRequestId();
  const dialog = openDialog({
    title: `Movimiento de inventario: ${product.name}`,
    body: html`<form id="mov-form" class="form-grid" novalidate>
      <p class="inline-alert is-info">${icon('inventory_2')} Stock actual: <strong id="mov-current">${formatNumber(product.stock ?? 0)}</strong> unidades.</p>
      <fieldset class="choice-list">
        <legend class="field-label">Tipo de movimiento</legend>
        <label class="choice"><input type="radio" name="type" value="entrada" checked /><span><span class="choice-title">Entrada</span><span class="choice-text">Suma unidades (compra, devolución).</span></span><span></span></label>
        <label class="choice"><input type="radio" name="type" value="salida" /><span><span class="choice-title">Salida</span><span class="choice-text">Resta unidades (merma, uso interno).</span></span><span></span></label>
        <label class="choice"><input type="radio" name="type" value="ajuste" /><span><span class="choice-title">Ajuste por conteo</span><span class="choice-text">Fija el stock al número contado físicamente.</span></span><span></span></label>
      </fieldset>
      <div class="field"><label for="m-qty" id="m-qty-label">Cantidad a sumar</label><input class="input" id="m-qty" inputmode="numeric" /><p class="hint" id="m-preview"></p><p class="error-text" id="m-qty-error"></p></div>
      <div class="field"><label for="m-reason-select">Motivo</label><select class="select" id="m-reason-select"></select></div>
      <div class="field"><label for="m-reason">Detalle del motivo</label><input class="input" id="m-reason" maxlength="200" placeholder="Ej.: factura 1234 de proveedor" /><p class="error-text" id="m-reason-error"></p></div>
      <div id="m-alert" role="alert"></div>
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="submit" form="mov-form" class="btn btn-brand" id="m-save">${icon('save')} Registrar</button>`,
  });
  const type = () => dialog.querySelector('input[name="type"]:checked').value;
  const qty = dialog.querySelector('#m-qty');
  const refresh = () => {
    const t = type();
    dialog.querySelector('#m-qty-label').textContent = t === 'entrada' ? 'Cantidad a sumar' : t === 'salida' ? 'Cantidad a restar' : 'Stock contado';
    setHtml(dialog.querySelector('#m-reason-select'), html`${REASONS[t].map((r) => html`<option>${r}</option>`)}<option value="">Otro (escribir)</option>`);
    preview();
  };
  const preview = () => {
    const current = state.products.find((p) => p.id === product.id)?.stock ?? 0;
    dialog.querySelector('#mov-current').textContent = formatNumber(current);
    const n = Number(qty.value);
    if (!/^\d+$/.test(qty.value.trim())) {
      dialog.querySelector('#m-preview').textContent = '';
      return;
    }
    const t = type();
    const after = t === 'entrada' ? current + n : t === 'salida' ? current - n : n;
    dialog.querySelector('#m-preview').textContent = `Quedará en ${formatNumber(after)} unidades${after < 0 ? ' (no permitido)' : ''}.`;
  };
  refresh();
  dialog.addEventListener('change', (event) => {
    if (event.target.name === 'type') refresh();
  });
  qty.addEventListener('input', preview);
  dialog.querySelector('#mov-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const t = type();
    const selected = dialog.querySelector('#m-reason-select').value;
    const detail = dialog.querySelector('#m-reason').value.trim();
    const reason = [selected, detail].filter(Boolean).join(': ');
    const errors = validate(
      { 'm-qty': qty.value.trim(), 'm-reason': reason },
      {
        'm-qty': [rules.integer(t === 'ajuste' ? 'El stock contado' : 'La cantidad', { min: t === 'ajuste' ? 0 : 1, max: 100000 })],
        'm-reason': [rules.required('El motivo'), rules.minLength('El motivo', 3)],
      },
    );
    $$('.error-text', dialog).forEach((el) => {
      el.textContent = '';
    });
    for (const [field, message] of Object.entries(errors)) dialog.querySelector(`#${field}-error`).textContent = message;
    if (Object.keys(errors).length) return;
    const button = dialog.querySelector('#m-save');
    button.classList.add('is-loading');
    button.disabled = true;
    try {
      // El mismo requestId en reintentos evita aplicar el movimiento dos veces.
      const result = await adjustStock({ requestId, productId: product.id, type: t, quantity: Number(qty.value.trim()), reason });
      notify.success(result.alreadyApplied ? 'El movimiento ya estaba registrado' : 'Movimiento registrado', `${product.name}: stock ${formatNumber(result.stock)}`);
      dialog.close();
      if (state.range) loadMovements(state.range);
    } catch (error) {
      const details = errorDetails(error);
      setHtml(dialog.querySelector('#m-alert'), html`<p class="inline-alert is-error">${icon('error')} ${details?.code === 'NEGATIVE_STOCK' ? error.message : friendlyError(error)}</p>`);
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  });
}

async function openHistory(product) {
  const dialog = openDialog({ title: `Historial: ${product.name}`, wide: true, body: loadingState() });
  try {
    const list = await listProductMovements(product.id, 30);
    setHtml(
      dialog.querySelector('.modal-body'),
      list.length
        ? html`<div class="table-wrap"><table class="table responsive"><thead><tr><th scope="col">Producto y fecha</th><th scope="col">Tipo</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Stock</th><th scope="col">Motivo</th><th scope="col">Responsable</th></tr></thead>
            <tbody>${movementsRows(list)}</tbody></table></div><p class="hint" style="margin-top:.75rem">Últimos 30 movimientos.</p>`
        : emptyState({ title: 'Sin movimientos registrados', iconName: 'history' }),
    );
  } catch (error) {
    setHtml(dialog.querySelector('.modal-body'), errorState({ text: friendlyError(error) }));
  }
}

main.addEventListener('click', (event) => {
  const move = event.target.closest('[data-move]');
  if (move) return openMovementForm(state.products.find((p) => p.id === move.dataset.move));
  const history = event.target.closest('[data-history]');
  if (history) return openHistory(state.products.find((p) => p.id === history.dataset.history));
  const page = event.target.closest('[data-page]');
  if (page) {
    if (page.closest('[data-mov-pager]')) {
      state.movPage = Number(page.dataset.page);
      renderMovements();
    } else {
      state.page = Number(page.dataset.page);
      renderStock();
    }
  }
});
$('#q').addEventListener('input', (event) => {
  state.q = event.target.value;
  state.page = 1;
  renderStock();
});
$('#f-level').addEventListener('change', (event) => {
  state.filter = event.target.value;
  state.page = 1;
  renderStock();
});
$('#f-type').addEventListener('change', (event) => {
  state.movType = event.target.value;
  state.movPage = 1;
  renderMovements();
});
$('#export-mov').addEventListener('click', () => {
  const rows = state.movements.filter((m) => !state.movType || m.type === state.movType);
  downloadCsv(`movimientos-${state.range.fromKey}-a-${state.range.toKey}.csv`, [
    { label: 'Fecha', value: (m) => formatDateTime(m.createdAt) },
    { label: 'Producto', value: (m) => m.productName },
    { label: 'SKU', value: (m) => m.sku },
    { label: 'Tipo', value: (m) => MOVEMENT_TYPES[m.type]?.label ?? m.type },
    { label: 'Cantidad', value: (m) => m.quantity },
    { label: 'Stock antes', value: (m) => m.stockBefore },
    { label: 'Stock después', value: (m) => m.stockAfter },
    { label: 'Motivo', value: (m) => m.reason },
    { label: 'Responsable', value: (m) => m.userEmail ?? m.userUid },
    { label: 'Pedido', value: (m) => m.orderId ?? '' },
  ], rows);
});

try {
  [state.settings, state.categories] = await Promise.all([getSettings({ fresh: true }), listAllCategories()]);
} catch (error) {
  setHtml($('#stock-list'), html`<div class="panel-body">${errorState({ text: friendlyError(error) })}</div>`);
}
watchAllProducts(
  (products) => {
    state.products = products;
    renderStock();
    const target = params.get('producto');
    if (target && !state.openedFromUrl) {
      state.openedFromUrl = true;
      const product = products.find((p) => p.id === target);
      if (product) openMovementForm(product);
    }
  },
  (error) => setHtml($('#stock-list'), html`<div class="panel-body">${errorState({ text: friendlyError(error) })}</div>`),
);
const movFilter = mountRangeFilter($('#mov-range'), { initial: '30d', onChange: (range) => loadMovements(range) });
loadMovements(movFilter.getRange());

// Página del carrito: cantidades, subtotales y avisos de disponibilidad en tiempo real.
import { html, setHtml, icon, $ } from '../../utils/html.js';
import { formatCLP, pluralize } from '../../utils/format.js';
import { freeShippingGap } from '../../utils/pricing.js';
import { watchProductsByIds } from '../../services/catalog.js';
import { friendlyError } from '../../services/errors.js';
import { errorState, emptyState, loadingState } from '../../components/states.js';
import { confirmDialog } from '../../components/dialog.js';
import { notify } from '../../components/toast.js';
import { initStoreLayout } from '../layout.js';
import { productImages } from '../product-visuals.js';
import { getCart, setQuantity, removeLine, updatePriceSeen, MAX_LINE_QUANTITY } from '../cart.js';
import { reconcileCart, describeOptions } from '../cart-view.js';

const main = $('#main');
let context;
let products = null;
let stopWatching = () => {};
let watchedIds = '';
const priceNotices = new Map();
let syncing = false;

setHtml(main, html`<div class="container section">${loadingState('Revisando tu bolsa…')}</div>`);

function issueMessage(item) {
  switch (item.issue) {
    case 'unavailable':
      return html`<p class="inline-alert is-error">${icon('block')} Este producto ya no está disponible. Quítalo para continuar.</p>`;
    case 'soldout':
      return html`<p class="inline-alert is-error">${icon('block')} Se agotó. Quítalo para continuar.</p>`;
    case 'quantity':
      return html`<p class="inline-alert">${icon('warning')} Solo ${item.free === 1 ? 'queda 1 unidad' : `quedan ${item.free} unidades`} disponibles.
        <button type="button" class="link-btn" data-fix="${item.line.key}" data-qty="${item.free}">Ajustar a ${item.free}</button></p>`;
    case 'options':
      return html`<p class="inline-alert is-error">${icon('tune')} Las opciones de este producto cambiaron. Quítalo y vuelve a agregarlo.</p>`;
    default:
      return '';
  }
}

function render() {
  const lines = getCart();
  if (lines.length === 0) {
    setHtml(
      main,
      html`<div class="container section">${emptyState({
        title: 'Tu bolsa está vacía',
        text: 'Explora el catálogo y agrega tus cositas favoritas.',
        iconName: 'shopping_bag',
        action: { href: '/catalogo.html', label: 'Ir al catálogo' },
      })}</div>`,
    );
    return;
  }
  if (!products) return;

  const { settings, categoriesById } = context;
  const view = reconcileCart(lines, products);
  // Registra los cambios de precio para avisarlos y actualiza la referencia local
  // sin volver a pintar en cada actualización.
  syncing = true;
  for (const item of view.items) {
    if (item.priceChanged) {
      priceNotices.set(item.line.key, { from: item.line.priceSeen, to: item.product.price });
      updatePriceSeen(item.line.key, item.product.price);
    }
  }
  syncing = false;
  const gap = freeShippingGap(settings, view.subtotal);
  const threshold = settings.freeShippingThreshold;

  setHtml(
    main,
    html`<div class="container page-head">
        <h1 class="page-title">Tu bolsa</h1>
        <p class="text-muted">${pluralize(view.units, 'producto')} listo${view.units === 1 ? '' : 's'} para comprar</p>
      </div>
      <div class="container two-col">
        <ul class="cart-list" aria-label="Productos en tu bolsa">
          ${view.items.map((item) => {
            const product = item.product;
            const category = product ? categoriesById.get(product.categoryId) : null;
            const [image] = product ? productImages(product, category) : [{ src: item.line.image || '/assets/images/illustrations/generic.svg', photo: Boolean(item.line.image) }];
            const notice = priceNotices.get(item.line.key);
            const url = `/producto.html?id=${encodeURIComponent(item.line.productId)}`;
            return html`<li class="cart-line" data-key="${item.line.key}">
              <div class="cart-line-media${image.photo ? '' : ' is-illustration'}"><img src="${image.src}" alt="" width="96" height="96" loading="lazy" /></div>
              <div class="cart-line-info">
                <h2><a href="${url}">${product?.name ?? item.line.name}</a></h2>
                ${Object.keys(item.line.options ?? {}).length ? html`<p class="cart-line-options">${describeOptions(item.line.options)}</p>` : ''}
                ${product ? html`<p class="text-muted" style="font-size:var(--fs-label-md)">${formatCLP(product.price)} c/u</p>` : ''}
                ${notice ? html`<p class="inline-alert is-info">${icon('info')} El precio cambió de ${formatCLP(notice.from)} a ${formatCLP(notice.to)}.</p>` : ''}
                ${issueMessage(item)}
              </div>
              <div class="cart-line-actions">
                ${product && item.issue !== 'soldout' && item.issue !== 'options'
                  ? html`<div class="stepper is-small" role="group" aria-label="Cantidad de ${product.name}">
                      <button type="button" data-qty-step="-1" aria-label="Disminuir cantidad">${icon('remove')}</button>
                      <input type="number" inputmode="numeric" min="1" max="${MAX_LINE_QUANTITY}" value="${item.line.quantity}" data-qty-input aria-label="Cantidad" />
                      <button type="button" data-qty-step="1" aria-label="Aumentar cantidad" ${item.line.quantity >= item.free ? 'disabled' : ''}>${icon('add')}</button>
                    </div>`
                  : ''}
                ${item.valid ? html`<span class="line-total">${formatCLP(item.lineTotal)}</span>` : ''}
                <button type="button" class="btn btn-ghost btn-sm" data-remove>${icon('delete')} Quitar</button>
              </div>
            </li>`;
          })}
        </ul>
        <aside class="summary-card sticky-aside" aria-labelledby="summary-title">
          <h2 id="summary-title">Resumen</h2>
          ${gap !== null
            ? html`<div class="ship-progress">
                <span>${gap === 0 ? html`${icon('celebration')} ¡Tienes envío gratis en despacho!` : html`Te faltan <strong>${formatCLP(gap)}</strong> para envío gratis`}</span>
                <span class="ship-progress-bar" aria-hidden="true"><span style="width:${Math.min(100, Math.round((view.subtotal / threshold) * 100))}%"></span></span>
              </div>`
            : ''}
          <div class="summary-rows">
            <div class="summary-row"><span>Subtotal</span><strong>${formatCLP(view.subtotal)}</strong></div>
            <div class="summary-row"><span>Envío</span><span>Se calcula al elegir la entrega</span></div>
          </div>
          <div class="summary-total"><span>Total estimado</span><strong>${formatCLP(view.subtotal)}</strong></div>
          ${view.blocking ? html`<p class="inline-alert is-error" role="alert">${icon('error')} Revisa los productos marcados antes de continuar.</p>` : ''}
          <a class="btn btn-gradient btn-lg btn-block" href="/checkout.html" ${view.blocking ? html`aria-disabled="true" data-blocked` : ''}>
            ${icon('lock')} Continuar con el pedido
          </a>
          <a class="btn btn-ghost btn-block" href="/catalogo.html">Seguir comprando</a>
          <p class="text-muted" style="font-size:var(--fs-label-md)">Precios en pesos chilenos (CLP). El stock y el precio se confirman al registrar el pedido.</p>
        </aside>
      </div>`,
  );
}

function watch() {
  const ids = [...new Set(getCart().map((l) => l.productId))].sort();
  const key = ids.join(',');
  if (key === watchedIds) return;
  watchedIds = key;
  stopWatching();
  stopWatching = watchProductsByIds(
    ids,
    (map) => {
      products = map;
      render();
    },
    (error) => setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error) })}</div>`),
  );
}

main.addEventListener('click', async (event) => {
  const lineEl = event.target.closest('[data-key]');
  const key = lineEl?.dataset.key;
  if (event.target.closest('[data-blocked]')) {
    event.preventDefault();
    notify.warning('Revisa tu bolsa', 'Hay productos sin stock suficiente o no disponibles.');
    return;
  }
  const fix = event.target.closest('[data-fix]');
  if (fix) {
    setQuantity(fix.dataset.fix, Number(fix.dataset.qty));
    return;
  }
  if (!key) return;
  const line = getCart().find((l) => l.key === key);
  if (!line) return;
  const step = event.target.closest('[data-qty-step]');
  if (step) {
    const next = line.quantity + Number(step.dataset.qtyStep);
    if (next <= 0) {
      const ok = await confirmDialog({ title: '¿Quitar producto?', message: `Se quitará "${line.name}" de tu bolsa.`, confirmLabel: 'Quitar', danger: true });
      if (ok) removeLine(key);
    } else setQuantity(key, next);
    return;
  }
  if (event.target.closest('[data-remove]')) {
    removeLine(key);
    notify.info('Producto quitado', line.name);
  }
});

main.addEventListener('change', (event) => {
  if (!event.target.matches('[data-qty-input]')) return;
  const key = event.target.closest('[data-key]').dataset.key;
  const value = Math.floor(Number(event.target.value));
  if (!Number.isFinite(value) || value < 1) {
    event.target.value = getCart().find((l) => l.key === key)?.quantity ?? 1;
    notify.warning('Cantidad no válida', 'Ingresa un número entero mayor que cero.');
    return;
  }
  setQuantity(key, value);
});

window.addEventListener('cart:change', () => {
  if (syncing) return;
  watch();
  render();
});

async function load() {
  try {
    const { settings, categories } = await initStoreLayout({ active: 'carrito' });
    context = { settings, categoriesById: new Map(categories.map((c) => [c.id, c])) };
    if (getCart().length === 0) render();
    else watch();
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error), retry: true })}</div>`);
    main.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
  }
}

load();

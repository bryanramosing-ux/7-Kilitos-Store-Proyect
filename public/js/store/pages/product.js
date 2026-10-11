// Ficha de producto: datos en tiempo real desde Firestore (precio, stock, estado).
import { html, setHtml, icon, $ } from '../../utils/html.js';
import { formatCLP, discountPercent } from '../../utils/format.js';
import { availabilityLabel } from '../../utils/stock.js';
import { listActiveProducts, watchProduct } from '../../services/catalog.js';
import { friendlyError } from '../../services/errors.js';
import { errorState, emptyState, loadingState } from '../../components/states.js';
import { notify } from '../../components/toast.js';
import { initStoreLayout } from '../layout.js';
import { productCard, bindProductGrid } from '../product-card.js';
import { productImages } from '../product-visuals.js';
import { addToCart, quantityInCart, MAX_LINE_QUANTITY } from '../cart.js';
import { isFavorite, toggleFavorite } from '../favorites.js';

const FEATURE_ICONS = ['auto_stories', 'star', 'folder_special', 'bookmark_heart', 'redeem', 'palette', 'brush', 'favorite'];
const main = $('#main');
const productId = new URLSearchParams(location.search).get('id');
const ui = { selected: {}, quantity: 1, image: 0, imagesKey: '' };
let context;
let product;

setHtml(main, html`<div class="container section">${loadingState('Cargando producto…')}</div>`);

function maxQuantity() {
  const free = Math.max(0, (product.stock ?? 0) - quantityInCart(product.id));
  return Math.min(free, MAX_LINE_QUANTITY);
}

function renderGallery(images) {
  const current = images[ui.image] ?? images[0];
  const discount = discountPercent(product.price, product.compareAtPrice);
  return html`<div class="gallery-main${current.photo ? '' : ' is-illustration'}">
      <img class="gallery-image" src="${current.src}" alt="${current.alt}" width="800" height="800" id="main-image" />
      <div class="gallery-badges">
        ${product.badge ? html`<span class="badge badge-ambar">${product.badge}</span>` : ''}
        ${discount > 0 ? html`<span class="badge badge-brand">${discount}% OFF</span>` : ''}
      </div>
      <img class="gallery-stamp" src="/assets/images/logo-7kilitos-96.webp" alt="" width="56" height="56" />
    </div>
    ${images.length > 1
      ? html`<div class="thumbs" role="group" aria-label="Fotos del producto">
          ${images.map(
            (img, i) => html`<button type="button" class="thumb" data-image="${i}" aria-current="${i === ui.image}"
              aria-label="Ver foto ${i + 1} de ${images.length}"><img src="${img.src}" alt="" width="68" height="68" /></button>`,
          )}
        </div>
        <div class="gallery-dots" aria-hidden="true">${images.map((_, i) => html`<span class="${i === ui.image ? 'is-active' : ''}"></span>`)}</div>`
      : ''}`;
}

function renderBuyBox() {
  const settings = context.settings;
  const availability = availabilityLabel(product, settings);
  const discount = discountPercent(product.price, product.compareAtPrice);
  const soldOut = availability.level === 'agotado';
  const max = maxQuantity();
  ui.quantity = Math.min(Math.max(1, ui.quantity), Math.max(1, max));
  const inCart = quantityInCart(product.id);
  const stockText =
    availability.level === 'bajo'
      ? `¡Solo ${product.stock === 1 ? 'queda 1 unidad disponible' : `quedan ${product.stock} unidades disponibles`}!`
      : availability.level === 'agotado'
        ? 'Producto agotado por ahora.'
        : `Disponible: ${product.stock} unidades.`;

  return html`<div class="price-box">
      <div class="price-box-row">
        <p class="price" style="display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap">
          <span class="price-now">${formatCLP(product.price)}</span>
          ${discount > 0 ? html`<span class="price-before"><span class="sr-only">Precio anterior:</span> ${formatCLP(product.compareAtPrice)} CLP</span>` : html`<span class="price-currency">CLP</span>`}
        </p>
        ${discount > 0 ? html`<span class="badge badge-pink">${discount}% OFF</span>` : ''}
      </div>
      ${Number.isInteger(settings.freeShippingThreshold) && settings.freeShippingThreshold > 0
        ? html`<p class="text-muted" style="font-size:var(--fs-label-md);display:flex;gap:.4rem;align-items:center">
            ${icon('local_shipping')} Envío gratis en despachos sobre ${formatCLP(settings.freeShippingThreshold)}</p>`
        : ''}
    </div>
    <p class="stock-alert is-${availability.level}" role="status">${icon(availability.icon)} ${stockText}
      ${inCart ? html`<span style="margin-left:auto;font-weight:600">Ya tienes ${inCart} en tu bolsa</span>` : ''}</p>

    <form id="buy-form" class="product-info" novalidate>
      ${(product.options ?? []).map(
        (group, gi) => html`<fieldset class="option-group">
          <legend>${group.name}: <output id="opt-out-${gi}">${ui.selected[group.name] ?? 'elige una opción'}</output></legend>
          <div class="option-values">
            ${group.values.map(
              (value) => html`<label class="option-value">
                <input type="radio" name="opt-${gi}" value="${value}" data-group="${group.name}" data-index="${gi}"
                  ${ui.selected[group.name] === value ? 'checked' : ''} ${soldOut ? 'disabled' : ''} />
                <span>${value}</span>
              </label>`,
            )}
          </div>
          <p class="error-text" id="opt-error-${gi}" style="color:var(--danger);font-size:var(--fs-label-md);font-weight:700"></p>
        </fieldset>`,
      )}
      <div class="buy-row">
        <div class="stepper" role="group" aria-label="Cantidad">
          <button type="button" data-step="-1" aria-label="Disminuir cantidad" ${soldOut || ui.quantity <= 1 ? 'disabled' : ''}>${icon('remove')}</button>
          <input type="number" id="qty" inputmode="numeric" min="1" max="${Math.max(1, max)}" value="${ui.quantity}"
            aria-label="Cantidad" ${soldOut || max === 0 ? 'disabled' : ''} />
          <button type="button" data-step="1" aria-label="Aumentar cantidad" ${soldOut || ui.quantity >= max ? 'disabled' : ''}>${icon('add')}</button>
        </div>
        <button type="submit" class="btn btn-gradient btn-lg" data-mode="add" ${soldOut || max === 0 ? 'disabled' : ''}>
          ${icon('shopping_bag')} ${soldOut ? 'Agotado' : max === 0 ? 'Ya tienes todo el stock' : 'Agregar a la bolsa'} ${soldOut || max === 0 ? '' : '✨'}
        </button>
      </div>
      <button type="button" class="btn btn-secondary btn-block" data-mode="buy-now" ${soldOut || max === 0 ? 'disabled' : ''}>
        ${icon('bolt')} Comprar ahora
      </button>
    </form>`;
}

function renderDetails() {
  const { settings } = context;
  const deliveries = (settings.deliveryMethods ?? []).filter((m) => m.active);
  return html`
    ${(product.features ?? []).length
      ? html`<section aria-labelledby="features-title" style="display:grid;gap:.75rem">
          <h2 id="features-title" style="font-size:var(--fs-headline-md)">🎁 ¿Qué incluye?</h2>
          <ul class="feature-list">
            ${product.features.map(
              (f, i) => html`<li><span class="feature-icon">${icon(FEATURE_ICONS[i % FEATURE_ICONS.length])}</span>
                <div><strong>${f.title}</strong>${f.text ? html`<p>${f.text}</p>` : ''}</div></li>`,
            )}
          </ul>
        </section>`
      : ''}
    ${deliveries.length
      ? html`<section class="info-card" aria-label="Entrega y pago">
          ${deliveries.map(
            (m) => html`<div class="info-row"><span class="info-row-icon">${icon(m.requiresAddress ? 'local_shipping' : 'storefront')}</span>
              <div><strong>${m.name} (${m.cost > 0 ? formatCLP(m.cost) : 'sin costo'})</strong>${m.description ? html`<p>${m.description}</p>` : ''}</div></div>`,
          )}
          <div class="info-row"><span class="info-row-icon">${icon('help')}</span>
            <div><strong>¿Dudas?</strong><p>Revisa <a href="/ayuda.html">cómo comprar</a> o escríbenos.</p></div></div>
        </section>`
      : ''}`;
}

function paintDynamic() {
  setHtml($('#buy-box'), renderBuyBox());
}

function paintAll() {
  const { categoriesById } = context;
  const category = categoriesById.get(product.categoryId);
  const images = productImages(product, category);
  ui.imagesKey = images.map((i) => i.src).join('|');
  if (ui.image >= images.length) ui.image = 0;
  const favorite = isFavorite(product.id);
  document.title = `${product.name} | ${context.settings.storeName}`;

  setHtml(
    main,
    html`<div class="container">
        <div class="breadcrumb-row">
          <nav class="breadcrumb" aria-label="Ruta de navegación">
            <a class="round-btn" href="/catalogo.html" aria-label="Volver al catálogo">${icon('arrow_back_ios_new')}</a>
            <p class="crumbs">
              <a href="/catalogo.html">Catálogo</a> <span aria-hidden="true">›</span>
              ${category ? html`<a href="/catalogo.html?categoria=${encodeURIComponent(category.id)}">${category.name}</a> <span aria-hidden="true">›</span>` : ''}
              <span aria-current="page">${product.name}</span>
            </p>
          </nav>
          <div style="display:flex;gap:.5rem">
            <button type="button" class="round-btn" id="share-btn" aria-label="Compartir producto" style="border:0">${icon('share')}</button>
            <button type="button" class="round-btn" id="fav-btn" aria-pressed="${favorite}" style="border:0;${favorite ? 'color:var(--pink-deep)' : ''}"
              aria-label="${favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}">${icon('favorite', { filled: favorite })}</button>
          </div>
        </div>
        <div class="product-layout">
          <div class="gallery" id="gallery">${renderGallery(images)}</div>
          <div class="product-info">
            ${category ? html`<p class="product-category" style="font-size:var(--fs-label-md)">${category.name}</p>` : ''}
            <h1 class="product-title">${product.name}</h1>
            ${product.description ? html`<p class="text-muted" style="white-space:pre-line">${product.description}</p>` : ''}
            <div id="buy-box" class="product-info"></div>
            ${renderDetails()}
          </div>
        </div>
        <section class="section" aria-labelledby="related-title">
          <div class="section-head">
            <h2 class="section-title" id="related-title">✨ Completa tu set</h2>
            <a class="link-btn" href="/catalogo.html${category ? `?categoria=${encodeURIComponent(category.id)}` : ''}">Ver todo ${icon('chevron_right')}</a>
          </div>
          <div class="related-row" id="related"></div>
        </section>
      </div>`,
  );
  paintDynamic();
  paintRelated();
}

function paintRelated() {
  const container = $('#related');
  const others = context.products.filter((p) => p.id !== product.id && (p.stock ?? 0) > 0);
  const sameCategory = others.filter((p) => p.categoryId === product.categoryId);
  const related = [...sameCategory, ...others.filter((p) => p.categoryId !== product.categoryId)].slice(0, 8);
  if (related.length === 0) {
    container.closest('section').hidden = true;
    return;
  }
  setHtml(container, html`${related.map((p, i) => productCard(p, { categoriesById: context.categoriesById, settings: context.settings, index: i }))}`);
}

function readSelection(form) {
  let valid = true;
  (product.options ?? []).forEach((group, gi) => {
    const error = $(`#opt-error-${gi}`);
    if (!ui.selected[group.name]) {
      valid = false;
      error.textContent = `Selecciona ${group.name.toLowerCase()}.`;
    } else {
      error.textContent = '';
    }
  });
  if (!valid) form.querySelector('.option-group:has(.error-text:not(:empty)) input')?.focus();
  return valid;
}

function handleAdd(mode) {
  const form = $('#buy-form');
  if (!readSelection(form)) {
    notify.warning('Falta elegir una opción', 'Selecciona todas las opciones del producto.');
    return;
  }
  const result = addToCart(product, ui.quantity, { ...ui.selected });
  if (result.added === 0) {
    notify.warning('No quedan más unidades disponibles', result.tooManyLines ? 'Tu bolsa tiene demasiados productos distintos.' : 'Ya tienes en tu bolsa todo el stock disponible.');
    paintDynamic();
    return;
  }
  if (mode === 'buy-now') {
    location.href = '/checkout.html';
    return;
  }
  notify.success(
    '¡Añadido con mucho amor! 🌸',
    result.limited ? `Se agregaron ${result.added} (máximo disponible).` : `${product.name} está en tu bolsa.`,
    { action: { label: 'Ver bolsa', href: '/carrito.html' } },
  );
  ui.quantity = 1;
  paintDynamic();
}

function bindEvents() {
  main.addEventListener('click', async (event) => {
    const thumb = event.target.closest('[data-image]');
    if (thumb) {
      ui.image = Number(thumb.dataset.image);
      const images = productImages(product, context.categoriesById.get(product.categoryId));
      setHtml($('#gallery'), renderGallery(images));
      return;
    }
    const step = event.target.closest('[data-step]');
    if (step) {
      ui.quantity = Math.min(Math.max(1, ui.quantity + Number(step.dataset.step)), Math.max(1, maxQuantity()));
      paintDynamic();
      $('#qty')?.focus();
      return;
    }
    if (event.target.closest('[data-mode="buy-now"]')) {
      handleAdd('buy-now');
      return;
    }
    if (event.target.closest('#fav-btn')) {
      const button = $('#fav-btn');
      const active = toggleFavorite(product.id);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Quitar de favoritos' : 'Guardar en favoritos');
      button.style.color = active ? 'var(--pink-deep)' : '';
      button.querySelector('.icon').classList.toggle('is-filled', active);
      notify.info(active ? 'Guardado en favoritos' : 'Quitado de favoritos', active ? 'Lo encontrarás en la pestaña Favoritos.' : '');
      return;
    }
    if (event.target.closest('#share-btn')) {
      const data = { title: product.name, text: `${product.name} en ${context.settings.storeName}`, url: location.href };
      try {
        if (navigator.share) await navigator.share(data);
        else {
          await navigator.clipboard.writeText(location.href);
          notify.success('Enlace copiado', 'Pégalo donde quieras compartirlo.');
        }
      } catch (error) {
        if (error?.name !== 'AbortError') notify.error('No se pudo compartir', 'Copia la dirección desde la barra del navegador.');
      }
    }
  });
  main.addEventListener('change', (event) => {
    const radio = event.target.closest('input[data-group]');
    if (radio) {
      ui.selected[radio.dataset.group] = radio.value;
      $(`#opt-out-${radio.dataset.index}`).textContent = radio.value;
      $(`#opt-error-${radio.dataset.index}`).textContent = '';
      return;
    }
    if (event.target.id === 'qty') {
      const value = Math.floor(Number(event.target.value));
      const max = Math.max(1, maxQuantity());
      if (!Number.isFinite(value) || value < 1) ui.quantity = 1;
      else if (value > max) {
        ui.quantity = max;
        notify.warning('Cantidad ajustada', `Solo puedes agregar ${max} ${max === 1 ? 'unidad' : 'unidades'} más.`);
      } else ui.quantity = value;
      paintDynamic();
    }
  });
  main.addEventListener('submit', (event) => {
    if (event.target.id !== 'buy-form') return;
    event.preventDefault();
    handleAdd('add');
  });
  window.addEventListener('cart:change', () => product && paintDynamic());
}

async function load() {
  if (!productId) {
    setHtml(main, html`<div class="container section">${emptyState({ title: 'Producto no encontrado', iconName: 'search_off', action: { href: '/catalogo.html', label: 'Ir al catálogo' } })}</div>`);
    return;
  }
  try {
    const { settings, categories } = await initStoreLayout({ active: 'catalogo' });
    const products = await listActiveProducts();
    context = { settings, categories, categoriesById: new Map(categories.map((c) => [c.id, c])), products };
    bindEvents();
    bindProductGrid(main, (id) => products.find((p) => p.id === id));
    watchProduct(
      productId,
      (data) => {
        const wasLoaded = Boolean(product);
        if (!data || data.active !== true) {
          product = null;
          setHtml(main, html`<div class="container section">${emptyState({
            title: 'Este producto no está disponible',
            text: 'Puede que se haya despublicado. Te mostramos otras opciones en el catálogo.',
            iconName: 'inventory_2',
            action: { href: '/catalogo.html', label: 'Ver catálogo' },
          })}</div>`);
          return;
        }
        const previous = product;
        product = data;
        const images = productImages(product, context.categoriesById.get(product.categoryId));
        const structureChanged =
          !wasLoaded ||
          images.map((i) => i.src).join('|') !== ui.imagesKey ||
          JSON.stringify(previous.options) !== JSON.stringify(product.options) ||
          previous.name !== product.name ||
          previous.description !== product.description;
        if (structureChanged) paintAll();
        else {
          paintDynamic();
          if (previous.price !== product.price) notify.info('El precio se actualizó', `Nuevo precio: ${formatCLP(product.price)}`);
        }
      },
      (error) => {
        // Producto despublicado o inexistente: las reglas niegan la lectura.
        const notAvailable = error?.code === 'permission-denied';
        setHtml(main, html`<div class="container section">${notAvailable
          ? emptyState({ title: 'Este producto no está disponible', iconName: 'inventory_2', action: { href: '/catalogo.html', label: 'Ver catálogo' } })
          : errorState({ text: friendlyError(error) })}</div>`);
      },
    );
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error), retry: true })}</div>`);
    main.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
  }
}

load();

// Tarjeta de producto y acciones rápidas (agregar al carrito, favorito).
import { html, icon } from '../utils/html.js';
import { formatCLP, discountPercent } from '../utils/format.js';
import { availabilityLabel } from '../utils/stock.js';
import { isFavorite, toggleFavorite } from './favorites.js';
import { addToCart } from './cart.js';
import { notify } from '../components/toast.js';
import { productImages } from './product-visuals.js';

const BADGE_TONES = ['badge-pink', 'badge-lavanda', 'badge-ambar', 'badge-rosa'];

export function productUrl(product) {
  return `/producto.html?id=${encodeURIComponent(product.id)}`;
}

export function productCard(product, { categoriesById, settings, index = 0 }) {
  const category = categoriesById.get(product.categoryId);
  const [image] = productImages(product, category);
  const availability = availabilityLabel(product, settings);
  const soldOut = availability.level === 'agotado';
  const discount = discountPercent(product.price, product.compareAtPrice);
  const favorite = isFavorite(product.id);
  const hasOptions = (product.options ?? []).length > 0;
  const url = productUrl(product);
  return html`<article class="product-card${soldOut ? ' is-sold-out' : ''}" data-product-id="${product.id}">
    <div class="product-media${image.photo ? '' : ' is-illustration'}">
      <a href="${url}" tabindex="-1" aria-hidden="true">
        <img src="${image.src}" alt="" loading="lazy" decoding="async" width="400" height="400" />
      </a>
      <div class="product-badges">
        ${product.badge ? html`<span class="badge ${BADGE_TONES[index % BADGE_TONES.length]}">${product.badge}</span>` : ''}
        ${discount > 0 ? html`<span class="badge badge-brand">-${discount}%</span>` : ''}
      </div>
      <button type="button" class="fav-btn" data-action="favorite" aria-pressed="${favorite}"
        aria-label="${favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}: ${product.name}">
        ${icon('favorite', { filled: favorite })}
      </button>
      ${soldOut ? html`<span class="sold-out-ribbon">Agotado</span>` : ''}
    </div>
    <div class="product-body">
      ${category ? html`<p class="product-category">${category.name}</p>` : ''}
      <h3 class="product-name"><a href="${url}">${product.name}</a></h3>
      <p class="availability is-${availability.level}">${icon(availability.icon)} ${availability.text}</p>
      <div class="product-foot">
        <p class="price">
          <span class="price-now">${formatCLP(product.price)}</span>
          ${discount > 0 ? html`<span class="price-before"><span class="sr-only">Antes</span> ${formatCLP(product.compareAtPrice)}</span>` : html`<span class="price-currency">CLP</span>`}
        </p>
        ${hasOptions
          ? html`<a class="quick-add" href="${url}" aria-label="Elegir opciones de ${product.name}">${icon('tune')}</a>`
          : html`<button type="button" class="quick-add" data-action="quick-add" ${soldOut ? 'disabled' : ''}
              aria-label="${soldOut ? `${product.name} está agotado` : `Agregar ${product.name} al carrito`}">${icon('add_shopping_cart')}</button>`}
      </div>
    </div>
  </article>`;
}

// Delegación de eventos para cualquier grilla de tarjetas.
export function bindProductGrid(container, getProduct) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-product-id]');
    const product = getProduct(card?.dataset.productId);
    if (!product) return;

    if (button.dataset.action === 'favorite') {
      const active = toggleFavorite(product.id);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `${active ? 'Quitar de favoritos' : 'Agregar a favoritos'}: ${product.name}`);
      button.querySelector('.icon').classList.toggle('is-filled', active);
      button.classList.remove('is-popping');
      void button.offsetWidth;
      button.classList.add('is-popping');
      return;
    }

    if (button.dataset.action === 'quick-add') {
      const result = addToCart(product, 1, {});
      if (result.added > 0) {
        button.classList.add('is-done');
        button.querySelector('.icon').textContent = 'done';
        setTimeout(() => {
          button.classList.remove('is-done');
          button.querySelector('.icon').textContent = 'add_shopping_cart';
        }, 1200);
        notify.success('¡Agregado con mucho amor! 🌸', `${product.name} está en tu bolsa.`, {
          action: { label: 'Ver bolsa', href: '/carrito.html' },
        });
      } else {
        notify.warning('No quedan más unidades disponibles', `Ya tienes en tu bolsa todo el stock de ${product.name}.`);
      }
    }
  });
}

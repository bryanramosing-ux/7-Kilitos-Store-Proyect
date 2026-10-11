// Portada: hero de marca, categorías, destacados y bloque promocional.
import { html, setHtml, icon, $ } from '../../utils/html.js';
import { formatCLP, instagramUrl, pluralize } from '../../utils/format.js';
import { listActiveProducts } from '../../services/catalog.js';
import { friendlyError } from '../../services/errors.js';
import { errorState, emptyState, skeletonCards } from '../../components/states.js';
import { initStoreLayout } from '../layout.js';
import { productCard, bindProductGrid } from '../product-card.js';
import { categoryTone, productImages } from '../product-visuals.js';
import { getCart, cartCount } from '../cart.js';

const main = $('#main');
setHtml(main, html`<div class="container section"><div class="product-grid">${skeletonCards(4)}</div></div>`);

const FILTERS = {
  destacados: { label: 'Todos los destacados', pick: (list) => list.filter((p) => p.featured) },
  vendidos: {
    label: 'Más vendidos',
    pick: (list) => list.filter((p) => (p.salesCount ?? 0) > 0).sort((a, b) => b.salesCount - a.salesCount),
  },
  ofertas: {
    label: 'Ofertas',
    pick: (list) => list.filter((p) => Number.isInteger(p.compareAtPrice) && p.compareAtPrice > p.price),
  },
  nuevos: {
    label: 'Novedades',
    pick: (list) => [...list].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
  },
};

function miniCart(categoriesById, productsById) {
  const lines = getCart();
  const count = cartCount(lines);
  const estimate = lines.reduce((sum, line) => sum + (line.priceSeen ?? 0) * line.quantity, 0);
  if (count === 0) {
    return html`<div class="mini-cart" aria-label="Resumen de tu bolsa">
      <div class="mini-cart-head"><span>${icon('shopping_bag')} Tu bolsa</span><span class="badge badge-rosa">vacía</span></div>
      <p class="text-muted" style="font-size:var(--fs-label-md)">Agrega tus favoritos y aparecerán aquí.</p>
      <a class="btn btn-plum btn-sm" href="/catalogo.html">Ver catálogo ${icon('arrow_forward')}</a>
    </div>`;
  }
  const first = lines[0];
  const product = productsById.get(first.productId);
  const [image] = product ? productImages(product, categoriesById.get(product.categoryId)) : [{ src: '/assets/images/illustrations/generic.svg' }];
  return html`<div class="mini-cart" aria-label="Resumen de tu bolsa">
    <div class="mini-cart-head"><span>${icon('shopping_bag')} Tu bolsa</span><span class="badge badge-pink">${pluralize(count, 'ítem', 'ítems')}</span></div>
    <div class="mini-cart-item">
      <img src="${image.src}" alt="" width="40" height="40" />
      <div><strong>${first.name}</strong><span class="text-muted">${formatCLP(first.priceSeen)} CLP</span></div>
      <span class="badge badge-neutral">${first.quantity}</span>
    </div>
    <div class="mini-cart-foot">
      <div><small>Subtotal estimado</small><strong>${formatCLP(estimate)} CLP</strong></div>
      <a class="btn btn-plum btn-sm" href="/carrito.html">Pagar ${icon('arrow_forward')}</a>
    </div>
  </div>`;
}

function render({ settings, categories, products }) {
  const hero = settings.hero ?? {};
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const productsById = new Map(products.map((p) => [p.id, p]));
  const counts = new Map();
  products.forEach((p) => counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1));
  const ig = instagramUrl(settings.instagram);
  const lines = getCart();
  const count = cartCount(lines);
  const estimate = lines.reduce((sum, line) => sum + (line.priceSeen ?? 0) * line.quantity, 0);

  const available = Object.entries(FILTERS).filter(([, f]) => f.pick(products).length > 0);
  if (available.length === 0) available.push(['nuevos', FILTERS.nuevos]);

  setHtml(
    main,
    html`<form class="container mobile-search" role="search" action="/catalogo.html" method="get">
        <div class="input-with-icon">${icon('search')}
          <label class="sr-only" for="home-search">Buscar productos</label>
          <input class="input input-pill" id="home-search" type="search" name="q" placeholder="Buscar stickers, planners, washis…" autocomplete="off" />
        </div>
        <a class="round-btn" href="/catalogo.html" aria-label="Ver catálogo con filtros">${icon('tune')}</a>
      </form>
      <div class="hero-wrap">
        <section class="container hero" aria-labelledby="hero-title">
          <div class="hero-copy">
            ${hero.badge ? html`<p class="pill-note">${icon('auto_awesome')} ${hero.badge}</p>` : ''}
            <div>
              ${hero.eyebrow ? html`<p class="eyebrow" style="color:var(--pink-deep)">${hero.eyebrow}</p>` : ''}
              <h1 class="hero-title" id="hero-title">${hero.title || settings.storeName}</h1>
              ${hero.subtitle ? html`<p class="hero-subtitle">${hero.subtitle}</p>` : ''}
            </div>
            ${hero.description ? html`<p class="hero-text">${hero.description}</p>` : ''}
            <div class="hero-actions">
              <a class="btn btn-gradient btn-lg" href="#destacados">
                ${icon('shopping_bag')} <span>${hero.ctaLabel || 'Comprar ahora'}</span>
                ${hero.ctaTag ? html`<span class="cta-tag">${hero.ctaTag}</span>` : ''}
              </a>
              <a class="btn btn-lg" href="/catalogo.html" style="color:var(--plum)">${icon('menu_book')} Ver catálogo</a>
            </div>
            ${(settings.highlights ?? []).length
              ? html`<ul class="highlights" aria-label="Lo que ofrecemos">
                  ${settings.highlights.map(
                    (h) => html`<li class="highlight"><span class="highlight-icon">${icon(h.icon || 'auto_awesome')}</span>
                      <div><strong>${h.title}</strong><span>${h.text}</span></div></li>`,
                  )}
                </ul>`
              : ''}
          </div>
          <div class="hero-visual">
            <span class="sparkle s1" aria-hidden="true">${icon('star', { filled: true })}</span>
            <span class="sparkle s2" aria-hidden="true">${icon('auto_awesome', { filled: true })}</span>
            <div class="mascot-ring">
              <img src="/assets/images/logo-7kilitos-640.webp" width="640" height="646"
                alt="Logo de ${settings.storeName}: un chanchito rosado con un libro dentro de un marco dorado" fetchpriority="high" />
              ${ig ? html`<a class="mascot-handle" href="${ig}" target="_blank" rel="noopener">@${settings.instagram} ${icon('favorite', { filled: true })}</a>` : ''}
            </div>
            ${miniCart(categoriesById, productsById)}
          </div>
        </section>
      </div>

      ${count > 0
        ? html`<div class="container" style="margin-top:-1rem">
            <a class="bag-strip" href="/carrito.html" style="color:inherit;text-decoration:none">
              <span style="display:flex;align-items:center;gap:.75rem">
                <span class="bag-strip-icon">${icon('shopping_bag', { filled: true })}</span>
                <span><p>${pluralize(count, 'cosita', 'cositas')} en tu bolsa</p><small>${formatCLP(estimate)} CLP</small></span>
              </span>
              <span class="btn btn-sm" style="background:var(--surface)">Ver bolsa ${icon('arrow_forward')}</span>
            </a>
          </div>`
        : ''}

      <section class="container section" aria-labelledby="cat-title">
        <div class="section-head">
          <h2 class="section-title-sm" id="cat-title">Explora por categoría</h2>
          <a class="link-btn" href="/catalogo.html">Ver todo el catálogo ${icon('chevron_right')}</a>
        </div>
        ${categories.length
          ? html`<div class="category-grid is-carousel">
              ${categories.map(
                (c) => html`<a class="category-tile tone-${categoryTone(c)}" href="/catalogo.html?categoria=${encodeURIComponent(c.id)}">
                  <span class="category-tile-icon">${icon(c.icon || 'category')}</span>
                  <strong>${c.name}</strong>
                  <small>${pluralize(counts.get(c.id) ?? 0, 'producto')}</small>
                </a>`,
              )}
            </div>`
          : html`<p class="text-muted">Aún no hay categorías publicadas.</p>`}
      </section>

      <section class="container section" id="destacados" aria-labelledby="featured-title" style="padding-top:0">
        <div class="section-head">
          <div>
            <p class="eyebrow">Favoritos del chanchito 💖</p>
            <h2 class="section-title" id="featured-title">Lo más lindo de la tienda</h2>
          </div>
          <div class="chip-row" role="group" aria-label="Filtrar destacados">
            ${available.map(
              ([key, f], i) => html`<button type="button" class="chip" data-filter="${key}" aria-pressed="${i === 0}">${f.label}</button>`,
            )}
          </div>
        </div>
        <div class="product-grid" id="featured-grid" aria-live="polite"></div>
        <p style="margin-top:1.5rem;text-align:center"><a class="btn btn-secondary" href="/catalogo.html">Ver todos los productos ${icon('arrow_forward')}</a></p>
      </section>

      <section class="container" aria-label="Experiencia ${settings.storeName}">
        <div class="bento">
          ${settings.promo?.title
            ? html`<div class="promo-card">
                <div>
                  ${settings.promo.badge ? html`<span class="badge badge-brand">${settings.promo.badge}</span>` : ''}
                  <h2>${settings.promo.title}</h2>
                  ${settings.promo.text ? html`<p>${settings.promo.text}</p>` : ''}
                  <a class="link-btn" href="/ayuda.html">Conoce cómo preparamos tu pedido ${icon('arrow_forward')}</a>
                </div>
                <span class="gift-bubble" aria-hidden="true">${icon('redeem')}</span>
              </div>`
            : ''}
          ${ig
            ? html`<div class="community-card">
                <div>
                  <h2>${icon('photo_camera')} @${settings.instagram}</h2>
                  ${settings.communityText ? html`<p>${settings.communityText}</p>` : ''}
                </div>
                <a class="btn btn-plum btn-block" href="${ig}" target="_blank" rel="noopener">Seguir en Instagram</a>
              </div>`
            : ''}
        </div>
      </section>`,
  );

  const grid = $('#featured-grid');
  const paint = (key) => {
    const list = FILTERS[key].pick(products).slice(0, 8);
    setHtml(
      grid,
      list.length
        ? html`${list.map((p, index) => productCard(p, { categoriesById, settings, index }))}`
        : emptyState({ title: 'Pronto habrá productos aquí', text: 'Mientras tanto, revisa el catálogo completo.', action: { href: '/catalogo.html', label: 'Ver catálogo' } }),
    );
  };
  paint(available[0][0]);
  main.querySelector('.chip-row')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;
    main.querySelectorAll('[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    paint(chip.dataset.filter);
  });
  bindProductGrid(grid, (id) => productsById.get(id));
}

async function load() {
  try {
    const { settings, categories } = await initStoreLayout({ active: 'inicio' });
    const products = await listActiveProducts();
    render({ settings, categories, products });
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error), retry: true })}</div>`);
    main.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
  }
}

load();

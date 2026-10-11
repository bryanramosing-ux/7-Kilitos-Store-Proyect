// Catálogo con búsqueda, filtro por categoría, ofertas, favoritos y orden.
import { html, setHtml, icon, $ } from '../../utils/html.js';
import { normalizeText, pluralize } from '../../utils/format.js';
import { listActiveProducts } from '../../services/catalog.js';
import { friendlyError } from '../../services/errors.js';
import { errorState, emptyState, skeletonCards } from '../../components/states.js';
import { initStoreLayout } from '../layout.js';
import { productCard, bindProductGrid } from '../product-card.js';
import { getFavorites } from '../favorites.js';

const main = $('#main');
const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') ?? '',
  categoria: params.get('categoria') ?? '',
  ofertas: params.get('ofertas') === '1',
  favoritos: params.get('favoritos') === '1',
  orden: params.get('orden') ?? 'destacados',
  disponibles: params.get('disponibles') === '1',
};

const SORTS = {
  destacados: { label: 'Destacados', fn: (a, b) => Number(b.featured ?? false) - Number(a.featured ?? false) || a.name.localeCompare(b.name, 'es') },
  vendidos: { label: 'Más vendidos', fn: (a, b) => (b.salesCount ?? 0) - (a.salesCount ?? 0) || a.name.localeCompare(b.name, 'es') },
  'precio-asc': { label: 'Precio: menor a mayor', fn: (a, b) => a.price - b.price },
  'precio-desc': { label: 'Precio: mayor a menor', fn: (a, b) => b.price - a.price },
  nombre: { label: 'Nombre (A-Z)', fn: (a, b) => a.name.localeCompare(b.name, 'es') },
  nuevos: { label: 'Novedades', fn: (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0) },
};

setHtml(
  main,
  html`<div class="container page-head"><div class="skeleton" style="height:2rem;width:12rem"></div></div>
    <div class="container"><div class="product-grid">${skeletonCards(8)}</div></div>`,
);

function searchableText(product, category) {
  return normalizeText(
    [
      product.name,
      product.description,
      product.sku,
      product.badge,
      category?.name,
      ...(product.options ?? []).flatMap((o) => o.values),
      ...(product.features ?? []).map((f) => f.title),
    ].join(' '),
  );
}

function syncUrl() {
  const next = new URLSearchParams();
  if (state.q) next.set('q', state.q);
  if (state.categoria) next.set('categoria', state.categoria);
  if (state.ofertas) next.set('ofertas', '1');
  if (state.favoritos) next.set('favoritos', '1');
  if (state.orden !== 'destacados') next.set('orden', state.orden);
  if (state.disponibles) next.set('disponibles', '1');
  const query = next.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function render({ settings, categories, products }) {
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const productsById = new Map(products.map((p) => [p.id, p]));
  const index = new Map(products.map((p) => [p.id, searchableText(p, categoriesById.get(p.categoryId))]));
  const hasSalesData = products.some((p) => (p.salesCount ?? 0) > 0);
  if (state.orden === 'vendidos' && !hasSalesData) state.orden = 'destacados';
  if (!SORTS[state.orden]) state.orden = 'destacados';
  if (state.categoria && !categoriesById.has(state.categoria)) state.categoria = '';

  const titleFor = () => {
    if (state.favoritos) return 'Mis favoritos';
    if (state.ofertas) return 'Ofertas';
    if (state.categoria) return categoriesById.get(state.categoria)?.name ?? 'Catálogo';
    return 'Catálogo';
  };

  setHtml(
    main,
    html`<div class="container page-head">
        <p class="eyebrow">${icon('auto_awesome')} Papelería kawaii</p>
        <h1 class="page-title" id="catalog-title"></h1>
      </div>
      <div class="container">
        <div class="catalog-toolbar">
          <form class="catalog-search" role="search" id="search-form">
            <div class="input-with-icon">
              ${icon('search')}
              <label class="sr-only" for="catalog-q">Buscar en el catálogo</label>
              <input class="input input-pill" id="catalog-q" type="search" name="q" value="${state.q}"
                placeholder="Buscar stickers, planners, washis…" autocomplete="off" />
            </div>
          </form>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
            <label class="check" style="font-size:var(--fs-label-md)"><input type="checkbox" id="only-available" ${state.disponibles ? 'checked' : ''} /> Solo disponibles</label>
            <label class="sr-only" for="sort">Ordenar productos</label>
            <select class="select sort-select" id="sort">
              ${Object.entries(SORTS)
                .filter(([key]) => key !== 'vendidos' || hasSalesData)
                .map(([key, s]) => html`<option value="${key}" ${state.orden === key ? 'selected' : ''}>${s.label}</option>`)}
            </select>
          </div>
        </div>
        <div class="chip-row" role="group" aria-label="Filtrar por categoría" id="chips">
          <button type="button" class="chip" data-chip="todos">Todo</button>
          ${categories.map((c) => html`<button type="button" class="chip" data-chip="cat" data-id="${c.id}">${c.name}</button>`)}
          <button type="button" class="chip" data-chip="ofertas">${icon('sell')} Ofertas</button>
          <button type="button" class="chip" data-chip="favoritos">${icon('favorite')} Favoritos</button>
        </div>
        <p class="result-count" id="result-count" role="status" aria-live="polite"></p>
        <div class="product-grid" id="grid"></div>
      </div>`,
  );

  const grid = $('#grid');
  const paint = () => {
    const favorites = getFavorites();
    const terms = normalizeText(state.q).split(' ').filter(Boolean);
    let list = products.filter((p) => {
      if (state.categoria && p.categoryId !== state.categoria) return false;
      if (state.ofertas && !(Number.isInteger(p.compareAtPrice) && p.compareAtPrice > p.price)) return false;
      if (state.favoritos && !favorites.has(p.id)) return false;
      if (state.disponibles && (p.stock ?? 0) <= 0) return false;
      const text = index.get(p.id);
      return terms.every((term) => text.includes(term));
    });
    list = list.sort(SORTS[state.orden].fn);
    // Los agotados siempre al final para no frustrar la compra.
    list = [...list.filter((p) => (p.stock ?? 0) > 0), ...list.filter((p) => (p.stock ?? 0) <= 0)];

    $('#catalog-title').textContent = titleFor();
    document.title = `${titleFor()} | ${settings.storeName}`;
    main.querySelectorAll('[data-chip]').forEach((chip) => {
      const kind = chip.dataset.chip;
      const pressed =
        (kind === 'todos' && !state.categoria && !state.ofertas && !state.favoritos) ||
        (kind === 'cat' && chip.dataset.id === state.categoria && !state.favoritos) ||
        (kind === 'ofertas' && state.ofertas) ||
        (kind === 'favoritos' && state.favoritos);
      chip.setAttribute('aria-pressed', String(pressed));
    });
    $('#result-count').textContent = `${pluralize(list.length, 'producto')}${state.q ? ` para "${state.q}"` : ''}`;

    if (list.length === 0) {
      let empty = { title: 'No encontramos productos', text: 'Prueba con otra palabra o revisa otra categoría.', iconName: 'search_off' };
      if (state.favoritos && favorites.size === 0) {
        empty = { title: 'Aún no tienes favoritos', text: 'Toca el corazón de un producto para guardarlo aquí.', iconName: 'favorite' };
      }
      setHtml(grid, html`<div style="grid-column:1/-1">${emptyState({ ...empty, action: { href: '/catalogo.html', label: 'Ver todo el catálogo' } })}</div>`);
      return;
    }
    setHtml(grid, html`${list.map((p, i) => productCard(p, { categoriesById, settings, index: i }))}`);
  };

  paint();
  bindProductGrid(grid, (id) => productsById.get(id));
  window.addEventListener('favorites:change', () => state.favoritos && paint());

  let debounce;
  const input = $('#catalog-q');
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = input.value.trim();
      syncUrl();
      paint();
    }, 180);
  });
  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = input.value.trim();
    syncUrl();
    paint();
  });
  $('#sort').addEventListener('change', (event) => {
    state.orden = event.target.value;
    syncUrl();
    paint();
  });
  $('#only-available').addEventListener('change', (event) => {
    state.disponibles = event.target.checked;
    syncUrl();
    paint();
  });
  $('#chips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-chip]');
    if (!chip) return;
    const kind = chip.dataset.chip;
    if (kind === 'todos') Object.assign(state, { categoria: '', ofertas: false, favoritos: false });
    if (kind === 'cat') Object.assign(state, { categoria: chip.dataset.id, favoritos: false });
    if (kind === 'ofertas') state.ofertas = !state.ofertas;
    if (kind === 'favoritos') state.favoritos = !state.favoritos;
    syncUrl();
    paint();
  });
  if (params.get('buscar') === '1') input.focus();
}

async function load() {
  const active = state.favoritos ? 'favoritos' : state.ofertas ? 'ofertas' : state.categoria ? `cat:${state.categoria}` : 'catalogo';
  try {
    const { settings, categories } = await initStoreLayout({ active });
    const products = await listActiveProducts();
    render({ settings, categories, products });
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error), retry: true })}</div>`);
    main.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
  }
}

load();

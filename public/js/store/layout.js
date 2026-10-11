// Estructura común de la tienda: encabezado, navegación, pie y barra inferior móvil.
import { html, setHtml, icon, safeUrl } from '../utils/html.js';
import { formatCLP, instagramUrl, whatsappUrl } from '../utils/format.js';
import { getSettings } from '../services/settings.js';
import { listActiveCategories } from '../services/catalog.js';
import { onSession, isStaffRole } from '../auth/session.js';
import { usingEmulators } from '../firebase/app.js';
import { friendlyError } from '../services/errors.js';
import { getCart, cartCount } from './cart.js';

let categoriesPromise;
export function getCategories() {
  categoriesPromise ??= listActiveCategories().catch((error) => {
    categoriesPromise = null;
    throw error;
  });
  return categoriesPromise;
}

function cartSummary() {
  const lines = getCart();
  const count = cartCount(lines);
  const estimate = lines.reduce((sum, line) => sum + (line.priceSeen ?? 0) * line.quantity, 0);
  return { count, estimate };
}

function announcementText(settings) {
  const parts = [];
  if (Number.isInteger(settings.freeShippingThreshold) && settings.freeShippingThreshold > 0) {
    parts.push(`Envíos gratis en compras sobre ${formatCLP(settings.freeShippingThreshold)}`);
  }
  if (settings.announcement) parts.push(settings.announcement);
  return parts.join(' | ');
}

function renderHeader(root, { settings, categories, active }) {
  const handle = settings.instagram ? `@${settings.instagram}` : '';
  const announcement = announcementText(settings);
  const offers = active === 'ofertas';
  setHtml(
    root,
    html`${announcement
        ? html`<div class="announce">
            <span class="announce-inner">${icon('auto_awesome')}<span class="announce-text">✨ ${announcement}</span>${icon('auto_awesome')}</span>
          </div>`
        : ''}
      <header class="site-header">
        <div class="header-main container">
          <a class="brand" href="/index.html" aria-label="${settings.storeName}: ir al inicio">
            <img class="brand-logo" src="/assets/images/logo-7kilitos-96.webp" width="44" height="44" alt="" />
            <span class="brand-text">
              <span class="brand-name">${settings.storeName}</span>
              <span class="brand-tag">${[handle, settings.tagline].filter(Boolean).join(' • ')}</span>
            </span>
          </a>
          <form class="header-search" role="search" action="/catalogo.html" method="get">
            <label class="sr-only" for="header-search-input">Buscar productos</label>
            ${icon('search')}
            <input id="header-search-input" class="input input-pill" type="search" name="q" autocomplete="off"
              placeholder="Buscar stickers, libretas, marcadores…" />
          </form>
          <div class="header-actions">
            <a class="round-btn only-mobile" href="/catalogo.html?buscar=1" aria-label="Buscar productos">${icon('search')}</a>
            <a class="round-btn only-desktop" href="/catalogo.html?favoritos=1" aria-label="Mis favoritos">${icon('favorite')}</a>
            <a class="cart-pill" href="/carrito.html" data-cart-link>
              <span class="cart-pill-icon">${icon('shopping_bag')}<span class="cart-count" data-cart-count hidden></span></span>
              <span class="cart-pill-text"><small>Carrito</small><strong data-cart-total>$0</strong></span>
            </a>
            <a class="account-link" href="/cuenta.html" data-account-link aria-label="Mi cuenta">${icon('person')}</a>
          </div>
        </div>
        <nav class="category-nav" aria-label="Categorías">
          <div class="container category-nav-inner">
            <a href="/index.html" ${active === 'inicio' ? html`aria-current="page"` : ''}>Inicio</a>
            ${categories.map(
              (c) => html`<a href="/catalogo.html?categoria=${encodeURIComponent(c.id)}"
                ${active === `cat:${c.id}` ? html`aria-current="page"` : ''}>${c.name}</a>`,
            )}
            <a href="/catalogo.html?ofertas=1" ${offers ? html`aria-current="page"` : ''}>Ofertas</a>
          </div>
        </nav>
      </header>`,
  );
}

function renderFooter(root, { settings, categories }) {
  const ig = instagramUrl(settings.instagram);
  const wa = whatsappUrl(settings.contact?.whatsapp);
  const mail = settings.contact?.email ? `mailto:${settings.contact.email}` : null;
  setHtml(
    root,
    html`<footer class="site-footer">
      <div class="container footer-grid">
        <div class="footer-brand">
          <p class="footer-title">${icon('favorite', { filled: true })} ${settings.storeName}</p>
          <p>${settings.tagline || 'Papelería bonita'} para organizar, estudiar y decorar con ternura.</p>
        </div>
        <nav aria-label="Categorías de la tienda">
          <p class="footer-heading">Categorías</p>
          <ul>
            ${categories.map((c) => html`<li><a href="/catalogo.html?categoria=${encodeURIComponent(c.id)}">${c.name}</a></li>`)}
            <li><a href="/catalogo.html">Ver todo el catálogo</a></li>
          </ul>
        </nav>
        <nav aria-label="Atención al cliente">
          <p class="footer-heading">Atención al cliente</p>
          <ul>
            <li><a href="/ayuda.html">Cómo comprar</a></li>
            <li><a href="/ayuda.html#envios">Envíos y pagos</a></li>
            <li><a href="/cuenta.html">Mis pedidos</a></li>
            <li><a href="/ayuda.html#contacto">Contacto</a></li>
          </ul>
        </nav>
        <div>
          <p class="footer-heading">Comunidad kawaii</p>
          ${settings.communityText ? html`<p>${settings.communityText}</p>` : ''}
          <div class="footer-social">
            ${ig ? html`<a class="social-dot is-lavanda" href="${ig}" target="_blank" rel="noopener" aria-label="Instagram @${settings.instagram}">${icon('photo_camera')}</a>` : ''}
            ${wa ? html`<a class="social-dot is-rosa" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('chat')}</a>` : ''}
            ${mail ? html`<a class="social-dot is-ambar" href="${safeUrl(mail)}" aria-label="Correo electrónico">${icon('mail')}</a>` : ''}
          </div>
        </div>
      </div>
      <div class="container footer-bottom">
        <p>© ${new Date().getFullYear()} ${settings.storeName}. Empacado con amor y destellos ✨</p>
        <p><a href="/login.html">Acceso para el equipo</a></p>
      </div>
    </footer>`,
  );
}

const BOTTOM_NAV = [
  { key: 'inicio', href: '/index.html', icon: 'cottage', label: 'Inicio' },
  { key: 'catalogo', href: '/catalogo.html', icon: 'grid_view', label: 'Categorías' },
  { key: 'favoritos', href: '/catalogo.html?favoritos=1', icon: 'favorite', label: 'Favoritos' },
  { key: 'carrito', href: '/carrito.html', icon: 'shopping_bag', label: 'Carrito' },
];

function renderBottomNav(root, active) {
  setHtml(
    root,
    html`<nav class="bottom-nav" aria-label="Navegación principal">
      ${BOTTOM_NAV.map(
        (item) => html`<a href="${item.href}" ${active === item.key ? html`aria-current="page"` : ''}>
          <span class="bottom-nav-icon">${icon(item.icon, { filled: active === item.key })}${item.key === 'carrito' ? html`<span class="bottom-nav-dot" data-cart-dot hidden></span>` : ''}</span>
          <span>${item.label}</span>
        </a>`,
      )}
    </nav>`,
  );
}

export function updateCartIndicators() {
  const { count, estimate } = cartSummary();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = count > 99 ? '99+' : String(count);
    el.hidden = count === 0;
  });
  document.querySelectorAll('[data-cart-total]').forEach((el) => {
    el.textContent = formatCLP(estimate);
  });
  document.querySelectorAll('[data-cart-dot]').forEach((el) => {
    el.hidden = count === 0;
  });
  document.querySelectorAll('[data-cart-link]').forEach((el) => {
    el.setAttribute('aria-label', count ? `Carrito: ${count} ${count === 1 ? 'producto' : 'productos'}` : 'Carrito vacío');
  });
}

function showBanner(id, text, variant = '') {
  if (document.getElementById(id)) return;
  const banner = document.createElement('div');
  banner.id = id;
  banner.className = `global-banner ${variant}`;
  banner.setAttribute('role', 'status');
  setHtml(banner, html`${icon(variant === 'is-demo' ? 'info' : 'wifi_off')}<span>${text}</span>`);
  document.body.prepend(banner);
}

function watchConnection() {
  const update = () => {
    if (navigator.onLine) document.getElementById('offline-banner')?.remove();
    else showBanner('offline-banner', 'Sin conexión: los datos pueden no estar actualizados y no podrás confirmar pedidos.');
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

/**
 * Pinta la estructura común. `active`: 'inicio' | 'catalogo' | 'favoritos' | 'carrito' | 'cat:<id>' | 'ofertas' | ''.
 * Devuelve { settings, categories } o lanza el error de configuración/conexión.
 */
export async function initStoreLayout({ active = '' } = {}) {
  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  const bottom = document.getElementById('bottom-nav');
  watchConnection();
  if (usingEmulators) showBanner('emulator-banner', 'Modo local: conectado a Firebase Local Emulator Suite.', 'is-demo');

  let settings;
  let categories = [];
  try {
    [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  } catch (error) {
    showBanner('config-banner', friendlyError(error));
    settings = { storeName: '7 Kilitos Store', instagram: '', tagline: '', contact: {}, error };
  }
  if (settings.demoMode) {
    showBanner('demo-banner', 'Catálogo de demostración: productos, precios y existencias son ejemplos, no inventario real.', 'is-demo');
  }
  const navActive = active.startsWith('cat:') || active === 'ofertas' ? active : active === 'inicio' ? 'inicio' : '';
  if (header) renderHeader(header, { settings, categories, active: navActive });
  if (footer) renderFooter(footer, { settings, categories });
  if (bottom) renderBottomNav(bottom, active.startsWith('cat:') || active === 'ofertas' ? 'catalogo' : active);
  updateCartIndicators();
  window.addEventListener('cart:change', updateCartIndicators);

  onSession(({ user, role }) => {
    const link = document.querySelector('[data-account-link]');
    if (!link) return;
    const signedIn = user && !user.isAnonymous;
    link.href = isStaffRole(role) ? '/admin/index.html' : '/cuenta.html';
    link.classList.toggle('is-signed-in', Boolean(signedIn));
    link.setAttribute('aria-label', isStaffRole(role) ? 'Ir al panel administrativo' : signedIn ? 'Mi cuenta y pedidos' : 'Iniciar sesión o ver mis pedidos');
  });

  if (settings.error) throw settings.error;
  return { settings, categories };
}

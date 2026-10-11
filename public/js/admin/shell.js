// Estructura del panel: verifica acceso, pinta menú lateral y barra superior.
import { html, setHtml, icon, $ } from '../utils/html.js';
import { requireStaff, logout, STAFF_ROLES } from '../auth/session.js';
import { usingEmulators } from '../firebase/app.js';
import { ROLE_LABELS } from '../utils/status.js';
import { loadingState } from '../components/states.js';
import { notify } from '../components/toast.js';

const NAV = [
  { group: 'Operación' },
  { id: 'dashboard', href: '/admin/index.html', icon: 'dashboard', label: 'Resumen', roles: STAFF_ROLES },
  { id: 'pedidos', href: '/admin/pedidos.html', icon: 'receipt_long', label: 'Pedidos', roles: STAFF_ROLES },
  { id: 'ventas', href: '/admin/ventas.html', icon: 'payments', label: 'Ventas', roles: STAFF_ROLES },
  { id: 'inventario', href: '/admin/inventario.html', icon: 'warehouse', label: 'Inventario', roles: STAFF_ROLES },
  { group: 'Catálogo' },
  { id: 'productos', href: '/admin/productos.html', icon: 'sell', label: 'Productos', roles: STAFF_ROLES },
  { id: 'categorias', href: '/admin/categorias.html', icon: 'category', label: 'Categorías', roles: ['admin'] },
  { group: 'Análisis y ajustes' },
  { id: 'reportes', href: '/admin/reportes.html', icon: 'insights', label: 'Reportes', roles: STAFF_ROLES },
  { id: 'configuracion', href: '/admin/configuracion.html', icon: 'settings', label: 'Configuración', roles: ['admin'] },
  { id: 'usuarios', href: '/admin/usuarios.html', icon: 'group', label: 'Usuarios y roles', roles: ['admin'] },
];

function renderSidebar(sidebar, page, role) {
  const items = [];
  let pendingGroup = null;
  for (const item of NAV) {
    if (item.group) {
      pendingGroup = item.group;
      continue;
    }
    if (!item.roles.includes(role)) continue;
    if (pendingGroup) {
      items.push(html`<p>${pendingGroup}</p>`);
      pendingGroup = null;
    }
    items.push(
      html`<a href="${item.href}" ${item.id === page ? html`aria-current="page"` : ''}>${icon(item.icon)} <span>${item.label}</span>
        ${item.id === 'pedidos' ? html`<span class="nav-count" data-pending-count hidden></span>` : ''}</a>`,
    );
  }
  setHtml(
    sidebar,
    html`<a class="sidebar-brand" href="/admin/index.html">
        <img src="/assets/images/logo-7kilitos-96.webp" alt="" width="40" height="40" />
        <span><strong>7 Kilitos</strong><small>Panel administrativo</small></span>
      </a>
      <nav class="side-nav" aria-label="Módulos del panel">${items}</nav>
      <div class="sidebar-foot">
        <a class="btn btn-secondary btn-sm" href="/index.html" target="_blank" rel="noopener">${icon('storefront')} Ver tienda</a>
        <button type="button" class="btn btn-ghost btn-sm" data-logout>${icon('logout')} Cerrar sesión</button>
      </div>`,
  );
}

function renderTopbar(topbar, title, user, role) {
  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
  setHtml(
    topbar,
    html`<button type="button" class="btn btn-ghost btn-icon menu-toggle" aria-label="Abrir menú" aria-controls="sidebar" aria-expanded="false" data-menu>${icon('menu')}</button>
      <h1>${title}</h1>
      <div class="user-chip">
        <div class="user-chip-text"><strong>${user.displayName || user.email}</strong><span class="badge badge-lavanda">${ROLE_LABELS[role] ?? role}</span></div>
        <span class="avatar" aria-hidden="true">${initial}</span>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-logout aria-label="Cerrar sesión">${icon('logout')}</button>
      </div>`,
  );
}

function bindMenu(sidebar, topbar) {
  const toggle = topbar.querySelector('[data-menu]');
  let backdrop = null;
  const close = () => {
    sidebar.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    backdrop?.remove();
    backdrop = null;
  };
  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) return close();
    sidebar.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.addEventListener('click', close);
    document.body.append(backdrop);
    sidebar.querySelector('a')?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
      close();
      toggle.focus();
    }
  });
}

/**
 * Inicializa una página del panel. Redirige si la sesión no tiene el rol requerido.
 * @returns {Promise<{ user, role, main: HTMLElement, isAdmin: boolean }>}
 */
export async function initAdminPage({ page, title, roles = STAFF_ROLES }) {
  const main = $('#main');
  setHtml(main, loadingState('Verificando acceso…'));
  const { user, role } = await requireStaff({ roles });
  const sidebar = $('#sidebar');
  const topbar = $('#topbar');
  renderSidebar(sidebar, page, role);
  renderTopbar(topbar, title, user, role);
  bindMenu(sidebar, topbar);
  document.title = `${title} | Panel 7 Kilitos`;
  document.querySelectorAll('[data-logout]').forEach((button) =>
    button.addEventListener('click', async () => {
      await logout();
      location.href = '/login.html';
    }),
  );
  if (usingEmulators) {
    const banner = document.createElement('div');
    banner.className = 'global-banner is-demo';
    banner.textContent = 'Modo local: conectado a Firebase Local Emulator Suite.';
    document.body.prepend(banner);
  }
  if (new URLSearchParams(location.search).get('aviso') === 'solo-admin') {
    notify.warning('Módulo solo para administración', 'Tu rol no tiene acceso a esa sección.');
  }
  setHtml(main, '');
  return { user, role, main, isAdmin: role === 'admin' };
}

export function setPendingCount(count) {
  document.querySelectorAll('[data-pending-count]').forEach((el) => {
    el.textContent = String(count);
    el.hidden = count === 0;
    el.setAttribute('aria-label', `${count} pendientes`);
  });
}

// Mi cuenta: pedidos propios (también para compras como invitada en este dispositivo).
import { html, setHtml, icon, $ } from '../../utils/html.js';
import { formatCLP, formatDate } from '../../utils/format.js';
import { listMyOrders } from '../../services/orders.js';
import { friendlyError } from '../../services/errors.js';
import { onSession, logout, isStaffRole, resendVerification } from '../../auth/session.js';
import { errorState, emptyState, loadingState } from '../../components/states.js';
import { notify } from '../../components/toast.js';
import { initStoreLayout } from '../layout.js';
import { statusBadge } from '../order-summary.js';

const main = $('#main');
setHtml(main, html`<div class="container section">${loadingState()}</div>`);

async function render({ user, role }) {
  if (!user) {
    setHtml(main, html`<div class="container section" style="max-width:40rem">${emptyState({
      title: 'Ingresa para ver tus pedidos',
      text: 'Con tu cuenta puedes revisar el estado de tus compras.',
      iconName: 'person',
      action: { href: '/login.html?next=%2Fcuenta.html', label: 'Iniciar sesión' },
    })}<p style="text-align:center;margin-top:1rem"><a href="/login.html?modo=registro">¿No tienes cuenta? Créala aquí</a></p></div>`);
    return;
  }
  const guest = user.isAnonymous;
  setHtml(main, html`<div class="container section">${loadingState('Cargando tus pedidos…')}</div>`);
  let orders = [];
  let loadError = null;
  try {
    orders = await listMyOrders(user.uid);
  } catch (error) {
    loadError = error;
  }
  setHtml(
    main,
    html`<div class="container page-head" style="display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;align-items:end">
        <div>
          <p class="eyebrow">${icon('favorite')} Mi cuenta</p>
          <h1 class="page-title">${guest ? 'Compras como invitada' : `Hola, ${user.displayName || user.email}`}</h1>
          ${guest ? html`<p class="text-muted">Estos pedidos están guardados solo en este dispositivo. Crea una cuenta para no perderlos.</p>` : html`<p class="text-muted">${user.email}</p>`}
          ${!guest && !user.emailVerified
            ? html`<p class="inline-alert is-info" style="margin-top:.5rem">${icon('mark_email_unread')} <span>Revisa tu correo para verificar tu cuenta.
                <button type="button" class="link-btn" id="resend">Reenviar correo de verificación</button></span></p>`
            : ''}
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          ${isStaffRole(role) ? html`<a class="btn btn-brand" href="/admin/index.html">${icon('dashboard')} Panel administrativo</a>` : ''}
          ${guest ? html`<a class="btn btn-gradient" href="/login.html?modo=registro&next=%2Fcuenta.html">${icon('person_add')} Crear cuenta</a>` : ''}
          <button type="button" class="btn btn-ghost" id="logout">${icon('logout')} ${guest ? 'Olvidar este dispositivo' : 'Cerrar sesión'}</button>
        </div>
      </div>
      <section class="container" aria-labelledby="orders-title">
        <h2 class="section-title-sm" id="orders-title" style="margin-bottom:1rem">Mis pedidos</h2>
        ${loadError
          ? errorState({ text: friendlyError(loadError) })
          : orders.length
            ? html`<ul class="order-list">
                ${orders.map(
                  (o) => html`<li><a class="order-item" href="/pedido.html?id=${encodeURIComponent(o.id)}">
                    <span><strong style="color:var(--pink-deep)">${o.orderNumber}</strong><br /><small class="text-muted">${formatDate(o.createdAt)} · ${o.itemCount} ${o.itemCount === 1 ? 'producto' : 'productos'}</small></span>
                    ${statusBadge(o.status)}
                    <strong>${formatCLP(o.total)}</strong>
                  </a></li>`,
                )}
              </ul>`
            : emptyState({ title: 'Aún no tienes pedidos', text: 'Cuando compres, verás aquí su estado.', iconName: 'receipt_long', action: { href: '/catalogo.html', label: 'Ir al catálogo' } })}
      </section>`,
  );
  $('#resend')?.addEventListener('click', async () => {
    try {
      await resendVerification();
      notify.success('Correo enviado', 'Revisa tu bandeja de entrada y spam.');
    } catch (error) {
      notify.error('No se pudo enviar el correo', friendlyError(error));
    }
  });
  $('#logout').addEventListener('click', async () => {
    await logout();
    notify.info('Sesión cerrada', '');
  });
}

async function load() {
  try {
    await initStoreLayout({ active: '' });
    onSession((session) => render(session));
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error) })}</div>`);
  }
}

load();

// Confirmación y seguimiento de un pedido (solo la persona que lo creó puede leerlo).
import { html, setHtml, icon, $ } from '../../utils/html.js';
import { formatCLP, formatDateTime, instagramUrl, whatsappUrl } from '../../utils/format.js';
import { ORDER_STATUS } from '../../utils/status.js';
import { watchOrder } from '../../services/orders.js';
import { friendlyError } from '../../services/errors.js';
import { currentSession } from '../../auth/session.js';
import { errorState, emptyState, loadingState } from '../../components/states.js';
import { initStoreLayout } from '../layout.js';
import { statusBadge, orderItemsTable, statusTimeline, deliveryBlock } from '../order-summary.js';

const main = $('#main');
const params = new URLSearchParams(location.search);
const orderId = params.get('id');
const isNew = params.get('nuevo') === '1';
let settings;

setHtml(main, html`<div class="container section">${loadingState('Cargando tu pedido…')}</div>`);

function lastOrderNumber() {
  try {
    const data = JSON.parse(sessionStorage.getItem('kilitos.lastOrder') ?? 'null');
    return data?.id === orderId ? data.number : null;
  } catch {
    return null;
  }
}

function contactLinks() {
  const links = [];
  const ig = instagramUrl(settings.instagram);
  const wa = whatsappUrl(settings.contact?.whatsapp);
  if (wa) links.push(html`<a class="btn btn-primary" href="${wa}" target="_blank" rel="noopener">${icon('chat')} Escribir por WhatsApp</a>`);
  if (ig) links.push(html`<a class="btn btn-secondary" href="${ig}" target="_blank" rel="noopener">${icon('photo_camera')} Instagram</a>`);
  if (settings.contact?.email) links.push(html`<a class="btn btn-ghost" href="mailto:${settings.contact.email}">${icon('mail')} ${settings.contact.email}</a>`);
  return links;
}

function render(order) {
  const info = ORDER_STATUS[order.status];
  document.title = `Pedido ${order.orderNumber} | ${settings.storeName}`;
  setHtml(
    main,
    html`<div class="container section" style="display:grid;gap:1.5rem;max-width:60rem">
      <section class="order-hero" aria-labelledby="order-title">
        <img src="/assets/images/logo-7kilitos-320.webp" alt="" width="96" height="96" />
        <h1 id="order-title" style="font-size:var(--fs-headline-md)">${isNew ? '¡Pedido recibido! 🌸' : 'Estado de tu pedido'}</h1>
        <p class="order-number">${order.orderNumber}</p>
        ${statusBadge(order.status)}
        <p class="text-muted" style="max-width:34rem">${info?.description ?? ''}</p>
        ${order.status === 'pendiente'
          ? html`<p class="inline-alert is-info" style="max-width:36rem">${icon('schedule')} Reservamos tu stock. La tienda revisará el pedido y te contactará al ${order.customer.phone} o a ${order.customer.email}.</p>`
          : ''}
      </section>

      ${['pendiente', 'confirmado'].includes(order.status) && order.payment?.instructions
        ? html`<section class="prose-card" aria-labelledby="pay-title">
            <h2 id="pay-title">${icon('payments')} Cómo pagar: ${order.payment.methodName}</h2>
            <p style="white-space:pre-line">${order.payment.instructions}</p>
            <p class="text-muted">Total a pagar: <strong style="color:var(--pink-deep)">${formatCLP(order.total)}</strong>. Indica el número ${order.orderNumber} en tu comprobante.</p>
          </section>`
        : ''}

      <div class="two-col" style="grid-template-columns:1fr">
        <section class="prose-card" aria-labelledby="items-title">
          <h2 id="items-title">Productos</h2>
          ${orderItemsTable(order)}
        </section>
      </div>

      <div style="display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))">
        <section class="prose-card" aria-labelledby="delivery-title">
          <h2 id="delivery-title">Entrega</h2>
          ${deliveryBlock(order)}
          <p class="text-muted">Pedido creado el ${formatDateTime(order.createdAt)}</p>
        </section>
        <section class="prose-card" aria-labelledby="history-title">
          <h2 id="history-title">Seguimiento</h2>
          ${statusTimeline(order)}
        </section>
      </div>

      <section class="prose-card" aria-labelledby="help-title">
        <h2 id="help-title">¿Necesitas ayuda con tu pedido?</h2>
        <div style="display:flex;flex-wrap:wrap;gap:.75rem">${contactLinks()}<a class="btn btn-ghost" href="/cuenta.html">${icon('receipt_long')} Ver mis pedidos</a></div>
      </section>
    </div>`,
  );
}

async function load() {
  try {
    ({ settings } = await initStoreLayout({ active: '' }));
    if (!orderId) {
      setHtml(main, html`<div class="container section">${emptyState({ title: 'Pedido no indicado', action: { href: '/cuenta.html', label: 'Ver mis pedidos' } })}</div>`);
      return;
    }
    const session = await currentSession();
    if (!session.user) {
      const number = lastOrderNumber();
      setHtml(main, html`<div class="container section">${emptyState({
        title: number ? `Tu pedido ${number} fue registrado` : 'Inicia sesión para ver este pedido',
        text: 'Por seguridad, solo la cuenta con la que se hizo el pedido puede ver su detalle.',
        iconName: 'lock',
        action: { href: `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`, label: 'Iniciar sesión' },
      })}</div>`);
      return;
    }
    watchOrder(
      orderId,
      (order) => {
        if (!order) {
          setHtml(main, html`<div class="container section">${emptyState({ title: 'No encontramos este pedido', iconName: 'search_off', action: { href: '/cuenta.html', label: 'Ver mis pedidos' } })}</div>`);
          return;
        }
        render(order);
      },
      (error) => {
        const denied = error?.code === 'permission-denied';
        setHtml(main, html`<div class="container section">${denied
          ? emptyState({
              title: 'No puedes ver este pedido con esta sesión',
              text: 'Solo la cuenta con la que se hizo el pedido puede ver su detalle. Si compraste como invitada en otro dispositivo, escríbenos indicando el número de pedido.',
              iconName: 'lock',
              action: { href: '/cuenta.html', label: 'Ir a mi cuenta' },
            })
          : errorState({ text: friendlyError(error) })}</div>`);
      },
    );
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error) })}</div>`);
  }
}

load();

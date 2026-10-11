// Detalle de pedido y cambios de estado (validados de nuevo en la Cloud Function).
import { html, icon } from '../utils/html.js';
import { formatCLP, formatDateTime, whatsappUrl } from '../utils/format.js';
import { allowedTransitions, TRANSITION_ACTIONS, ORDER_STATUS } from '../utils/status.js';
import { getOrder, updateOrderStatus } from '../services/orders.js';
import { friendlyError } from '../services/errors.js';
import { openDialog, confirmDialog } from '../components/dialog.js';
import { notify } from '../components/toast.js';
import { statusBadge, orderItemsTable, statusTimeline, deliveryBlock } from '../store/order-summary.js';

const CONFIRM_TEXT = {
  confirmado: 'Confirma que revisaste el pedido y que lo vas a preparar. Aún no cuenta como venta.',
  pagado: 'Registra que recibiste el pago completo. Desde este momento cuenta como venta confirmada con los precios del pedido.',
  entregado: 'Marca el pedido como entregado a la clienta. Este estado es final.',
};

async function askPaymentReference(order) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (!done) {
        done = true;
        resolve(value);
      }
    };
    const dialog = openDialog({
      title: `Registrar pago de ${order.orderNumber}`,
      body: html`<p>${CONFIRM_TEXT.pagado}</p>
        <p style="margin-top:.5rem"><strong>Total del pedido: ${formatCLP(order.total)}</strong> (${order.payment?.methodName})</p>
        <div class="field" style="margin-top:1rem">
          <label for="pay-ref">Referencia del pago <span class="text-muted">(opcional: n.º de transferencia o comprobante)</span></label>
          <input class="input" id="pay-ref" maxlength="80" />
        </div>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Volver</button>
        <button type="button" class="btn btn-brand" data-ok>${icon('paid')} Registrar pago</button>`,
      onClose: () => finish(null),
    });
    dialog.querySelector('[data-ok]').addEventListener('click', () => {
      finish({ paymentReference: dialog.querySelector('#pay-ref').value.trim() });
      dialog.close();
    });
  });
}

async function runTransition(order, target) {
  let note = '';
  let paymentReference = '';
  if (target === 'cancelado') {
    const paid = order.status === 'pagado';
    const reason = await confirmDialog({
      title: `Cancelar pedido ${order.orderNumber}`,
      message: paid
        ? 'El pedido está pagado: se anulará la venta (queda registrada como anulada, no se borra) y se devolverá el stock. Coordina el reembolso con la clienta.'
        : 'Se cancelará el pedido y se devolverá su stock reservado al inventario.',
      confirmLabel: 'Cancelar pedido',
      cancelLabel: 'Volver',
      danger: true,
      requireReason: true,
      reasonLabel: 'Motivo de la cancelación (queda en el historial)',
    });
    if (!reason) return false;
    note = reason;
  } else if (target === 'pagado') {
    const result = await askPaymentReference(order);
    if (!result) return false;
    paymentReference = result.paymentReference;
  } else {
    const ok = await confirmDialog({
      title: `${TRANSITION_ACTIONS[target].label}: ${order.orderNumber}`,
      message: CONFIRM_TEXT[target],
      confirmLabel: TRANSITION_ACTIONS[target].label,
    });
    if (!ok) return false;
  }
  try {
    const result = await updateOrderStatus({ orderId: order.id, status: target, note, paymentReference });
    if (result.changed) notify.success(`Pedido ${order.orderNumber}: ${ORDER_STATUS[target].label.toLowerCase()}`, target === 'pagado' ? 'Venta registrada.' : '');
    else notify.info('Sin cambios', `El pedido ya estaba ${ORDER_STATUS[target].label.toLowerCase()}.`);
    return true;
  } catch (error) {
    notify.error('No se pudo cambiar el estado', friendlyError(error));
    return false;
  }
}

/** Abre el detalle. `onChange` se llama cuando el estado cambió. */
export async function openOrderDialog(orderId, { role, onChange }) {
  let order;
  try {
    order = await getOrder(orderId);
  } catch (error) {
    notify.error('No se pudo abrir el pedido', friendlyError(error));
    return;
  }
  if (!order) {
    notify.error('Pedido no encontrado', '');
    return;
  }
  const transitions = allowedTransitions(order.status, role);
  const wa = whatsappUrl(order.customer?.phone);
  const blockedCancel = order.status === 'pagado' && role !== 'admin';
  const dialog = openDialog({
    title: html`Pedido ${order.orderNumber}`,
    wide: true,
    body: html`<div style="display:grid;gap:1.25rem">
        <div style="display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between">
          ${statusBadge(order.status)}
          <span class="text-muted">Creado el ${formatDateTime(order.createdAt)}</span>
        </div>
        <div class="grid-2 even" style="gap:1rem">
          <section class="panel"><div class="panel-body">
            <h3 style="margin-bottom:.5rem">Cliente</h3>
            <dl class="dl">
              <dt>Nombre</dt><dd>${order.customer?.name}</dd>
              <dt>Correo</dt><dd><a href="mailto:${order.customer?.email}">${order.customer?.email}</a></dd>
              <dt>Teléfono</dt><dd>${order.customer?.phone} ${wa ? html`<a class="link-btn" href="${wa}" target="_blank" rel="noopener">${icon('chat')} WhatsApp</a>` : ''}</dd>
            </dl>
          </div></section>
          <section class="panel"><div class="panel-body">
            <h3 style="margin-bottom:.5rem">Entrega y pago</h3>
            ${deliveryBlock(order)}
            <dl class="dl" style="margin-top:.75rem">
              <dt>Pago</dt><dd>${order.payment?.methodName}</dd>
              ${order.paymentReference ? html`<dt>Referencia</dt><dd>${order.paymentReference}</dd>` : ''}
              ${order.paidAt ? html`<dt>Pagado</dt><dd>${formatDateTime(order.paidAt)}</dd>` : ''}
              ${order.cancelReason ? html`<dt>Motivo cancelación</dt><dd>${order.cancelReason}</dd>` : ''}
              ${order.stockRestored ? html`<dt>Stock</dt><dd>Devuelto al inventario</dd>` : ''}
            </dl>
          </div></section>
        </div>
        ${order.notes ? html`<p class="inline-alert is-info">${icon('sticky_note_2')} <span><strong>Observaciones:</strong> ${order.notes}</span></p>` : ''}
        ${orderItemsTable(order)}
        <section><h3 style="margin-bottom:.75rem">Historial</h3>${statusTimeline(order)}</section>
        ${blockedCancel ? html`<p class="text-muted">${icon('lock')} Cancelar un pedido pagado (anula la venta) es exclusivo de administración.</p>` : ''}
      </div>`,
    footer: transitions.length
      ? html`${transitions.map(
          (t) => html`<button type="button" class="btn ${TRANSITION_ACTIONS[t].tone}" data-transition="${t}">${icon(TRANSITION_ACTIONS[t].icon)} ${TRANSITION_ACTIONS[t].label}</button>`,
        )}`
      : html`<span class="text-muted">Este pedido está ${ORDER_STATUS[order.status].label.toLowerCase()}: no admite más cambios.</span>
        <button type="button" class="btn btn-ghost" data-close>Cerrar</button>`,
  });
  dialog.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-transition]');
    if (!button) return;
    dialog.querySelectorAll('[data-transition]').forEach((b) => {
      b.disabled = true;
    });
    const changed = await runTransition(order, button.dataset.transition);
    if (changed) {
      dialog.close();
      onChange?.();
      openOrderDialog(orderId, { role, onChange });
    } else {
      dialog.querySelectorAll('[data-transition]').forEach((b) => {
        b.disabled = false;
      });
    }
  });
}

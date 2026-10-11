// Bloques reutilizables para mostrar un pedido (tienda y panel).
import { html, icon } from '../utils/html.js';
import { formatCLP, formatDateTime } from '../utils/format.js';
import { ORDER_STATUS } from '../utils/status.js';
import { describeOptions } from './cart-view.js';

export function statusBadge(status) {
  const info = ORDER_STATUS[status] ?? { label: status, icon: 'help' };
  return html`<span class="badge status status-${status}">${icon(info.icon)} ${info.label}</span>`;
}

export function orderItemsTable(order) {
  return html`<div class="table-wrap">
    <table class="table">
      <caption class="sr-only">Productos del pedido ${order.orderNumber}</caption>
      <thead><tr><th scope="col">Producto</th><th scope="col" class="num">Cant.</th><th scope="col" class="num">Precio</th><th scope="col" class="num">Subtotal</th></tr></thead>
      <tbody>
        ${order.items.map(
          (item) => html`<tr>
            <td><strong>${item.name}</strong>${Object.keys(item.options ?? {}).length ? html`<br /><small class="text-muted">${describeOptions(item.options)}</small>` : ''}
              ${item.sku ? html`<br /><small class="text-muted">SKU ${item.sku}</small>` : ''}</td>
            <td class="num">${item.quantity}</td>
            <td class="num">${formatCLP(item.unitPrice)}</td>
            <td class="num">${formatCLP(item.lineTotal)}</td>
          </tr>`,
        )}
      </tbody>
      <tfoot>
        <tr><td colspan="3" class="num">Subtotal</td><td class="num">${formatCLP(order.subtotal)}</td></tr>
        <tr><td colspan="3" class="num">Envío (${order.delivery?.methodName ?? '—'})</td><td class="num">${order.shippingCost > 0 ? formatCLP(order.shippingCost) : 'Sin costo'}</td></tr>
        <tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>${formatCLP(order.total)}</strong></td></tr>
      </tfoot>
    </table>
  </div>`;
}

export function statusTimeline(order) {
  const history = [...(order.statusHistory ?? [])].sort((a, b) => (a.at?.seconds ?? 0) - (b.at?.seconds ?? 0));
  return html`<ol class="timeline">
    ${history.map((entry) => {
      const info = ORDER_STATUS[entry.status] ?? { label: entry.status, icon: 'help' };
      return html`<li>
        <span class="timeline-dot">${icon(info.icon)}</span>
        <div><strong>${info.label}</strong><small>${formatDateTime(entry.at)}</small>${entry.note ? html`<small>${entry.note}</small>` : ''}</div>
      </li>`;
    })}
  </ol>`;
}

export function deliveryBlock(order) {
  const address = order.delivery?.address;
  return html`<p><strong>${order.delivery?.methodName ?? '—'}</strong></p>
    ${address
      ? html`<p>${address.street}, ${address.comuna}, ${address.region}</p>${address.reference ? html`<p class="text-muted">Ref.: ${address.reference}</p>` : ''}`
      : html`<p class="text-muted">Sin despacho: se coordina el retiro.</p>`}`;
}

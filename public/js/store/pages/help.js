// Ayuda: cómo comprar, entregas, pagos y contacto (datos desde la configuración).
import { html, setHtml, icon, $ } from '../../utils/html.js';
import { formatCLP, instagramUrl, whatsappUrl } from '../../utils/format.js';
import { activeDeliveryMethods, activePaymentMethods } from '../../services/settings.js';
import { friendlyError } from '../../services/errors.js';
import { errorState, loadingState } from '../../components/states.js';
import { initStoreLayout } from '../layout.js';

const main = $('#main');
setHtml(main, html`<div class="container section">${loadingState()}</div>`);

function render(settings) {
  const deliveries = activeDeliveryMethods(settings);
  const payments = activePaymentMethods(settings);
  const ig = instagramUrl(settings.instagram);
  const wa = whatsappUrl(settings.contact?.whatsapp);
  const contact = settings.contact ?? {};
  const hasContact = ig || wa || contact.email || contact.phone || contact.location;
  setHtml(
    main,
    html`<div class="container page-head"><h1 class="page-title">Ayuda y preguntas frecuentes</h1></div>
    <div class="container" style="display:grid;gap:1.5rem;max-width:56rem">
      <section class="prose-card" aria-labelledby="how">
        <h2 id="how">${icon('shopping_bag')} Cómo comprar</h2>
        <ol>
          <li>Agrega tus productos a la bolsa desde el catálogo.</li>
          <li>En "Finalizar pedido" ingresa tus datos y elige entrega y forma de pago.</li>
          <li>Tu pedido queda <strong>pendiente de confirmación</strong> y reservamos el stock.</li>
          <li>Te contactamos para confirmar el pago. Cuando lo recibimos, el pedido pasa a <strong>pagado</strong>.</li>
          <li>Preparamos tu paquete y te avisamos cuando esté entregado o listo para retiro.</li>
        </ol>
        ${Number.isInteger(settings.orderHoldHours) && settings.orderHoldHours > 0
          ? html`<p class="text-muted">Si un pedido pendiente no se confirma en ${settings.orderHoldHours} horas, se cancela automáticamente y el stock vuelve a estar disponible.</p>`
          : ''}
      </section>
      <section class="prose-card" id="envios" aria-labelledby="ship">
        <h2 id="ship">${icon('local_shipping')} Entregas</h2>
        ${deliveries.length
          ? html`<ul>${deliveries.map((m) => html`<li><strong>${m.name}</strong> (${m.cost > 0 ? formatCLP(m.cost) : 'sin costo'})${m.description ? html`: ${m.description}` : ''}</li>`)}</ul>`
          : html`<p class="text-muted">La tienda aún no publica métodos de entrega.</p>`}
        ${Number.isInteger(settings.freeShippingThreshold) && settings.freeShippingThreshold > 0
          ? html`<p>Envío gratis en despachos sobre <strong>${formatCLP(settings.freeShippingThreshold)}</strong>.</p>`
          : ''}
        <h2>${icon('payments')} Formas de pago</h2>
        ${payments.length
          ? html`<ul>${payments.map((m) => html`<li><strong>${m.name}</strong>${m.instructions ? html`: ${m.instructions}` : ''}</li>`)}</ul>`
          : html`<p class="text-muted">La tienda aún no publica formas de pago.</p>`}
        <p class="text-muted">No solicitamos datos de tarjeta en el sitio.</p>
      </section>
      <section class="prose-card" id="contacto" aria-labelledby="contact">
        <h2 id="contact">${icon('chat')} Contacto</h2>
        ${hasContact
          ? html`<ul>
              ${ig ? html`<li>Instagram: <a href="${ig}" target="_blank" rel="noopener">@${settings.instagram}</a></li>` : ''}
              ${wa ? html`<li>WhatsApp: <a href="${wa}" target="_blank" rel="noopener">${contact.whatsapp}</a></li>` : ''}
              ${contact.phone ? html`<li>Teléfono: <a href="tel:${contact.phone.replace(/[^\d+]/g, '')}">${contact.phone}</a></li>` : ''}
              ${contact.email ? html`<li>Correo: <a href="mailto:${contact.email}">${contact.email}</a></li>` : ''}
              ${contact.location ? html`<li>Ubicación: ${contact.location}</li>` : ''}
            </ul>`
          : html`<p class="text-muted">Los datos de contacto aún no están configurados.</p>`}
      </section>
    </div>`,
  );
}

async function load() {
  try {
    const { settings } = await initStoreLayout({ active: '' });
    render(settings);
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error) })}</div>`);
  }
}

load();

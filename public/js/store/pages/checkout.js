// Checkout: datos de contacto, entrega y pago. Registra un pedido PENDIENTE de
// confirmación a través de la Cloud Function createOrder (no hay cobro en línea).
import { html, setHtml, icon, $, $$ } from '../../utils/html.js';
import { formatCLP } from '../../utils/format.js';
import { computeTotals, freeShippingGap } from '../../utils/pricing.js';
import { CHILE_REGIONS, rules, validate } from '../../utils/validation.js';
import { newRequestId } from '../../utils/ids.js';
import { watchProductsByIds } from '../../services/catalog.js';
import { activeDeliveryMethods, activePaymentMethods } from '../../services/settings.js';
import { createOrder } from '../../services/orders.js';
import { friendlyError, errorDetails } from '../../services/errors.js';
import { ensureBuyerSession, currentSession } from '../../auth/session.js';
import { errorState, emptyState, loadingState } from '../../components/states.js';
import { notify } from '../../components/toast.js';
import { initStoreLayout } from '../layout.js';
import { getCart, clearCart, setQuantity, removeLine } from '../cart.js';
import { reconcileCart, describeOptions } from '../cart-view.js';

const REQUEST_KEY = 'kilitos.checkout.requestId';
const main = $('#main');
let settings;
let products = null;
let submitting = false;
let formRendered = false;

setHtml(main, html`<div class="container section">${loadingState('Preparando tu pedido…')}</div>`);

function requestId() {
  let id = null;
  try {
    id = sessionStorage.getItem(REQUEST_KEY);
  } catch {
    id = null;
  }
  if (!id) {
    id = newRequestId();
    try {
      sessionStorage.setItem(REQUEST_KEY, id);
    } catch {
      // Sin sessionStorage: se usa el ID en memoria.
    }
  }
  return id;
}

function resetRequestId() {
  try {
    sessionStorage.removeItem(REQUEST_KEY);
  } catch {
    // nada
  }
}

function selectedDelivery() {
  const id = $('input[name="delivery"]:checked')?.value;
  return activeDeliveryMethods(settings).find((m) => m.id === id) ?? null;
}

function renderForm(session) {
  const deliveries = activeDeliveryMethods(settings);
  const payments = activePaymentMethods(settings);
  const user = session.user && !session.user.isAnonymous ? session.user : null;
  if (deliveries.length === 0 || payments.length === 0) {
    setHtml(main, html`<div class="container section">${errorState({
      title: 'La tienda aún no recibe pedidos en línea',
      text: 'Faltan métodos de entrega o de pago en la configuración. Escríbenos por Instagram para comprar.',
    })}</div>`);
    return;
  }
  setHtml(
    main,
    html`<div class="container page-head">
        <h1 class="page-title">Finalizar pedido</h1>
        <p class="text-muted">Completa tus datos. Tu pedido quedará <strong>pendiente de confirmación</strong>: no se realiza ningún cobro en línea.</p>
      </div>
      <div class="container two-col">
        <form class="checkout-form" id="checkout-form" novalidate>
          <section class="checkout-section" aria-labelledby="s1">
            <h2 id="s1"><span class="step-num">1</span> Tus datos de contacto</h2>
            <div class="form-grid two">
              <div class="field" style="grid-column:1/-1">
                <label for="name">Nombre y apellido</label>
                <input class="input" id="name" name="name" autocomplete="name" maxlength="80" required value="${user?.displayName ?? ''}" />
                <p class="error-text" id="name-error"></p>
              </div>
              <div class="field">
                <label for="email">Correo electrónico</label>
                <input class="input" id="email" name="email" type="email" autocomplete="email" maxlength="120" required value="${user?.email ?? ''}" />
                <p class="error-text" id="email-error"></p>
              </div>
              <div class="field">
                <label for="phone">Teléfono o WhatsApp</label>
                <input class="input" id="phone" name="phone" type="tel" autocomplete="tel" maxlength="20" placeholder="+56 9 1234 5678" required />
                <p class="error-text" id="phone-error"></p>
              </div>
            </div>
          </section>

          <section class="checkout-section" aria-labelledby="s2">
            <h2 id="s2"><span class="step-num">2</span> Entrega</h2>
            <fieldset class="choice-list">
              <legend class="sr-only">Método de entrega</legend>
              ${deliveries.map(
                (m, i) => html`<label class="choice">
                  <input type="radio" name="delivery" value="${m.id}" ${i === 0 ? 'checked' : ''} />
                  <span><span class="choice-title">${m.name}</span>${m.description ? html`<span class="choice-text">${m.description}</span>` : ''}
                    ${m.freeShippingEligible && Number.isInteger(settings.freeShippingThreshold) && settings.freeShippingThreshold > 0
                      ? html`<span class="choice-text">Gratis en compras sobre ${formatCLP(settings.freeShippingThreshold)}</span>`
                      : ''}</span>
                  <span class="choice-price">${m.cost > 0 ? formatCLP(m.cost) : 'Sin costo'}</span>
                </label>`,
              )}
            </fieldset>
            <div class="form-grid two" id="address-fields">
              <div class="field">
                <label for="region">Región</label>
                <select class="select" id="region" name="region" autocomplete="address-level1">
                  <option value="">Selecciona tu región</option>
                  ${CHILE_REGIONS.map((r) => html`<option value="${r}">${r}</option>`)}
                </select>
                <p class="error-text" id="region-error"></p>
              </div>
              <div class="field">
                <label for="comuna">Comuna</label>
                <input class="input" id="comuna" name="comuna" autocomplete="address-level2" maxlength="60" />
                <p class="error-text" id="comuna-error"></p>
              </div>
              <div class="field" style="grid-column:1/-1">
                <label for="street">Dirección (calle, número, depto.)</label>
                <input class="input" id="street" name="street" autocomplete="street-address" maxlength="160" />
                <p class="error-text" id="street-error"></p>
              </div>
              <div class="field" style="grid-column:1/-1">
                <label for="reference">Referencia <span class="text-muted">(opcional)</span></label>
                <input class="input" id="reference" name="reference" maxlength="160" placeholder="Ej.: casa con reja rosada" />
              </div>
            </div>
          </section>

          <section class="checkout-section" aria-labelledby="s3">
            <h2 id="s3"><span class="step-num">3</span> Método de pago</h2>
            <fieldset class="choice-list">
              <legend class="sr-only">Método de pago</legend>
              ${payments.map(
                (m, i) => html`<label class="choice">
                  <input type="radio" name="payment" value="${m.id}" ${i === 0 ? 'checked' : ''} />
                  <span><span class="choice-title">${m.name}</span>${m.instructions ? html`<span class="choice-text">${m.instructions}</span>` : ''}</span>
                  <span></span>
                </label>`,
              )}
            </fieldset>
            <p class="inline-alert is-info">${icon('info')} No pedimos datos de tarjeta. La tienda te contactará para coordinar el pago y la entrega.</p>
          </section>

          <section class="checkout-section" aria-labelledby="s4">
            <h2 id="s4"><span class="step-num">4</span> Observaciones <span class="text-muted" style="font-size:var(--fs-label-md)">(opcional)</span></h2>
            <div class="field">
              <label for="notes" class="sr-only">Observaciones</label>
              <textarea class="textarea" id="notes" name="notes" maxlength="500" placeholder="Ej.: es para regalo, horario de entrega preferido…"></textarea>
            </div>
          </section>
          <div id="form-alert" role="alert"></div>
        </form>
        <aside class="summary-card sticky-aside" id="summary" aria-labelledby="summary-title"></aside>
      </div>`,
  );
  formRendered = true;
  toggleAddress();
  renderSummary();
}

function toggleAddress() {
  const method = selectedDelivery();
  const container = $('#address-fields');
  if (!container) return;
  container.hidden = !method?.requiresAddress;
  $$('select, input', container).forEach((el) => {
    el.required = Boolean(method?.requiresAddress) && el.id !== 'reference';
  });
}

function currentView() {
  return reconcileCart(getCart(), products ?? new Map());
}

function renderSummary() {
  const summary = $('#summary');
  if (!summary || !products) return;
  const view = currentView();
  const method = selectedDelivery();
  const lines = view.items.filter((i) => i.valid).map((i) => ({ unitPrice: i.product.price, quantity: i.line.quantity }));
  const totals = computeTotals(lines, settings, method);
  const gap = method?.freeShippingEligible ? freeShippingGap(settings, totals.subtotal) : null;
  setHtml(
    summary,
    html`<h2 id="summary-title">Tu pedido</h2>
      <ul class="summary-items">
        ${view.items.map(
          (item) => html`<li>
            <span>${item.line.quantity} × ${item.product?.name ?? item.line.name}
              ${Object.keys(item.line.options ?? {}).length ? html`<br /><small>${describeOptions(item.line.options)}</small>` : ''}
              ${!item.valid ? html`<br /><small style="color:var(--danger);font-weight:700">${icon('error')} ${item.issue === 'quantity' ? `Solo hay ${item.free} disponibles` : 'No disponible'}</small>` : ''}
            </span>
            <strong>${item.valid ? formatCLP(item.lineTotal) : '—'}</strong>
          </li>`,
        )}
      </ul>
      <div class="summary-rows">
        <div class="summary-row"><span>Subtotal</span><strong>${formatCLP(totals.subtotal)}</strong></div>
        <div class="summary-row"><span>Envío${method ? ` (${method.name})` : ''}</span><strong>${totals.shippingCost > 0 ? formatCLP(totals.shippingCost) : 'Sin costo'}</strong></div>
        ${gap ? html`<p class="text-muted" style="font-size:var(--fs-label-md)">Te faltan ${formatCLP(gap)} para envío gratis.</p>` : ''}
      </div>
      <div class="summary-total"><span>Total</span><strong>${formatCLP(totals.total)}</strong></div>
      ${view.blocking
        ? html`<div class="inline-alert is-error">${icon('error')} <span>Hay productos sin stock suficiente.
            <button type="button" class="link-btn" data-action="fix-cart">Ajustar mi bolsa automáticamente</button></span></div>`
        : ''}
      <button type="submit" form="checkout-form" class="btn btn-gradient btn-lg btn-block" id="submit-order" ${view.blocking || view.units === 0 ? 'disabled' : ''}>
        ${icon('favorite', { filled: true })} Confirmar pedido
      </button>
      <p class="text-muted" style="font-size:var(--fs-label-md)">Al confirmar, reservamos el stock y te mostraremos las instrucciones de pago. Precios en CLP.</p>
      <a class="btn btn-ghost btn-block" href="/carrito.html">Volver a la bolsa</a>`,
  );
}

function readValues() {
  const form = $('#checkout-form');
  const data = Object.fromEntries(new FormData(form).entries());
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
}

function showErrors(errors) {
  $$('.error-text', main).forEach((el) => {
    el.textContent = '';
  });
  $$('[aria-invalid]', main).forEach((el) => el.removeAttribute('aria-invalid'));
  const fields = Object.keys(errors);
  for (const field of fields) {
    const input = $(`#${field}`);
    const target = $(`#${field}-error`);
    if (target) target.textContent = errors[field];
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${field}-error`);
    }
  }
  if (fields.length) $(`#${fields[0]}`)?.focus();
}

function fixCart() {
  const view = currentView();
  for (const item of view.items) {
    if (item.issue === 'quantity' && item.free > 0) setQuantity(item.line.key, item.free);
    else if (!item.valid) removeLine(item.line.key);
  }
  notify.info('Ajustamos tu bolsa', 'Revisa el resumen antes de confirmar.');
}

function serverFieldToInput(field = '') {
  const map = {
    'customer.name': 'name',
    'customer.email': 'email',
    'customer.phone': 'phone',
    'delivery.region': 'region',
    'delivery.comuna': 'comuna',
    'delivery.street': 'street',
  };
  return map[field] ?? null;
}

async function submit(event) {
  event.preventDefault();
  if (submitting) return;
  const values = readValues();
  const method = selectedDelivery();
  const schema = {
    name: [rules.required('El nombre'), rules.minLength('El nombre', 2), rules.maxLength('El nombre', 80)],
    email: [rules.required('El correo'), rules.email()],
    phone: [rules.required('El teléfono'), rules.phone()],
  };
  if (method?.requiresAddress) {
    Object.assign(schema, {
      region: [rules.oneOf('una región', CHILE_REGIONS)],
      comuna: [rules.required('La comuna'), rules.minLength('La comuna', 2)],
      street: [rules.required('La dirección'), rules.minLength('La dirección', 5)],
    });
  }
  const errors = validate(values, schema);
  showErrors(errors);
  if (Object.keys(errors).length) {
    notify.warning('Revisa el formulario', 'Hay campos por completar o corregir.');
    return;
  }

  const view = currentView();
  if (view.blocking || view.units === 0) {
    notify.warning('Revisa tu bolsa', 'Hay productos sin stock suficiente.');
    return;
  }
  const lines = view.items.map((i) => ({ unitPrice: i.product.price, quantity: i.line.quantity }));
  const totals = computeTotals(lines, settings, method);
  const payload = {
    requestId: requestId(),
    items: view.items.map((i) => ({ productId: i.line.productId, quantity: i.line.quantity, options: i.line.options ?? {} })),
    customer: { name: values.name, email: values.email, phone: values.phone },
    delivery: method.requiresAddress
      ? { methodId: method.id, region: values.region, comuna: values.comuna, street: values.street, reference: values.reference ?? '' }
      : { methodId: method.id },
    paymentMethodId: values.payment,
    notes: values.notes ?? '',
    expectedTotal: totals.total,
  };

  submitting = true;
  const button = $('#submit-order');
  button.classList.add('is-loading');
  button.disabled = true;
  setHtml($('#form-alert'), '');
  try {
    await ensureBuyerSession();
    const result = await createOrder(payload);
    resetRequestId();
    clearCart();
    try {
      sessionStorage.setItem('kilitos.lastOrder', JSON.stringify({ id: result.orderId, number: result.orderNumber }));
    } catch {
      // nada
    }
    location.href = `/pedido.html?id=${encodeURIComponent(result.orderId)}&nuevo=1`;
  } catch (error) {
    submitting = false;
    button.classList.remove('is-loading');
    button.disabled = false;
    handleOrderError(error);
  }
}

function handleOrderError(error) {
  const details = errorDetails(error);
  const alert = $('#form-alert');
  if (details?.code === 'OUT_OF_STOCK') {
    const list = details.items.map((i) => html`<li>${i.name}: pediste ${i.requested}, quedan ${i.available}.</li>`);
    setHtml(alert, html`<div class="inline-alert is-error">${icon('inventory_2')}<div><strong>Alguien compró antes que tú 😿</strong><ul style="padding-left:1rem">${list}</ul>
      <button type="button" class="link-btn" data-action="fix-cart">Ajustar mi bolsa</button></div></div>`);
    return;
  }
  if (details?.code === 'PRICE_CHANGED') {
    setHtml(alert, html`<div class="inline-alert">${icon('sell')}<div><strong>Los precios cambiaron.</strong> El total actualizado es ${formatCLP(details.total)}. Revisa el resumen y confirma nuevamente.</div></div>`);
    renderSummary();
    return;
  }
  if (details?.code === 'PRODUCT_UNAVAILABLE') {
    setHtml(alert, html`<div class="inline-alert is-error">${icon('block')}<div>Algunos productos ya no están disponibles.
      <button type="button" class="link-btn" data-action="fix-cart">Quitarlos de mi bolsa</button></div></div>`);
    return;
  }
  if (details?.code === 'INVALID_FIELD') {
    const field = serverFieldToInput(details.field);
    if (field) showErrors({ [field]: error.message });
    else setHtml(alert, html`<p class="inline-alert is-error">${icon('error')} ${error.message}</p>`);
    return;
  }
  const code = error?.code ?? '';
  const uncertain = ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/unknown'].includes(code) || !navigator.onLine;
  if (uncertain) {
    // El requestId se conserva: reintentar no duplica el pedido.
    setHtml(alert, html`<p class="inline-alert is-error">${icon('wifi_off')} No pudimos confirmar si tu pedido se registró. Vuelve a presionar "Confirmar pedido": si ya se registró, no se duplicará.</p>`);
    return;
  }
  setHtml(alert, html`<p class="inline-alert is-error">${icon('error')} ${friendlyError(error)}</p>`);
}

function watchCart() {
  const ids = getCart().map((l) => l.productId);
  return watchProductsByIds(
    ids,
    (map) => {
      products = map;
      renderSummary();
    },
    (error) => notify.error('No pudimos actualizar el stock', friendlyError(error)),
  );
}

async function load() {
  try {
    ({ settings } = await initStoreLayout({ active: 'carrito' }));
    if (getCart().length === 0) {
      setHtml(main, html`<div class="container section">${emptyState({
        title: 'Tu bolsa está vacía',
        text: 'Agrega productos antes de finalizar el pedido.',
        iconName: 'shopping_bag',
        action: { href: '/catalogo.html', label: 'Ir al catálogo' },
      })}</div>`);
      return;
    }
    const session = await currentSession();
    renderForm(session);
    if (!formRendered) return;
    let stop = watchCart();
    window.addEventListener('cart:change', () => {
      if (submitting) return;
      if (getCart().length === 0) {
        location.href = '/carrito.html';
        return;
      }
      stop();
      stop = watchCart();
    });
    main.addEventListener('change', (event) => {
      if (event.target.name === 'delivery') {
        toggleAddress();
        renderSummary();
      }
    });
    main.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="fix-cart"]')) fixCart();
    });
    $('#checkout-form').addEventListener('submit', submit);
  } catch (error) {
    setHtml(main, html`<div class="container section">${errorState({ text: friendlyError(error), retry: true })}</div>`);
    main.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
  }
}

load();

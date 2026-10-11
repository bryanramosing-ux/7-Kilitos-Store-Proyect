// Configuración de la tienda (storeSettings/public). Solo administración.
// Los valores se validan aquí y de nuevo en las reglas de Firestore.
import { html, setHtml, icon, $, $$ } from '../utils/html.js';
import { formatCLP } from '../utils/format.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { friendlyError } from '../services/errors.js';
import { errorState, loadingState } from '../components/states.js';
import { confirmDialog } from '../components/dialog.js';
import { notify } from '../components/toast.js';
import { initAdminPage } from './shell.js';

const { main } = await initAdminPage({ page: 'configuracion', title: 'Configuración de la tienda', roles: ['admin'] });
const HIGHLIGHT_ICONS = ['local_shipping', 'redeem', 'verified', 'favorite', 'auto_awesome', 'storefront', 'payments', 'star'];

setHtml(main, loadingState('Cargando configuración…'));

const text = (id, label, value, { max = 120, hint = '', placeholder = '', area = false } = {}) => html`<div class="field">
  <label for="${id}">${label}</label>
  ${area
    ? html`<textarea class="textarea" id="${id}" maxlength="${max}" placeholder="${placeholder}">${value ?? ''}</textarea>`
    : html`<input class="input" id="${id}" maxlength="${max}" value="${value ?? ''}" placeholder="${placeholder}" />`}
  ${hint ? html`<p class="hint">${hint}</p>` : ''}<p class="error-text" id="${id}-error"></p>
</div>`;

function deliveryRow(m = { id: '', name: '', description: '', cost: 0, requiresAddress: false, freeShippingEligible: false, active: true }) {
  return html`<div class="repeater-row" data-delivery data-id="${m.id}">
    <div class="form-grid two">
      <div class="field"><label>Nombre</label><input class="input" data-k="name" maxlength="60" value="${m.name}" /></div>
      <div class="field"><label>Costo (CLP)</label><input class="input" data-k="cost" inputmode="numeric" value="${m.cost}" /></div>
      <div class="field" style="grid-column:1/-1"><label>Descripción para la clienta</label><input class="input" data-k="description" maxlength="160" value="${m.description ?? ''}" /></div>
      <label class="check"><input type="checkbox" data-k="requiresAddress" ${m.requiresAddress ? 'checked' : ''} /> Pide dirección (despacho)</label>
      <label class="check"><input type="checkbox" data-k="freeShippingEligible" ${m.freeShippingEligible ? 'checked' : ''} /> Aplica envío gratis sobre el umbral</label>
      <label class="check"><input type="checkbox" data-k="active" ${m.active ? 'checked' : ''} /> Activo</label>
    </div>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-row aria-label="Quitar método de entrega">${icon('delete')}</button>
  </div>`;
}

function paymentRow(m = { id: '', name: '', instructions: '', active: true }) {
  return html`<div class="repeater-row" data-payment data-id="${m.id}">
    <div class="form-grid">
      <div class="field"><label>Nombre</label><input class="input" data-k="name" maxlength="60" value="${m.name}" /></div>
      <div class="field"><label>Instrucciones (se muestran al confirmar el pedido)</label><textarea class="textarea" data-k="instructions" maxlength="500">${m.instructions ?? ''}</textarea></div>
      <label class="check"><input type="checkbox" data-k="active" ${m.active ? 'checked' : ''} /> Activo</label>
    </div>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-row aria-label="Quitar método de pago">${icon('delete')}</button>
  </div>`;
}

function highlightRow(h = { icon: 'auto_awesome', title: '', text: '' }, i) {
  return html`<div class="form-grid two" data-highlight style="padding:.75rem;border-radius:1rem;background:var(--surface-low)">
    <div class="field"><label for="h-icon-${i}">Icono</label><select class="select" id="h-icon-${i}" data-k="icon">${HIGHLIGHT_ICONS.map((n) => html`<option value="${n}" ${n === h.icon ? 'selected' : ''}>${n.replace(/_/g, ' ')}</option>`)}</select></div>
    <div class="field"><label for="h-title-${i}">Título</label><input class="input" id="h-title-${i}" data-k="title" maxlength="40" value="${h.title}" /></div>
    <div class="field" style="grid-column:1/-1"><label for="h-text-${i}">Texto</label><input class="input" id="h-text-${i}" data-k="text" maxlength="60" value="${h.text}" /></div>
  </div>`;
}

function render(s) {
  const hero = s.hero ?? {};
  const promo = s.promo ?? {};
  const highlights = [...(s.highlights ?? [])];
  while (highlights.length < 3) highlights.push({ icon: 'auto_awesome', title: '', text: '' });
  setHtml(
    main,
    html`${s.missing ? html`<p class="inline-alert">${icon('warning')} La tienda aún no tiene configuración guardada. Completa y guarda este formulario (o ejecuta el script de datos iniciales).</p>` : ''}
    ${s.demoMode ? html`<p class="inline-alert">${icon('info')} El aviso de "catálogo de demostración" está activo. Desactívalo cuando reemplaces productos, precios, costos de envío y textos de ejemplo por los reales.</p>` : ''}
    <form id="settings-form" class="form-grid" novalidate>
      <section class="panel"><div class="panel-head"><h2>Tienda y contacto</h2></div><div class="panel-body form-grid two">
        ${text('storeName', 'Nombre de la tienda *', s.storeName, { max: 60 })}
        ${text('tagline', 'Bajada o lema', s.tagline, { max: 60, placeholder: 'Papelería Bonita' })}
        ${text('instagram', 'Usuario de Instagram (sin @)', s.instagram, { max: 30 })}
        ${text('contact-email', 'Correo de contacto', s.contact?.email)}
        ${text('contact-phone', 'Teléfono', s.contact?.phone, { max: 30 })}
        ${text('contact-whatsapp', 'WhatsApp (con código de país)', s.contact?.whatsapp, { max: 30, placeholder: '+56 9 1234 5678' })}
        ${text('contact-location', 'Ubicación o zona de retiro', s.contact?.location)}
      </div></section>

      <section class="panel"><div class="panel-head"><h2>Mensajes promocionales</h2><p>Se muestran en la portada y la barra superior.</p></div><div class="panel-body form-grid">
        ${text('announcement', 'Mensaje de la barra superior', s.announcement, { max: 160, hint: 'El envío gratis se agrega automáticamente si hay umbral configurado.' })}
        <div class="form-grid two">
          ${text('hero-badge', 'Etiqueta del banner', hero.badge, { max: 80 })}
          ${text('hero-eyebrow', 'Antetítulo', hero.eyebrow, { max: 80 })}
          ${text('hero-title', 'Título principal', hero.title, { max: 60 })}
          ${text('hero-subtitle', 'Subtítulo', hero.subtitle, { max: 120 })}
        </div>
        ${text('hero-description', 'Descripción del banner', hero.description, { max: 400, area: true })}
        <div class="form-grid two">
          ${text('hero-ctaLabel', 'Texto del botón', hero.ctaLabel, { max: 30 })}
          ${text('hero-ctaTag', 'Etiqueta del botón', hero.ctaTag, { max: 30 })}
        </div>
        <p class="field-label">Destacados bajo el banner (deja el título vacío para ocultar)</p>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))">${highlights.slice(0, 3).map((h, i) => highlightRow(h, i))}</div>
        <div class="form-grid two">
          ${text('promo-badge', 'Bloque promocional: etiqueta', promo.badge, { max: 60 })}
          ${text('promo-title', 'Bloque promocional: título', promo.title, { max: 120 })}
        </div>
        ${text('promo-text', 'Bloque promocional: texto', promo.text, { max: 400, area: true })}
        ${text('communityText', 'Texto de comunidad (Instagram)', s.communityText, { max: 300, area: true })}
      </div></section>

      <section class="panel"><div class="panel-head"><h2>Entregas</h2></div><div class="panel-body form-grid">
        ${text('freeShippingThreshold', 'Envío gratis desde (CLP)', s.freeShippingThreshold ?? '', { max: 9, hint: 'Déjalo vacío para no ofrecer envío gratis.' })}
        <div class="repeater" id="deliveries">${(s.deliveryMethods ?? []).map((m) => deliveryRow(m))}</div>
        <button type="button" class="btn btn-sm btn-secondary" data-add="delivery">${icon('add')} Agregar método de entrega</button>
        <p class="error-text" id="deliveries-error"></p>
      </div></section>

      <section class="panel"><div class="panel-head"><h2>Pagos</h2><p>No hay pasarela de pago: la tienda confirma cada pago manualmente.</p></div><div class="panel-body form-grid">
        <div class="repeater" id="payments">${(s.paymentMethods ?? []).map((m) => paymentRow(m))}</div>
        <button type="button" class="btn btn-sm btn-secondary" data-add="payment">${icon('add')} Agregar método de pago</button>
        <p class="error-text" id="payments-error"></p>
      </div></section>

      <section class="panel"><div class="panel-head"><h2>Inventario y pedidos</h2></div><div class="panel-body form-grid two">
        ${text('lowStockDefault', 'Umbral general de stock bajo', s.lowStockDefault, { max: 4, hint: 'Cada producto puede tener su propio umbral.' })}
        ${text('orderHoldHours', 'Horas de reserva de pedidos pendientes', s.orderHoldHours, { max: 3, hint: 'Pasado este plazo, un pedido pendiente se cancela y su stock vuelve. 0 = nunca.' })}
        <label class="check" style="grid-column:1/-1"><input type="checkbox" id="demoMode" ${s.demoMode ? 'checked' : ''} /> Mostrar aviso de "catálogo de demostración" en la tienda</label>
      </div></section>

      <div id="form-alert" role="alert"></div>
      <div style="display:flex;justify-content:flex-end;gap:.75rem;position:sticky;bottom:0;padding:1rem 0;background:linear-gradient(transparent,#fdf6f5 30%)">
        <button type="submit" class="btn btn-brand btn-lg" id="save">${icon('save')} Guardar configuración</button>
      </div>
    </form>`,
  );
}

function slug(textValue) {
  return textValue.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function collect() {
  const v = (id) => $(`#${id}`).value.trim();
  const errors = {};
  const intOrNull = (id, label, min, max) => {
    const raw = v(id).replace(/[$.\s]/g, '');
    if (raw === '') return null;
    if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
      errors[id] = `${label} debe ser un número entero entre ${min} y ${max}.`;
      return null;
    }
    return Number(raw);
  };
  const usedIds = new Set();
  const uniqueId = (row, name) => {
    let id = row.dataset.id || slug(name) || 'metodo';
    while (usedIds.has(id)) id = `${id}-2`;
    usedIds.add(id);
    return id;
  };
  const deliveryMethods = $$('[data-delivery]').map((row) => {
    const get = (k) => row.querySelector(`[data-k="${k}"]`);
    const name = get('name').value.trim();
    const costRaw = get('cost').value.replace(/[$.\s]/g, '');
    if (!name) errors.deliveries = 'Cada método de entrega necesita un nombre.';
    if (!/^\d+$/.test(costRaw)) errors.deliveries = `El costo de "${name || 'un método'}" debe ser un número entero (0 si es gratis).`;
    return {
      id: uniqueId(row, name),
      name,
      description: get('description').value.trim(),
      cost: Number(costRaw),
      requiresAddress: get('requiresAddress').checked,
      freeShippingEligible: get('freeShippingEligible').checked,
      active: get('active').checked,
    };
  });
  usedIds.clear();
  const paymentMethods = $$('[data-payment]').map((row) => {
    const get = (k) => row.querySelector(`[data-k="${k}"]`);
    const name = get('name').value.trim();
    if (!name) errors.payments = 'Cada método de pago necesita un nombre.';
    return { id: uniqueId(row, name), name, instructions: get('instructions').value.trim(), active: get('active').checked };
  });
  if (!deliveryMethods.some((m) => m.active)) errors.deliveries = 'Debe haber al menos un método de entrega activo.';
  if (!paymentMethods.some((m) => m.active)) errors.payments = 'Debe haber al menos un método de pago activo.';
  if (deliveryMethods.length > 6) errors.deliveries = 'Máximo 6 métodos de entrega.';
  if (paymentMethods.length > 6) errors.payments = 'Máximo 6 métodos de pago.';
  if (v('storeName').length < 2) errors.storeName = 'El nombre de la tienda es obligatorio.';
  const instagram = v('instagram').replace(/^@/, '');
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) errors.instagram = 'Solo letras, números, puntos y guiones bajos.';
  const email = v('contact-email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors['contact-email'] = 'Ingresa un correo válido.';

  const values = {
    storeName: v('storeName'),
    tagline: v('tagline'),
    instagram,
    contact: { email, phone: v('contact-phone'), whatsapp: v('contact-whatsapp'), location: v('contact-location') },
    announcement: v('announcement'),
    hero: {
      badge: v('hero-badge'),
      eyebrow: v('hero-eyebrow'),
      title: v('hero-title'),
      subtitle: v('hero-subtitle'),
      description: v('hero-description'),
      ctaLabel: v('hero-ctaLabel'),
      ctaTag: v('hero-ctaTag'),
    },
    highlights: $$('[data-highlight]')
      .map((row) => ({
        icon: row.querySelector('[data-k="icon"]').value,
        title: row.querySelector('[data-k="title"]').value.trim(),
        text: row.querySelector('[data-k="text"]').value.trim(),
      }))
      .filter((h) => h.title),
    promo: { badge: v('promo-badge'), title: v('promo-title'), text: v('promo-text') },
    communityText: v('communityText'),
    freeShippingThreshold: intOrNull('freeShippingThreshold', 'El umbral de envío gratis', 1, 10000000),
    deliveryMethods,
    paymentMethods,
    lowStockDefault: intOrNull('lowStockDefault', 'El umbral de stock bajo', 0, 1000) ?? 5,
    orderHoldHours: intOrNull('orderHoldHours', 'Las horas de reserva', 0, 720) ?? 0,
    demoMode: $('#demoMode').checked,
  };
  return { values, errors };
}

async function load() {
  try {
    const settings = await getSettings({ fresh: true });
    render(settings);
  } catch (error) {
    setHtml(main, errorState({ text: friendlyError(error) }));
    return;
  }
  main.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      const list = $(add.dataset.add === 'delivery' ? '#deliveries' : '#payments');
      list.insertAdjacentHTML('beforeend', (add.dataset.add === 'delivery' ? deliveryRow() : paymentRow()).toString());
      list.lastElementChild.querySelector('input').focus();
      return;
    }
    const remove = event.target.closest('[data-remove-row]');
    if (remove) remove.closest('.repeater-row').remove();
  });
  $('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const { values, errors } = collect();
    $$('.error-text', main).forEach((el) => {
      el.textContent = '';
    });
    for (const [id, message] of Object.entries(errors)) {
      const target = $(`#${id}-error`);
      if (target) target.textContent = message;
    }
    if (Object.keys(errors).length) {
      notify.warning('Revisa la configuración', Object.values(errors)[0]);
      return;
    }
    const ok = await confirmDialog({
      title: 'Guardar configuración',
      message: `Los cambios se verán de inmediato en la tienda.${values.freeShippingThreshold ? ` Envío gratis desde ${formatCLP(values.freeShippingThreshold)}.` : ' Sin envío gratis.'}`,
      confirmLabel: 'Guardar',
    });
    if (!ok) return;
    const button = $('#save');
    button.classList.add('is-loading');
    button.disabled = true;
    try {
      await saveSettings(values);
      notify.success('Configuración guardada', 'La tienda ya muestra los nuevos valores.');
      setHtml($('#form-alert'), '');
    } catch (error) {
      setHtml($('#form-alert'), html`<p class="inline-alert is-error">${icon('error')} ${friendlyError(error)}</p>`);
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  });
}

load();

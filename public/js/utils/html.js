// Plantillas HTML con escape automático: todo valor interpolado se escapa salvo
// que ya sea un fragmento seguro creado con html`` o raw(). Evita XSS al pintar
// datos que vienen de Firestore o del usuario.

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"'`]/g, (char) => ESCAPES[char]);
}

function render(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// Solo para HTML generado por el propio código (nunca con datos externos).
export function raw(value) {
  return new SafeHtml(String(value));
}

export function setHtml(element, content) {
  element.innerHTML = render(content);
}

// URLs para href/src: solo http(s), mailto, tel o rutas relativas.
export function safeUrl(value, fallback = '#') {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const url = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^(\/|\.\/|\.\.\/|[\w-]+\.html)/.test(url) && !/^\/\//.test(url)) return url;
  return fallback;
}

export function icon(name, { filled = false, label } = {}) {
  const cls = filled ? 'icon is-filled' : 'icon';
  if (label) return html`<span class="${cls}" role="img" aria-label="${label}">${name}</span>`;
  return html`<span class="${cls}" aria-hidden="true">${name}</span>`;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

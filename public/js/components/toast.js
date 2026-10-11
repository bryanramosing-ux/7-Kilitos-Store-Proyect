// Notificaciones accesibles (región aria-live) con estilo de "nube" de la marca.
import { html, setHtml, icon } from '../utils/html.js';

const ICONS = { success: 'favorite', error: 'error', warning: 'warning', info: 'auto_awesome' };
let region;

function ensureRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.append(region);
  return region;
}

function dismiss(element) {
  if (!element.isConnected) return;
  element.classList.add('is-leaving');
  element.addEventListener('animationend', () => element.remove(), { once: true });
  setTimeout(() => element.remove(), 400);
}

/**
 * @param {{ type?: 'success'|'error'|'warning'|'info', title: string, text?: string,
 *           action?: { label: string, href: string }, duration?: number }} options
 */
export function toast({ type = 'success', title, text = '', action = null, duration }) {
  const element = document.createElement('div');
  element.className = `toast is-${type}`;
  if (type === 'error') element.setAttribute('role', 'alert');
  setHtml(
    element,
    html`<span class="toast-icon">${icon(ICONS[type] ?? 'info', { filled: type === 'success' })}</span>
      <div>
        <p class="toast-title">${title}</p>
        ${text ? html`<p class="toast-text">${text}</p>` : ''}
      </div>
      <div class="toast-actions">
        ${action ? html`<a class="btn btn-brand btn-sm" href="${action.href}">${action.label}</a>` : ''}
        <button type="button" class="toast-close" aria-label="Cerrar notificación">${icon('close')}</button>
      </div>`,
  );
  element.querySelector('.toast-close').addEventListener('click', () => dismiss(element));
  ensureRegion().append(element);
  const timeout = duration ?? (type === 'error' ? 8000 : 4500);
  if (timeout > 0) setTimeout(() => dismiss(element), timeout);
  return element;
}

export const notify = {
  success: (title, text, extra) => toast({ type: 'success', title, text, ...extra }),
  error: (title, text, extra) => toast({ type: 'error', title, text, ...extra }),
  warning: (title, text, extra) => toast({ type: 'warning', title, text, ...extra }),
  info: (title, text, extra) => toast({ type: 'info', title, text, ...extra }),
};

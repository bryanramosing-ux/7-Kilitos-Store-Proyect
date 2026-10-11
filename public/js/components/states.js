// Estados de interfaz reutilizables: carga, vacío y error.
import { html, icon } from '../utils/html.js';

export function loadingState(text = 'Cargando…') {
  return html`<div class="state" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <p>${text}</p>
  </div>`;
}

export function emptyState({ title, text = '', iconName = 'auto_awesome', action = null }) {
  return html`<div class="state">
    <span class="state-icon">${icon(iconName)}</span>
    <h2>${title}</h2>
    ${text ? html`<p>${text}</p>` : ''}
    ${action ? html`<a class="btn btn-primary" href="${action.href}">${action.label}</a>` : ''}
  </div>`;
}

export function errorState({ title = 'No pudimos cargar la información', text = '', retry = false }) {
  return html`<div class="state is-error" role="alert">
    <span class="state-icon">${icon('cloud_off')}</span>
    <h2>${title}</h2>
    ${text ? html`<p>${text}</p>` : ''}
    ${retry ? html`<button type="button" class="btn btn-brand" data-action="retry">${icon('refresh')} Reintentar</button>` : ''}
  </div>`;
}

export function skeletonCards(count = 4) {
  return html`${Array.from(
    { length: count },
    () => html`<div class="product-card is-skeleton" aria-hidden="true">
      <div class="skeleton" style="aspect-ratio:1"></div>
      <div class="skeleton" style="height:1rem;width:70%;margin-top:.9rem"></div>
      <div class="skeleton" style="height:1rem;width:40%;margin-top:.5rem"></div>
    </div>`,
  )}`;
}

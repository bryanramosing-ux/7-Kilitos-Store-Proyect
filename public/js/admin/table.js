// Paginación en el navegador para listas ya filtradas.
import { html, icon } from '../utils/html.js';
import { formatNumber } from '../utils/format.js';

export function paginate(list, page, size = 20) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: list.slice((current - 1) * size, current * size), page: current, pages, total: list.length, size };
}

export function pager({ page, pages, total, size }) {
  if (total === 0) return '';
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return html`<nav class="pager" aria-label="Paginación">
    <span>${formatNumber(from)}–${formatNumber(to)} de ${formatNumber(total)}</span>
    <span class="pager-buttons">
      <button type="button" class="btn btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevron_left')}</button>
      <span style="align-self:center">Página ${page} de ${pages}</span>
      <button type="button" class="btn btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Página siguiente">${icon('chevron_right')}</button>
    </span>
  </nav>`;
}

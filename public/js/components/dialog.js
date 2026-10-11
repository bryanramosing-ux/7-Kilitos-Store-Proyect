// Diálogos modales basados en <dialog> nativo (foco atrapado, Escape y backdrop).
import { html, setHtml, icon } from '../utils/html.js';

/**
 * Crea un diálogo. `body` y `footer` son fragmentos html``.
 * Devuelve el elemento <dialog>; se elimina del DOM al cerrarse.
 */
export function openDialog({ title, body, footer = '', wide = false, onClose } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = `modal${wide ? ' is-wide' : ''}`;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;
  dialog.setAttribute('aria-labelledby', titleId);
  setHtml(
    dialog,
    html`<div class="modal-head">
        <h2 id="${titleId}">${title}</h2>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Cerrar">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? html`<div class="modal-foot">${footer}</div>` : ''}`,
  );
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close('cancel');
  });
  dialog.addEventListener('close', () => {
    onClose?.(dialog.returnValue);
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/**
 * Confirmación antes de acciones importantes o destructivas.
 * Resuelve true/false. Con `requireReason` devuelve el texto ingresado o null.
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Volver',
  danger = false,
  requireReason = false,
  reasonLabel = 'Motivo',
}) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    const dialog = openDialog({
      title,
      body: html`<p>${message}</p>
        ${requireReason
          ? html`<div class="field" style="margin-top:1rem">
              <label for="confirm-reason">${reasonLabel}</label>
              <textarea id="confirm-reason" class="textarea" maxlength="300" required></textarea>
              <p class="error-text" id="confirm-reason-error"></p>
            </div>`
          : ''}`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>${cancelLabel}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-brand'}" data-confirm>${confirmLabel}</button>`,
      onClose: () => finish(requireReason ? null : false),
    });
    dialog.querySelector('[data-confirm]').addEventListener('click', () => {
      if (requireReason) {
        const input = dialog.querySelector('#confirm-reason');
        const value = input.value.trim();
        if (value.length < 3) {
          input.setAttribute('aria-invalid', 'true');
          dialog.querySelector('#confirm-reason-error').textContent = 'Escribe un motivo de al menos 3 caracteres.';
          input.focus();
          return;
        }
        finish(value);
      } else {
        finish(true);
      }
      dialog.close('confirm');
    });
  });
}

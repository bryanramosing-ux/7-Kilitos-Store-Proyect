// Usuarios y roles. Los roles se asignan solo mediante la Cloud Function
// setUserRole (custom claims), nunca escribiendo documentos desde el navegador.
import { html, setHtml, icon, $ } from '../utils/html.js';
import { formatDateTime } from '../utils/format.js';
import { ROLE_LABELS } from '../utils/status.js';
import { rules, validate } from '../utils/validation.js';
import { listStaff, setUserRole } from '../services/admin.js';
import { friendlyError } from '../services/errors.js';
import { errorState, emptyState, loadingState } from '../components/states.js';
import { confirmDialog } from '../components/dialog.js';
import { notify } from '../components/toast.js';
import { initAdminPage } from './shell.js';

const { main, user } = await initAdminPage({ page: 'usuarios', title: 'Usuarios y roles', roles: ['admin'] });

setHtml(
  main,
  html`<div class="grid-2">
    <section class="panel" aria-labelledby="staff-title">
      <div class="panel-head"><h2 id="staff-title">Equipo con acceso al panel</h2></div>
      <div class="panel-body flush" id="list">${loadingState()}</div>
    </section>
    <section class="panel" aria-labelledby="assign-title">
      <div class="panel-head"><h2 id="assign-title">Asignar o quitar un rol</h2></div>
      <div class="panel-body">
        <form id="role-form" class="form-grid" novalidate>
          <p class="text-muted">La persona primero debe crear su cuenta en <a href="/login.html?modo=registro" target="_blank" rel="noopener">la página de registro</a> y <strong>verificar su correo</strong> con el enlace que recibe. Luego ingresa aquí su correo.</p>
          <div class="field"><label for="r-email">Correo de la cuenta</label><input class="input" id="r-email" type="email" autocomplete="off" /><p class="error-text" id="r-email-error"></p></div>
          <div class="field"><label for="r-role">Rol</label>
            <select class="select" id="r-role">
              <option value="encargado">Encargado/a: pedidos, ventas, inventario y reportes (sin costos)</option>
              <option value="admin">Administración: acceso completo</option>
              <option value="cliente">Quitar acceso al panel (cliente)</option>
            </select></div>
          <button type="submit" class="btn btn-brand" id="r-save">${icon('manage_accounts')} Aplicar rol</button>
          <p class="hint">El cambio se aplica de inmediato en las operaciones protegidas. La persona debe cerrar sesión y volver a entrar para ver el menú actualizado. Nadie puede cambiar su propio rol.</p>
        </form>
      </div>
    </section>
  </div>`,
);

async function load() {
  setHtml($('#list'), loadingState());
  try {
    const staff = (await listStaff()).sort((a, b) => (a.role === b.role ? (a.email ?? '').localeCompare(b.email ?? '') : a.role === 'admin' ? -1 : 1));
    setHtml(
      $('#list'),
      staff.length
        ? html`<div class="table-wrap"><table class="table responsive"><caption class="sr-only">Equipo</caption>
            <thead><tr><th scope="col">Cuenta</th><th scope="col">Rol</th><th scope="col">Actualizado</th></tr></thead>
            <tbody>${staff.map((s) => html`<tr>
              <td class="cell-main"><strong>${s.email}</strong>${s.id === user.uid ? html`<small>Tu cuenta</small>` : ''}</td>
              <td data-label="Rol"><span class="badge ${s.role === 'admin' ? 'badge-brand' : 'badge-lavanda'}">${ROLE_LABELS[s.role] ?? s.role}</span></td>
              <td data-label="Actualizado">${formatDateTime(s.updatedAt)}</td>
            </tr>`)}</tbody></table></div>`
        : html`<div class="panel-body">${emptyState({ title: 'Sin personal registrado', iconName: 'group' })}</div>`,
    );
  } catch (error) {
    setHtml($('#list'), html`<div class="panel-body">${errorState({ text: friendlyError(error) })}</div>`);
  }
}

$('#role-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('#r-email').value.trim().toLowerCase();
  const role = $('#r-role').value;
  const errors = validate({ email }, { email: [rules.required('El correo'), rules.email()] });
  if (!errors.email && email === (user.email ?? '').toLowerCase()) errors.email = 'No puedes cambiar tu propio rol.';
  $('#r-email-error').textContent = errors.email ?? '';
  if (errors.email) return;
  const ok = await confirmDialog({
    title: 'Confirmar cambio de rol',
    message: `${email} quedará como "${ROLE_LABELS[role]}".`,
    confirmLabel: 'Aplicar',
    danger: role === 'admin',
  });
  if (!ok) return;
  const button = $('#r-save');
  button.classList.add('is-loading');
  button.disabled = true;
  try {
    await setUserRole(email, role);
    notify.success('Rol actualizado', `${email}: ${ROLE_LABELS[role]}`);
    $('#r-email').value = '';
    load();
  } catch (error) {
    notify.error('No se pudo cambiar el rol', friendlyError(error));
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
  }
});

load();

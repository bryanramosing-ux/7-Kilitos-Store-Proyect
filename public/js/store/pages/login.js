// Inicio de sesión, registro de clientes y recuperación de contraseña.
import { html, setHtml, icon, $, $$ } from '../../utils/html.js';
import { rules, validate } from '../../utils/validation.js';
import { login, register, resetPassword, currentSession, isStaffRole } from '../../auth/session.js';
import { friendlyError } from '../../services/errors.js';
import { notify } from '../../components/toast.js';
import { initStoreLayout } from '../layout.js';

const main = $('#main');
const params = new URLSearchParams(location.search);

// Solo rutas internas para evitar redirecciones abiertas.
function safeNext() {
  const next = params.get('next') ?? '';
  return /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : null;
}

function destination(role) {
  const next = safeNext();
  if (isStaffRole(role)) return next && next.startsWith('/admin/') ? next : next ?? '/admin/index.html';
  if (next && !next.startsWith('/admin/')) return next;
  return '/cuenta.html';
}

const TABS = {
  login: 'Iniciar sesión',
  register: 'Crear cuenta',
  reset: 'Recuperar acceso',
};

function render(active = 'login') {
  const notice =
    params.get('motivo') === 'sin-permiso'
      ? html`<p class="inline-alert is-error" role="alert">${icon('lock')} Tu cuenta no tiene acceso al panel administrativo. Si deberías tenerlo, pide a la administradora que te asigne un rol.</p>`
      : '';
  setHtml(
    main,
    html`<div class="container auth-shell">
      <div class="auth-card card card-pad" style="display:grid;gap:1.25rem">
        <div style="display:grid;justify-items:center;gap:.5rem;text-align:center">
          <img src="/assets/images/logo-7kilitos-320.webp" alt="" width="88" height="88" style="border-radius:50%;box-shadow:0 0 0 4px var(--white),var(--shadow-md)" />
          <h1 style="font-size:var(--fs-headline-md);color:var(--pink-deep)">${TABS[active]}</h1>
        </div>
        ${notice}
        <div class="tabs" role="tablist" aria-label="Opciones de acceso">
          ${Object.entries(TABS).map(
            ([key, label]) => html`<button type="button" role="tab" id="tab-${key}" aria-selected="${key === active}" aria-controls="panel" data-tab="${key}">${label}</button>`,
          )}
        </div>
        <div id="panel" role="tabpanel" aria-labelledby="tab-${active}">${panel(active)}</div>
      </div>
    </div>`,
  );
}

function field(id, label, type, autocomplete, extra = '') {
  return html`<div class="field">
    <label for="${id}">${label}</label>
    <input class="input" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" required ${extra} />
    <p class="error-text" id="${id}-error"></p>
  </div>`;
}

function panel(active) {
  if (active === 'register') {
    return html`<form class="form-grid" data-form="register" novalidate>
      ${field('name', 'Nombre', 'text', 'name')}
      ${field('email', 'Correo electrónico', 'email', 'email')}
      ${field('password', 'Contraseña (mínimo 8 caracteres)', 'password', 'new-password')}
      <button class="btn btn-gradient btn-lg btn-block" type="submit">${icon('person_add')} Crear mi cuenta</button>
      <p class="text-muted" style="font-size:var(--fs-label-md)">Si ya compraste como invitada en este dispositivo, tus pedidos quedarán asociados a la nueva cuenta.</p>
    </form>`;
  }
  if (active === 'reset') {
    return html`<form class="form-grid" data-form="reset" novalidate>
      <p class="text-muted">Te enviaremos un correo para crear una nueva contraseña.</p>
      ${field('email', 'Correo electrónico', 'email', 'email')}
      <button class="btn btn-brand btn-lg btn-block" type="submit">${icon('mail')} Enviar enlace</button>
    </form>`;
  }
  return html`<form class="form-grid" data-form="login" novalidate>
    ${field('email', 'Correo electrónico', 'email', 'email')}
    ${field('password', 'Contraseña', 'password', 'current-password')}
    <button class="btn btn-gradient btn-lg btn-block" type="submit">${icon('login')} Entrar</button>
  </form>`;
}

function showErrors(errors) {
  $$('.error-text', main).forEach((el) => {
    el.textContent = '';
  });
  $$('[aria-invalid]', main).forEach((el) => el.removeAttribute('aria-invalid'));
  for (const [key, message] of Object.entries(errors)) {
    $(`#${key}-error`).textContent = message;
    $(`#${key}`).setAttribute('aria-invalid', 'true');
  }
  const first = Object.keys(errors)[0];
  if (first) $(`#${first}`).focus();
}

async function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  const values = Object.fromEntries(new FormData(form).entries());
  const schema = { email: [rules.required('El correo'), rules.email()] };
  if (kind !== 'reset') schema.password = [rules.required('La contraseña')];
  if (kind === 'register') {
    schema.name = [rules.required('El nombre'), rules.minLength('El nombre', 2)];
    schema.password.push(rules.password());
  }
  const errors = validate(values, schema);
  showErrors(errors);
  if (Object.keys(errors).length) return;

  const button = form.querySelector('button[type="submit"]');
  button.classList.add('is-loading');
  button.disabled = true;
  try {
    if (kind === 'login') {
      const { role } = await login(values.email, values.password);
      location.href = destination(role);
      return;
    }
    if (kind === 'register') {
      await register({ name: values.name, email: values.email, password: values.password });
      notify.success('¡Cuenta creada!', 'Ya puedes ver tus pedidos.');
      location.href = destination(null);
      return;
    }
    await resetPassword(values.email);
    notify.success('Revisa tu correo', 'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.');
  } catch (error) {
    if (kind === 'reset' && error?.code === 'auth/user-not-found') {
      notify.success('Revisa tu correo', 'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.');
    } else {
      notify.error('No se pudo completar', friendlyError(error));
    }
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

async function load() {
  try {
    await initStoreLayout({ active: '' });
  } catch {
    // El banner global ya informa el problema de configuración.
  }
  const session = await currentSession().catch(() => ({ user: null }));
  if (session.user && !session.user.isAnonymous && !params.get('motivo')) {
    location.replace(destination(session.role));
    return;
  }
  render(params.get('modo') === 'registro' ? 'register' : 'login');
  main.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      render(tab.dataset.tab);
      $(`#tab-${tab.dataset.tab}`).focus();
    }
  });
  main.addEventListener('submit', handleSubmit);
}

load();

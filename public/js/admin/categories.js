// Categorías: crear, editar y activar/desactivar (no se eliminan para no romper
// productos ni reportes). Escritura directa validada por las reglas de Firestore.
import { html, setHtml, icon, $, $$ } from '../utils/html.js';
import { rules, validate } from '../utils/validation.js';
import { listAllCategories, listAllProducts } from '../services/catalog.js';
import { saveCategory } from '../services/admin.js';
import { friendlyError } from '../services/errors.js';
import { errorState, emptyState, loadingState } from '../components/states.js';
import { openDialog, confirmDialog } from '../components/dialog.js';
import { notify } from '../components/toast.js';
import { initAdminPage } from './shell.js';

const { main } = await initAdminPage({ page: 'categorias', title: 'Categorías', roles: ['admin'] });

const CATEGORY_ICONS = ['calendar_today', 'menu_book', 'layers', 'sentiment_very_satisfied', 'auto_awesome', 'draw', 'edit', 'brush', 'palette', 'redeem', 'favorite', 'star', 'sticky_note_2', 'backpack', 'category'];
const COLORS = { rosa: 'Rosa', lavanda: 'Lavanda', ambar: 'Ámbar', menta: 'Menta' };
const ILLUSTRATIONS = { planner: 'Planner', washi: 'Washi tape', stickers: 'Stickers', pens: 'Bolígrafos', desk: 'Escritorio', generic: 'Regalo' };
let categories = [];
let productCounts = new Map();

setHtml(
  main,
  html`<div class="toolbar"><button type="button" class="btn btn-brand" id="new-category">${icon('add')} Nueva categoría</button></div>
    <section class="panel" aria-labelledby="cat-title">
      <div class="panel-head"><h2 id="cat-title">Categorías de la tienda</h2><p>El orden define cómo aparecen en la tienda.</p></div>
      <div class="panel-body flush" id="list">${loadingState()}</div>
    </section>`,
);

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function render() {
  if (categories.length === 0) {
    setHtml($('#list'), html`<div class="panel-body">${emptyState({ title: 'Aún no hay categorías', text: 'Crea la primera para empezar a cargar productos.', iconName: 'category' })}</div>`);
    return;
  }
  setHtml(
    $('#list'),
    html`<div class="table-wrap"><table class="table responsive">
      <caption class="sr-only">Categorías</caption>
      <thead><tr><th scope="col">Categoría</th><th scope="col" class="num">Orden</th><th scope="col" class="num">Productos</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${categories.map(
        (c) => html`<tr>
          <td class="cell-main"><div style="display:flex;gap:.75rem;align-items:center">
            <span class="category-tile-icon tone-${c.color ?? 'rosa'}" style="width:2.5rem;height:2.5rem;font-size:1.2rem;display:grid;place-items:center;border-radius:50%">${icon(c.icon || 'category')}</span>
            <div><strong>${c.name}</strong><small>/${c.slug}${c.description ? ` · ${c.description}` : ''}</small></div></div></td>
          <td data-label="Orden" class="num">${c.order}</td>
          <td data-label="Productos" class="num">${productCounts.get(c.id) ?? 0}</td>
          <td data-label="Estado">${c.active ? html`<span class="badge badge-menta">${icon('visibility')} Visible</span>` : html`<span class="badge badge-neutral">${icon('visibility_off')} Oculta</span>`}</td>
          <td data-label=""><div class="row-actions">
            <button type="button" class="btn btn-sm btn-secondary" data-edit="${c.id}">${icon('edit')} Editar</button>
            <button type="button" class="btn btn-sm btn-ghost" data-toggle="${c.id}">${c.active ? 'Ocultar' : 'Mostrar'}</button>
          </div></td>
        </tr>`,
      )}</tbody></table></div>`,
  );
}

async function load() {
  setHtml($('#list'), loadingState());
  try {
    const [cats, products] = await Promise.all([listAllCategories(), listAllProducts()]);
    categories = cats;
    productCounts = new Map();
    products.forEach((p) => productCounts.set(p.categoryId, (productCounts.get(p.categoryId) ?? 0) + 1));
    render();
  } catch (error) {
    setHtml($('#list'), html`<div class="panel-body">${errorState({ text: friendlyError(error), retry: true })}</div>`);
  }
}

function openForm(existing = null) {
  const isNew = !existing;
  const c = existing ?? { name: '', slug: '', description: '', icon: 'category', color: 'rosa', illustration: 'generic', order: categories.length + 1, active: true };
  const dialog = openDialog({
    title: isNew ? 'Nueva categoría' : `Editar ${c.name}`,
    body: html`<form id="cat-form" class="form-grid" novalidate>
      <div class="field"><label for="c-name">Nombre *</label><input class="input" id="c-name" maxlength="40" value="${c.name}" /><p class="error-text" id="c-name-error"></p></div>
      <div class="field"><label for="c-slug">Identificador (URL) *</label><input class="input" id="c-slug" maxlength="40" value="${c.slug}" ${isNew ? '' : 'readonly'} />
        <p class="hint">${isNew ? 'Se genera desde el nombre. Minúsculas, números y guiones.' : 'No se puede cambiar porque los productos lo usan.'}</p><p class="error-text" id="c-slug-error"></p></div>
      <div class="field"><label for="c-description">Descripción corta</label><input class="input" id="c-description" maxlength="160" value="${c.description ?? ''}" /></div>
      <div class="form-grid two">
        <div class="field"><label for="c-icon">Icono</label><select class="select" id="c-icon">${CATEGORY_ICONS.map((name) => html`<option value="${name}" ${name === c.icon ? 'selected' : ''}>${name.replace(/_/g, ' ')}</option>`)}</select></div>
        <div class="field"><label for="c-color">Color</label><select class="select" id="c-color">${Object.entries(COLORS).map(([k, v]) => html`<option value="${k}" ${k === c.color ? 'selected' : ''}>${v}</option>`)}</select></div>
        <div class="field"><label for="c-illustration">Ilustración para productos sin foto</label><select class="select" id="c-illustration">${Object.entries(ILLUSTRATIONS).map(([k, v]) => html`<option value="${k}" ${k === c.illustration ? 'selected' : ''}>${v}</option>`)}</select></div>
        <div class="field"><label for="c-order">Orden</label><input class="input" id="c-order" inputmode="numeric" value="${c.order}" /><p class="error-text" id="c-order-error"></p></div>
      </div>
      <label class="check"><input type="checkbox" id="c-active" ${c.active ? 'checked' : ''} /> Visible en la tienda</label>
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="submit" form="cat-form" class="btn btn-brand" id="c-save">${icon('save')} Guardar</button>`,
  });
  const name = dialog.querySelector('#c-name');
  const slug = dialog.querySelector('#c-slug');
  if (isNew) name.addEventListener('input', () => {
    slug.value = slugify(name.value);
  });
  dialog.querySelector('#cat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = { 'c-name': name.value.trim(), 'c-slug': slug.value.trim(), 'c-order': dialog.querySelector('#c-order').value.trim() };
    const errors = validate(values, {
      'c-name': [rules.required('El nombre'), rules.minLength('El nombre', 2), rules.maxLength('El nombre', 40)],
      'c-slug': [rules.required('El identificador'), (v) => (/^[a-z0-9-]{2,40}$/.test(v) ? null : 'Solo minúsculas, números y guiones (2 a 40).'), (v) => (isNew && categories.some((x) => x.id === v) ? 'Ya existe una categoría con este identificador.' : null)],
      'c-order': [rules.integer('El orden', { min: 0, max: 999 })],
    });
    $$('.error-text', dialog).forEach((el) => {
      el.textContent = '';
    });
    for (const [field, message] of Object.entries(errors)) dialog.querySelector(`#${field}-error`).textContent = message;
    if (Object.keys(errors).length) return;
    const button = dialog.querySelector('#c-save');
    button.classList.add('is-loading');
    button.disabled = true;
    try {
      await saveCategory(
        {
          name: values['c-name'],
          slug: values['c-slug'],
          description: dialog.querySelector('#c-description').value.trim(),
          icon: dialog.querySelector('#c-icon').value,
          color: dialog.querySelector('#c-color').value,
          illustration: dialog.querySelector('#c-illustration').value,
          order: Number(values['c-order']),
          active: dialog.querySelector('#c-active').checked,
          createdAt: existing?.createdAt,
        },
        { isNew },
      );
      notify.success('Categoría guardada', values['c-name']);
      dialog.close();
      load();
    } catch (error) {
      notify.error('No se pudo guardar', friendlyError(error));
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  });
}

main.addEventListener('click', async (event) => {
  if (event.target.closest('#new-category')) return openForm();
  const edit = event.target.closest('[data-edit]');
  if (edit) return openForm(categories.find((c) => c.id === edit.dataset.edit));
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const c = categories.find((x) => x.id === toggle.dataset.toggle);
    const count = productCounts.get(c.id) ?? 0;
    const ok = await confirmDialog({
      title: c.active ? 'Ocultar categoría' : 'Mostrar categoría',
      message: c.active
        ? `"${c.name}" dejará de aparecer en la navegación de la tienda. Sus ${count} productos siguen publicados y se pueden encontrar en el catálogo.`
        : `"${c.name}" volverá a aparecer en la tienda.`,
      confirmLabel: c.active ? 'Ocultar' : 'Mostrar',
    });
    if (!ok) return;
    try {
      await saveCategory({ ...c, active: !c.active }, { isNew: false });
      notify.success('Categoría actualizada', c.name);
      load();
    } catch (error) {
      notify.error('No se pudo actualizar', friendlyError(error));
    }
    return;
  }
  if (event.target.closest('[data-action="retry"]')) load();
});

load();

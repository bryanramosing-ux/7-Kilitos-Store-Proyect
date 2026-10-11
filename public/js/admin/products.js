// Productos: creación, edición, publicación e imágenes. Las escrituras pasan por
// la Cloud Function saveProduct (valida precios, SKU único y no toca el stock).
import { html, setHtml, icon, $, $$ } from '../utils/html.js';
import { formatCLP, formatNumber, normalizeText, discountPercent, formatDateTime } from '../utils/format.js';
import { availabilityLabel, lowStockThreshold } from '../utils/stock.js';
import { rules, validate, parseMoney } from '../utils/validation.js';
import { slugId } from '../utils/ids.js';
import { listAllProducts, listAllCategories } from '../services/catalog.js';
import { getSettings } from '../services/settings.js';
import { saveProduct, setProductActive, getProductCost, uploadProductImage, deleteProductImage, validateImageFile } from '../services/admin.js';
import { friendlyError, errorDetails } from '../services/errors.js';
import { errorState, emptyState, loadingState } from '../components/states.js';
import { openDialog, confirmDialog } from '../components/dialog.js';
import { notify } from '../components/toast.js';
import { initAdminPage } from './shell.js';
import { paginate, pager } from './table.js';
import { productImages } from '../store/product-visuals.js';

const { main, isAdmin } = await initAdminPage({ page: 'productos', title: 'Productos' });
const state = { products: [], categories: [], settings: null, q: '', category: '', status: '', stock: '', page: 1 };

setHtml(
  main,
  html`<div class="toolbar">
      <div class="field grow"><label for="q">Buscar</label>
        <div class="input-with-icon">${icon('search')}<input class="input" id="q" type="search" placeholder="Nombre o SKU" /></div></div>
      <div class="field"><label for="f-cat">Categoría</label><select class="select" id="f-cat"><option value="">Todas</option></select></div>
      <div class="field"><label for="f-status">Publicación</label>
        <select class="select" id="f-status"><option value="">Todos</option><option value="activo">Publicados</option><option value="inactivo">No publicados</option><option value="demo">De demostración</option></select></div>
      <div class="field"><label for="f-stock">Stock</label>
        <select class="select" id="f-stock"><option value="">Todos</option><option value="bajo">Stock bajo</option><option value="agotado">Agotados</option></select></div>
      ${isAdmin ? html`<button type="button" class="btn btn-brand" id="new-product">${icon('add')} Nuevo producto</button>` : ''}
    </div>
    ${isAdmin ? '' : html`<p class="inline-alert is-info">${icon('visibility')} Tu rol puede consultar productos. Crear o editar precios es exclusivo de administración.</p>`}
    <section class="panel" aria-labelledby="products-title">
      <div class="panel-head"><h2 id="products-title">Catálogo</h2><p id="products-note"></p></div>
      <div class="panel-body flush" id="list">${loadingState()}</div>
    </section>`,
);

const categoryName = (id) => state.categories.find((c) => c.id === id)?.name ?? 'Sin categoría';

function filtered() {
  const terms = normalizeText(state.q).split(' ').filter(Boolean);
  return state.products
    .filter((p) => {
      if (state.category && p.categoryId !== state.category) return false;
      if (state.status === 'activo' && !p.active) return false;
      if (state.status === 'inactivo' && p.active) return false;
      if (state.status === 'demo' && !p.isDemo) return false;
      const level = availabilityLabel(p, state.settings).level;
      if (state.stock === 'bajo' && level !== 'bajo') return false;
      if (state.stock === 'agotado' && level !== 'agotado') return false;
      const text = normalizeText(`${p.name} ${p.sku}`);
      return terms.every((t) => text.includes(t));
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function renderList() {
  const list = filtered();
  const view = paginate(list, state.page, 20);
  state.page = view.page;
  $('#products-note').textContent = `${formatNumber(list.length)} de ${formatNumber(state.products.length)} productos`;
  if (list.length === 0) {
    setHtml($('#list'), html`<div class="panel-body">${emptyState({ title: 'No hay productos con estos filtros', iconName: 'sell' })}</div>`);
    return;
  }
  const categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  setHtml(
    $('#list'),
    html`<div class="table-wrap"><table class="table responsive">
      <caption class="sr-only">Productos</caption>
      <thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col" class="num">Precio</th><th scope="col" class="num">Stock</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>
        ${view.rows.map((p) => {
          const [image] = productImages(p, categoriesById.get(p.categoryId));
          const availability = availabilityLabel(p, state.settings);
          const discount = discountPercent(p.price, p.compareAtPrice);
          return html`<tr>
            <td class="cell-main"><div style="display:flex;gap:.75rem;align-items:center">
              <img class="thumb-sm${image.photo ? '' : ' is-illustration'}" src="${image.src}" alt="" width="44" height="44" loading="lazy" />
              <div><strong>${p.name}</strong><small>SKU ${p.sku}${p.isDemo ? html` <span class="badge badge-lavanda">Demo</span>` : ''}${p.featured ? html` <span class="badge badge-ambar">Destacado</span>` : ''}</small></div>
            </div></td>
            <td data-label="Categoría">${categoryName(p.categoryId)}</td>
            <td data-label="Precio" class="num"><strong>${formatCLP(p.price)}</strong>${discount ? html`<br /><small class="text-muted"><s>${formatCLP(p.compareAtPrice)}</s> −${discount}%</small>` : ''}</td>
            <td data-label="Stock" class="num"><span class="badge ${availability.level === 'agotado' ? 'badge-danger' : availability.level === 'bajo' ? 'badge-warning' : 'badge-menta'}">${icon(availability.icon)} ${formatNumber(p.stock ?? 0)}</span></td>
            <td data-label="Estado">${p.active ? html`<span class="badge badge-menta">${icon('visibility')} Publicado</span>` : html`<span class="badge badge-neutral">${icon('visibility_off')} No publicado</span>`}</td>
            <td data-label=""><div class="row-actions">
              ${isAdmin
                ? html`<button type="button" class="btn btn-sm btn-secondary" data-edit="${p.id}">${icon('edit')} Editar</button>
                    <button type="button" class="btn btn-sm ${p.active ? 'btn-ghost' : 'btn-primary'}" data-toggle="${p.id}">${p.active ? 'Despublicar' : 'Publicar'}</button>`
                : html`<button type="button" class="btn btn-sm btn-secondary" data-view="${p.id}">${icon('visibility')} Ver</button>`}
            </div></td>
          </tr>`;
        })}
      </tbody>
    </table></div>${pager(view)}`,
  );
}

async function load() {
  setHtml($('#list'), loadingState('Cargando productos…'));
  try {
    const [products, categories, settings] = await Promise.all([listAllProducts(), listAllCategories(), getSettings({ fresh: true })]);
    Object.assign(state, { products, categories, settings });
    setHtml($('#f-cat'), html`<option value="">Todas</option>${categories.map((c) => html`<option value="${c.id}">${c.name}${c.active ? '' : ' (inactiva)'}</option>`)}`);
    $('#f-cat').value = state.category;
    renderList();
  } catch (error) {
    setHtml($('#list'), html`<div class="panel-body">${errorState({ text: friendlyError(error), retry: true })}</div>`);
  }
}

// ---------------------------------------------------------------------------
// Formulario de producto
// ---------------------------------------------------------------------------
function featureRow(feature = { title: '', text: '' }) {
  return html`<div class="repeater-row" data-feature>
    <div class="form-grid two">
      <div class="field"><label>Título</label><input class="input" data-f="title" maxlength="60" value="${feature.title}" /></div>
      <div class="field"><label>Detalle</label><input class="input" data-f="text" maxlength="240" value="${feature.text}" /></div>
    </div>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-row aria-label="Quitar característica">${icon('delete')}</button>
  </div>`;
}

function optionRow(option = { name: '', values: [] }) {
  return html`<div class="repeater-row" data-option>
    <div class="form-grid two">
      <div class="field"><label>Nombre de la opción</label><input class="input" data-o="name" maxlength="40" value="${option.name}" placeholder="Ej.: Diseño de portada" /></div>
      <div class="field"><label>Valores (separados por coma)</label><input class="input" data-o="values" value="${option.values.join(', ')}" placeholder="Rosa Algodón, Lila Estelar" /></div>
    </div>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-row aria-label="Quitar opción">${icon('delete')}</button>
  </div>`;
}

function imagesGrid(images) {
  return html`${images.map(
      (img, i) => html`<div class="image-tile" data-image-index="${i}">
        <img src="${img.url}" alt="${img.alt || ''}" />
        ${i === 0 ? html`<span class="badge badge-brand cover-flag">Portada</span>` : ''}
        <div class="tile-actions">
          ${i > 0 ? html`<button type="button" data-cover="${i}" aria-label="Usar como portada">${icon('star')}</button>` : html`<span></span>`}
          <button type="button" data-remove-image="${i}" aria-label="Quitar imagen">${icon('delete')}</button>
        </div>
      </div>`,
    )}
    ${images.length < 8
      ? html`<label class="upload-drop">${icon('add_photo_alternate')}<span>Subir fotos</span><small class="text-muted">JPG, PNG o WebP</small>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload /></label>`
      : ''}`;
}

async function openProductForm(existing = null) {
  const isNew = !existing;
  const productId = existing?.id ?? slugId('producto');
  let cost = null;
  if (!isNew) {
    try {
      cost = await getProductCost(productId);
    } catch (error) {
      notify.warning('No se pudo leer el costo', friendlyError(error));
    }
  }
  const product = existing ?? { name: '', sku: '', categoryId: state.categories[0]?.id ?? '', description: '', badge: '', featured: false, active: false, price: '', compareAtPrice: null, lowStockThreshold: null, images: [], features: [], options: [], isDemo: false };
  let images = [...(product.images ?? [])];
  const uploadedThisSession = new Set();
  const removedPaths = new Set();
  let saved = false;
  const defaultThreshold = state.settings?.lowStockDefault ?? 5;

  const dialog = openDialog({
    title: isNew ? 'Nuevo producto' : `Editar: ${product.name}`,
    wide: true,
    body: html`<form id="product-form" class="form-grid" novalidate>
      <section class="form-section">
        <h3>Información</h3>
        <div class="form-grid two">
          <div class="field" style="grid-column:1/-1"><label for="p-name">Nombre *</label><input class="input" id="p-name" maxlength="100" value="${product.name}" required /><p class="error-text" id="p-name-error"></p></div>
          <div class="field"><label for="p-sku">SKU o código interno *</label><input class="input" id="p-sku" maxlength="32" value="${product.sku}" required style="text-transform:uppercase" /><p class="hint">Único. Letras, números y guiones.</p><p class="error-text" id="p-sku-error"></p></div>
          <div class="field"><label for="p-category">Categoría *</label><select class="select" id="p-category">${state.categories.map((c) => html`<option value="${c.id}" ${c.id === product.categoryId ? 'selected' : ''}>${c.name}${c.active ? '' : ' (inactiva)'}</option>`)}</select><p class="error-text" id="p-category-error"></p></div>
          <div class="field" style="grid-column:1/-1"><label for="p-description">Descripción</label><textarea class="textarea" id="p-description" maxlength="2000">${product.description}</textarea></div>
          <div class="field"><label for="p-badge">Etiqueta destacada <span class="text-muted">(opcional)</span></label><input class="input" id="p-badge" maxlength="30" value="${product.badge}" placeholder="Ej.: Nuevo, Set x5" /></div>
          <div class="field" style="align-content:end">
            <label class="check"><input type="checkbox" id="p-featured" ${product.featured ? 'checked' : ''} /> Mostrar en destacados</label>
            <label class="check"><input type="checkbox" id="p-active" ${product.active ? 'checked' : ''} /> Publicado en la tienda</label>
            ${product.isDemo ? html`<label class="check"><input type="checkbox" id="p-demo" checked /> Producto de demostración</label>` : ''}
          </div>
        </div>
      </section>
      <section class="form-section">
        <h3>Precios (CLP, sin decimales)</h3>
        <div class="form-grid two">
          <div class="field"><label for="p-price">Precio de venta *</label><input class="input" id="p-price" inputmode="numeric" value="${product.price}" placeholder="16900" required /><p class="error-text" id="p-price-error"></p></div>
          <div class="field"><label for="p-compare">Precio anterior <span class="text-muted">(solo si hay promoción)</span></label><input class="input" id="p-compare" inputmode="numeric" value="${product.compareAtPrice ?? ''}" placeholder="19900" /><p class="hint" id="p-discount"></p><p class="error-text" id="p-compare-error"></p></div>
          <div class="field"><label for="p-cost">Costo de adquisición <span class="text-muted">(privado, opcional)</span></label><input class="input" id="p-cost" inputmode="numeric" value="${cost ?? ''}" placeholder="9000" /><p class="hint">Solo lo ve administración. Se usa para el beneficio estimado.</p><p class="error-text" id="p-cost-error"></p></div>
        </div>
      </section>
      <section class="form-section">
        <h3>Inventario</h3>
        <div class="form-grid two">
          ${isNew
            ? html`<div class="field"><label for="p-stock">Stock inicial</label><input class="input" id="p-stock" inputmode="numeric" value="0" /><p class="hint">Queda registrado como movimiento "Stock inicial".</p><p class="error-text" id="p-stock-error"></p></div>`
            : html`<div class="field"><span class="field-label">Stock actual</span><p><strong>${formatNumber(product.stock ?? 0)} unidades</strong></p><p class="hint">Para cambiarlo registra una entrada, salida o ajuste en <a href="/admin/inventario.html?producto=${encodeURIComponent(productId)}">Inventario</a>.</p></div>`}
          <div class="field"><label for="p-threshold">Umbral de stock bajo</label><input class="input" id="p-threshold" inputmode="numeric" value="${product.lowStockThreshold ?? ''}" placeholder="${defaultThreshold} (valor general)" /><p class="error-text" id="p-threshold-error"></p></div>
        </div>
      </section>
      <section class="form-section">
        <h3>Imágenes</h3>
        <p class="hint">La primera imagen es la portada. Se optimizan antes de subirlas (máximo 3 MB cada una).</p>
        <div class="image-grid" id="p-images">${imagesGrid(images)}</div>
        <p class="text-muted" id="upload-status" role="status" aria-live="polite"></p>
      </section>
      <section class="form-section">
        <h3>Características</h3>
        <div class="repeater" id="p-features">${(product.features ?? []).map((f) => featureRow(f))}</div>
        <button type="button" class="btn btn-sm btn-secondary" data-add-feature>${icon('add')} Agregar característica</button>
      </section>
      <section class="form-section">
        <h3>Opciones o variantes</h3>
        <p class="hint">La clienta debe elegir un valor de cada opción. El stock es común a todas las opciones; si necesitas stock separado por variante, crea un producto por variante.</p>
        <div class="repeater" id="p-options">${(product.options ?? []).map((o) => optionRow(o))}</div>
        <button type="button" class="btn btn-sm btn-secondary" data-add-option>${icon('add')} Agregar opción</button>
      </section>
      ${!isNew ? html`<p class="text-muted">Creado: ${formatDateTime(product.createdAt)}. Última actualización: ${formatDateTime(product.updatedAt)}.</p>` : ''}
      <div id="p-alert" role="alert"></div>
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="submit" form="product-form" class="btn btn-brand" id="p-save">${icon('save')} ${isNew ? 'Crear producto' : 'Guardar cambios'}</button>`,
    onClose: async () => {
      if (saved) return;
      // Limpia imágenes subidas en esta sesión que no se guardaron.
      for (const path of uploadedThisSession) await deleteProductImage(path).catch(() => {});
    },
  });

  const refreshImages = () => setHtml(dialog.querySelector('#p-images'), imagesGrid(images));
  const updateDiscount = () => {
    const price = parseMoney(dialog.querySelector('#p-price').value);
    const compare = parseMoney(dialog.querySelector('#p-compare').value);
    const percent = discountPercent(price, compare);
    dialog.querySelector('#p-discount').textContent = percent > 0 ? `La tienda mostrará ${percent}% de descuento.` : '';
  };
  updateDiscount();
  dialog.addEventListener('input', (event) => {
    if (['p-price', 'p-compare'].includes(event.target.id)) updateDiscount();
  });

  dialog.addEventListener('click', async (event) => {
    if (event.target.closest('[data-add-feature]')) {
      const list = dialog.querySelector('#p-features');
      if (list.children.length >= 8) return notify.warning('Máximo 8 características', '');
      list.insertAdjacentHTML('beforeend', featureRow().toString());
      list.lastElementChild.querySelector('input').focus();
      return;
    }
    if (event.target.closest('[data-add-option]')) {
      const list = dialog.querySelector('#p-options');
      if (list.children.length >= 3) return notify.warning('Máximo 3 opciones', '');
      list.insertAdjacentHTML('beforeend', optionRow().toString());
      list.lastElementChild.querySelector('input').focus();
      return;
    }
    const removeRow = event.target.closest('[data-remove-row]');
    if (removeRow) {
      removeRow.closest('.repeater-row').remove();
      return;
    }
    const cover = event.target.closest('[data-cover]');
    if (cover) {
      const [img] = images.splice(Number(cover.dataset.cover), 1);
      images.unshift(img);
      refreshImages();
      return;
    }
    const removeImage = event.target.closest('[data-remove-image]');
    if (removeImage) {
      const [img] = images.splice(Number(removeImage.dataset.removeImage), 1);
      if (img?.path) removedPaths.add(img.path);
      refreshImages();
    }
  });

  dialog.addEventListener('change', async (event) => {
    if (!event.target.matches('[data-upload]')) return;
    const files = [...event.target.files].slice(0, 8 - images.length);
    const status = dialog.querySelector('#upload-status');
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) {
        notify.error('Imagen no válida', problem);
        continue;
      }
      status.textContent = `Subiendo ${file.name}…`;
      try {
        const image = await uploadProductImage(productId, file);
        image.alt = dialog.querySelector('#p-name').value.trim();
        images.push(image);
        uploadedThisSession.add(image.path);
        refreshImages();
      } catch (error) {
        notify.error('No se pudo subir la imagen', error.code ? friendlyError(error) : error.message);
      }
    }
    status.textContent = '';
  });

  dialog.querySelector('#product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const get = (id) => dialog.querySelector(`#${id}`)?.value.trim() ?? '';
    const values = {
      'p-name': get('p-name'),
      'p-sku': get('p-sku').toUpperCase(),
      'p-category': get('p-category'),
      'p-price': get('p-price').replace(/[$.\s]/g, ''),
      'p-compare': get('p-compare').replace(/[$.\s]/g, ''),
      'p-cost': get('p-cost').replace(/[$.\s]/g, ''),
      'p-threshold': get('p-threshold'),
      'p-stock': isNew ? get('p-stock') : '0',
    };
    const errors = validate(values, {
      'p-name': [rules.required('El nombre'), rules.minLength('El nombre', 3)],
      'p-sku': [rules.required('El SKU'), (v) => (/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(v) ? null : 'Usa 3 a 32 letras, números o guiones.')],
      'p-category': [rules.required('La categoría')],
      'p-price': [rules.integer('El precio', { min: 1, max: 10000000 })],
      'p-compare': [rules.optionalInteger('El precio anterior', { min: 1, max: 10000000 }), (v, all) => (v && Number(v) <= Number(all['p-price']) ? 'Debe ser mayor que el precio de venta.' : null)],
      'p-cost': [rules.optionalInteger('El costo', { min: 0, max: 10000000 })],
      'p-threshold': [rules.optionalInteger('El umbral', { min: 0, max: 10000 })],
      'p-stock': [rules.integer('El stock inicial', { min: 0, max: 100000 })],
    });
    $$('.error-text', dialog).forEach((el) => {
      el.textContent = '';
    });
    $$('[aria-invalid]', dialog).forEach((el) => el.removeAttribute('aria-invalid'));
    for (const [field, message] of Object.entries(errors)) {
      dialog.querySelector(`#${field}-error`).textContent = message;
      dialog.querySelector(`#${field}`).setAttribute('aria-invalid', 'true');
    }
    if (Object.keys(errors).length) {
      dialog.querySelector(`#${Object.keys(errors)[0]}`).focus();
      return;
    }
    const features = $$('[data-feature]', dialog)
      .map((row) => ({ title: row.querySelector('[data-f="title"]').value.trim(), text: row.querySelector('[data-f="text"]').value.trim() }))
      .filter((f) => f.title);
    const options = $$('[data-option]', dialog)
      .map((row) => ({
        name: row.querySelector('[data-o="name"]').value.trim(),
        values: [...new Set(row.querySelector('[data-o="values"]').value.split(',').map((v) => v.trim()).filter(Boolean))],
      }))
      .filter((o) => o.name);
    const payload = {
      mode: isNew ? 'create' : 'update',
      productId,
      initialStock: isNew ? Number(values['p-stock']) : undefined,
      product: {
        sku: values['p-sku'],
        name: values['p-name'],
        description: dialog.querySelector('#p-description').value.trim(),
        categoryId: values['p-category'],
        price: Number(values['p-price']),
        compareAtPrice: values['p-compare'] ? Number(values['p-compare']) : null,
        cost: values['p-cost'] ? Number(values['p-cost']) : null,
        lowStockThreshold: values['p-threshold'] ? Number(values['p-threshold']) : null,
        badge: get('p-badge'),
        featured: dialog.querySelector('#p-featured').checked,
        active: dialog.querySelector('#p-active').checked,
        isDemo: dialog.querySelector('#p-demo')?.checked ?? false,
        images: images.map((img) => ({ url: img.url, path: img.path, alt: img.alt || values['p-name'] })),
        features,
        options,
      },
    };
    const button = dialog.querySelector('#p-save');
    button.classList.add('is-loading');
    button.disabled = true;
    try {
      await saveProduct(payload);
      saved = true;
      for (const path of removedPaths) await deleteProductImage(path).catch(() => {});
      notify.success(isNew ? 'Producto creado' : 'Cambios guardados', payload.product.name);
      dialog.close();
      load();
    } catch (error) {
      const details = errorDetails(error);
      const map = { name: 'p-name', sku: 'p-sku', price: 'p-price', compareAtPrice: 'p-compare', cost: 'p-cost', categoryId: 'p-category', lowStockThreshold: 'p-threshold', initialStock: 'p-stock' };
      const field = map[details?.field];
      if (field && dialog.querySelector(`#${field}-error`)) {
        dialog.querySelector(`#${field}-error`).textContent = error.message;
        dialog.querySelector(`#${field}`).focus();
      } else {
        setHtml(dialog.querySelector('#p-alert'), html`<p class="inline-alert is-error">${icon('error')} ${friendlyError(error)}</p>`);
      }
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  });
}

function openReadOnly(product) {
  const categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  const [image] = productImages(product, categoriesById.get(product.categoryId));
  openDialog({
    title: product.name,
    body: html`<div style="display:grid;gap:1rem">
      <img src="${image.src}" alt="" style="max-width:12rem;border-radius:1rem;background:var(--pink-soft)" />
      <dl class="dl">
        <dt>SKU</dt><dd>${product.sku}</dd>
        <dt>Categoría</dt><dd>${categoryName(product.categoryId)}</dd>
        <dt>Precio</dt><dd>${formatCLP(product.price)}</dd>
        ${product.compareAtPrice ? html`<dt>Precio anterior</dt><dd>${formatCLP(product.compareAtPrice)}</dd>` : ''}
        <dt>Stock</dt><dd>${formatNumber(product.stock ?? 0)} (umbral ${lowStockThreshold(product, state.settings)})</dd>
        <dt>Estado</dt><dd>${product.active ? 'Publicado' : 'No publicado'}</dd>
        <dt>Actualizado</dt><dd>${formatDateTime(product.updatedAt)}</dd>
      </dl>
    </div>`,
    footer: html`<a class="btn btn-secondary" href="/admin/inventario.html?producto=${encodeURIComponent(product.id)}">${icon('warehouse')} Ir a inventario</a>`,
  });
}

main.addEventListener('click', async (event) => {
  if (event.target.closest('#new-product')) {
    if (state.categories.length === 0) {
      notify.warning('Primero crea una categoría', 'Los productos necesitan una categoría.');
      return;
    }
    openProductForm();
    return;
  }
  const edit = event.target.closest('[data-edit]');
  if (edit) {
    openProductForm(state.products.find((p) => p.id === edit.dataset.edit));
    return;
  }
  const view = event.target.closest('[data-view]');
  if (view) {
    openReadOnly(state.products.find((p) => p.id === view.dataset.view));
    return;
  }
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const product = state.products.find((p) => p.id === toggle.dataset.toggle);
    const activate = !product.active;
    const ok = await confirmDialog({
      title: activate ? 'Publicar producto' : 'Despublicar producto',
      message: activate
        ? `"${product.name}" será visible en la tienda y se podrá comprar.`
        : `"${product.name}" dejará de mostrarse en la tienda. Su historial de ventas se conserva.`,
      confirmLabel: activate ? 'Publicar' : 'Despublicar',
      danger: !activate,
    });
    if (!ok) return;
    toggle.disabled = true;
    try {
      await setProductActive(product.id, activate);
      notify.success(activate ? 'Producto publicado' : 'Producto despublicado', product.name);
      load();
    } catch (error) {
      toggle.disabled = false;
      notify.error('No se pudo cambiar la publicación', friendlyError(error));
    }
    return;
  }
  const page = event.target.closest('[data-page]');
  if (page) {
    state.page = Number(page.dataset.page);
    renderList();
    return;
  }
  if (event.target.closest('[data-action="retry"]')) load();
});

$('#q').addEventListener('input', (event) => {
  state.q = event.target.value;
  state.page = 1;
  renderList();
});
for (const [id, key] of [['f-cat', 'category'], ['f-status', 'status'], ['f-stock', 'stock']]) {
  $(`#${id}`).addEventListener('change', (event) => {
    state[key] = event.target.value;
    state.page = 1;
    renderList();
  });
}

load();

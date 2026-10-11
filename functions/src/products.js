import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { LIMITS } from './config.js';
import {
  cleanBool,
  cleanDocId,
  cleanInt,
  cleanOptionalInt,
  cleanText,
  ensureArray,
  ensureObject,
  invalid,
} from './validation.js';

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const FILE_NAME = /^[A-Za-z0-9._-]{1,120}$/;

function isEmulated() {
  return process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
}

function cleanImage(raw, index, productId) {
  ensureObject(raw, `images.${index}`, 'La imagen');
  const path = typeof raw.path === 'string' ? raw.path : '';
  const prefix = `products/${productId}/`;
  if (!path.startsWith(prefix) || !FILE_NAME.test(path.slice(prefix.length))) {
    throw invalid(`images.${index}`, 'La imagen no pertenece a este producto.');
  }
  let url;
  try {
    url = new URL(raw.url);
  } catch {
    throw invalid(`images.${index}`, 'La dirección de la imagen no es válida.');
  }
  const allowedHosts = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];
  const hostOk =
    (url.protocol === 'https:' && allowedHosts.includes(url.hostname)) ||
    (isEmulated() && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname));
  if (!hostOk || raw.url.length > 1000) {
    throw invalid(`images.${index}`, 'La imagen debe estar alojada en Firebase Storage.');
  }
  const alt = cleanText(raw.alt, { field: `images.${index}.alt`, label: 'La descripción de la imagen', max: 120 });
  return { url: raw.url, path, alt };
}

function cleanOptions(raw) {
  const groups = ensureArray(raw, 'options', 'Las opciones', LIMITS.maxOptionGroups);
  const names = new Set();
  return groups.map((group, index) => {
    ensureObject(group, `options.${index}`, 'La opción');
    const name = cleanText(group.name, { field: `options.${index}.name`, label: 'El nombre de la opción', min: 1, max: 40 });
    if (names.has(name.toLowerCase())) throw invalid(`options.${index}.name`, `La opción "${name}" está repetida.`);
    names.add(name.toLowerCase());
    const values = ensureArray(group.values, `options.${index}.values`, 'Los valores', LIMITS.maxOptionValues).map(
      (value) => cleanText(value, { field: `options.${index}.values`, label: 'El valor', min: 1, max: 40 }),
    );
    if (values.length === 0) throw invalid(`options.${index}.values`, `Agrega al menos un valor para "${name}".`);
    if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) {
      throw invalid(`options.${index}.values`, `Hay valores repetidos en "${name}".`);
    }
    return { name, values };
  });
}

function cleanFeatures(raw) {
  return ensureArray(raw, 'features', 'Las características', LIMITS.maxFeatures).map((feature, index) => {
    ensureObject(feature, `features.${index}`, 'La característica');
    return {
      title: cleanText(feature.title, { field: `features.${index}.title`, label: 'El título', min: 2, max: 60 }),
      text: cleanText(feature.text, { field: `features.${index}.text`, label: 'El detalle', max: 240 }),
    };
  });
}

export function parseProductInput(data) {
  ensureObject(data, 'data', 'La solicitud');
  const mode = data.mode;
  if (mode !== 'create' && mode !== 'update') throw invalid('mode', 'Operación no válida.');
  const productId = cleanDocId(data.productId, 'productId', 'El identificador del producto');
  const raw = ensureObject(data.product, 'product', 'El producto');

  const sku = cleanText(raw.sku, { field: 'sku', label: 'El SKU', min: 3, max: 32 }).toUpperCase();
  if (!SKU_PATTERN.test(sku)) throw invalid('sku', 'El SKU solo admite letras, números, guiones y guiones bajos (3 a 32).');
  const price = cleanInt(raw.price, { field: 'price', label: 'El precio', min: 1, max: LIMITS.maxPrice });
  const compareAtPrice = cleanOptionalInt(raw.compareAtPrice, {
    field: 'compareAtPrice',
    label: 'El precio anterior',
    min: 1,
    max: LIMITS.maxPrice,
  });
  if (compareAtPrice !== null && compareAtPrice <= price) {
    throw invalid('compareAtPrice', 'El precio anterior debe ser mayor que el precio de venta para mostrar un descuento.');
  }
  const cost = cleanOptionalInt(raw.cost, { field: 'cost', label: 'El costo', min: 0, max: LIMITS.maxPrice });
  const images = ensureArray(raw.images, 'images', 'Las imágenes', LIMITS.maxImages).map((image, index) =>
    cleanImage(image, index, productId),
  );

  const product = {
    sku,
    name: cleanText(raw.name, { field: 'name', label: 'El nombre', min: 3, max: 100 }),
    description: cleanText(raw.description, { field: 'description', label: 'La descripción', max: 2000, multiline: true }),
    features: cleanFeatures(raw.features),
    categoryId: cleanDocId(raw.categoryId, 'categoryId', 'La categoría'),
    price,
    compareAtPrice,
    lowStockThreshold: cleanOptionalInt(raw.lowStockThreshold, {
      field: 'lowStockThreshold',
      label: 'El umbral de stock bajo',
      min: 0,
      max: 10000,
    }),
    images,
    options: cleanOptions(raw.options),
    badge: cleanText(raw.badge, { field: 'badge', label: 'La etiqueta', max: 30 }),
    featured: cleanBool(raw.featured ?? false, { field: 'featured', label: 'Destacado' }),
    active: cleanBool(raw.active ?? false, { field: 'active', label: 'Publicado' }),
    isDemo: cleanBool(raw.isDemo ?? false, { field: 'isDemo', label: 'Demostración' }),
  };
  const initialStock =
    mode === 'create'
      ? cleanInt(data.initialStock ?? 0, { field: 'initialStock', label: 'El stock inicial', min: 0, max: LIMITS.maxStockMovement })
      : null;
  return { mode, productId, product, cost, initialStock };
}

// Crea o actualiza un producto. El stock NO se modifica aquí: después de crear el
// producto, solo cambia mediante movimientos de inventario o pedidos.
export async function saveProduct(db, { actor, data, now = Timestamp.now() }) {
  const input = parseProductInput(data);
  const productRef = db.collection('products').doc(input.productId);
  const privateRef = db.collection('productPrivate').doc(input.productId);
  const skuRef = db.collection('skus').doc(input.product.sku);
  const categoryRef = db.collection('categories').doc(input.product.categoryId);

  return db.runTransaction(async (tx) => {
    const [productSnap, skuSnap, categorySnap] = await tx.getAll(productRef, skuRef, categoryRef);
    if (!categorySnap.exists) throw invalid('categoryId', 'La categoría seleccionada no existe.');
    if (input.mode === 'create' && productSnap.exists) {
      throw new HttpsError('already-exists', 'Ya existe un producto con este identificador.');
    }
    if (input.mode === 'update' && !productSnap.exists) throw new HttpsError('not-found', 'El producto no existe.');
    if (skuSnap.exists && skuSnap.get('productId') !== input.productId) {
      throw invalid('sku', `El SKU ${input.product.sku} ya está asignado a otro producto.`);
    }

    const previousSku = productSnap.exists ? productSnap.get('sku') : null;
    if (previousSku && previousSku !== input.product.sku) tx.delete(db.collection('skus').doc(previousSku));
    if (!skuSnap.exists) tx.set(skuRef, { productId: input.productId, createdAt: now });

    if (input.mode === 'create') {
      tx.create(productRef, {
        ...input.product,
        stock: input.initialStock,
        salesCount: 0,
        createdAt: now,
        createdBy: actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
      });
      if (input.initialStock > 0) {
        tx.create(db.collection('inventoryMovements').doc(), {
          productId: input.productId,
          sku: input.product.sku,
          productName: input.product.name,
          type: 'stock_inicial',
          quantity: input.initialStock,
          stockBefore: 0,
          stockAfter: input.initialStock,
          reason: 'Stock inicial al crear el producto',
          orderId: null,
          requestId: null,
          userUid: actor.uid,
          userEmail: actor.email ?? null,
          userRole: actor.role,
          createdAt: now,
        });
      }
    } else {
      tx.update(productRef, { ...input.product, updatedAt: now, updatedBy: actor.uid });
    }
    tx.set(privateRef, { cost: input.cost, updatedAt: now, updatedBy: actor.uid });
    return { productId: input.productId, created: input.mode === 'create' };
  });
}

export async function setProductActive(db, { actor, data, now = Timestamp.now() }) {
  ensureObject(data, 'data', 'La solicitud');
  const productId = cleanDocId(data.productId, 'productId', 'El producto');
  const active = cleanBool(data.active, { field: 'active', label: 'Publicado' });
  const ref = db.collection('products').doc(productId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'El producto no existe.');
    if (snap.get('active') === active) return { productId, active, changed: false };
    tx.update(ref, { active, updatedAt: now, updatedBy: actor.uid });
    return { productId, active, changed: true };
  });
}

// Utilidades para probar la lógica de Cloud Functions contra Local Emulator Suite.
// Se ejecutan con `npm run test:emulated` (firebase emulators:exec define
// FIRESTORE_EMULATOR_HOST y FIREBASE_AUTH_EMULATOR_HOST).
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

export const PROJECT_ID = 'demo-7kilitos';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Estas pruebas requieren el emulador: ejecuta `npm run test:emulated`.');
}
if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });

export const db = getFirestore();
export const authAdmin = getAuth();
export { Timestamp, FieldValue, randomUUID };

export async function clearFirestore() {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`No se pudo limpiar Firestore: ${res.status}`);
}

export async function clearAuth() {
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`No se pudo limpiar Auth: ${res.status}`);
}

export const baseSettings = {
  storeName: '7 Kilitos Store',
  freeShippingThreshold: 45000,
  deliveryMethods: [
    { id: 'retiro', name: 'Retiro', cost: 0, requiresAddress: false, freeShippingEligible: false, active: true },
    { id: 'despacho', name: 'Despacho', cost: 3990, requiresAddress: true, freeShippingEligible: true, active: true },
    { id: 'antiguo', name: 'Método inactivo', cost: 0, requiresAddress: false, freeShippingEligible: false, active: false },
  ],
  paymentMethods: [
    { id: 'transferencia', name: 'Transferencia', instructions: 'Datos por correo', active: true },
    { id: 'tarjeta', name: 'Tarjeta (inactivo)', instructions: '', active: false },
  ],
  lowStockDefault: 5,
  orderHoldHours: 48,
  demoMode: false,
};

export async function seedStore({ products = defaultProducts() } = {}) {
  const now = Timestamp.now();
  await db.doc('storeSettings/public').set({ ...baseSettings, updatedAt: now, updatedBy: 'test' });
  await db.doc('categories/planners').set({ name: 'Planners', slug: 'planners', order: 1, active: true, createdAt: now, updatedAt: now });
  for (const product of products) {
    const { id, cost = null, ...data } = product;
    await db.collection('products').doc(id).set({ salesCount: 0, images: [], options: [], categoryId: 'planners', ...data, createdAt: now, updatedAt: now });
    await db.collection('productPrivate').doc(id).set({ cost, updatedAt: now });
    await db.collection('skus').doc(data.sku).set({ productId: id });
  }
}

export function defaultProducts() {
  return [
    { id: 'planner', sku: 'PLN-1', name: 'Planner Chanchito', price: 16900, stock: 5, active: true, cost: 9000,
      options: [{ name: 'Portada', values: ['Rosa', 'Lila'] }] },
    { id: 'washi', sku: 'WSH-1', name: 'Washi Sueños', price: 8500, stock: 10, active: true, cost: null },
    { id: 'borrador', sku: 'BRR-1', name: 'Producto no publicado', price: 1000, stock: 10, active: false },
  ];
}

export function customer(uid = 'cliente-1', email = `${uid}@correo.cl`) {
  return { uid, token: { email } };
}

export function orderPayload(overrides = {}) {
  return {
    requestId: randomUUID(),
    items: [{ productId: 'washi', quantity: 1 }],
    customer: { name: 'Camila Pérez', email: 'camila@correo.cl', phone: '+56 9 1234 5678' },
    delivery: { methodId: 'retiro' },
    paymentMethodId: 'transferencia',
    notes: '',
    expectedTotal: 8500,
    ...overrides,
  };
}

export async function stockOf(productId) {
  return (await db.collection('products').doc(productId).get()).get('stock');
}

export async function makeStaff(uid, role, email = `${uid}@7kilitos.test`) {
  await db.collection('users').doc(uid).set({ email, role, updatedAt: Timestamp.now(), updatedBy: 'test' });
  return { auth: { uid, token: { email, role } }, actor: { uid, role, email } };
}

export async function expectHttpsError(promise, code, detailCode) {
  try {
    await promise;
  } catch (error) {
    if (error.code !== code) throw new Error(`Se esperaba ${code} y llegó ${error.code}: ${error.message}`);
    if (detailCode && error.details?.code !== detailCode) {
      throw new Error(`Se esperaba details.code=${detailCode} y llegó ${error.details?.code}`);
    }
    return error;
  }
  throw new Error(`Se esperaba un error ${code}, pero la operación tuvo éxito.`);
}

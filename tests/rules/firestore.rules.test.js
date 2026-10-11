import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/app';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-7kilitos-rules';
let env;

const validSettings = (uid) => ({
  storeName: '7 Kilitos Store',
  tagline: 'Papelería Bonita',
  instagram: '7kilitos.store',
  contact: { email: '', phone: '', whatsapp: '', location: '' },
  announcement: 'Hola',
  hero: { title: '7 Kilitos Store', description: 'Texto' },
  highlights: [],
  promo: { badge: 'x', title: 'y', text: 'z' },
  communityText: '',
  freeShippingThreshold: 45000,
  deliveryMethods: [{ id: 'retiro', name: 'Retiro', cost: 0, requiresAddress: false, freeShippingEligible: false, active: true }],
  paymentMethods: [{ id: 'transferencia', name: 'Transferencia', instructions: '', active: true }],
  lowStockDefault: 5,
  orderHoldHours: 48,
  demoMode: false,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
});

const validCategory = () => ({
  name: 'Washi Tapes',
  slug: 'washi-tapes',
  description: 'Cintas',
  icon: 'layers',
  color: 'lavanda',
  illustration: 'washi',
  order: 2,
  active: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

function as(uid, role) {
  return env.authenticatedContext(uid, role ? { role, email: `${uid}@test.cl` } : { email: `${uid}@test.cl` }).firestore();
}

setLogLevel('silent');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();
    await setDoc(doc(db, 'users/admin1'), { role: 'admin', email: 'admin1@test.cl' });
    await setDoc(doc(db, 'users/staff1'), { role: 'encargado', email: 'staff1@test.cl' });
    await setDoc(doc(db, 'users/ex-admin'), { role: 'cliente', email: 'ex@test.cl' });
    await setDoc(doc(db, 'products/publicado'), { name: 'Planner', price: 16900, stock: 4, active: true });
    await setDoc(doc(db, 'products/borrador'), { name: 'Borrador', price: 1000, stock: 4, active: false });
    await setDoc(doc(db, 'productPrivate/publicado'), { cost: 9000 });
    await setDoc(doc(db, 'categories/planners'), { name: 'Planners', slug: 'planners', order: 1, active: true, createdAt: now, updatedAt: now });
    await setDoc(doc(db, 'categories/oculta'), { name: 'Oculta', slug: 'oculta', order: 9, active: false, createdAt: now, updatedAt: now });
    await setDoc(doc(db, 'storeSettings/public'), { storeName: '7 Kilitos Store' });
    await setDoc(doc(db, 'orders/o-ana'), { customerUid: 'ana', total: 16900, status: 'pendiente' });
    await setDoc(doc(db, 'orders/o-bea'), { customerUid: 'bea', total: 8500, status: 'pendiente' });
    await setDoc(doc(db, 'sales/o-ana'), { total: 16900, status: 'vigente' });
    await setDoc(doc(db, 'saleCosts/o-ana'), { knownCost: 9000 });
    await setDoc(doc(db, 'inventoryMovements/m1'), { productId: 'publicado', quantity: -1 });
    await setDoc(doc(db, 'counters/orders'), { last: 1 });
  });
});

describe('visitante sin sesión', () => {
  it('ve productos y categorías publicados y la configuración pública', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'products/publicado')));
    await assertSucceeds(getDocs(query(collection(db, 'products'), where('active', '==', true))));
    await assertSucceeds(getDocs(query(collection(db, 'categories'), where('active', '==', true))));
    await assertSucceeds(getDoc(doc(db, 'storeSettings/public')));
  });

  it('no ve borradores, costos, pedidos, ventas ni movimientos', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'products/borrador')));
    await assertFails(getDocs(collection(db, 'products')));
    await assertFails(getDoc(doc(db, 'categories/oculta')));
    await assertFails(getDoc(doc(db, 'productPrivate/publicado')));
    await assertFails(getDoc(doc(db, 'orders/o-ana')));
    await assertFails(getDocs(collection(db, 'sales')));
    await assertFails(getDocs(collection(db, 'inventoryMovements')));
    await assertFails(getDoc(doc(db, 'counters/orders')));
  });
});

describe('cliente autenticado', () => {
  it('lee solo sus propios pedidos', async () => {
    const db = as('ana');
    await assertSucceeds(getDoc(doc(db, 'orders/o-ana')));
    await assertSucceeds(getDocs(query(collection(db, 'orders'), where('customerUid', '==', 'ana'))));
    await assertFails(getDoc(doc(db, 'orders/o-bea')));
    await assertFails(getDocs(collection(db, 'orders')));
    await assertFails(getDocs(query(collection(db, 'orders'), where('customerUid', '==', 'bea'))));
  });

  it('no puede crear ni modificar pedidos directamente', async () => {
    const db = as('ana');
    await assertFails(addDoc(collection(db, 'orders'), { customerUid: 'ana', total: 1, status: 'pagado' }));
    await assertFails(updateDoc(doc(db, 'orders/o-ana'), { status: 'pagado' }));
    await assertFails(updateDoc(doc(db, 'orders/o-ana'), { total: 1 }));
    await assertFails(deleteDoc(doc(db, 'orders/o-ana')));
  });

  it('no puede cambiar precios oficiales ni existencias', async () => {
    const db = as('ana');
    await assertFails(updateDoc(doc(db, 'products/publicado'), { price: 1 }));
    await assertFails(updateDoc(doc(db, 'products/publicado'), { stock: 999 }));
    await assertFails(setDoc(doc(db, 'products/nuevo'), { name: 'X', price: 1, stock: 1, active: true }));
    await assertFails(addDoc(collection(db, 'inventoryMovements'), { productId: 'publicado', quantity: 100 }));
  });

  it('no puede leer, modificar ni eliminar ventas', async () => {
    const db = as('ana');
    await assertFails(getDoc(doc(db, 'sales/o-ana')));
    await assertFails(updateDoc(doc(db, 'sales/o-ana'), { status: 'anulada' }));
    await assertFails(deleteDoc(doc(db, 'sales/o-ana')));
    await assertFails(setDoc(doc(db, 'sales/falsa'), { total: 1 }));
  });

  it('no puede asignarse un rol administrativo', async () => {
    const db = as('ana');
    await assertFails(setDoc(doc(db, 'users/ana'), { role: 'admin', email: 'ana@test.cl' }));
    await assertFails(updateDoc(doc(db, 'users/admin1'), { role: 'cliente' }));
    await assertFails(getDoc(doc(db, 'users/admin1')));
    await assertFails(setDoc(doc(db, 'storeSettings/public'), validSettings('ana')));
  });

  it('un claim de administrador sin respaldo en users/{uid} no concede acceso', async () => {
    // Simula un token con rol que no coincide con el espejo (rol revocado o claim no emitido por el servidor).
    const forged = as('intruso', 'admin');
    await assertFails(getDocs(collection(forged, 'orders')));
    const revoked = as('ex-admin', 'admin');
    await assertFails(getDocs(collection(revoked, 'orders')));
    await assertFails(getDoc(doc(revoked, 'productPrivate/publicado')));
  });
});

describe('encargado', () => {
  it('lee pedidos, ventas, movimientos y borradores', async () => {
    const db = as('staff1', 'encargado');
    await assertSucceeds(getDocs(collection(db, 'orders')));
    await assertSucceeds(getDocs(collection(db, 'sales')));
    await assertSucceeds(getDocs(collection(db, 'inventoryMovements')));
    await assertSucceeds(getDocs(collection(db, 'products')));
    await assertSucceeds(getDoc(doc(db, 'products/borrador')));
  });

  it('no ve costos ni administra configuración, categorías o usuarios', async () => {
    const db = as('staff1', 'encargado');
    await assertFails(getDoc(doc(db, 'productPrivate/publicado')));
    await assertFails(getDoc(doc(db, 'saleCosts/o-ana')));
    await assertFails(setDoc(doc(db, 'storeSettings/public'), validSettings('staff1')));
    await assertFails(setDoc(doc(db, 'categories/washi-tapes'), validCategory()));
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(updateDoc(doc(db, 'products/publicado'), { stock: 0 }));
  });
});

describe('administrador', () => {
  it('administra configuración y categorías con datos válidos', async () => {
    const db = as('admin1', 'admin');
    await assertSucceeds(setDoc(doc(db, 'storeSettings/public'), validSettings('admin1')));
    await assertSucceeds(setDoc(doc(db, 'categories/washi-tapes'), validCategory()));
    await assertSucceeds(getDoc(doc(db, 'productPrivate/publicado')));
    await assertSucceeds(getDoc(doc(db, 'saleCosts/o-ana')));
    await assertSucceeds(getDocs(collection(db, 'users')));
  });

  it('rechaza configuración o categorías mal formadas', async () => {
    const db = as('admin1', 'admin');
    await assertFails(setDoc(doc(db, 'storeSettings/public'), { ...validSettings('admin1'), freeShippingThreshold: -1 }));
    await assertFails(setDoc(doc(db, 'storeSettings/public'), { ...validSettings('admin1'), campoExtra: true }));
    await assertFails(setDoc(doc(db, 'storeSettings/public'), { ...validSettings('admin1'), deliveryMethods: [] }));
    await assertFails(setDoc(doc(db, 'storeSettings/public'), { ...validSettings('admin1'), updatedBy: 'otra' }));
    await assertFails(setDoc(doc(db, 'storeSettings/otro'), validSettings('admin1')));
    await assertFails(setDoc(doc(db, 'categories/washi-tapes'), { ...validCategory(), slug: 'otro' }));
    await assertFails(setDoc(doc(db, 'categories/washi-tapes'), { ...validCategory(), order: -1 }));
    await assertFails(deleteDoc(doc(db, 'categories/planners')));
  });

  it('tampoco escribe directamente ventas, stock, pedidos ni roles (solo vía Cloud Functions)', async () => {
    const db = as('admin1', 'admin');
    await assertFails(updateDoc(doc(db, 'products/publicado'), { stock: 100 }));
    await assertFails(updateDoc(doc(db, 'sales/o-ana'), { total: 0 }));
    await assertFails(deleteDoc(doc(db, 'sales/o-ana')));
    await assertFails(updateDoc(doc(db, 'orders/o-ana'), { status: 'pagado' }));
    await assertFails(setDoc(doc(db, 'users/ana'), { role: 'admin' }));
  });
});

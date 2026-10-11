import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, authAdmin, clearFirestore, clearAuth, seedStore, stockOf, makeStaff, expectHttpsError, randomUUID } from './helpers.js';
import { adjustStock } from '../../functions/src/inventory.js';
import { saveProduct, setProductActive } from '../../functions/src/products.js';
import { requireRole } from '../../functions/src/auth.js';
import { setUserRole, assignRole } from '../../functions/src/users.js';

describe('adjustStock', () => {
  let staff;
  beforeEach(async () => {
    await clearFirestore();
    await seedStore();
    staff = await makeStaff('encargado-1', 'encargado');
  });

  it('registra entradas, salidas y ajustes con usuario, motivo y stock antes/después', async () => {
    await adjustStock(db, { actor: staff.actor, data: { requestId: randomUUID(), productId: 'washi', type: 'entrada', quantity: 5, reason: 'Compra a proveedor' } });
    await adjustStock(db, { actor: staff.actor, data: { requestId: randomUUID(), productId: 'washi', type: 'salida', quantity: 3, reason: 'Merma' } });
    const result = await adjustStock(db, { actor: staff.actor, data: { requestId: randomUUID(), productId: 'washi', type: 'ajuste', quantity: 7, reason: 'Conteo físico' } });
    assert.equal(result.stock, 7);
    assert.equal(await stockOf('washi'), 7);
    const movements = (await db.collection('inventoryMovements').where('productId', '==', 'washi').get()).docs.map((d) => d.data());
    const byType = Object.fromEntries(movements.map((m) => [m.type, m]));
    assert.deepEqual([byType.entrada.stockBefore, byType.entrada.stockAfter], [10, 15]);
    assert.deepEqual([byType.salida.quantity, byType.salida.stockAfter], [-3, 12]);
    assert.deepEqual([byType.ajuste.quantity, byType.ajuste.stockAfter], [-5, 7]);
    assert.equal(byType.ajuste.userUid, 'encargado-1');
    assert.equal(byType.ajuste.reason, 'Conteo físico');
  });

  it('no permite stock negativo, cantidades inválidas ni motivo vacío', async () => {
    await expectHttpsError(
      adjustStock(db, { actor: staff.actor, data: { requestId: randomUUID(), productId: 'washi', type: 'salida', quantity: 11, reason: 'Merma' } }),
      'failed-precondition',
      'NEGATIVE_STOCK',
    );
    for (const quantity of [0, -4, 2.5]) {
      await expectHttpsError(
        adjustStock(db, { actor: staff.actor, data: { requestId: randomUUID(), productId: 'washi', type: 'entrada', quantity, reason: 'Compra' } }),
        'invalid-argument',
      );
    }
    await expectHttpsError(
      adjustStock(db, { actor: staff.actor, data: { requestId: randomUUID(), productId: 'washi', type: 'entrada', quantity: 1, reason: '' } }),
      'invalid-argument',
    );
    assert.equal(await stockOf('washi'), 10);
  });

  it('es idempotente por requestId', async () => {
    const data = { requestId: randomUUID(), productId: 'washi', type: 'entrada', quantity: 4, reason: 'Compra' };
    await adjustStock(db, { actor: staff.actor, data });
    const again = await adjustStock(db, { actor: staff.actor, data });
    assert.equal(again.alreadyApplied, true);
    assert.equal(await stockOf('washi'), 14);
  });

  it('salidas concurrentes no dejan stock negativo', async () => {
    const attempts = Array.from({ length: 8 }, () =>
      adjustStock(db, { actor: staff.actor, data: { requestId: randomUUID(), productId: 'washi', type: 'salida', quantity: 3, reason: 'Retiro' } }),
    );
    const results = await Promise.allSettled(attempts);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    assert.equal(await stockOf('washi'), 1);
  });
});

describe('saveProduct', () => {
  let admin;
  const baseProduct = () => ({
    sku: 'nuevo-01',
    name: 'Libreta Nube',
    description: 'Libreta punteada.',
    features: [{ title: '80 hojas', text: 'Papel 100 g' }],
    categoryId: 'planners',
    price: 5990,
    compareAtPrice: null,
    cost: 2500,
    lowStockThreshold: 3,
    images: [],
    options: [{ name: 'Color', values: ['Rosa', 'Lila'] }],
    badge: 'Nuevo',
    featured: false,
    active: true,
  });

  beforeEach(async () => {
    await clearFirestore();
    await seedStore();
    admin = await makeStaff('admin-1', 'admin');
  });

  it('crea el producto, guarda el costo en un documento privado y registra el stock inicial', async () => {
    await saveProduct(db, { actor: admin.actor, data: { mode: 'create', productId: 'libreta-nube', product: baseProduct(), initialStock: 12 } });
    const product = (await db.collection('products').doc('libreta-nube').get()).data();
    assert.equal(product.sku, 'NUEVO-01');
    assert.equal(product.stock, 12);
    assert.equal(product.cost, undefined, 'el costo no se publica en el catálogo');
    assert.equal((await db.collection('productPrivate').doc('libreta-nube').get()).get('cost'), 2500);
    const movements = await db.collection('inventoryMovements').where('productId', '==', 'libreta-nube').get();
    assert.equal(movements.docs[0].get('type'), 'stock_inicial');
  });

  it('la edición persiste cambios de precio pero no altera el stock', async () => {
    await saveProduct(db, { actor: admin.actor, data: { mode: 'create', productId: 'libreta-nube', product: baseProduct(), initialStock: 12 } });
    const edited = { ...baseProduct(), price: 6490, compareAtPrice: 7990, stock: 999 };
    await saveProduct(db, { actor: admin.actor, data: { mode: 'update', productId: 'libreta-nube', product: edited, initialStock: 500 } });
    const product = (await db.collection('products').doc('libreta-nube').get()).data();
    assert.equal(product.price, 6490);
    assert.equal(product.compareAtPrice, 7990);
    assert.equal(product.stock, 12);
  });

  it('valida precios, descuentos, SKU único e imágenes', async () => {
    const cases = [
      { price: -10 },
      { price: 0 },
      { price: 12.5 },
      { price: '5990' },
      { compareAtPrice: 5990 },
      { compareAtPrice: 1000 },
      { cost: -1 },
      { sku: 'con espacios' },
      { name: '' },
      { images: [{ url: 'https://evil.example/x.png', path: 'products/libreta-nube/x.png' }] },
      { images: [{ url: 'https://firebasestorage.googleapis.com/x.png', path: 'products/otro/x.png' }] },
    ];
    for (const change of cases) {
      await expectHttpsError(
        saveProduct(db, { actor: admin.actor, data: { mode: 'create', productId: 'libreta-nube', product: { ...baseProduct(), ...change } } }),
        'invalid-argument',
      );
    }
    await expectHttpsError(
      saveProduct(db, { actor: admin.actor, data: { mode: 'create', productId: 'otro', product: { ...baseProduct(), sku: 'PLN-1' } } }),
      'invalid-argument',
    );
    await expectHttpsError(
      saveProduct(db, { actor: admin.actor, data: { mode: 'create', productId: 'washi', product: { ...baseProduct(), sku: 'NUEVO-02' } } }),
      'already-exists',
    );
  });

  it('activa y desactiva productos', async () => {
    await setProductActive(db, { actor: admin.actor, data: { productId: 'washi', active: false } });
    assert.equal((await db.collection('products').doc('washi').get()).get('active'), false);
    const again = await setProductActive(db, { actor: admin.actor, data: { productId: 'washi', active: false } });
    assert.equal(again.changed, false);
  });
});

describe('roles', () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it('requireRole exige claim y espejo en users/{uid} coherentes', async () => {
    const forged = { uid: 'x', token: { role: 'admin', email: 'x@x.cl' } };
    await expectHttpsError(requireRole(db, forged, ['admin']), 'permission-denied');
    await db.collection('users').doc('x').set({ role: 'encargado' });
    await expectHttpsError(requireRole(db, forged, ['admin']), 'permission-denied');
    await expectHttpsError(requireRole(db, { uid: 'y', token: {} }, ['admin']), 'permission-denied');
    await expectHttpsError(requireRole(db, null, ['admin']), 'unauthenticated');
    const staff = await requireRole(db, { uid: 'x', token: { role: 'encargado' } }, ['admin', 'encargado']);
    assert.equal(staff.role, 'encargado');
  });

  it('setUserRole asigna y revoca roles, y nadie puede cambiar su propio rol', async () => {
    await authAdmin.createUser({ email: 'duena@7kilitos.test', password: 'secreto-123', emailVerified: true });
    const target = await authAdmin.createUser({ email: 'ayudante@7kilitos.test', password: 'secreto-123', emailVerified: true });
    const owner = { uid: 'owner', role: 'admin', email: 'duena@7kilitos.test' };

    await setUserRole(db, authAdmin, { actor: owner, data: { email: 'ayudante@7kilitos.test', role: 'encargado' } });
    assert.equal((await authAdmin.getUser(target.uid)).customClaims.role, 'encargado');
    assert.equal((await db.collection('users').doc(target.uid).get()).get('role'), 'encargado');

    await setUserRole(db, authAdmin, { actor: owner, data: { email: 'ayudante@7kilitos.test', role: 'cliente' } });
    assert.equal((await authAdmin.getUser(target.uid)).customClaims?.role, undefined);

    await expectHttpsError(setUserRole(db, authAdmin, { actor: owner, data: { email: 'duena@7kilitos.test', role: 'cliente' } }), 'failed-precondition');
    await expectHttpsError(setUserRole(db, authAdmin, { actor: owner, data: { email: 'nadie@7kilitos.test', role: 'admin' } }), 'not-found');
    await expectHttpsError(assignRole(db, authAdmin, { email: 'ayudante@7kilitos.test', role: 'superadmin', actor: owner }), 'invalid-argument');
  });

  it('no asigna roles de personal a cuentas con correo sin verificar', async () => {
    // Evita que alguien registre primero el correo de una futura encargada y reciba su rol.
    const owner = { uid: 'owner', role: 'admin', email: 'duena@7kilitos.test' };
    const squatter = await authAdmin.createUser({ email: 'futura-encargada@7kilitos.test', password: 'secreto-123' });
    await expectHttpsError(
      setUserRole(db, authAdmin, { actor: owner, data: { email: 'futura-encargada@7kilitos.test', role: 'encargado' } }),
      'failed-precondition',
      'EMAIL_NOT_VERIFIED',
    );
    assert.equal((await authAdmin.getUser(squatter.uid)).customClaims?.role, undefined);
    assert.equal((await db.collection('users').doc(squatter.uid).get()).exists, false);
    // Quitar privilegios (rol cliente) no requiere verificación.
    await setUserRole(db, authAdmin, { actor: owner, data: { email: 'futura-encargada@7kilitos.test', role: 'cliente' } });
  });
});

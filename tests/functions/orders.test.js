import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  clearFirestore,
  seedStore,
  customer,
  orderPayload,
  stockOf,
  makeStaff,
  expectHttpsError,
  randomUUID,
  Timestamp,
} from './helpers.js';
import { createOrder, applyOrderTransition, expirePendingOrders } from '../../functions/src/orders.js';

async function movementsFor(orderId) {
  const snap = await db.collection('inventoryMovements').where('orderId', '==', orderId).get();
  return snap.docs.map((d) => d.data());
}

describe('createOrder', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedStore();
  });

  it('registra un pedido pendiente, reserva stock y deja un movimiento verificable', async () => {
    const data = orderPayload({ items: [{ productId: 'washi', quantity: 2 }], expectedTotal: 17000 });
    const result = await createOrder(db, { auth: customer(), data });
    assert.equal(result.status, 'pendiente');
    assert.equal(result.orderNumber, '7K-000001');
    assert.equal(result.alreadyExisted, false);

    const order = (await db.collection('orders').doc(result.orderId).get()).data();
    assert.equal(order.status, 'pendiente');
    assert.equal(order.subtotal, 17000);
    assert.equal(order.shippingCost, 0);
    assert.equal(order.total, 17000);
    assert.equal(order.items[0].unitPrice, 8500);
    assert.equal(order.customerUid, 'cliente-1');
    assert.equal(order.saleId, null, 'un pedido nuevo no es una venta');
    assert.equal(await stockOf('washi'), 8);

    const movements = await movementsFor(result.orderId);
    assert.equal(movements.length, 1);
    assert.deepEqual(
      { type: movements[0].type, quantity: movements[0].quantity, before: movements[0].stockBefore, after: movements[0].stockAfter },
      { type: 'reserva_pedido', quantity: -2, before: 10, after: 8 },
    );
    const sales = await db.collection('sales').get();
    assert.equal(sales.size, 0, 'crear un pedido no registra ventas');
  });

  it('usa el precio oficial e ignora precios enviados desde el navegador', async () => {
    const data = orderPayload({
      items: [{ productId: 'washi', quantity: 1, unitPrice: 1, price: 1 }],
      expectedTotal: 1,
    });
    const error = await expectHttpsError(createOrder(db, { auth: customer(), data }), 'failed-precondition', 'PRICE_CHANGED');
    assert.equal(error.details.total, 8500);
    assert.equal(await stockOf('washi'), 10, 'no se reserva stock si el total no coincide');
    assert.equal((await db.collection('orders').get()).size, 0);
  });

  it('aplica envío gratis solo desde el umbral configurado y exige dirección válida', async () => {
    const delivery = { methodId: 'despacho', region: 'Metropolitana de Santiago', comuna: 'Ñuñoa', street: 'Av. Siempre Viva 742' };
    const small = orderPayload({ delivery, items: [{ productId: 'washi', quantity: 1 }], expectedTotal: 8500 + 3990 });
    const r1 = await createOrder(db, { auth: customer('c1'), data: small });
    const o1 = (await db.collection('orders').doc(r1.orderId).get()).data();
    assert.equal(o1.shippingCost, 3990);
    assert.equal(o1.delivery.address.comuna, 'Ñuñoa');

    const big = orderPayload({ delivery, items: [{ productId: 'washi', quantity: 6 }], expectedTotal: 51000 });
    const r2 = await createOrder(db, { auth: customer('c2'), data: big });
    assert.equal((await db.collection('orders').doc(r2.orderId).get()).get('shippingCost'), 0);

    await expectHttpsError(
      createOrder(db, { auth: customer('c3'), data: orderPayload({ delivery: { methodId: 'despacho', region: 'Marte' }, expectedTotal: 12490 }) }),
      'invalid-argument',
    );
  });

  it('rechaza cantidades mayores al stock sin modificar nada', async () => {
    const data = orderPayload({ items: [{ productId: 'planner', quantity: 6, options: { Portada: 'Rosa' } }], expectedTotal: 101400 });
    const error = await expectHttpsError(createOrder(db, { auth: customer(), data }), 'failed-precondition', 'OUT_OF_STOCK');
    assert.deepEqual(error.details.items[0], { productId: 'planner', name: 'Planner Chanchito', requested: 6, available: 5 });
    assert.equal(await stockOf('planner'), 5);
  });

  it('suma líneas del mismo producto con opciones distintas al validar stock', async () => {
    const data = orderPayload({
      items: [
        { productId: 'planner', quantity: 3, options: { Portada: 'Rosa' } },
        { productId: 'planner', quantity: 3, options: { Portada: 'Lila' } },
      ],
      expectedTotal: 101400,
    });
    await expectHttpsError(createOrder(db, { auth: customer(), data }), 'failed-precondition', 'OUT_OF_STOCK');
  });

  it('rechaza productos no publicados, opciones inválidas, cantidades no válidas y métodos inactivos', async () => {
    await expectHttpsError(
      createOrder(db, { auth: customer(), data: orderPayload({ items: [{ productId: 'borrador', quantity: 1 }], expectedTotal: 1000 }) }),
      'failed-precondition',
      'PRODUCT_UNAVAILABLE',
    );
    await expectHttpsError(
      createOrder(db, { auth: customer(), data: orderPayload({ items: [{ productId: 'planner', quantity: 1, options: { Portada: 'Verde' } }], expectedTotal: 16900 }) }),
      'invalid-argument',
    );
    await expectHttpsError(
      createOrder(db, { auth: customer(), data: orderPayload({ items: [{ productId: 'planner', quantity: 1 }], expectedTotal: 16900 }) }),
      'invalid-argument',
    );
    for (const quantity of [0, -1, 1.5, '2', 100]) {
      await expectHttpsError(
        createOrder(db, { auth: customer(), data: orderPayload({ items: [{ productId: 'washi', quantity }] }) }),
        'invalid-argument',
      );
    }
    await expectHttpsError(
      createOrder(db, { auth: customer(), data: orderPayload({ delivery: { methodId: 'antiguo' } }) }),
      'invalid-argument',
    );
    await expectHttpsError(
      createOrder(db, { auth: customer(), data: orderPayload({ paymentMethodId: 'tarjeta' }) }),
      'invalid-argument',
    );
    await expectHttpsError(
      createOrder(db, { auth: customer(), data: orderPayload({ customer: { name: '', email: 'malo', phone: '12' } }) }),
      'invalid-argument',
    );
    await expectHttpsError(createOrder(db, { auth: null, data: orderPayload() }), 'unauthenticated');
    assert.equal(await stockOf('washi'), 10);
  });

  it('es idempotente: repetir la misma solicitud no duplica el pedido ni el descuento de stock', async () => {
    const data = orderPayload();
    const first = await createOrder(db, { auth: customer(), data });
    const second = await createOrder(db, { auth: customer(), data });
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.alreadyExisted, true);
    assert.equal(await stockOf('washi'), 9);
    assert.equal((await db.collection('orders').get()).size, 1);
    await expectHttpsError(createOrder(db, { auth: customer('otra-persona'), data }), 'already-exists');
  });

  it('dos compras simultáneas nunca dejan stock negativo', async () => {
    // Stock 5: 12 clientes intentan comprar 1 unidad al mismo tiempo.
    const attempts = Array.from({ length: 12 }, (_, i) =>
      createOrder(db, {
        auth: customer(`concurrente-${i}`),
        data: orderPayload({ items: [{ productId: 'planner', quantity: 1, options: { Portada: 'Rosa' } }], expectedTotal: 16900 }),
      }),
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 5);
    assert.ok(rejected.every((r) => r.reason.details?.code === 'OUT_OF_STOCK'), 'los rechazos son por falta de stock');
    assert.equal(await stockOf('planner'), 0);
    const numbers = new Set(ok.map((r) => r.value.orderNumber));
    assert.equal(numbers.size, 5, 'los números de pedido no se repiten');
  });

  it('limita los pedidos pendientes por cliente', async () => {
    for (let i = 0; i < 5; i += 1) await createOrder(db, { auth: customer(), data: orderPayload() });
    await expectHttpsError(createOrder(db, { auth: customer(), data: orderPayload() }), 'resource-exhausted', 'RATE_LIMIT');
  });
});

describe('transiciones de pedidos y ventas', () => {
  let orderId;
  let admin;
  let staff;

  beforeEach(async () => {
    await clearFirestore();
    await seedStore();
    admin = await makeStaff('admin-1', 'admin');
    staff = await makeStaff('encargado-1', 'encargado');
    const data = orderPayload({
      items: [
        { productId: 'planner', quantity: 2, options: { Portada: 'Lila' } },
        { productId: 'washi', quantity: 1 },
      ],
      expectedTotal: 42300,
    });
    orderId = (await createOrder(db, { auth: customer(), data })).orderId;
  });

  it('registra la venta solo al marcar pagado, con precio y costo histórico, y una sola vez', async () => {
    await applyOrderTransition(db, { orderId, target: 'confirmado', actor: staff.actor });
    assert.equal((await db.collection('sales').get()).size, 0, 'confirmado no es venta');

    const first = await applyOrderTransition(db, { orderId, target: 'pagado', actor: staff.actor, paymentReference: 'TRX-1' });
    const repeat = await applyOrderTransition(db, { orderId, target: 'pagado', actor: staff.actor });
    assert.equal(first.changed, true);
    assert.equal(repeat.changed, false);

    const sales = await db.collection('sales').get();
    assert.equal(sales.size, 1);
    const sale = sales.docs[0].data();
    assert.equal(sale.status, 'vigente');
    assert.equal(sale.total, 42300);

    // Cambiar el precio después no reescribe la venta.
    await db.collection('products').doc('planner').update({ price: 99990 });
    const after = (await db.collection('sales').doc(orderId).get()).data();
    assert.equal(after.items.find((i) => i.productId === 'planner').unitPrice, 16900);

    const costs = (await db.collection('saleCosts').doc(orderId).get()).data();
    assert.equal(costs.knownCost, 18000);
    assert.equal(costs.linesWithoutCost, 1, 'la línea sin costo registrado queda identificada');

    assert.equal((await db.collection('products').doc('planner').get()).get('salesCount'), 2);
    const order = (await db.collection('orders').doc(orderId).get()).data();
    assert.equal(order.paymentReference, 'TRX-1');
    assert.equal(order.statusHistory.length, 3);
  });

  it('cancelar un pedido pendiente devuelve el stock exactamente una vez', async () => {
    assert.equal(await stockOf('planner'), 3);
    await expectHttpsError(applyOrderTransition(db, { orderId, target: 'cancelado', actor: staff.actor }), 'invalid-argument');
    await applyOrderTransition(db, { orderId, target: 'cancelado', actor: staff.actor, note: 'Cliente desistió' });
    const again = await applyOrderTransition(db, { orderId, target: 'cancelado', actor: staff.actor, note: 'Otra vez' });
    assert.equal(again.changed, false);
    assert.equal(await stockOf('planner'), 5);
    assert.equal(await stockOf('washi'), 10);
    const restores = (await movementsFor(orderId)).filter((m) => m.type === 'devolucion_cancelacion');
    assert.equal(restores.length, 2, 'un movimiento de devolución por producto');
  });

  it('rechaza transiciones no válidas', async () => {
    await expectHttpsError(applyOrderTransition(db, { orderId, target: 'entregado', actor: staff.actor }), 'failed-precondition', 'INVALID_TRANSITION');
    await expectHttpsError(applyOrderTransition(db, { orderId, target: 'inventado', actor: staff.actor }), 'invalid-argument');
    await applyOrderTransition(db, { orderId, target: 'pagado', actor: staff.actor });
    await applyOrderTransition(db, { orderId, target: 'entregado', actor: staff.actor });
    await expectHttpsError(
      applyOrderTransition(db, { orderId, target: 'cancelado', actor: admin.actor, note: 'tarde' }),
      'failed-precondition',
      'INVALID_TRANSITION',
    );
  });

  it('solo un administrador cancela un pedido pagado: anula la venta sin borrarla y devuelve stock', async () => {
    await applyOrderTransition(db, { orderId, target: 'pagado', actor: staff.actor });
    await expectHttpsError(
      applyOrderTransition(db, { orderId, target: 'cancelado', actor: staff.actor, note: 'Reembolso' }),
      'permission-denied',
    );
    await applyOrderTransition(db, { orderId, target: 'cancelado', actor: admin.actor, note: 'Reembolso acordado' });
    const sale = (await db.collection('sales').doc(orderId).get()).data();
    assert.equal(sale.status, 'anulada');
    assert.equal(sale.voidReason, 'Reembolso acordado');
    assert.equal(await stockOf('planner'), 5);
    assert.equal((await db.collection('products').doc('planner').get()).get('salesCount'), 0);
  });

  it('vence pedidos pendientes antiguos y devuelve su stock', async () => {
    const old = Timestamp.fromMillis(Date.now() - 49 * 3600 * 1000);
    await db.collection('orders').doc(orderId).update({ createdAt: old });
    const result = await expirePendingOrders(db);
    assert.equal(result.expired, 1);
    const order = (await db.collection('orders').doc(orderId).get()).data();
    assert.equal(order.status, 'cancelado');
    assert.equal(order.statusHistory.at(-1).by, 'sistema');
    assert.equal(await stockOf('planner'), 5);
  });
});

describe('número de pedido', () => {
  it('es correlativo', async () => {
    await clearFirestore();
    await seedStore();
    const a = await createOrder(db, { auth: customer('a'), data: orderPayload() });
    const b = await createOrder(db, { auth: customer('b'), data: orderPayload({ requestId: randomUUID() }) });
    assert.deepEqual([a.orderNumber, b.orderNumber], ['7K-000001', '7K-000002']);
  });
});

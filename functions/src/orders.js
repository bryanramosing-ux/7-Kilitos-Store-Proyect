import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { LIMITS, ORDER_NUMBER_PREFIX } from './config.js';
import { requireAuth, SYSTEM_ACTOR } from './auth.js';
import { computeTotals, optionsKey } from './pricing.js';
import {
  CHILE_REGIONS,
  cleanDocId,
  cleanEmail,
  cleanInt,
  cleanPhone,
  cleanRequestId,
  cleanText,
  ensureArray,
  ensureObject,
  invalid,
} from './validation.js';

/*
 * Política comercial (documentada también en README.md):
 * - Al crear un pedido el stock se RESERVA (se descuenta) dentro de una transacción.
 *   Así dos compras simultáneas nunca pueden vender la misma unidad.
 * - Un pedido "pendiente" o "confirmado" NO es una venta.
 * - La venta se registra solo cuando el pedido pasa a "pagado" (sales/{orderId}).
 * - Cancelar devuelve el stock reservado una única vez (stockRestored) y, si el
 *   pedido estaba pagado, anula la venta sin borrarla.
 */
export const ORDER_STATUSES = Object.freeze(['pendiente', 'confirmado', 'pagado', 'entregado', 'cancelado']);

export const TRANSITIONS = Object.freeze({
  pendiente: Object.freeze(['confirmado', 'pagado', 'cancelado']),
  confirmado: Object.freeze(['pagado', 'cancelado']),
  pagado: Object.freeze(['entregado', 'cancelado']),
  entregado: Object.freeze([]),
  cancelado: Object.freeze([]),
});

const STATUS_LABELS = {
  pendiente: 'pendiente',
  confirmado: 'confirmado',
  pagado: 'pagado',
  entregado: 'entregado',
  cancelado: 'cancelado',
};

export function assertTransition(from, to, role) {
  if (!ORDER_STATUSES.includes(to)) throw invalid('status', 'El estado solicitado no existe.');
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new HttpsError(
      'failed-precondition',
      `Un pedido ${STATUS_LABELS[from] ?? from} no puede pasar a ${STATUS_LABELS[to]}.`,
      { code: 'INVALID_TRANSITION', from, to },
    );
  }
  if (role === 'sistema' && !(from === 'pendiente' && to === 'cancelado')) {
    throw new HttpsError('permission-denied', 'Transición no permitida para procesos automáticos.');
  }
  if (from === 'pagado' && to === 'cancelado' && role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Solo un administrador puede cancelar un pedido pagado, porque anula la venta registrada.',
    );
  }
}

// ---------------------------------------------------------------------------
// Validación de la solicitud del cliente
// ---------------------------------------------------------------------------

function parseSelectedOptions(raw, index) {
  if (raw === undefined || raw === null) return {};
  ensureObject(raw, `items.${index}.options`, 'Las opciones');
  const entries = Object.entries(raw);
  if (entries.length > LIMITS.maxOptionGroups) throw invalid(`items.${index}.options`, 'Las opciones no son válidas.');
  const options = {};
  for (const [name, value] of entries) {
    if (typeof value !== 'string' || name.length > 40 || value.length > 40) {
      throw invalid(`items.${index}.options`, 'Las opciones no son válidas.');
    }
    options[name] = value;
  }
  return options;
}

export function parseOrderInput(data) {
  ensureObject(data, 'data', 'La solicitud');
  const requestId = cleanRequestId(data.requestId);

  const rawItems = ensureArray(data.items, 'items', 'El carrito', LIMITS.maxOrderLines);
  if (rawItems.length === 0) throw invalid('items', 'Tu carrito está vacío.');
  const merged = new Map();
  rawItems.forEach((raw, index) => {
    ensureObject(raw, `items.${index}`, 'El producto');
    const productId = cleanDocId(raw.productId, `items.${index}.productId`, 'El producto');
    const quantity = cleanInt(raw.quantity, {
      field: `items.${index}.quantity`,
      label: 'La cantidad',
      min: 1,
      max: LIMITS.maxLineQuantity,
    });
    const options = parseSelectedOptions(raw.options, index);
    const key = `${productId}::${optionsKey(options)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > LIMITS.maxLineQuantity) {
        throw invalid(`items.${index}.quantity`, `La cantidad máxima por producto es ${LIMITS.maxLineQuantity}.`);
      }
    } else {
      merged.set(key, { productId, quantity, options });
    }
  });

  const customer = ensureObject(data.customer, 'customer', 'Los datos de contacto');
  const delivery = ensureObject(data.delivery, 'delivery', 'La entrega');

  return {
    requestId,
    lines: [...merged.values()],
    customer: {
      name: cleanText(customer.name, { field: 'customer.name', label: 'El nombre', min: 2, max: 80 }),
      email: cleanEmail(customer.email, 'customer.email'),
      phone: cleanPhone(customer.phone, 'customer.phone'),
    },
    deliveryMethodId: cleanDocId(delivery.methodId, 'delivery.methodId', 'El método de entrega'),
    rawAddress: delivery,
    paymentMethodId: cleanDocId(data.paymentMethodId, 'paymentMethodId', 'El método de pago'),
    notes: cleanText(data.notes, { field: 'notes', label: 'Las observaciones', max: 500, multiline: true }),
    expectedTotal: cleanInt(data.expectedTotal, { field: 'expectedTotal', label: 'El total', min: 0, max: 1e9 }),
  };
}

export function parseAddress(raw) {
  const region = typeof raw.region === 'string' ? raw.region : '';
  if (!CHILE_REGIONS.includes(region)) throw invalid('delivery.region', 'Selecciona una región válida.');
  return {
    region,
    comuna: cleanText(raw.comuna, { field: 'delivery.comuna', label: 'La comuna', min: 2, max: 60 }),
    street: cleanText(raw.street, { field: 'delivery.street', label: 'La dirección', min: 5, max: 160 }),
    reference: cleanText(raw.reference, { field: 'delivery.reference', label: 'La referencia', max: 160 }),
  };
}

function validateOptionsForProduct(selected, product) {
  const groups = Array.isArray(product.options) ? product.options : [];
  if (Object.keys(selected).length !== groups.length) {
    throw invalid('options', `Selecciona todas las opciones de "${product.name}".`);
  }
  for (const group of groups) {
    if (!group.values.includes(selected[group.name])) {
      throw invalid('options', `La opción "${group.name}" de "${product.name}" no es válida.`);
    }
  }
}

function sumQuantities(items) {
  const totals = new Map();
  for (const item of items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  return totals;
}

export function buildOrderLines(lines, productSnaps) {
  const byId = new Map(productSnaps.map((snap) => [snap.id, snap]));
  const unavailable = new Set();
  const items = [];
  for (const line of lines) {
    const snap = byId.get(line.productId);
    if (!snap?.exists || snap.get('active') !== true) {
      unavailable.add(line.productId);
      continue;
    }
    const product = snap.data();
    validateOptionsForProduct(line.options, product);
    items.push({
      productId: line.productId,
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId ?? null,
      options: line.options,
      quantity: line.quantity,
      unitPrice: product.price,
      lineTotal: product.price * line.quantity,
      image: product.images?.[0]?.url ?? null,
    });
  }
  if (unavailable.size > 0) {
    throw new HttpsError('failed-precondition', 'Algunos productos de tu carrito ya no están disponibles.', {
      code: 'PRODUCT_UNAVAILABLE',
      productIds: [...unavailable],
    });
  }
  const requested = sumQuantities(items);
  const outOfStock = [];
  for (const [productId, quantity] of requested) {
    const product = byId.get(productId).data();
    if (quantity > product.stock) {
      outOfStock.push({ productId, name: product.name, requested: quantity, available: Math.max(product.stock, 0) });
    }
  }
  if (outOfStock.length > 0) {
    throw new HttpsError('failed-precondition', 'No hay stock suficiente para algunos productos.', {
      code: 'OUT_OF_STOCK',
      items: outOfStock,
    });
  }
  return { items, requested };
}

function rateLimitRef(db, ip, now) {
  const hour = now.toDate().toISOString().slice(0, 13).replace(/[-T]/g, '');
  const hash = createHash('sha256').update(String(ip)).digest('hex').slice(0, 24);
  return db.collection('rateLimits').doc(`orders_${hash}_${hour}`);
}

function movementDoc({ product, productId, quantity, before, type, reason, orderId, actor, now, requestId = null }) {
  return {
    productId,
    sku: product.sku ?? null,
    productName: product.name ?? null,
    type,
    quantity,
    stockBefore: before,
    stockAfter: before + quantity,
    reason,
    orderId: orderId ?? null,
    requestId,
    userUid: actor.uid,
    userEmail: actor.email ?? null,
    userRole: actor.role,
    createdAt: now,
  };
}

function orderSummary(orderId, order, alreadyExisted) {
  return {
    orderId,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
    alreadyExisted,
  };
}

// ---------------------------------------------------------------------------
// createOrder: valida precios, stock y condiciones con datos oficiales y
// reserva el stock en una sola transacción. Idempotente por requestId.
// ---------------------------------------------------------------------------
export async function createOrder(db, { auth, data, ip = null, now = Timestamp.now() }) {
  requireAuth(auth);
  const input = parseOrderInput(data);
  const orderRef = db.collection('orders').doc(input.requestId);
  const customerActor = { uid: auth.uid, role: 'cliente', email: auth.token?.email ?? input.customer.email };

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(orderRef);
    if (existing.exists) {
      if (existing.get('customerUid') !== auth.uid) {
        throw new HttpsError('already-exists', 'La solicitud ya fue utilizada. Recarga la página e inténtalo de nuevo.');
      }
      return orderSummary(orderRef.id, existing.data(), true);
    }

    const settingsSnap = await tx.get(db.collection('storeSettings').doc('public'));
    if (!settingsSnap.exists) {
      throw new HttpsError('failed-precondition', 'La tienda aún no está configurada para recibir pedidos.');
    }
    const settings = settingsSnap.data();

    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const productSnaps = await tx.getAll(...productIds.map((id) => db.collection('products').doc(id)));

    const pendingSnap = await tx.get(
      db
        .collection('orders')
        .where('customerUid', '==', auth.uid)
        .where('status', '==', 'pendiente')
        .limit(LIMITS.maxPendingOrdersPerUser),
    );
    if (pendingSnap.size >= LIMITS.maxPendingOrdersPerUser) {
      throw new HttpsError(
        'resource-exhausted',
        'Tienes varios pedidos pendientes de confirmación. Espera a que la tienda los revise antes de crear otro.',
        { code: 'RATE_LIMIT' },
      );
    }
    const limitRef = ip ? rateLimitRef(db, ip, now) : null;
    const limitSnap = limitRef ? await tx.get(limitRef) : null;
    if (limitSnap?.exists && limitSnap.get('count') >= LIMITS.maxOrdersPerIpPerHour) {
      throw new HttpsError('resource-exhausted', 'Se recibieron demasiados pedidos desde tu conexión. Inténtalo más tarde.', {
        code: 'RATE_LIMIT',
      });
    }
    const counterRef = db.collection('counters').doc('orders');
    const counterSnap = await tx.get(counterRef);

    // --- Validación con datos oficiales (lecturas terminadas) ---
    const deliveryMethod = (settings.deliveryMethods ?? []).find(
      (method) => method.id === input.deliveryMethodId && method.active === true,
    );
    if (!deliveryMethod) throw invalid('delivery.methodId', 'El método de entrega seleccionado no está disponible.');
    if (!Number.isInteger(deliveryMethod.cost) || deliveryMethod.cost < 0) {
      throw new HttpsError('failed-precondition', 'El método de entrega no está bien configurado. Avísale a la tienda.');
    }
    const paymentMethod = (settings.paymentMethods ?? []).find(
      (method) => method.id === input.paymentMethodId && method.active === true,
    );
    if (!paymentMethod) throw invalid('paymentMethodId', 'El método de pago seleccionado no está disponible.');
    const address = deliveryMethod.requiresAddress ? parseAddress(input.rawAddress) : null;

    const { items, requested } = buildOrderLines(input.lines, productSnaps);
    const totals = computeTotals(items, settings, deliveryMethod);
    if (totals.total !== input.expectedTotal) {
      throw new HttpsError(
        'failed-precondition',
        'Los precios o el costo de envío cambiaron. Revisa el resumen actualizado antes de confirmar.',
        {
          code: 'PRICE_CHANGED',
          total: totals.total,
          subtotal: totals.subtotal,
          shippingCost: totals.shippingCost,
          prices: items.map((item) => ({ productId: item.productId, unitPrice: item.unitPrice })),
        },
      );
    }

    // --- Escrituras ---
    const sequence = (counterSnap.exists ? counterSnap.get('last') : 0) + 1;
    const orderNumber = `${ORDER_NUMBER_PREFIX}${String(sequence).padStart(6, '0')}`;
    tx.set(counterRef, { last: sequence, updatedAt: now });

    const productsById = new Map(productSnaps.map((snap) => [snap.id, snap]));
    for (const [productId, quantity] of requested) {
      const snap = productsById.get(productId);
      const before = snap.get('stock');
      tx.update(snap.ref, { stock: before - quantity, updatedAt: now });
      tx.create(
        db.collection('inventoryMovements').doc(),
        movementDoc({
          product: snap.data(),
          productId,
          quantity: -quantity,
          before,
          type: 'reserva_pedido',
          reason: `Reserva por pedido ${orderNumber}`,
          orderId: orderRef.id,
          actor: customerActor,
          now,
        }),
      );
    }

    const order = {
      orderNumber,
      customerUid: auth.uid,
      customer: input.customer,
      delivery: {
        methodId: deliveryMethod.id,
        methodName: deliveryMethod.name,
        requiresAddress: deliveryMethod.requiresAddress === true,
        address,
      },
      payment: {
        methodId: paymentMethod.id,
        methodName: paymentMethod.name,
        instructions: paymentMethod.instructions ?? '',
      },
      notes: input.notes,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: totals.subtotal,
      shippingCost: totals.shippingCost,
      total: totals.total,
      status: 'pendiente',
      statusHistory: [
        { status: 'pendiente', at: now, by: auth.uid, byEmail: customerActor.email, note: 'Pedido recibido desde la tienda.' },
      ],
      stockReserved: true,
      stockRestored: false,
      saleId: null,
      paymentReference: null,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      paidAt: null,
      deliveredAt: null,
      cancelledAt: null,
    };
    tx.create(orderRef, order);

    if (limitRef) {
      tx.set(limitRef, {
        count: (limitSnap?.exists ? limitSnap.get('count') : 0) + 1,
        expireAt: Timestamp.fromMillis(now.toMillis() + 48 * 3600 * 1000),
      });
    }
    return orderSummary(orderRef.id, order, false);
  });
}

// ---------------------------------------------------------------------------
// Transiciones de estado (personal autorizado o proceso automático).
// ---------------------------------------------------------------------------
function buildSale(order, orderId, actor, now) {
  return {
    orderId,
    orderNumber: order.orderNumber,
    status: 'vigente',
    paidAt: now,
    orderCreatedAt: order.createdAt,
    customerUid: order.customerUid,
    customerName: order.customer.name,
    items: order.items.map(({ productId, sku, name, categoryId, options, quantity, unitPrice, lineTotal }) => ({
      productId,
      sku,
      name,
      categoryId,
      options,
      quantity,
      unitPrice,
      lineTotal,
    })),
    itemCount: order.itemCount,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    total: order.total,
    paymentMethodId: order.payment.methodId,
    paymentMethod: order.payment.methodName,
    deliveryMethod: order.delivery.methodName,
    recordedBy: actor.uid,
    recordedByEmail: actor.email ?? null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
}

// Costo histórico: se congela el costo vigente en productPrivate al momento de
// registrar el pago. Las líneas sin costo registrado quedan fuera del margen.
function buildSaleCosts(order, orderId, privateById, now) {
  let knownCost = 0;
  let revenueWithKnownCost = 0;
  let linesWithoutCost = 0;
  const items = order.items.map((item) => {
    const cost = privateById.get(item.productId)?.cost;
    const unitCost = Number.isInteger(cost) ? cost : null;
    if (unitCost === null) {
      linesWithoutCost += 1;
    } else {
      knownCost += unitCost * item.quantity;
      revenueWithKnownCost += item.lineTotal;
    }
    return {
      productId: item.productId,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost,
      lineCost: unitCost === null ? null : unitCost * item.quantity,
    };
  });
  return { orderId, status: 'vigente', paidAt: now, items, knownCost, revenueWithKnownCost, linesWithoutCost };
}

export async function applyOrderTransition(
  db,
  { orderId, target, actor, note = null, paymentReference = null, now = Timestamp.now() },
) {
  const orderRef = db.collection('orders').doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError('not-found', 'El pedido no existe.');
    const order = snap.data();
    // Idempotencia: repetir la misma transición no vuelve a registrar nada.
    if (order.status === target) return { orderId, status: target, changed: false };
    assertTransition(order.status, target, actor.role);
    if (target === 'cancelado' && !note) throw invalid('note', 'Indica el motivo de la cancelación.');

    const quantities = sumQuantities(order.items);
    const productIds = [...quantities.keys()];
    const productRefs = productIds.map((id) => db.collection('products').doc(id));

    // Lecturas
    let privateById = new Map();
    if (target === 'pagado') {
      const snaps = await tx.getAll(...productIds.map((id) => db.collection('productPrivate').doc(id)));
      privateById = new Map(snaps.map((s) => [s.id, s.exists ? s.data() : null]));
    }
    const mustRestore = target === 'cancelado' && order.stockReserved === true && order.stockRestored !== true;
    const productSnaps = mustRestore ? await tx.getAll(...productRefs) : [];
    const saleRef = order.saleId ? db.collection('sales').doc(order.saleId) : null;
    const saleSnap = target === 'cancelado' && saleRef ? await tx.get(saleRef) : null;
    const voidSale = saleSnap?.exists && saleSnap.get('status') === 'vigente';

    // Escrituras: una sola actualización por producto.
    const productUpdates = new Map(productIds.map((id) => [id, {}]));
    const update = {
      status: target,
      updatedAt: now,
      statusHistory: FieldValue.arrayUnion({
        status: target,
        at: now,
        by: actor.uid,
        byEmail: actor.email ?? null,
        note: note || null,
      }),
    };

    if (target === 'confirmado') update.confirmedAt = now;
    if (target === 'entregado') update.deliveredAt = now;
    if (target === 'pagado') {
      Object.assign(update, { paidAt: now, saleId: orderId, paymentReference: paymentReference || null });
      tx.create(db.collection('sales').doc(orderId), buildSale(order, orderId, actor, now));
      tx.create(db.collection('saleCosts').doc(orderId), buildSaleCosts(order, orderId, privateById, now));
      for (const [productId, quantity] of quantities) {
        productUpdates.get(productId).salesCount = FieldValue.increment(quantity);
      }
    }
    if (target === 'cancelado') {
      Object.assign(update, { cancelledAt: now, cancelReason: note });
      if (mustRestore) {
        for (const productSnap of productSnaps) {
          if (!productSnap.exists) {
            logger.error('Producto inexistente al restaurar stock', { orderId, productId: productSnap.id });
            continue;
          }
          const quantity = quantities.get(productSnap.id);
          const before = productSnap.get('stock');
          Object.assign(productUpdates.get(productSnap.id), { stock: before + quantity, updatedAt: now });
          tx.create(
            db.collection('inventoryMovements').doc(),
            movementDoc({
              product: productSnap.data(),
              productId: productSnap.id,
              quantity,
              before,
              type: 'devolucion_cancelacion',
              reason: `Cancelación del pedido ${order.orderNumber}: ${note}`,
              orderId,
              actor,
              now,
            }),
          );
        }
        update.stockRestored = true;
      }
      if (voidSale) {
        tx.update(saleRef, { status: 'anulada', voidedAt: now, voidedBy: actor.uid, voidReason: note });
        tx.update(db.collection('saleCosts').doc(order.saleId), { status: 'anulada' });
        for (const [productId, quantity] of quantities) {
          productUpdates.get(productId).salesCount = FieldValue.increment(-quantity);
        }
      }
    }

    for (const [productId, changes] of productUpdates) {
      if (Object.keys(changes).length > 0) tx.update(db.collection('products').doc(productId), changes);
    }
    tx.update(orderRef, update);
    return { orderId, status: target, changed: true };
  });
}

export function parseTransitionInput(data) {
  ensureObject(data, 'data', 'La solicitud');
  return {
    orderId: cleanDocId(data.orderId, 'orderId', 'El pedido'),
    target: typeof data.status === 'string' ? data.status : '',
    note: cleanText(data.note, { field: 'note', label: 'La nota', max: 300 }) || null,
    paymentReference: cleanText(data.paymentReference, { field: 'paymentReference', label: 'La referencia', max: 80 }) || null,
  };
}

// Cancela pedidos pendientes que superaron el plazo configurado (orderHoldHours)
// y devuelve su stock. Se ejecuta de forma programada.
export async function expirePendingOrders(db, { now = Timestamp.now() } = {}) {
  const settingsSnap = await db.collection('storeSettings').doc('public').get();
  const hours = settingsSnap.exists ? settingsSnap.get('orderHoldHours') : null;
  if (!Number.isInteger(hours) || hours <= 0) return { expired: 0, skipped: true };
  const cutoff = Timestamp.fromMillis(now.toMillis() - hours * 3600 * 1000);
  const pending = await db
    .collection('orders')
    .where('status', '==', 'pendiente')
    .where('createdAt', '<', cutoff)
    .orderBy('createdAt')
    .limit(LIMITS.expireBatchSize)
    .get();
  let expired = 0;
  for (const doc of pending.docs) {
    try {
      const result = await applyOrderTransition(db, {
        orderId: doc.id,
        target: 'cancelado',
        actor: SYSTEM_ACTOR,
        note: `Cancelado automáticamente: sin confirmación en ${hours} horas.`,
        now,
      });
      if (result.changed) expired += 1;
    } catch (error) {
      logger.error('No se pudo vencer el pedido', { orderId: doc.id, error: error.message });
    }
  }
  return { expired, skipped: false };
}

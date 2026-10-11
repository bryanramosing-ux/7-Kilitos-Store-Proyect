import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { LIMITS } from './config.js';
import { cleanDocId, cleanInt, cleanRequestId, cleanText, ensureObject, invalid } from './validation.js';

export const MANUAL_MOVEMENT_TYPES = Object.freeze(['entrada', 'salida', 'ajuste']);

export function parseAdjustInput(data) {
  ensureObject(data, 'data', 'La solicitud');
  const type = data.type;
  if (!MANUAL_MOVEMENT_TYPES.includes(type)) throw invalid('type', 'Selecciona un tipo de movimiento válido.');
  const quantity = cleanInt(data.quantity, {
    field: 'quantity',
    label: type === 'ajuste' ? 'El stock contado' : 'La cantidad',
    min: type === 'ajuste' ? 0 : 1,
    max: LIMITS.maxStockMovement,
  });
  return {
    requestId: cleanRequestId(data.requestId),
    productId: cleanDocId(data.productId, 'productId', 'El producto'),
    type,
    quantity,
    reason: cleanText(data.reason, { field: 'reason', label: 'El motivo', min: 3, max: 200 }),
  };
}

// Registra un movimiento manual de inventario. El documento del movimiento usa el
// requestId como ID: si la misma solicitud llega dos veces, no se aplica dos veces.
export async function adjustStock(db, { actor, data, now = Timestamp.now() }) {
  const input = parseAdjustInput(data);
  const productRef = db.collection('products').doc(input.productId);
  const movementRef = db.collection('inventoryMovements').doc(input.requestId);

  return db.runTransaction(async (tx) => {
    const [movementSnap, productSnap] = await tx.getAll(movementRef, productRef);
    if (movementSnap.exists) {
      const movement = movementSnap.data();
      if (movement.productId !== input.productId) {
        throw new HttpsError('already-exists', 'La solicitud ya fue utilizada para otro producto.');
      }
      return { movementId: movementRef.id, stock: movement.stockAfter, alreadyApplied: true };
    }
    if (!productSnap.exists) throw new HttpsError('not-found', 'El producto no existe.');

    const product = productSnap.data();
    const before = product.stock;
    let delta;
    if (input.type === 'entrada') delta = input.quantity;
    else if (input.type === 'salida') delta = -input.quantity;
    else delta = input.quantity - before;

    if (input.type === 'ajuste' && delta === 0) {
      throw new HttpsError('failed-precondition', `El stock registrado ya es ${before}. No hay diferencia que ajustar.`);
    }
    const after = before + delta;
    if (after < 0) {
      throw new HttpsError('failed-precondition', `No puedes retirar ${input.quantity} unidades: solo hay ${before} disponibles.`, {
        code: 'NEGATIVE_STOCK',
        available: before,
      });
    }
    if (after > LIMITS.maxStockMovement) {
      throw new HttpsError('failed-precondition', `El stock no puede superar ${LIMITS.maxStockMovement} unidades.`);
    }

    tx.update(productRef, { stock: after, updatedAt: now });
    tx.create(movementRef, {
      productId: input.productId,
      sku: product.sku ?? null,
      productName: product.name ?? null,
      type: input.type,
      quantity: delta,
      stockBefore: before,
      stockAfter: after,
      reason: input.reason,
      orderId: null,
      requestId: input.requestId,
      userUid: actor.uid,
      userEmail: actor.email ?? null,
      userRole: actor.role,
      createdAt: now,
    });
    return { movementId: movementRef.id, stock: after, alreadyApplied: false };
  });
}

// Inventario: movimientos manuales vía Cloud Function y consulta del historial.
import { callFunction, getServices } from '../firebase/app.js';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from '../firebase/sdk.js';
import { newRequestId } from '../utils/ids.js';

const withId = (snap) => ({ id: snap.id, ...snap.data() });
export const MOVEMENTS_QUERY_LIMIT = 1000;

export function adjustStock({ productId, type, quantity, reason, requestId = newRequestId() }) {
  return callFunction('adjustStock', { requestId, productId, type, quantity, reason });
}

export async function listMovements(range) {
  const { db } = await getServices();
  const snap = await getDocs(
    query(
      collection(db, 'inventoryMovements'),
      where('createdAt', '>=', Timestamp.fromDate(range.start)),
      where('createdAt', '<', Timestamp.fromDate(range.end)),
      orderBy('createdAt', 'desc'),
      limit(MOVEMENTS_QUERY_LIMIT),
    ),
  );
  return { movements: snap.docs.map(withId), truncated: snap.size >= MOVEMENTS_QUERY_LIMIT };
}

export async function listProductMovements(productId, max = 15) {
  const { db } = await getServices();
  const snap = await getDocs(
    query(collection(db, 'inventoryMovements'), where('productId', '==', productId), orderBy('createdAt', 'desc'), limit(max)),
  );
  return snap.docs.map(withId);
}

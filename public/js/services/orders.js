// Pedidos: creación y cambios de estado vía Cloud Functions; lectura con reglas.
import { callFunction, getServices } from '../firebase/app.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit, Timestamp } from '../firebase/sdk.js';

const withId = (snap) => ({ id: snap.id, ...snap.data() });

export function createOrder(payload) {
  return callFunction('createOrder', payload);
}

export function updateOrderStatus({ orderId, status, note, paymentReference }) {
  return callFunction('updateOrderStatus', { orderId, status, note: note ?? '', paymentReference: paymentReference ?? '' });
}

export function watchOrder(orderId, onData, onError) {
  let unsubscribe = () => {};
  getServices().then(({ db }) => {
    unsubscribe = onSnapshot(doc(db, 'orders', orderId), (snap) => onData(snap.exists() ? withId(snap) : null), onError);
  }, onError);
  return () => unsubscribe();
}

export async function listMyOrders(uid, max = 50) {
  const { db } = await getServices();
  const snap = await getDocs(
    query(collection(db, 'orders'), where('customerUid', '==', uid), orderBy('createdAt', 'desc'), limit(max)),
  );
  return snap.docs.map(withId);
}

export const ORDER_QUERY_LIMIT = 1000;

// Pedidos creados en el rango [start, end). Máximo ORDER_QUERY_LIMIT por consulta.
export async function listOrdersInRange(range) {
  const { db } = await getServices();
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('createdAt', '>=', Timestamp.fromDate(range.start)),
      where('createdAt', '<', Timestamp.fromDate(range.end)),
      orderBy('createdAt', 'desc'),
      limit(ORDER_QUERY_LIMIT),
    ),
  );
  return { orders: snap.docs.map(withId), truncated: snap.size >= ORDER_QUERY_LIMIT };
}

export async function getOrder(orderId) {
  const { db } = await getServices();
  const snap = await getDoc(doc(db, 'orders', orderId));
  return snap.exists() ? withId(snap) : null;
}

export async function findOrderByNumber(orderNumber) {
  const { db } = await getServices();
  const snap = await getDocs(query(collection(db, 'orders'), where('orderNumber', '==', orderNumber), limit(1)));
  return snap.empty ? null : withId(snap.docs[0]);
}

export async function countPendingOrders() {
  const { db } = await getServices();
  const snap = await getDocs(query(collection(db, 'orders'), where('status', 'in', ['pendiente', 'confirmado']), limit(500)));
  const orders = snap.docs.map(withId);
  return {
    pendiente: orders.filter((o) => o.status === 'pendiente'),
    confirmado: orders.filter((o) => o.status === 'confirmado'),
  };
}

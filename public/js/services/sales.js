// Ventas confirmadas (sales) y costos históricos (saleCosts, solo administración).
import { getServices } from '../firebase/app.js';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from '../firebase/sdk.js';

export const SALES_QUERY_LIMIT = 2000;
const withId = (snap) => ({ id: snap.id, ...snap.data() });

async function listInRange(collectionName, range) {
  const { db } = await getServices();
  const snap = await getDocs(
    query(
      collection(db, collectionName),
      where('paidAt', '>=', Timestamp.fromDate(range.start)),
      where('paidAt', '<', Timestamp.fromDate(range.end)),
      orderBy('paidAt', 'desc'),
      limit(SALES_QUERY_LIMIT),
    ),
  );
  return { rows: snap.docs.map(withId), truncated: snap.size >= SALES_QUERY_LIMIT };
}

export async function listSales(range) {
  const { rows, truncated } = await listInRange('sales', range);
  return { sales: rows, truncated };
}

export async function listSaleCosts(range) {
  const { rows, truncated } = await listInRange('saleCosts', range);
  return { costs: rows, truncated };
}

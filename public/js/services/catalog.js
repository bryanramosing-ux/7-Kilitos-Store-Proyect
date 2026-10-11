// Catálogo: productos y categorías. La tienda solo consulta productos publicados
// (active == true), condición que también exigen las reglas de Firestore.
import { getServices } from '../firebase/app.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, documentId } from '../firebase/sdk.js';

const withId = (snap) => ({ id: snap.id, ...snap.data() });

export async function listActiveProducts() {
  const { db } = await getServices();
  const snap = await getDocs(query(collection(db, 'products'), where('active', '==', true)));
  return snap.docs.map(withId);
}

// Solo personal: incluye borradores.
export async function listAllProducts() {
  const { db } = await getServices();
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map(withId);
}

export function watchAllProducts(onData, onError) {
  let unsubscribe = () => {};
  getServices().then(({ db }) => {
    unsubscribe = onSnapshot(collection(db, 'products'), (snap) => onData(snap.docs.map(withId)), onError);
  }, onError);
  return () => unsubscribe();
}

export async function getProduct(id) {
  const { db } = await getServices();
  const snap = await getDoc(doc(db, 'products', id));
  return snap.exists() ? withId(snap) : null;
}

// Observa un producto en tiempo real (stock y precio actualizados en la ficha).
export function watchProduct(id, onData, onError) {
  let unsubscribe = () => {};
  getServices().then(({ db }) => {
    unsubscribe = onSnapshot(
      doc(db, 'products', id),
      (snap) => onData(snap.exists() ? withId(snap) : null),
      onError,
    );
  }, onError);
  return () => unsubscribe();
}

// Observa productos publicados por ID (carrito). Firestore admite hasta 30 IDs por consulta "in".
export function watchProductsByIds(ids, onData, onError) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    onData(new Map());
    return () => {};
  }
  const chunks = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const results = chunks.map(() => null);
  const unsubscribers = [];
  getServices().then(({ db }) => {
    chunks.forEach((chunk, index) => {
      const q = query(collection(db, 'products'), where('active', '==', true), where(documentId(), 'in', chunk));
      unsubscribers.push(
        onSnapshot(
          q,
          (snap) => {
            results[index] = snap.docs.map(withId);
            if (results.every(Boolean)) onData(new Map(results.flat().map((p) => [p.id, p])));
          },
          onError,
        ),
      );
    });
  }, onError);
  return () => unsubscribers.forEach((fn) => fn());
}

export async function listActiveCategories() {
  const { db } = await getServices();
  const snap = await getDocs(query(collection(db, 'categories'), where('active', '==', true)));
  return snap.docs.map(withId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'es'));
}

export async function listAllCategories() {
  const { db } = await getServices();
  const snap = await getDocs(collection(db, 'categories'));
  return snap.docs.map(withId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'es'));
}

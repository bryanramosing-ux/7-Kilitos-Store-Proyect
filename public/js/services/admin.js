// Operaciones del panel administrativo: productos, imágenes, categorías y roles.
import { callFunction, getServices, getStorageService } from '../firebase/app.js';
import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from '../firebase/sdk.js';

// ---------- Productos (Cloud Functions) ----------
export function saveProduct({ mode, productId, product, initialStock }) {
  return callFunction('saveProduct', { mode, productId, product, initialStock });
}

export function setProductActive(productId, active) {
  return callFunction('setProductActive', { productId, active });
}

export async function getProductCost(productId) {
  const { db } = await getServices();
  const snap = await getDoc(doc(db, 'productPrivate', productId));
  return snap.exists() ? (snap.get('cost') ?? null) : null;
}

// ---------- Imágenes (Cloud Storage) ----------
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 1600;

// Reduce la imagen a 1600 px como máximo y la convierte a WebP cuando el navegador
// lo permite. Si no se puede procesar, se sube el archivo original validado.
async function optimizeImage(file) {
  if (!('createImageBitmap' in window)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (blob && blob.type === 'image/webp' && blob.size < file.size) return blob;
  } catch {
    // Se usa el archivo original.
  }
  return file;
}

export function validateImageFile(file) {
  if (!IMAGE_TYPES.includes(file.type)) return `"${file.name}" no es una imagen JPG, PNG o WebP.`;
  if (file.size > IMAGE_MAX_BYTES * 3) return `"${file.name}" pesa más de 9 MB. Reduce su tamaño antes de subirla.`;
  return null;
}

export async function uploadProductImage(productId, file) {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);
  const blob = await optimizeImage(file);
  if (blob.size > IMAGE_MAX_BYTES) throw new Error(`"${file.name}" sigue pesando más de 3 MB después de optimizarla.`);
  const extension = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const safeBase = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'imagen';
  const path = `products/${productId}/${Date.now()}-${safeBase}.${extension}`;
  const { storage, ref, uploadBytes, getDownloadURL } = await getStorageService();
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, blob, { contentType: blob.type, cacheControl: 'public, max-age=31536000' });
  const url = await getDownloadURL(objectRef);
  return { url, path, alt: '' };
}

export async function deleteProductImage(path) {
  const { storage, ref, deleteObject } = await getStorageService();
  await deleteObject(ref(storage, path));
}

// ---------- Categorías (Firestore con reglas) ----------
export async function saveCategory(category, { isNew }) {
  const { db } = await getServices();
  const data = {
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    color: category.color,
    illustration: category.illustration,
    order: category.order,
    active: category.active,
    updatedAt: serverTimestamp(),
    createdAt: isNew ? serverTimestamp() : category.createdAt,
  };
  await setDoc(doc(db, 'categories', category.slug), data);
}

// ---------- Usuarios y roles ----------
export async function listStaff() {
  const { db } = await getServices();
  const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'encargado'])));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function setUserRole(email, role) {
  return callFunction('setUserRole', { email, role });
}

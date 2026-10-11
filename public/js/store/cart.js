// Carrito temporal en localStorage. Solo guarda qué productos y cuántos quiere la
// persona: el precio vigente, el stock y la disponibilidad se leen siempre desde
// Firestore, y el total oficial lo calcula la Cloud Function createOrder.
import { optionsKey } from '../utils/pricing.js';

const STORAGE_KEY = 'kilitos.cart.v1';
export const MAX_LINE_QUANTITY = 99;
export const MAX_LINES = 30;

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter((line) => line && typeof line.productId === 'string') : [];
  } catch {
    return [];
  }
}

function write(lines) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Almacenamiento no disponible (modo privado): el carrito vive solo en esta página.
  }
  memory = lines;
  window.dispatchEvent(new CustomEvent('cart:change', { detail: { lines } }));
}

let memory = null;

export function getCart() {
  memory ??= read();
  return memory.map((line) => ({ ...line, options: { ...line.options } }));
}

export function lineKey(productId, options = {}) {
  return `${productId}::${optionsKey(options)}`;
}

export function cartCount(lines = getCart()) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

// Cantidad total ya en el carrito para un producto (todas sus opciones).
export function quantityInCart(productId, lines = getCart()) {
  return lines.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Agrega un producto respetando el stock visible. Devuelve { added, quantity, limited }.
 * El servidor vuelve a validar el stock al confirmar el pedido.
 */
export function addToCart(product, quantity = 1, options = {}) {
  const lines = getCart();
  const key = lineKey(product.id, options);
  const available = Math.max(0, (product.stock ?? 0) - quantityInCart(product.id, lines));
  const wanted = Math.max(1, Math.floor(quantity));
  const toAdd = Math.min(wanted, available);
  if (toAdd <= 0) return { added: 0, limited: true };
  const existing = lines.find((line) => line.key === key);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + toAdd, MAX_LINE_QUANTITY);
    existing.priceSeen = product.price;
  } else {
    if (lines.length >= MAX_LINES) return { added: 0, limited: true, tooManyLines: true };
    lines.push({
      key,
      productId: product.id,
      quantity: Math.min(toAdd, MAX_LINE_QUANTITY),
      options: { ...options },
      name: product.name,
      image: product.images?.[0]?.url ?? null,
      priceSeen: product.price,
      addedAt: Date.now(),
    });
  }
  write(lines);
  return { added: toAdd, limited: toAdd < wanted };
}

export function setQuantity(key, quantity) {
  const lines = getCart();
  const line = lines.find((item) => item.key === key);
  if (!line) return;
  const value = Math.floor(Number(quantity));
  if (!Number.isFinite(value) || value <= 0) {
    write(lines.filter((item) => item.key !== key));
    return;
  }
  line.quantity = Math.min(value, MAX_LINE_QUANTITY);
  write(lines);
}

export function removeLine(key) {
  write(getCart().filter((line) => line.key !== key));
}

export function updatePriceSeen(key, price) {
  const lines = getCart();
  const line = lines.find((item) => item.key === key);
  if (line && line.priceSeen !== price) {
    line.priceSeen = price;
    write(lines);
  }
}

export function clearCart() {
  write([]);
}

// Sincroniza el carrito entre pestañas.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    memory = read();
    window.dispatchEvent(new CustomEvent('cart:change', { detail: { lines: memory } }));
  }
});

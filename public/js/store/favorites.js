// Favoritos guardados en este dispositivo (preferencia personal, no dato comercial).
const STORAGE_KEY = 'kilitos.favorites.v1';

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(data) ? data.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

let favorites = null;

export function getFavorites() {
  favorites ??= read();
  return new Set(favorites);
}

export function isFavorite(productId) {
  return getFavorites().has(productId);
}

export function toggleFavorite(productId) {
  const set = getFavorites();
  if (set.has(productId)) set.delete(productId);
  else set.add(productId);
  favorites = set;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Sin almacenamiento: el favorito dura mientras la página esté abierta.
  }
  window.dispatchEvent(new CustomEvent('favorites:change', { detail: { productId, active: set.has(productId) } }));
  return set.has(productId);
}

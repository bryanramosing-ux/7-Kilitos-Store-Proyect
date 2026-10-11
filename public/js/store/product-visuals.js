// Imágenes de producto: foto real si existe; si no, ilustración pastel de la categoría.
import { safeUrl } from '../utils/html.js';

const ILLUSTRATIONS = ['planner', 'washi', 'stickers', 'pens', 'desk', 'generic'];

export function illustrationFor(category) {
  const name = ILLUSTRATIONS.includes(category?.illustration) ? category.illustration : 'generic';
  return `/assets/images/illustrations/${name}.svg`;
}

export function productImages(product, category) {
  const photos = (product.images ?? [])
    .filter((image) => typeof image?.url === 'string')
    .map((image) => ({ src: safeUrl(image.url, ''), alt: image.alt || product.name, photo: true }))
    .filter((image) => image.src);
  if (photos.length > 0) return photos;
  return [{ src: illustrationFor(category), alt: `Ilustración de ${category?.name ?? 'producto'} (sin foto todavía)`, photo: false }];
}

export function categoryTone(category) {
  return ['rosa', 'lavanda', 'ambar', 'menta'].includes(category?.color) ? category.color : 'rosa';
}

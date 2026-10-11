// Niveles de stock para la tienda y el panel.
export function lowStockThreshold(product, settings) {
  if (Number.isInteger(product?.lowStockThreshold)) return product.lowStockThreshold;
  return Number.isInteger(settings?.lowStockDefault) ? settings.lowStockDefault : 5;
}

// 'agotado' | 'bajo' | 'disponible'
export function stockLevel(product, settings) {
  const stock = Number.isInteger(product?.stock) ? product.stock : 0;
  if (stock <= 0) return 'agotado';
  if (stock <= lowStockThreshold(product, settings)) return 'bajo';
  return 'disponible';
}

export function availabilityLabel(product, settings) {
  const level = stockLevel(product, settings);
  if (level === 'agotado') return { level, text: 'Agotado', icon: 'block' };
  if (level === 'bajo') {
    const n = product.stock;
    return { level, text: n === 1 ? '¡Queda 1 unidad!' : `¡Quedan ${n} unidades!`, icon: 'local_fire_department' };
  }
  return { level, text: 'Disponible', icon: 'check_circle' };
}

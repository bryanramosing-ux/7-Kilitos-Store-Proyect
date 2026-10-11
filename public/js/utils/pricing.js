// Réplica de functions/src/pricing.js SOLO para mostrar resúmenes en pantalla.
// El total oficial lo calcula siempre la Cloud Function createOrder.

export function computeShippingCost(settings, method, subtotal) {
  if (!method) return 0;
  const threshold = settings?.freeShippingThreshold;
  const freeApplies =
    method.freeShippingEligible === true && Number.isInteger(threshold) && threshold > 0 && subtotal >= threshold;
  return freeApplies ? 0 : method.cost;
}

export function computeTotals(lines, settings, method) {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const shippingCost = computeShippingCost(settings, method, subtotal);
  return { subtotal, shippingCost, total: subtotal + shippingCost };
}

// Cuánto falta para el envío gratis (null si no hay umbral configurado).
export function freeShippingGap(settings, subtotal) {
  const threshold = settings?.freeShippingThreshold;
  if (!Number.isInteger(threshold) || threshold <= 0) return null;
  return Math.max(threshold - subtotal, 0);
}

export function optionsKey(options = {}) {
  return Object.keys(options)
    .sort()
    .map((key) => `${key}=${options[key]}`)
    .join('|');
}

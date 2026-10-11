// Cálculo oficial de totales. La interfaz replica esta lógica solo para mostrar
// un resumen; el valor que se cobra es siempre el calculado aquí con datos de Firestore.

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

export function optionsKey(options) {
  return Object.keys(options)
    .sort()
    .map((key) => `${key}=${options[key]}`)
    .join('|');
}

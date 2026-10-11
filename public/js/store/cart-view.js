// Cruza el carrito local con los productos vigentes de Firestore y detecta
// problemas antes de comprar. Función pura (sin DOM) para poder probarla.

/**
 * @param {Array} lines   líneas del carrito (localStorage)
 * @param {Map}   products productos publicados vigentes por ID
 * @returns {{ items: Array, subtotal: number, blocking: boolean, units: number }}
 */
export function reconcileCart(lines, products) {
  const usedByProduct = new Map();
  const items = lines.map((line) => {
    const product = products.get(line.productId) ?? null;
    if (!product) return { line, product: null, issue: 'unavailable', valid: false };
    const stock = product.stock ?? 0;
    const alreadyUsed = usedByProduct.get(product.id) ?? 0;
    const free = Math.max(0, stock - alreadyUsed);
    usedByProduct.set(product.id, alreadyUsed + line.quantity);
    const optionNames = (product.options ?? []).map((o) => o.name);
    const optionsValid =
      Object.keys(line.options ?? {}).length === optionNames.length &&
      (product.options ?? []).every((group) => group.values.includes(line.options?.[group.name]));
    let issue = null;
    if (!optionsValid) issue = 'options';
    else if (stock <= 0) issue = 'soldout';
    else if (line.quantity > free) issue = 'quantity';
    const priceChanged = Number.isInteger(line.priceSeen) && line.priceSeen !== product.price;
    return {
      line,
      product,
      issue,
      free,
      priceChanged,
      valid: issue === null,
      lineTotal: product.price * line.quantity,
    };
  });
  const validItems = items.filter((item) => item.valid);
  return {
    items,
    subtotal: validItems.reduce((sum, item) => sum + item.lineTotal, 0),
    units: validItems.reduce((sum, item) => sum + item.line.quantity, 0),
    blocking: items.some((item) => !item.valid),
  };
}

export function describeOptions(options = {}) {
  return Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ');
}

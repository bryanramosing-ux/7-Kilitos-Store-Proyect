import { test, expect } from './fixtures.js';
import { fileURLToPath } from 'node:url';
import { ADMIN, STAFF, login, readDoc, stockOf } from './support.js';

test.describe.configure({ mode: 'serial' });

const PNG = fileURLToPath(new URL('./producto-prueba.png', import.meta.url));
const TXT = fileURLToPath(new URL('./no-es-imagen.txt', import.meta.url));
const SKU = `E2E-${Date.now().toString(36).toUpperCase()}`;

async function placeOrder(page) {
  await page.goto('/producto.html?id=demo-sellitos-fresas');
  await page.getByRole('button', { name: /Agregar a la bolsa/ }).click();
  await page.goto('/checkout.html');
  await page.fill('#name', 'Fernanda Rojas');
  await page.fill('#email', 'fernanda@correo.cl');
  await page.fill('#phone', '+56 9 8765 4321');
  await page.getByRole('button', { name: /Confirmar pedido/ }).click();
  await page.waitForURL('**/pedido.html?id=*');
  return (await page.locator('.order-number').textContent()).trim();
}

test('sin sesión no se puede entrar al panel', async ({ page, jsErrors }) => {
  await page.goto('/admin/index.html');
  await page.waitForURL('**/login.html?next=*');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(jsErrors).toEqual([]);
});

test('una clienta registrada no accede al panel aunque escriba la URL', async ({ page }) => {
  await page.goto('/login.html?modo=registro');
  await page.fill('#name', 'Clienta Curiosa');
  await page.fill('#email', `clienta-${Date.now()}@correo.cl`);
  await page.fill('#password', 'una-clave-segura');
  await page.click('form[data-form="register"] button[type="submit"]');
  await page.waitForURL('**/cuenta.html');
  await page.goto('/admin/pedidos.html');
  await page.waitForURL('**/login.html?*motivo=sin-permiso*');
  await expect(page.getByRole('alert')).toContainText('no tiene acceso al panel');
});

test('el administrador crea un producto con imagen y se publica en la tienda', async ({ page, jsErrors }) => {
  await login(page, ADMIN, '/admin/productos.html');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('#p-name').fill('Libreta Nube Pastel E2E');
  await dialog.locator('#p-sku').fill(SKU);
  await dialog.locator('#p-category').selectOption('planners');
  await dialog.locator('#p-price').fill('5990');
  await dialog.locator('#p-compare').fill('4990');
  await dialog.locator('#p-cost').fill('2500');
  await dialog.locator('#p-stock').fill('7');
  await dialog.locator('#p-active').check();

  // Validación: el precio anterior debe ser mayor al de venta.
  await dialog.getByRole('button', { name: /Crear producto/ }).click();
  await expect(dialog.locator('#p-compare-error')).toHaveText('Debe ser mayor que el precio de venta.');
  await dialog.locator('#p-compare').fill('7990');
  await expect(dialog.locator('#p-discount')).toContainText('25% de descuento');

  // Un archivo que no es imagen se rechaza; una imagen PNG se sube a Storage.
  await dialog.locator('input[data-upload]').setInputFiles(TXT);
  await expect(page.locator('.toast.is-error')).toContainText('no es una imagen');
  await dialog.locator('input[data-upload]').setInputFiles(PNG);
  await expect(dialog.locator('.image-tile img')).toHaveCount(1);

  await dialog.getByRole('button', { name: /Crear producto/ }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Producto creado' })).toBeVisible();
  const row = page.locator('tr', { hasText: SKU });
  await expect(row).toContainText('$5.990');
  await expect(row).toContainText('7');

  const id = await row.getByRole('button', { name: /Editar/ }).getAttribute('data-edit');
  const doc = await readDoc(`products/${id}`);
  expect(doc.fields.price.integerValue).toBe('5990');
  expect(doc.fields.cost).toBeUndefined();
  expect(doc.fields.images.arrayValue.values[0].mapValue.fields.url.stringValue).toContain('127.0.0.1:9199');
  const privateDoc = await readDoc(`productPrivate/${id}`);
  expect(privateDoc.fields.cost.integerValue).toBe('2500');

  await page.goto(`/producto.html?id=${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Libreta Nube Pastel E2E');
  await expect(page.locator('.gallery-image')).toHaveAttribute('src', /127\.0\.0\.1:9199/);
  expect(jsErrors).toEqual([]);
});

test('una entrada de inventario actualiza el stock y queda en el historial', async ({ page, jsErrors }) => {
  await login(page, ADMIN, '/admin/inventario.html');
  const row = page.locator('#stock-list tr', { hasText: 'Washi Tape Dorado Estrellitas' });
  await expect(row).toContainText('Agotado');
  await row.getByRole('button', { name: /Registrar movimiento/ }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('#m-qty').fill('6');
  await expect(dialog.locator('#m-preview')).toHaveText('Quedará en 6 unidades.');
  await dialog.locator('#m-reason').fill('Factura 1001 proveedor');
  await dialog.getByRole('button', { name: /Registrar/ }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Movimiento registrado' })).toBeVisible();
  await expect(row).toContainText('Disponible');
  expect(await stockOf('demo-washi-dorado')).toBe(6);

  await expect(page.locator('#mov-list')).toContainText('Compra a proveedor: Factura 1001 proveedor');
  await expect(page.locator('#mov-list')).toContainText(ADMIN.email);

  // Una salida mayor al stock se rechaza en el servidor.
  await row.getByRole('button', { name: /Registrar movimiento/ }).click();
  await dialog.getByText('Salida', { exact: true }).click();
  await dialog.locator('#m-qty').fill('50');
  await dialog.locator('#m-reason').fill('Prueba de límite');
  await dialog.getByRole('button', { name: /Registrar/ }).click();
  await expect(dialog.locator('#m-alert')).toContainText('solo hay 6 disponibles');
  expect(await stockOf('demo-washi-dorado')).toBe(6);
  expect(jsErrors.filter((e) => !e.includes('status of 400'))).toEqual([]);
});

test('registrar el pago crea la venta; cancelar la anula y devuelve el stock', async ({ page, jsErrors }) => {
  const before = await stockOf('demo-sellitos-fresas');
  const orderNumber = await placeOrder(page);
  expect(await stockOf('demo-sellitos-fresas')).toBe(before - 1);

  await login(page, ADMIN, '/admin/pedidos.html');
  await page.fill('#q', orderNumber);
  const row = page.locator('tr', { hasText: orderNumber });
  await expect(row).toContainText('Pendiente');
  await row.getByRole('button', { name: /Ver/ }).click();

  let dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: /Registrar pago/ }).click();
  const payDialog = page.locator('dialog[open]').last();
  await payDialog.locator('#pay-ref').fill('TRX-E2E-1');
  await payDialog.getByRole('button', { name: /Registrar pago/ }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Venta registrada' })).toBeVisible();
  dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Pagado');
  await expect(dialog).toContainText('TRX-E2E-1');
  await dialog.getByRole('button', { name: /Cerrar/ }).first().click();

  await page.goto('/admin/ventas.html');
  const saleRow = page.locator('tr', { hasText: orderNumber });
  await expect(saleRow).toContainText('Vigente');
  await expect(saleRow).toContainText('$3.990');

  await page.goto('/admin/index.html');
  await expect(page.locator('.kpi', { hasText: 'Ventas de hoy' })).not.toContainText('$0');

  await page.goto(`/admin/pedidos.html?pedido=${(await readOrderId(orderNumber))}`);
  dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: /Cancelar pedido/ }).click();
  const confirm = page.locator('dialog[open]').last();
  await confirm.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(confirm.locator('#confirm-reason-error')).toContainText('al menos 3 caracteres');
  await confirm.locator('#confirm-reason').fill('Clienta desistió, reembolso hecho');
  await confirm.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.locator('dialog[open]')).toContainText('Cancelado');
  expect(await stockOf('demo-sellitos-fresas')).toBe(before);

  await page.goto('/admin/ventas.html');
  await expect(page.locator('tr', { hasText: orderNumber })).toContainText('Anulada');
  expect(jsErrors).toEqual([]);
});

async function readOrderId(orderNumber) {
  const res = await fetch('http://127.0.0.1:8080/v1/projects/demo-7kilitos/databases/(default)/documents:runQuery', {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: { fieldFilter: { field: { fieldPath: 'orderNumber' }, op: 'EQUAL', value: { stringValue: orderNumber } } },
      },
    }),
  });
  const [first] = await res.json();
  return first.document.name.split('/').pop();
}

test('el encargado opera pedidos e inventario pero no configura ni edita precios', async ({ page, jsErrors }) => {
  await login(page, STAFF, '/admin/index.html');
  const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
  await expect(nav.getByRole('link', { name: 'Pedidos' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Configuración' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Usuarios y roles' })).toHaveCount(0);

  await page.goto('/admin/configuracion.html');
  await page.waitForURL('**/admin/index.html?aviso=solo-admin');
  await expect(page.locator('.toast')).toContainText('Módulo solo para administración');

  await page.goto('/admin/productos.html');
  await expect(page.getByText('Crear o editar precios es exclusivo de administración')).toBeVisible();
  await expect(page.getByRole('button', { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nuevo producto' })).toHaveCount(0);
  expect(jsErrors).toEqual([]);
});

test('la configuración guardada se refleja en la tienda', async ({ page, jsErrors }) => {
  await login(page, ADMIN, '/admin/configuracion.html');
  await page.fill('#freeShippingThreshold', '30000');
  await page.fill('#announcement', 'Nuevos stickers de otoño');
  await page.getByRole('button', { name: /Guardar configuración/ }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Configuración guardada' })).toBeVisible();

  await page.goto('/index.html');
  await expect(page.locator('.announce')).toContainText('Envíos gratis en compras sobre $30.000');
  await expect(page.locator('.announce')).toContainText('Nuevos stickers de otoño');

  // Restaurar el valor demostrativo.
  await page.goto('/admin/configuracion.html');
  await page.fill('#freeShippingThreshold', '45000');
  await page.getByRole('button', { name: /Guardar configuración/ }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Configuración guardada' })).toBeVisible();
  expect(jsErrors).toEqual([]);
});

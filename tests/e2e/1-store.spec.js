import { test, expect } from '@playwright/test';
import { routeFirebaseSdk, trackErrors, stockOf } from './support.js';

// Un solo contexto para todo el recorrido: el carrito (localStorage) y la sesión
// de invitada se conservan entre pasos, como en una compra real.
let context;
let page;
let jsErrors;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago', viewport: { width: 1366, height: 900 } });
  await routeFirebaseSdk(context);
  page = await context.newPage();
  jsErrors = trackErrors(page);
});

test.afterAll(async () => {
  await context?.close();
});

test.beforeEach(() => {
  jsErrors.length = 0;
});

test.describe('tienda pública', () => {
  test('la portada carga sin errores y muestra productos y categorías desde Firestore', async () => {
    await page.goto('/index.html');
    await expect(page.getByRole('heading', { level: 1, name: '7 Kilitos Store' })).toBeVisible();
    await expect(page.locator('.category-tile')).toHaveCount(5);
    await expect(page.locator('#featured-grid .product-card')).toHaveCount(4);
    await expect(page.getByText('Planner Perpetuo "Chanchito" 2026').first()).toBeVisible();
    await expect(page.locator('.announce')).toContainText('$45.000');
    await expect(page.locator('#demo-banner')).toBeVisible();
    expect(jsErrors).toEqual([]);
  });

  test('el catálogo filtra por categoría, busca y ordena por precio', async () => {
    await page.goto('/catalogo.html?categoria=washi-tapes');
    const cards = page.locator('#grid .product-card');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#catalog-title')).toHaveText('Washi Tapes');

    await page.getByRole('button', { name: 'Todo', exact: true }).click();
    await expect(cards).toHaveCount(10);
    await page.fill('#catalog-q', 'sellitos');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Sellitos Decorativos Fresas');
    // La búsqueda ignora tildes y mayúsculas.
    await page.fill('#catalog-q', 'BOLIGRAFOS');
    await expect(cards).toHaveCount(2);

    await page.fill('#catalog-q', 'zzzz-no-existe');
    await expect(page.getByText('No encontramos productos')).toBeVisible();

    await page.fill('#catalog-q', '');
    await page.selectOption('#sort', 'precio-asc');
    // Los agotados van al final; el primero disponible es el más barato.
    await expect(cards.first()).toContainText('$3.990');
    await expect(cards.last()).toContainText('Agotado');
    expect(jsErrors).toEqual([]);
  });

  test('la ficha muestra el producto seleccionado y exige elegir opciones', async () => {
    await page.goto('/producto.html?id=demo-planner-chanchito');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planner Perpetuo "Chanchito" 2026');
    await expect(page.locator('.price-box .price-now')).toHaveText('$16.900');
    await expect(page.locator('.price-box .price-before')).toContainText('$19.900');
    await expect(page.locator('.price-box')).toContainText('15% OFF');
    await expect(page.locator('.stock-alert')).toContainText('quedan 4 unidades');

    await page.getByRole('button', { name: /Agregar a la bolsa/ }).click();
    await expect(page.locator('#opt-error-0')).toContainText('Selecciona diseño de portada');

    await page.getByText('Lila Estelar').click();
    await page.getByText('Punteadas (bullet)').click();
    await page.getByRole('button', { name: 'Aumentar cantidad' }).click();
    await page.getByRole('button', { name: /Agregar a la bolsa/ }).click();
    await expect(page.locator('.toast').filter({ hasText: '¡Añadido con mucho amor!' })).toBeVisible();
    await expect(page.locator('[data-cart-count]')).toHaveText('2');
    expect(jsErrors).toEqual([]);
  });

  test('el carrito calcula subtotales y no deja superar el stock', async () => {
    await page.goto('/producto.html?id=demo-washi-suenos');
    await page.getByRole('button', { name: /Agregar a la bolsa/ }).click();
    await page.goto('/carrito.html');
    const lines = page.locator('.cart-line');
    await expect(lines).toHaveCount(2);
    // 2 × 16.900 + 1 × 8.500
    await expect(page.locator('.summary-total')).toContainText('$42.300');

    const planner = lines.filter({ hasText: 'Chanchito' });
    await expect(planner).toContainText('Diseño de portada: Lila Estelar');
    await planner.getByRole('button', { name: 'Aumentar cantidad' }).click();
    await planner.getByRole('button', { name: 'Aumentar cantidad' }).click();
    await expect(planner.locator('input[data-qty-input]')).toHaveValue('4');
    await expect(planner.getByRole('button', { name: 'Aumentar cantidad' })).toBeDisabled();

    // Escribir una cantidad mayor al stock bloquea el pedido con un aviso claro.
    await planner.locator('input[data-qty-input]').fill('9');
    await planner.locator('input[data-qty-input]').press('Tab');
    await expect(planner).toContainText('Solo quedan 4 unidades');
    await expect(page.getByRole('link', { name: /Continuar con el pedido/ })).toHaveAttribute('aria-disabled', 'true');
    await planner.getByRole('button', { name: 'Ajustar a 4' }).click();
    await expect(page.locator('.summary-total')).toContainText('$76.100');
    expect(jsErrors).toEqual([]);
  });

  test('el checkout valida el formulario y registra un pedido pendiente que reserva stock', async () => {
    const before = await stockOf('demo-planner-chanchito');
    await page.goto('/checkout.html');
    await expect(page.locator('#summary')).toContainText('$76.100');
    await page.getByRole('button', { name: /Confirmar pedido/ }).click();
    await expect(page.locator('#name-error')).toHaveText('El nombre es obligatorio.');
    await expect(page.locator('#email-error')).toHaveText('El correo es obligatorio.');

    await page.fill('#name', 'Camila Pérez');
    await page.fill('#email', 'correo-invalido');
    await page.fill('#phone', '+56 9 1234 5678');
    await page.getByRole('button', { name: /Confirmar pedido/ }).click();
    await expect(page.locator('#email-error')).toHaveText('Ingresa un correo electrónico válido.');

    await page.fill('#email', 'camila@correo.cl');
    // Despacho: exige dirección y aplica envío gratis (subtotal sobre $45.000).
    await page.getByText('Despacho a domicilio').click();
    await page.getByRole('button', { name: /Confirmar pedido/ }).click();
    await expect(page.locator('#region-error')).toHaveText('Selecciona una región.');
    await page.selectOption('#region', 'Metropolitana de Santiago');
    await page.fill('#comuna', 'Ñuñoa');
    await page.fill('#street', 'Av. Irarrázaval 1234, depto 5');
    await expect(page.locator('#summary')).toContainText('Sin costo');
    await page.getByRole('button', { name: /Confirmar pedido/ }).click();

    await page.waitForURL('**/pedido.html?id=*');
    await expect(page.getByRole('heading', { name: '¡Pedido recibido! 🌸' })).toBeVisible();
    await expect(page.locator('.order-number')).toHaveText(/^7K-\d{6}$/);
    await expect(page.locator('.order-hero')).toContainText('Pendiente');
    await expect(page.getByText('Cómo pagar: Transferencia bancaria')).toBeVisible();
    await expect(page.locator('[data-cart-count]')).toBeHidden();
    expect(await stockOf('demo-planner-chanchito')).toBe(before - 4);
    expect(jsErrors).toEqual([]);
  });

  test('la compradora invitada ve su pedido en "Mis pedidos" y nadie más puede leerlo', async ({ browser }) => {
    await page.goto('/cuenta.html');
    await expect(page.getByRole('heading', { name: 'Compras como invitada' })).toBeVisible();
    const item = page.locator('.order-item').first();
    await expect(item).toContainText(/7K-\d{6}/);
    await expect(item).toContainText('Pendiente');
    const orderUrl = await item.getAttribute('href');

    // Otra persona (otro navegador, sin sesión) no puede ver el pedido.
    const other = await browser.newContext();
    await routeFirebaseSdk(other);
    const otherPage = await other.newPage();
    await otherPage.goto(orderUrl);
    await expect(otherPage.getByRole('heading', { name: 'Inicia sesión para ver este pedido' })).toBeVisible();
    await other.close();
    expect(jsErrors).toEqual([]);
  });
});

import { test, expect } from './fixtures.js';
import { ADMIN, login } from './support.js';

const VIEWPORTS = [
  { name: 'teléfono pequeño', width: 360, height: 740 },
  { name: 'teléfono grande', width: 430, height: 932 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'portátil', width: 1366, height: 768 },
  { name: 'escritorio', width: 1920, height: 1080 },
];
const STORE_PAGES = ['/index.html', '/catalogo.html', '/producto.html?id=demo-planner-chanchito', '/carrito.html', '/ayuda.html', '/login.html'];
const ADMIN_PAGES = ['/admin/index.html', '/admin/pedidos.html', '/admin/productos.html', '/admin/inventario.html', '/admin/reportes.html'];

// Un icono cuyo nombre no está en el subconjunto de la fuente se ve como texto
// ("C", "G"…) y desborda su caja de 1em. Solo se verifica si la fuente cargó.
async function brokenIcons(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.fonts.check('24px "Material Symbols Outlined"')) return [];
    return [...document.querySelectorAll('.icon')]
      .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim());
  });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const viewport of VIEWPORTS) {
  test(`tienda sin desborde horizontal en ${viewport.name} (${viewport.width}px)`, async ({ page, jsErrors }) => {
    await page.setViewportSize(viewport);
    for (const path of STORE_PAGES) {
      await page.goto(path);
      await expect(page.locator('#site-header .brand')).toBeVisible();
      await page.waitForTimeout(400);
      expect(await horizontalOverflow(page), `${path} desborda`).toBeLessThanOrEqual(0);
      expect(await brokenIcons(page), `${path}: iconos sin glifo`).toEqual([]);
    }
    const bottomNav = page.locator('.bottom-nav');
    if (viewport.width < 768) await expect(bottomNav).toBeVisible();
    else await expect(bottomNav).toBeHidden();
    expect(jsErrors).toEqual([]);
  });
}

for (const viewport of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[3]]) {
  test(`panel sin desborde horizontal en ${viewport.name} (${viewport.width}px)`, async ({ page, jsErrors }) => {
    await page.setViewportSize(viewport);
    await login(page, ADMIN, '/admin/index.html');
    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await expect(page.locator('#sidebar .sidebar-brand')).toBeAttached();
      await page.waitForTimeout(600);
      expect(await horizontalOverflow(page), `${path} desborda`).toBeLessThanOrEqual(0);
      expect(await brokenIcons(page), `${path}: iconos sin glifo`).toEqual([]);
    }
    // En pantallas pequeñas el menú lateral se abre con el botón y se cierra con Escape.
    if (viewport.width < 1024) {
      const toggle = page.getByRole('button', { name: 'Abrir menú' });
      await toggle.click();
      await expect(page.locator('#sidebar')).toHaveClass(/is-open/);
      await page.keyboard.press('Escape');
      await expect(page.locator('#sidebar')).not.toHaveClass(/is-open/);
    }
    expect(jsErrors).toEqual([]);
  });
}

// Utilidades E2E compartidas.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sdkDir = fileURLToPath(new URL('../../node_modules/firebase/', import.meta.url));

// Sirve el SDK de Firebase desde node_modules (son los mismos archivos que publica
// el CDN oficial) para no depender del acceso a www.gstatic.com durante las pruebas.
export async function routeFirebaseSdk(context) {
  await context.route(/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(.+\.js)$/, async (route) => {
    const file = route.request().url().split('/').pop();
    const path = `${sdkDir}${file}`;
    if (!existsSync(path)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(path) });
  });
}

// Cuentas creadas solo en el emulador por global-setup.js (no existen en producción).
export const ADMIN = { email: 'admin@7kilitos.test', password: 'Prueba-Admin-2026' };
export const STAFF = { email: 'encargado@7kilitos.test', password: 'Prueba-Staff-2026' };
export const BASE_URL = 'http://127.0.0.1:5000';

// Registra errores de JavaScript de la página para poder exigir que no haya ninguno.
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

export async function login(page, { email, password }, next = '/admin/index.html') {
  await page.goto(`/login.html?next=${encodeURIComponent(next)}`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('form[data-form="login"] button[type="submit"]');
  await page.waitForURL(`**${next.split('?')[0]}*`);
}

// Lee un documento directamente del emulador (REST, sin reglas: cabecera "owner").
export async function readDoc(path) {
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-7kilitos/databases/(default)/documents/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function stockOf(productId) {
  const doc = await readDoc(`products/${productId}`);
  return Number(doc?.fields?.stock?.integerValue ?? NaN);
}

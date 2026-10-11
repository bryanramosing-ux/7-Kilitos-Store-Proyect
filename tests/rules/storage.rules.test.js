import { describe, it, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/app';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const PROJECT_ID = 'demo-7kilitos-rules';
let env;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const bytes = (size) => new Uint8Array(size);

setLogLevel('silent');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), 'products/p1/existente.png'), PNG, { contentType: 'image/png' });
  });
});

after(async () => {
  await env?.cleanup();
});

const adminStorage = () => env.authenticatedContext('admin1', { role: 'admin' }).storage();

describe('imágenes de productos', () => {
  it('cualquiera puede verlas', async () => {
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), 'products/p1/existente.png')));
  });

  it('un administrador sube JPEG, PNG o WebP de hasta 3 MB', async () => {
    const storage = adminStorage();
    await assertSucceeds(uploadBytes(ref(storage, 'products/p1/foto.png'), PNG, { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(ref(storage, 'products/p1/foto.webp'), bytes(1024), { contentType: 'image/webp' }));
    await assertSucceeds(uploadBytes(ref(storage, 'products/p1/foto.jpg'), bytes(1024), { contentType: 'image/jpeg' }));
  });

  it('rechaza archivos que no son imágenes autorizadas o que superan el tamaño', async () => {
    const storage = adminStorage();
    await assertFails(uploadBytes(ref(storage, 'products/p1/nota.txt'), bytes(10), { contentType: 'text/plain' }));
    await assertFails(uploadBytes(ref(storage, 'products/p1/logo.svg'), bytes(10), { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(storage, 'products/p1/app.html'), bytes(10), { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(storage, 'products/p1/grande.jpg'), bytes(3 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(storage, 'products/p1/vacio.jpg'), bytes(0), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(storage, 'otra-carpeta/foto.png'), PNG, { contentType: 'image/png' }));
  });

  it('clientes, encargados y visitantes no pueden subir ni eliminar', async () => {
    const customer = env.authenticatedContext('ana').storage();
    const staff = env.authenticatedContext('staff1', { role: 'encargado' }).storage();
    const anon = env.unauthenticatedContext().storage();
    for (const storage of [customer, staff, anon]) {
      await assertFails(uploadBytes(ref(storage, 'products/p1/x.png'), PNG, { contentType: 'image/png' }));
      await assertFails(deleteObject(ref(storage, 'products/p1/existente.png')));
    }
  });

  it('no se puede sobrescribir una imagen existente, solo eliminarla', async () => {
    const storage = adminStorage();
    await assertFails(uploadBytes(ref(storage, 'products/p1/existente.png'), PNG, { contentType: 'image/png' }));
    await assertSucceeds(deleteObject(ref(storage, 'products/p1/existente.png')));
  });
});

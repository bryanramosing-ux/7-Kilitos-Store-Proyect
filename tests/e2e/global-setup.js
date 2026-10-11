// Deja el emulador en un estado conocido: borra Firestore y Auth, y vuelve a
// sembrar los datos demostrativos y las cuentas de prueba. Solo actúa sobre el
// proyecto de demostración "demo-7kilitos" del emulador local.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADMIN, STAFF } from './support.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const PROJECT = 'demo-7kilitos';

async function clear(url) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`No se pudo limpiar el emulador (${url}): ${res.status}`);
}

export default async function globalSetup() {
  await clear(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
  await clear(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`);
  const run = (args) => execFileSync('node', args, { cwd: root, stdio: 'inherit', env: process.env });
  run(['functions/scripts/seed.js', '--emulator']);
  run(['functions/scripts/set-role.js', '--emulator', '--email', ADMIN.email, '--role', 'admin', '--create', '--password', ADMIN.password, '--name', 'Admin Pruebas']);
  run(['functions/scripts/set-role.js', '--emulator', '--email', STAFF.email, '--role', 'encargado', '--create', '--password', STAFF.password, '--name', 'Encargado Pruebas']);
}

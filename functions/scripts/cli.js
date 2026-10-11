// Utilidades compartidas por los scripts de administración (se ejecutan en la
// máquina del propietario, nunca en el navegador).
import { initializeApp } from 'firebase-admin/app';

export const EMULATOR_PROJECT = 'demo-7kilitos';

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, inline] = token.slice(2).split('=');
    if (inline !== undefined) args[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
    else args[key] = true;
  }
  return args;
}

// --emulator  -> usa Local Emulator Suite con el proyecto de demostración.
// --project X -> usa el proyecto real X con Application Default Credentials.
export function initAdmin(args) {
  if (args.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
    initializeApp({ projectId: EMULATOR_PROJECT });
    return { projectId: EMULATOR_PROJECT, emulator: true };
  }
  if (typeof args.project !== 'string') {
    fail('Indica --emulator o --project <id-del-proyecto>.');
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    fail('FIRESTORE_EMULATOR_HOST está definido: quítalo para operar sobre el proyecto real.');
  }
  initializeApp({ projectId: args.project });
  return { projectId: args.project, emulator: false };
}

export function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

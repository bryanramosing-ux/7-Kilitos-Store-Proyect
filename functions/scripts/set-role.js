#!/usr/bin/env node
// Asigna un rol (admin, encargado o cliente) a una cuenta existente.
// Es el procedimiento seguro para crear el PRIMER administrador: requiere
// credenciales de Google Cloud del propietario, que nunca llegan al navegador.
//
//   Proyecto real:  node functions/scripts/set-role.js --project <id> --email dueña@correo.cl --role admin
//   Emulador:       node functions/scripts/set-role.js --emulator --email admin@demo.test --role admin --create
//
// --create (solo emulador) crea la cuenta con la contraseña indicada en --password.
// Los roles de personal exigen correo verificado. Solo si eres la propietaria y
// sabes con certeza de quién es la cuenta, puedes omitirlo con --allow-unverified.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { assignRole } from '../src/users.js';
import { fail, initAdmin, parseArgs } from './cli.js';

const args = parseArgs();
const target = initAdmin(args);
const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
const role = typeof args.role === 'string' ? args.role : 'admin';
if (!email) fail('Indica --email <correo>.');

const auth = getAuth();
if (args.create) {
  if (!target.emulator) fail('--create solo está permitido con --emulator. En producción la persona se registra en login.html.');
  if (typeof args.password !== 'string' || args.password.length < 8) fail('Indica --password con al menos 8 caracteres.');
  try {
    await auth.createUser({ email, password: args.password, displayName: args.name ?? email, emailVerified: true });
  } catch (error) {
    if (error.code !== 'auth/email-already-exists') throw error;
    // Emulador: una cuenta de prueba existente se marca como verificada.
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { emailVerified: true });
  }
}

const result = await assignRole(getFirestore(), auth, {
  email,
  role,
  actor: { uid: 'cli-set-role', role: 'admin', email: null },
  requireVerifiedEmail: !args['allow-unverified'],
});
console.log(`✔ ${result.email} ahora tiene el rol "${result.role}" en ${target.projectId}.`);
console.log('  La persona debe cerrar sesión y volver a entrar para que el cambio se aplique en su navegador.');
process.exit(0);

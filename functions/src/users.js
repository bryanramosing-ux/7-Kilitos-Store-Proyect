import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { ROLES, STAFF_ROLES } from './config.js';
import { cleanEmail, ensureObject, invalid } from './validation.js';

// Asigna un rol a una cuenta existente. El rol vive en dos lugares que solo el
// servidor puede escribir: el custom claim del token y el espejo users/{uid}.
// Los roles de personal exigen correo VERIFICADO: así nadie puede registrar
// primero el correo de una futura encargada y recibir su rol.
export async function assignRole(db, authAdmin, { email, role, actor, now = Timestamp.now(), requireVerifiedEmail = true }) {
  if (!ROLES.includes(role)) throw invalid('role', 'Selecciona un rol válido.');
  let user;
  try {
    user = await authAdmin.getUserByEmail(email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No existe una cuenta con ese correo. La persona debe registrarse primero.');
    }
    throw error;
  }
  if (STAFF_ROLES.includes(role) && requireVerifiedEmail && !user.emailVerified) {
    throw new HttpsError(
      'failed-precondition',
      'Esta cuenta aún no verificó su correo. Pídele que abra el enlace de verificación que recibió al registrarse y vuelve a intentarlo.',
      { code: 'EMAIL_NOT_VERIFIED' },
    );
  }
  const claims = { ...(user.customClaims ?? {}) };
  if (role === 'cliente') delete claims.role;
  else claims.role = role;
  await authAdmin.setCustomUserClaims(user.uid, claims);
  await db.collection('users').doc(user.uid).set(
    {
      email: user.email ?? email,
      displayName: user.displayName ?? null,
      role,
      updatedAt: now,
      updatedBy: actor.uid,
    },
    { merge: true },
  );
  // Al quitar privilegios se invalidan las sesiones abiertas de esa cuenta.
  if (role === 'cliente') await authAdmin.revokeRefreshTokens(user.uid);
  return { uid: user.uid, email: user.email, role };
}

export async function setUserRole(db, authAdmin, { actor, data }) {
  ensureObject(data, 'data', 'La solicitud');
  const email = cleanEmail(data.email);
  const role = data.role;
  if (actor.email && actor.email.toLowerCase() === email) {
    throw new HttpsError('failed-precondition', 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.');
  }
  return assignRole(db, authAdmin, { email, role, actor });
}

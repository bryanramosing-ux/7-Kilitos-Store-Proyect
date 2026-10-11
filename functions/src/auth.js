import { HttpsError } from 'firebase-functions/v2/https';
import { STAFF_ROLES } from './config.js';

export function requireAuth(auth) {
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para continuar.');
  }
  return auth;
}

// El rol se lee del custom claim (no editable desde el navegador) y se contrasta
// con el espejo en users/{uid}. Si un administrador revoca el rol, el documento
// cambia de inmediato y las operaciones se bloquean aunque el token siga vigente.
export async function requireRole(db, auth, allowedRoles = STAFF_ROLES) {
  requireAuth(auth);
  const claimRole = auth.token?.role;
  if (!claimRole || !allowedRoles.includes(claimRole)) {
    throw new HttpsError('permission-denied', 'No tienes permisos para realizar esta acción.');
  }
  const userSnap = await db.collection('users').doc(auth.uid).get();
  if (!userSnap.exists || userSnap.get('role') !== claimRole) {
    throw new HttpsError('permission-denied', 'Tus permisos cambiaron. Vuelve a iniciar sesión.');
  }
  return { uid: auth.uid, role: claimRole, email: auth.token?.email ?? null };
}

export function actorFromAuth(auth, role) {
  return { uid: auth.uid, role, email: auth.token?.email ?? null };
}

export const SYSTEM_ACTOR = Object.freeze({ uid: 'sistema', role: 'sistema', email: null });

// Sesión y roles en el navegador. El rol se toma del custom claim del token (lo
// asigna solo el servidor). Ocultar botones es solo una ayuda visual: la
// autorización real la aplican las reglas de Firestore/Storage y las Cloud Functions.
import { getServices } from '../firebase/app.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  linkWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  doc,
  getDoc,
} from '../firebase/sdk.js';

export const STAFF_ROLES = ['admin', 'encargado'];

let state = { ready: false, user: null, role: null };
const listeners = new Set();
let started = false;

async function roleOf(user, forceRefresh = false) {
  if (!user || user.isAnonymous) return null;
  const token = await user.getIdTokenResult(forceRefresh);
  return typeof token.claims.role === 'string' ? token.claims.role : null;
}

async function start() {
  if (started) return;
  started = true;
  const { auth } = await getServices();
  onAuthStateChanged(auth, async (user) => {
    let role = null;
    try {
      role = await roleOf(user);
    } catch {
      role = null;
    }
    state = { ready: true, user, role };
    listeners.forEach((listener) => listener(state));
  });
}

export function onSession(listener) {
  listeners.add(listener);
  start();
  if (state.ready) listener(state);
  return () => listeners.delete(listener);
}

export function currentSession() {
  return new Promise((resolve) => {
    const stop = onSession((value) => {
      stop();
      resolve(value);
    });
  });
}

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export async function login(email, password) {
  const { auth } = await getServices();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return { user: credential.user, role: await roleOf(credential.user, true) };
}

// Crea una cuenta de cliente. Si la persona ya compró como invitada, se
// vincula la cuenta para conservar sus pedidos.
export async function register({ name, email, password }) {
  const { auth } = await getServices();
  let user;
  if (auth.currentUser?.isAnonymous) {
    const credential = EmailAuthProvider.credential(email.trim(), password);
    user = (await linkWithCredential(auth.currentUser, credential)).user;
  } else {
    user = (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
  }
  if (name) await updateProfile(user, { displayName: name.trim() });
  // La verificación es necesaria para recibir un rol del equipo; a clientes no les bloquea nada.
  await sendEmailVerification(user).catch(() => {});
  return user;
}

export async function resendVerification() {
  const { auth } = await getServices();
  if (auth.currentUser && !auth.currentUser.isAnonymous) await sendEmailVerification(auth.currentUser);
}

export async function logout() {
  const { auth } = await getServices();
  await signOut(auth);
}

export async function resetPassword(email) {
  const { auth } = await getServices();
  await sendPasswordResetEmail(auth, email.trim());
}

// Para comprar sin cuenta: sesión anónima que permite leer solo los pedidos propios.
export async function ensureBuyerSession() {
  const { auth } = await getServices();
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

/**
 * Protege páginas del panel. Si no hay sesión o el rol no corresponde, redirige.
 * Además confirma el rol contra users/{uid} (igual que las reglas).
 */
export async function requireStaff({ roles = STAFF_ROLES } = {}) {
  const session = await currentSession();
  const next = encodeURIComponent(location.pathname + location.search);
  if (!session.user || session.user.isAnonymous) {
    location.replace(`/login.html?next=${next}`);
    return new Promise(() => {});
  }
  const role = await roleOf(session.user, true);
  let mirrorRole = null;
  try {
    const { db } = await getServices();
    const snap = await getDoc(doc(db, 'users', session.user.uid));
    mirrorRole = snap.exists() ? snap.get('role') : null;
  } catch {
    mirrorRole = null;
  }
  if (isStaffRole(role) && mirrorRole === role && !roles.includes(role)) {
    // Personal autenticado sin acceso a este módulo (p. ej. encargado en Configuración).
    location.replace('/admin/index.html?aviso=solo-admin');
    return new Promise(() => {});
  }
  if (!roles.includes(role) || mirrorRole !== role) {
    location.replace(`/login.html?next=${next}&motivo=sin-permiso`);
    return new Promise(() => {});
  }
  return { user: session.user, role };
}

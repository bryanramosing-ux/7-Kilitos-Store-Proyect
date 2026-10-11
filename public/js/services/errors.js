// Traduce errores de Firebase y de las Cloud Functions a mensajes claros en español.
import { FirebaseConfigError } from '../firebase/app.js';

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
  'auth/wrong-password': 'El correo o la contraseña no son correctos.',
  'auth/user-not-found': 'El correo o la contraseña no son correctos.',
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/email-already-in-use': 'Ya existe una cuenta con este correo. Inicia sesión.',
  'auth/credential-already-in-use': 'Ya existe una cuenta con este correo. Inicia sesión.',
  'auth/weak-password': 'La contraseña debe tener al menos 8 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  'auth/operation-not-allowed': 'Este método de acceso no está habilitado en Firebase Authentication.',
  'auth/admin-restricted-operation': 'El acceso como invitado no está habilitado. Activa "Anónimo" en Firebase Authentication.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
};

const CODE_MESSAGES = {
  'permission-denied': 'No tienes permisos para esta acción.',
  'functions/permission-denied': 'No tienes permisos para esta acción.',
  unavailable: 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
  'functions/unavailable': 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
  'functions/deadline-exceeded': 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
  'functions/internal': 'Ocurrió un error en el servidor. Si se repite, avísale a la tienda.',
  'functions/not-found': 'No se encontró el recurso solicitado.',
  'functions/unauthenticated': 'Tu sesión expiró. Vuelve a iniciar sesión.',
  'failed-precondition': 'Falta un índice o configuración en Firestore.',
  'not-found': 'No se encontró la información solicitada.',
};

export function friendlyError(error) {
  if (!error) return 'Ocurrió un error inesperado.';
  if (error instanceof FirebaseConfigError) return error.message;
  if (globalThis.navigator && navigator.onLine === false) return 'Estás sin conexión. Revisa tu internet e inténtalo de nuevo.';
  const code = error.code ?? '';
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  // Las Cloud Functions de la tienda ya devuelven mensajes en español.
  if (code.startsWith('functions/') && !['functions/internal', 'functions/unavailable'].includes(code) && error.message) {
    return error.message;
  }
  return CODE_MESSAGES[code] ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

// Datos estructurados que envían las Cloud Functions (OUT_OF_STOCK, PRICE_CHANGED…).
export function errorDetails(error) {
  return error?.details ?? null;
}

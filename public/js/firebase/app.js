// Punto único de inicialización de Firebase. Todos los módulos obtienen los
// servicios desde aquí; nunca se inicializa la app en otro lugar.
import { appCheck, emulators, firebaseConfig, functionsRegion } from './config.js';
import { initializeApp, getFirestore, connectFirestoreEmulator, getAuth, connectAuthEmulator } from './sdk.js';

export class FirebaseConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FirebaseConfigError';
  }
}

const isLocalHost = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
export const usingEmulators = emulators.enabled === true || (emulators.enabled === 'auto' && isLocalHost);

function isConfigured(config) {
  return Object.values(config).every((value) => typeof value === 'string' && value && !value.includes('PENDIENTE'));
}

async function resolveConfig() {
  if (usingEmulators) {
    // Proyecto "demo-*": solo existe en el emulador; no son credenciales reales.
    return {
      apiKey: 'demo-api-key',
      authDomain: `${emulators.projectId}.firebaseapp.com`,
      projectId: emulators.projectId,
      storageBucket: `${emulators.projectId}.appspot.com`,
      appId: 'demo-app',
    };
  }
  if (isConfigured(firebaseConfig)) return firebaseConfig;
  try {
    const response = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (response.ok) {
      const config = await response.json();
      if (config?.projectId && config?.apiKey) return config;
    }
  } catch {
    // Sin Firebase Hosting: se informa abajo.
  }
  throw new FirebaseConfigError(
    'La tienda todavía no está conectada a Firebase. Completa public/js/firebase/config.js (ver README).',
  );
}

let servicesPromise;
export function getServices() {
  servicesPromise ??= (async () => {
    const config = await resolveConfig();
    const app = initializeApp(config);
    if (!usingEmulators && appCheck.siteKey) {
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('./sdk-app-check.js');
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheck.siteKey), isTokenAutoRefreshEnabled: true });
    }
    const db = getFirestore(app);
    const auth = getAuth(app);
    auth.languageCode = 'es';
    if (usingEmulators) {
      connectFirestoreEmulator(db, emulators.host, emulators.ports.firestore);
      connectAuthEmulator(auth, `http://${emulators.host}:${emulators.ports.auth}`, { disableWarnings: true });
    }
    return { app, db, auth, config };
  })();
  return servicesPromise;
}

let functionsPromise;
export function getFunctionsService() {
  functionsPromise ??= (async () => {
    const { app } = await getServices();
    const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('./sdk-functions.js');
    const functions = getFunctions(app, functionsRegion);
    if (usingEmulators) connectFunctionsEmulator(functions, emulators.host, emulators.ports.functions);
    return { functions, httpsCallable };
  })();
  return functionsPromise;
}

let storagePromise;
export function getStorageService() {
  storagePromise ??= (async () => {
    const { app } = await getServices();
    const sdk = await import('./sdk-storage.js');
    const storage = sdk.getStorage(app);
    if (usingEmulators) sdk.connectStorageEmulator(storage, emulators.host, emulators.ports.storage);
    return { storage, ...sdk };
  })();
  return storagePromise;
}

// Llama una Cloud Function callable por nombre.
export async function callFunction(name, data) {
  const { functions, httpsCallable } = await getFunctionsService();
  const callable = httpsCallable(functions, name, { timeout: 30000 });
  const result = await callable(data);
  return result.data;
}

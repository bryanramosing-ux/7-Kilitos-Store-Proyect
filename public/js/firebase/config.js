// Configuración PÚBLICA de la app web de Firebase.
// Estos valores no son secretos (identifican el proyecto); la protección de los
// datos la dan Authentication, las reglas de seguridad y las Cloud Functions.
//
// PENDIENTE DE CONFIGURACIÓN: reemplaza los valores PENDIENTE_* con los que
// aparecen en Consola Firebase → Configuración del proyecto → Tus apps → App web.
// Si publicas con Firebase Hosting puedes dejarlos así: la app leerá la
// configuración automáticamente desde /__/firebase/init.json.
export const firebaseConfig = {
  apiKey: 'PENDIENTE_API_KEY',
  authDomain: 'PENDIENTE_PROYECTO.firebaseapp.com',
  projectId: 'PENDIENTE_PROYECTO',
  storageBucket: 'PENDIENTE_PROYECTO.firebasestorage.app',
  messagingSenderId: 'PENDIENTE_SENDER_ID',
  appId: 'PENDIENTE_APP_ID',
};

// Debe coincidir con REGION en functions/src/config.js.
export const functionsRegion = 'southamerica-west1';

// App Check (opcional, recomendado): clave de sitio de reCAPTCHA Enterprise.
// Déjala vacía hasta configurarla en la consola.
export const appCheck = { siteKey: '' };

// Local Emulator Suite. 'auto' = se usa al abrir la app en localhost/127.0.0.1.
export const emulators = {
  enabled: 'auto',
  projectId: 'demo-7kilitos',
  host: '127.0.0.1',
  ports: { auth: 9099, firestore: 8080, functions: 5001, storage: 9199 },
};

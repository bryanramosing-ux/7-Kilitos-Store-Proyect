// SDK modular oficial de Firebase cargado desde el CDN de Firebase.
// La versión se define solo en los archivos sdk-*.js de esta carpeta.
export { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';

export {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
  Timestamp,
  documentId,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export {
  getAuth,
  connectAuthEmulator,
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
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

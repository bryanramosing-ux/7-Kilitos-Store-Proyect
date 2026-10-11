// Configuración pública de la tienda (storeSettings/public).
import { getServices } from '../firebase/app.js';
import { doc, getDoc, setDoc, serverTimestamp } from '../firebase/sdk.js';

// Valores mínimos para que la interfaz funcione si la configuración aún no existe.
// No contienen datos comerciales: la tienda mostrará que falta configurarla.
export const EMPTY_SETTINGS = Object.freeze({
  storeName: '7 Kilitos Store',
  tagline: '',
  instagram: '',
  contact: { email: '', phone: '', whatsapp: '', location: '' },
  announcement: '',
  hero: {},
  highlights: [],
  promo: {},
  communityText: '',
  freeShippingThreshold: null,
  deliveryMethods: [],
  paymentMethods: [],
  lowStockDefault: 5,
  orderHoldHours: 48,
  demoMode: false,
  missing: true,
});

let cached;
export function getSettings({ fresh = false } = {}) {
  if (!cached || fresh) {
    cached = (async () => {
      const { db } = await getServices();
      const snap = await getDoc(doc(db, 'storeSettings', 'public'));
      if (!snap.exists()) return { ...EMPTY_SETTINGS };
      return { ...EMPTY_SETTINGS, ...snap.data(), missing: false };
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

const ALLOWED_KEYS = [
  'storeName', 'tagline', 'instagram', 'contact', 'announcement', 'hero', 'highlights', 'promo',
  'communityText', 'freeShippingThreshold', 'deliveryMethods', 'paymentMethods', 'lowStockDefault',
  'orderHoldHours', 'demoMode',
];

export async function saveSettings(values) {
  const { db, auth } = await getServices();
  const data = Object.fromEntries(ALLOWED_KEYS.map((key) => [key, values[key]]));
  await setDoc(doc(db, 'storeSettings', 'public'), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
  cached = null;
}

export function activeDeliveryMethods(settings) {
  return (settings.deliveryMethods ?? []).filter((m) => m.active);
}

export function activePaymentMethods(settings) {
  return (settings.paymentMethods ?? []).filter((m) => m.active);
}

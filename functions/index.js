import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { REGION, TIME_ZONE } from './src/config.js';
import { requireRole, actorFromAuth } from './src/auth.js';
import { createOrder as createOrderLogic, applyOrderTransition, parseTransitionInput, expirePendingOrders } from './src/orders.js';
import { adjustStock as adjustStockLogic } from './src/inventory.js';
import { saveProduct as saveProductLogic, setProductActive as setProductActiveLogic } from './src/products.js';
import { setUserRole as setUserRoleLogic } from './src/users.js';

initializeApp();
const db = getFirestore();

// maxInstances limita el gasto ante picos o abusos. Ajustar si el tráfico crece.
setGlobalOptions({ region: REGION, maxInstances: 10, memory: '256MiB' });

// Para exigir App Check (recomendado en producción) cambia a `true` después de
// configurarlo en la consola y en public/js/firebase/config.js.
const callableOptions = { enforceAppCheck: false };

export const createOrder = onCall(callableOptions, (request) =>
  createOrderLogic(db, { auth: request.auth, data: request.data, ip: request.rawRequest?.ip ?? null }),
);

export const updateOrderStatus = onCall(callableOptions, async (request) => {
  const staff = await requireRole(db, request.auth, ['admin', 'encargado']);
  const input = parseTransitionInput(request.data);
  return applyOrderTransition(db, {
    orderId: input.orderId,
    target: input.target,
    note: input.note,
    paymentReference: input.paymentReference,
    actor: actorFromAuth(request.auth, staff.role),
  });
});

export const adjustStock = onCall(callableOptions, async (request) => {
  const staff = await requireRole(db, request.auth, ['admin', 'encargado']);
  return adjustStockLogic(db, { actor: actorFromAuth(request.auth, staff.role), data: request.data });
});

export const saveProduct = onCall(callableOptions, async (request) => {
  const staff = await requireRole(db, request.auth, ['admin']);
  return saveProductLogic(db, { actor: actorFromAuth(request.auth, staff.role), data: request.data });
});

export const setProductActive = onCall(callableOptions, async (request) => {
  const staff = await requireRole(db, request.auth, ['admin']);
  return setProductActiveLogic(db, { actor: actorFromAuth(request.auth, staff.role), data: request.data });
});

export const setUserRole = onCall(callableOptions, async (request) => {
  const staff = await requireRole(db, request.auth, ['admin']);
  return setUserRoleLogic(db, getAuth(), { actor: actorFromAuth(request.auth, staff.role), data: request.data });
});

// Requiere Cloud Scheduler (plan Blaze). Cancela pedidos pendientes vencidos y
// devuelve su stock según storeSettings/public.orderHoldHours.
export const expireOrders = onSchedule({ schedule: 'every 60 minutes', timeZone: TIME_ZONE }, async () => {
  const result = await expirePendingOrders(db);
  logger.info('Vencimiento de pedidos pendientes', result);
});

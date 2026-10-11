// Parámetros de negocio compartidos por todas las funciones.
// La región debe coincidir con `functionsRegion` en public/js/firebase/config.js.
export const REGION = 'southamerica-west1';
export const TIME_ZONE = 'America/Santiago';

export const ROLES = Object.freeze(['admin', 'encargado', 'cliente']);
export const STAFF_ROLES = Object.freeze(['admin', 'encargado']);

export const LIMITS = Object.freeze({
  maxOrderLines: 30,
  maxLineQuantity: 99,
  maxPendingOrdersPerUser: 5,
  maxOrdersPerIpPerHour: 20,
  maxStockMovement: 100000,
  maxPrice: 10000000,
  maxImages: 8,
  maxOptionGroups: 3,
  maxOptionValues: 12,
  maxFeatures: 8,
  expireBatchSize: 50,
});

export const ORDER_NUMBER_PREFIX = '7K-';

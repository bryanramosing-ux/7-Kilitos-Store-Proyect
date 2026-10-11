# CLAUDE.md: guía para trabajar en 7 Kilitos Store

Tienda online + panel administrativo en HTML/CSS/JS sin frameworks ni compilación, con Firebase. Interfaz y mensajes **en español de Chile**, montos en **CLP enteros**, fechas en **America/Santiago**.

## Comandos

```bash
npm run setup          # dependencias (raíz + functions/)
npm run dev            # emuladores: Auth, Firestore, Functions, Storage, Hosting (127.0.0.1:5000)
npm run seed:emulator  # datos demostrativos (idempotente)
npm test               # unitarias + emulador + E2E
npm run test:unit | test:emulated | test:e2e
npm run lint
npm run icons          # tras usar un icono nuevo; check:icons lo verifica
```

## Reglas del proyecto

- **Integridad comercial primero.** Productos, stock, pedidos, ventas, movimientos y roles se escriben **solo** en Cloud Functions (`functions/src/`) con transacciones. Las reglas niegan esas escrituras a cualquier cliente; no las abras.
- **Nunca confiar en el navegador:** precios, totales, stock y transiciones se recalculan en el servidor. Las copias en el cliente (`public/js/utils/pricing.js`, `status.js`, `validation.js`) son solo para mostrar; si cambias la lógica del servidor, actualiza la copia y las pruebas `tests/unit/logic.test.js` que verifican que coincidan.
- **Idempotencia:** `createOrder` y `adjustStock` usan `requestId` (UUID) como ID de documento; las transiciones de estado son no-op si se repiten. Mantén eso en cualquier operación nueva.
- **Historial inalterable:** no se borran ventas ni movimientos; se anulan. Los productos se despublican, no se eliminan.
- **Roles:** custom claim `role` + espejo `users/{uid}`; reglas y funciones exigen ambos. Solo `setUserRole` o `functions/scripts/set-role.js` los cambian.
- **HTML seguro:** pinta con la plantilla `html``…``` de `public/js/utils/html.js` (escapa todo) y `setHtml`. No uses `innerHTML` con datos externos. URLs externas por `safeUrl`.
- **Firebase se inicializa solo en `public/js/firebase/app.js`.** La versión del SDK está fijada en `public/js/firebase/sdk*.js`.
- **Diseño:** usa los tokens de `public/css/tokens.css` (paleta Pastel Whimsy de `referencias/.../DESIGN.md`). Comfortaa para títulos, Quicksand para el resto. Estados siempre con icono + texto, no solo color. Respeta `prefers-reduced-motion`.
- **Sin datos inventados:** nada de reseñas, estadísticas o promesas comerciales ficticias. Los datos de ejemplo van marcados (`isDemo`, `demoMode`).
- No modifiques `referencias/`: es el material original del diseño.

## Mapa rápido

- Tienda: `public/*.html` → `public/js/store/pages/*.js` (estructura común en `store/layout.js`).
- Panel: `public/admin/*.html` → `public/js/admin/*.js` (protección y menú en `admin/shell.js`).
- Datos: `public/js/services/*.js`. Lógica pura y testeable: `public/js/utils/*.js`, `store/cart-view.js`.
- Servidor: `functions/index.js` (exporta funciones) y `functions/src/*.js` (lógica testeable con emulador).
- Reglas: `firestore.rules`, `storage.rules`; índices en `firestore.indexes.json`.
- Pruebas E2E: `tests/e2e/` (los archivos se ejecutan en orden 1-, 2-, 3-; `global-setup.js` reinicia y siembra el emulador).

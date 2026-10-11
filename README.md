# 7 Kilitos Store

Tienda online y panel administrativo para **7 Kilitos Store** (papelería, planners, stickers, washi tapes y artículos kawaii), construidos con HTML, CSS y JavaScript sin frameworks, y **Firebase** (Authentication, Cloud Firestore, Cloud Storage, Cloud Functions, Security Rules y Hosting).

- **Tienda pública:** catálogo con búsqueda, filtros y orden; ficha de producto; carrito; checkout que registra pedidos pendientes de confirmación; seguimiento del pedido; cuenta de cliente.
- **Panel administrativo:** resumen con indicadores, pedidos y ventas, productos e imágenes, categorías, inventario con historial, reportes con exportación CSV, configuración de la tienda y usuarios/roles.

> **Estado:** la aplicación funciona completa contra **Firebase Local Emulator Suite** y está probada (88 pruebas automatizadas, ver [Resultados de las pruebas](#resultados-de-las-pruebas)). **Todavía no está conectada a un proyecto Firebase real**: eso requiere tus credenciales y los pasos marcados como *acción de la propietaria* más abajo.

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Instalación y organización del proyecto](#2-instalación-y-organización-del-proyecto)
3. [Crear el proyecto Firebase](#3-crear-el-proyecto-firebase)
4. [Registrar la aplicación web](#4-registrar-la-aplicación-web)
5. [Activar Authentication](#5-activar-authentication)
6. [Crear Firestore](#6-crear-firestore)
7. [Configurar Storage](#7-configurar-storage)
8. [Roles y primer administrador](#8-roles-y-primer-administrador)
9. [Cloud Functions](#9-cloud-functions)
10. [Aplicar y probar las reglas de seguridad](#10-aplicar-y-probar-las-reglas-de-seguridad)
11. [Variables y archivos de ejemplo](#11-variables-y-archivos-de-ejemplo)
12. [Ejecución local](#12-ejecución-local)
13. [Pruebas](#13-pruebas)
14. [Despliegue en Firebase Hosting](#14-despliegue-en-firebase-hosting)
15. [Facturación y servicios que requieren habilitación](#15-facturación-y-servicios-que-requieren-habilitación)

También: [Arquitectura](#arquitectura) · [Pedidos, ventas e inventario](#pedidos-ventas-e-inventario) · [Seguridad](#seguridad) · [Resultados de las pruebas](#resultados-de-las-pruebas) · [Decisiones y limitaciones](#decisiones-y-limitaciones) · [Solución de problemas](#solución-de-problemas)

---

## Arquitectura

```
7-Kilitos-Store-Proyect/
├── public/                    ← todo lo que se publica en Firebase Hosting
│   ├── index.html, catalogo.html, producto.html, carrito.html, checkout.html,
│   │   pedido.html, cuenta.html, login.html, ayuda.html, 404.html
│   ├── admin/                 ← index (resumen), pedidos, ventas, productos, categorias,
│   │                            inventario, reportes, configuracion, usuarios
│   ├── css/                   ← tokens.css (marca), base.css, components.css, store.css, admin.css
│   ├── assets/                ← logo (desde las referencias), favicon e ilustraciones SVG
│   └── js/
│       ├── firebase/          ← config.js (configuración pública) y app.js (inicialización única)
│       ├── auth/              ← sesión, roles y protección de páginas
│       ├── services/          ← acceso a datos (catálogo, pedidos, ventas, inventario, admin)
│       ├── components/        ← notificaciones, diálogos y estados de carga/vacío/error
│       ├── utils/             ← formato CLP, fechas en hora de Chile, validación, CSV, HTML seguro
│       ├── store/             ← tienda: estructura, tarjetas, carrito, favoritos y páginas
│       └── admin/             ← panel: estructura, gráficos, filtros y páginas
├── functions/                 ← Cloud Functions (JavaScript, Node 22)
│   ├── index.js               ← funciones publicadas
│   ├── src/                   ← lógica: pedidos, inventario, productos, roles, validación
│   └── scripts/               ← seed.js (datos iniciales) y set-role.js (primer administrador)
├── tests/
│   ├── unit/                  ← lógica pura (node:test)
│   ├── rules/                 ← reglas de Firestore y Storage (emulador)
│   ├── functions/             ← pedidos, ventas, stock y roles contra el emulador
│   └── e2e/                   ← recorridos reales en el navegador (Playwright)
├── referencias/               ← material de diseño original (ZIP de Stitch), sin modificar
├── firestore.rules · storage.rules · firestore.indexes.json · firebase.json
└── README.md · CLAUDE.md · .env.example · .firebaserc.example
```

**Por qué así:** no hay paso de compilación. Los módulos ES se cargan directamente y el SDK modular oficial de Firebase viene del CDN de Firebase, con la versión fijada en `public/js/firebase/sdk*.js`. Las operaciones comerciales críticas viven en Cloud Functions; el navegador solo puede leer lo que las reglas permiten.

### Colecciones de Firestore

| Colección | Propósito | Lectura | Escritura |
|---|---|---|---|
| `products/{id}` | Catálogo: SKU, nombre, descripción, características, categoría, precio, precio anterior, stock, umbral, imágenes, opciones, etiqueta, destacado, publicado, `salesCount`, fechas | Público si `active == true`; personal ve todo | Solo Cloud Functions |
| `productPrivate/{id}` | Costo de adquisición (privado) | Administración | Solo Cloud Functions |
| `categories/{slug}` | Categorías: nombre, icono, color, ilustración, orden, visible | Público si `active`; personal ve todo | Administración (validado por reglas) |
| `storeSettings/public` | Datos de contacto, Instagram, mensajes, envío gratis, métodos de entrega y pago, umbral de stock, horas de reserva, aviso de demostración | Público | Administración (validado por reglas) |
| `orders/{requestId}` | Pedido con **instantánea** de cliente, entrega, pago, líneas (nombre, SKU y precio unitario al momento de pedir), totales, estado e historial | La persona que lo creó y el personal | Solo Cloud Functions |
| `sales/{orderId}` | Venta confirmada (se crea al registrar el pago). Conserva precios aplicados; si se anula queda como `anulada` | Personal | Solo Cloud Functions |
| `saleCosts/{orderId}` | Costo histórico por línea, congelado al registrar el pago | Administración | Solo Cloud Functions |
| `inventoryMovements/{id}` | Movimientos: tipo, cantidad, stock antes/después, motivo, usuario, fecha y pedido asociado | Personal | Solo Cloud Functions |
| `users/{uid}` | Espejo del rol (`admin`/`encargado`) para listar el equipo y revocar al instante | Propio o administración | Solo Cloud Functions / script |
| `skus`, `counters`, `rateLimits` | Unicidad de SKU, correlativo de pedidos y límite de pedidos por IP | Nadie (cliente) | Solo Cloud Functions |

**Instantáneas históricas:** pedidos y ventas guardan nombre, SKU y precio de cada línea al momento de la operación. Cambiar después el producto no reescribe la historia. `saleCosts` congela el costo vigente al registrar el pago.

### Roles y permisos

| Módulo | Administración | Encargado/a | Cliente |
|---|---|---|---|
| Resumen, pedidos, ventas, inventario (movimientos) | ✔ | ✔ | — |
| Cancelar un pedido **pagado** (anula la venta) | ✔ | — | — |
| Productos: crear, editar precios, imágenes, publicar | ✔ | Solo lectura | — |
| Costos y beneficio estimado | ✔ | — | — |
| Reportes y exportación CSV | ✔ | ✔ (sin costos) | — |
| Categorías, configuración, usuarios y roles | ✔ | — | — |
| Tienda, carrito, pedidos propios | ✔ | ✔ | ✔ (solo los suyos) |

El rol se guarda como *custom claim* del token (solo el servidor puede asignarlo) y se replica en `users/{uid}`. Reglas y funciones exigen **ambos**: si un administrador quita un rol, el acceso a datos y operaciones se corta de inmediato.

### Cloud Functions

| Función | Quién | Qué hace |
|---|---|---|
| `createOrder` | Cualquier sesión (incluye invitada anónima) | Valida datos, productos publicados, opciones, **precio oficial**, stock y método de entrega/pago; **reserva el stock** en una transacción; crea el pedido `pendiente`. Idempotente por `requestId`. |
| `updateOrderStatus` | Personal | Cambia el estado según transiciones válidas; registra la venta al pasar a `pagado`; al cancelar devuelve el stock una sola vez y anula la venta si existía. Idempotente. |
| `adjustStock` | Personal | Entrada, salida o ajuste por conteo con motivo; nunca deja stock negativo. Idempotente por `requestId`. |
| `saveProduct` / `setProductActive` | Administración | Crea/edita productos (precios válidos, descuento coherente, SKU único, imágenes de Storage); el stock solo cambia con movimientos. |
| `setUserRole` | Administración | Asigna `admin`, `encargado` o `cliente` por correo; nadie cambia su propio rol. |
| `expireOrders` (programada, cada hora) | Sistema | Cancela pedidos `pendiente` más antiguos que `orderHoldHours` y devuelve su stock. |

---

## Pedidos, ventas e inventario

```
            ┌────────────┐   confirmar   ┌────────────┐
 crear ───▶ │ pendiente  │ ────────────▶ │ confirmado │
 (reserva   └─────┬──────┘               └─────┬──────┘
  stock)          │ registrar pago             │ registrar pago
                  ▼                            ▼
             ┌──────────┐  marcar entregado  ┌───────────┐
             │  pagado  │ ─────────────────▶ │ entregado │ (final)
             └────┬─────┘                    └───────────┘
                  │ cancelar (solo administración)
   pendiente/confirmado/pagado ──▶ cancelado (final)
```

- **Cuándo se descuenta el inventario:** al **crear** el pedido (reserva). Así dos compras simultáneas nunca venden la misma unidad. Queda un movimiento `reserva_pedido`.
- **Cuándo es una venta:** solo al pasar a **pagado**. Se crea `sales/{orderId}` (el ID del pedido impide duplicados) y `saleCosts/{orderId}`. Pendientes y confirmados **no** son ingresos.
- **Cancelación:** devuelve el stock reservado **una sola vez** (`stockRestored`) con un movimiento `devolucion_cancelacion`. Si el pedido estaba pagado, la venta queda **anulada** (no se borra) y deja de sumar en reportes.
- **Entregado** es final. Las devoluciones posteriores se registran como *entrada* de inventario con su motivo.
- **Vencimiento:** los pedidos `pendiente` sin atender en `orderHoldHours` horas (48 por defecto, configurable; 0 desactiva) se cancelan automáticamente.
- **Pagos:** no hay pasarela de pago ni se simulan cobros. La tienda confirma cada pago manualmente (transferencia, efectivo, etc.). Ver [cómo integrar un proveedor real](#integrar-un-proveedor-de-pagos).

---

## Seguridad

- **Denegación por defecto** en `firestore.rules` y `storage.rules`; solo se concede lo necesario.
- El catálogo público solo expone productos publicados; el costo vive aparte (`productPrivate`).
- **Ningún cliente escribe** productos, stock, pedidos, ventas, movimientos ni roles: todo pasa por Cloud Functions con validación y transacciones.
- El precio enviado por el navegador **se ignora**: el total se calcula con precios de Firestore y, si no coincide con el que vio la clienta, se rechaza con `PRICE_CHANGED` para que lo revise.
- Imágenes: solo administración sube JPEG/PNG/WebP de hasta 3 MB en `products/{id}/`, sin sobrescribir (se excluye SVG por riesgo de scripts).
- Interfaz: todo el HTML dinámico se escapa (`html```), las URLs se filtran y el CSV neutraliza fórmulas.
- Los roles del equipo solo se asignan a cuentas con **correo verificado**.
- Límite de 5 pedidos pendientes por cuenta y 20 pedidos por hora por IP; `maxInstances: 10` en las funciones.
- Encabezados de seguridad en Hosting (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`) y `noindex` en `/admin/`.
- Ocultar un botón **no** es seguridad: cada permiso se vuelve a verificar en reglas o funciones (las pruebas lo comprueban).

---

## 1. Requisitos previos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22 o superior | Scripts, pruebas y Cloud Functions (runtime `nodejs22`) |
| Java (JDK) | 21 o superior | Emuladores de Firestore y Storage |
| Cuenta de Google | — | Consola de Firebase |
| Plan **Blaze** de Firebase | — | Cloud Functions, Storage y Cloud Scheduler (ver [facturación](#15-facturación-y-servicios-que-requieren-habilitación)) |

La CLI de Firebase viene como dependencia de desarrollo: se usa con `npx firebase …` (no hace falta instalarla global).

## 2. Instalación y organización del proyecto

```bash
git clone https://github.com/bryanramosing-ux/7-Kilitos-Store-Proyect.git
cd 7-Kilitos-Store-Proyect
npm run setup        # instala dependencias de la raíz y de functions/
```

El material de referencia del diseño está en `referencias/stitch_7_kilitos_store_ui/` tal como venía en el ZIP.

## 3. Crear el proyecto Firebase

*Acción de la propietaria.*

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** (por ejemplo `7kilitos-store`).
2. Google Analytics es opcional (la app no lo usa).
3. En tu terminal:

```bash
npx firebase login
npx firebase use --add          # elige el proyecto y ponle el alias "default"
```

Esto crea `.firebaserc` (está en `.gitignore`; hay un ejemplo en `.firebaserc.example`).

## 4. Registrar la aplicación web

*Acción de la propietaria.*

1. Consola → ⚙ **Configuración del proyecto** → **Tus apps** → icono **</>** (Web). No hace falta marcar Hosting en este paso.
2. Copia el objeto `firebaseConfig` en `public/js/firebase/config.js`, reemplazando los valores `PENDIENTE_*`.

> Estos valores **no son secretos** (identifican el proyecto). Si publicas con Firebase Hosting puedes dejar `config.js` sin tocar: la app lee la configuración desde `/__/firebase/init.json`, que Hosting sirve automáticamente.

Si cambias la región de las funciones, actualiza `functionsRegion` en `config.js` y `REGION` en `functions/src/config.js` (deben coincidir).

## 5. Activar Authentication

*Acción de la propietaria.* Consola → **Authentication** → **Comenzar** → **Método de acceso**:

1. Habilita **Correo electrónico/contraseña** (cuentas de clientes y del equipo).
2. Habilita **Anónimo** (permite comprar sin crear cuenta; cada compradora solo ve sus propios pedidos).
3. **Configuración → Dominios autorizados:** agrega tu dominio si usas uno propio (los de `web.app`/`firebaseapp.com` ya están).
4. Opcional: en **Plantillas** cambia el idioma a español para el correo de recuperación de contraseña.

## 6. Crear Firestore

*Acción de la propietaria.*

1. Consola → **Firestore Database** → **Crear base de datos** → modo **producción** (las reglas del repositorio reemplazan las iniciales).
2. Ubicación recomendada: `southamerica-west1` (Santiago). **La ubicación no se puede cambiar después.**
3. Publica reglas e índices:

```bash
npx firebase deploy --only firestore
```

El archivo de índices también activa una política **TTL** sobre `rateLimits.expireAt` para que los contadores de límite se borren solos.

## 7. Configurar Storage

*Acción de la propietaria.* Requiere plan **Blaze** (los buckets nuevos de Cloud Storage para Firebase lo exigen).

1. Consola → **Storage** → **Comenzar** → modo producción, misma región que Firestore.
2. Publica las reglas:

```bash
npx firebase deploy --only storage
```

## 8. Roles y primer administrador

No existen contraseñas predeterminadas. El primer administrador se crea así:

1. La dueña **se registra** en `https://<tu-sitio>/login.html?modo=registro` con su correo y **abre el enlace de verificación** que recibe (los roles del equipo solo se asignan a correos verificados).
2. En tu computador, autentícate con tu cuenta de Google (no hace falta descargar claves):

```bash
gcloud auth application-default login
```

3. Asigna el rol con el script (usa el Admin SDK con tus credenciales; nunca pasa por el navegador):

```bash
node functions/scripts/set-role.js --project <ID-DEL-PROYECTO> --email duena@correo.cl --role admin
```

4. La persona cierra sesión y vuelve a entrar. Desde entonces, los demás roles se gestionan en **Panel → Usuarios y roles** (la persona primero se registra y verifica su correo; luego se le asigna `encargado` o `admin` por correo).

> ¿Por qué exigir correo verificado? Firebase permite registrar cualquier correo sin comprobarlo. Sin esta exigencia, alguien que supiera a quién vas a dar acceso podría registrar ese correo antes y recibir el rol. Si de verdad necesitas omitirlo para la primera cuenta, el script acepta `--allow-unverified` (solo bajo tu responsabilidad).

## 9. Cloud Functions

*Acción de la propietaria:* requiere plan **Blaze** (ver punto 15).

```bash
npm --prefix functions install            # si no ejecutaste "npm run setup"
npx firebase deploy --only functions
```

- Región por defecto: `southamerica-west1` (solo 2.ª generación; tarifa de nivel 2). Puedes usar `us-central1` (nivel 1) cambiando `REGION` y `functionsRegion`.
- `expireOrders` es una función programada: el despliegue habilita **Cloud Scheduler** automáticamente.
- **App Check (recomendado en producción):** registra la app con reCAPTCHA Enterprise en la consola, pon la clave de sitio en `appCheck.siteKey` (`config.js`) y cambia `enforceAppCheck` a `true` en `functions/index.js`.

## 10. Aplicar y probar las reglas de seguridad

```bash
npm run test:emulated                     # reglas de Firestore/Storage + lógica de funciones (emulador)
npx firebase deploy --only firestore:rules,storage   # publicar reglas
```

Las pruebas de reglas usan identidades distintas (visitante, cliente, encargado, administrador, token con rol falsificado) y verifican que las operaciones prohibidas fallen.

## 11. Variables y archivos de ejemplo

| Archivo | ¿Se versiona? | Contenido |
|---|---|---|
| `public/js/firebase/config.js` | Sí | Configuración **pública** de la app web (pendiente de completar o automática con Hosting) |
| `.firebaserc` | No (`.firebaserc.example`) | Alias del proyecto para la CLI |
| `.env` | No (`.env.example`) | Solo para scripts locales; la app web no usa secretos |
| Claves de cuenta de servicio | **Nunca** | Si las usas, guárdalas fuera del repositorio (`GOOGLE_APPLICATION_CREDENTIALS`) |

Antes de publicar revisa: `config.js` completo (o Hosting), región de funciones coincidente, y que no haya archivos `*.json` de credenciales en el repositorio.

## 12. Ejecución local

Todo funciona sin un proyecto real usando el proyecto de demostración `demo-7kilitos` del emulador:

```bash
npm run dev                                # Auth, Firestore, Functions, Storage y Hosting emulados
# en otra terminal:
npm run seed:emulator                      # datos demostrativos (idempotente)
npm run admin:emulator -- --email admin@demo.test --role admin --create --password "una-clave-local"
```

- Tienda: <http://127.0.0.1:5000> · Panel: <http://127.0.0.1:5000/admin/> · UI de emuladores: <http://127.0.0.1:4000>
- En `localhost`/`127.0.0.1` la app se conecta sola a los emuladores y muestra el aviso "Modo local".
- La función programada no corre sola en el emulador (requiere el emulador de Pub/Sub); su lógica está cubierta por las pruebas.

## 13. Pruebas

```bash
npm test                 # todo: unitarias + emulador + navegador
npm run test:unit        # lógica pura (sin emulador)
npm run test:emulated    # reglas + Cloud Functions contra emuladores
npm run test:e2e         # Playwright (levanta emuladores, siembra datos y recorre la app)
npm run lint             # ESLint
npm run check:icons      # verifica el subconjunto de iconos de las páginas
```

Para E2E, Playwright necesita Chromium (`npx playwright install chromium` si no lo tienes). Las pruebas sirven el SDK de Firebase desde `node_modules/firebase` (los mismos archivos del CDN oficial) para no depender de la red.

Si agregas un icono nuevo (`icon('nombre')`), ejecuta `npm run icons` para actualizar el enlace de la fuente en todas las páginas.

## 14. Despliegue en Firebase Hosting

*Acción de la propietaria* (publica el sitio):

```bash
npx firebase deploy                        # Hosting + reglas + índices + funciones
# o por partes:
npx firebase deploy --only hosting
```

**Datos iniciales en producción (opcional):** carga configuración y categorías de ejemplo y, si quieres, los productos demostrativos:

```bash
node functions/scripts/seed.js --project <ID> --confirm --only settings,categories
node functions/scripts/seed.js --project <ID> --confirm              # incluye productos de demostración
```

Luego, en el panel: reemplaza productos, precios, costos de envío y textos de ejemplo por los reales, sube fotos y **desactiva el aviso de demostración** en *Configuración*.

## 15. Facturación y servicios que requieren habilitación

- **Plan Blaze (pago por uso)** es obligatorio para Cloud Functions, para crear el bucket de Storage y para Cloud Scheduler. Blaze incluye cuotas gratuitas mensuales; una tienda pequeña normalmente se mantiene en ellas o con costos bajos, pero **no hay garantía**: configura una **alerta de presupuesto** en Google Cloud Billing antes de desplegar.
- `southamerica-west1` tiene tarifas de nivel 2 (algo más altas que `us-central1`).
- Firestore, Authentication y Hosting tienen cuotas gratuitas; el uso adicional se cobra.
- En este trabajo **no se desplegó nada ni se generaron gastos**: todo se ejecutó contra emuladores locales.

---

## Resultados de las pruebas

Ejecutadas el 11-10-2026 en este repositorio (Node 22, Java 21, Firebase CLI 15.33, Chromium de Playwright 1.56):

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias | `npm run test:unit` | **23/23** ✔ |
| Reglas + Cloud Functions (emulador) | `npm run test:emulated` | **44/44** ✔ (18 de reglas, 26 de lógica) |
| Extremo a extremo (navegador) | `npm run test:e2e` | **21/21** ✔ |
| Lint | `npm run lint` | 0 problemas en 77 archivos |

Cobertura de las comprobaciones pedidas:

| Comprobación | Dónde |
|---|---|
| 1. La tienda carga sin errores de JavaScript | E2E: todas las pruebas exigen 0 errores de consola |
| 2. Productos desde Firebase | E2E portada/catálogo (datos sembrados en el emulador) |
| 3–4. Categorías, filtros y buscador | E2E catálogo (categoría, búsqueda sin tildes, sin resultados, orden por precio) |
| 5. Ficha del producto seleccionado | E2E ficha (precio, descuento, stock, opciones obligatorias) |
| 6. Carrito: cantidades y subtotales | E2E carrito + unitarias de `reconcileCart` |
| 7. Validación de formularios | E2E checkout, panel de productos e inventario + unitarias |
| 8. Pedido con estado válido | Funciones + E2E (pedido `pendiente`, número `7K-…`) |
| 9. No superar el stock | Funciones (`OUT_OF_STOCK`) + E2E (carrito bloquea y ajusta) |
| 10. Concurrencia sin stock negativo | Funciones: 12 compras simultáneas con stock 5 → 5 pedidos, stock 0; 8 salidas concurrentes |
| 11. Precios no manipulables | Funciones (precio enviado ignorado → `PRICE_CHANGED`) + reglas (cliente no escribe precios) |
| 12. Sin ventas duplicadas | Funciones: repetir `pagado` y `createOrder` con el mismo `requestId` |
| 13. Productos persisten | E2E creación con imagen + lectura directa de Firestore |
| 14. Movimientos verificables | Funciones + E2E inventario (stock antes/después, motivo, usuario) |
| 15. Cancelación y stock | Funciones + E2E (devuelve una vez, anula venta pagada) |
| 16. Indicadores con estados y fechas | Unitarias (solo ventas vigentes, fecha de pago, días en hora de Chile con cambios de horario) + E2E resumen |
| 17. Acceso no autorizado | E2E: sin sesión, clienta registrada y encargado en módulos de administración |
| 18. Reglas de Firestore y Storage | 18 pruebas de reglas con 5 identidades |
| 19. Imágenes: tipo y tamaño | Reglas de Storage (tipo, 3 MB, vacío, ruta, sobrescritura) + E2E (archivo no imagen rechazado) |
| 20. Móvil y escritorio | E2E: sin desborde horizontal a 360, 430, 820, 1366 y 1920 px; navegación inferior; menú lateral; iconos con glifo |

Pruebas de seguridad explícitas: acceso al panel sin sesión, lectura de pedidos de otra clienta, auto-asignación de rol (escritura de `users` y token con rol falsificado), cambio de precios, alteración de stock, modificación/eliminación de ventas, archivos no permitidos y repetición de operaciones comerciales.

### Revisión de seguridad

Se hizo una revisión enfocada del código fuente (sin sondear servicios reales) sobre reglas, Cloud Functions, sesión, plantillas HTML y redirecciones:

- **Corregido:** la asignación de roles por correo no exigía correo verificado. Alguien podía registrar primero el correo de una futura encargada y recibir su rol. Ahora `setUserRole` y `set-role.js` lo exigen, el registro envía el correo de verificación y hay una prueba que lo cubre.
- **Por validar en el despliegue real:** el límite de pedidos por IP usa la IP que entrega la plataforma; si la plataforma la toma del encabezado `X-Forwarded-For`, puede falsificarse. El límite de 5 pedidos pendientes por cuenta se mantiene, pero alguien con muchas cuentas anónimas podría reservar stock. Mitigación: activar **App Check** (sección 9), revisar periódicamente los pedidos pendientes y, si hace falta, bajar `orderHoldHours`.
- **Sin hallazgos** en manipulación de precios o stock, lectura de pedidos ajenos, fuga de costos, XSS, redirección abierta y condiciones de carrera (cubiertas por las pruebas descritas arriba).

**No verificado aquí:** el comportamiento contra un proyecto Firebase real (despliegue, App Check, Cloud Scheduler, TTL y correos de recuperación), porque requiere tus credenciales. Los pasos están en las secciones 3–9 y 14.

---

## Decisiones y limitaciones

- **Fidelidad al diseño:** se tomaron las pantallas, el HTML y `pastel_whimsy/DESIGN.md` del ZIP (paleta, Comfortaa/Quicksand, tarjetas, píldoras, navegación inferior, ficha "Planner Perpetuo Chanchito") y se pasaron a CSS propio, sin Tailwind por CDN. El logo es el original de la referencia.
- **Contenido de referencia no incluido como dato real:** reseñas y estrellas ("Clientas Enamoradas", 4.9 ★), "3 cuotas sin interés con Mercado Pago", promesas de despacho con transportistas y garantías. No hay datos que los respalden. Los textos comerciales (banner, destacados, bloque promocional, envío gratis) quedaron **editables** en *Configuración*.
- **Fotos de productos:** las fotos generadas de la referencia no se pudieron descargar desde el entorno de trabajo (dominio bloqueado) y las capturas tienen muy baja resolución. Los productos demostrativos muestran **ilustraciones pastel por categoría** hasta que se suban fotos reales desde el panel.
- **Datos demostrativos:** productos, precios, existencias y costos de envío de ejemplo quedan marcados (`isDemo`, `demoMode`) y la tienda muestra un aviso hasta desactivarlo.
- **Variantes:** las opciones (p. ej. diseño de portada) se registran en el pedido, pero el **stock es común** al producto. Para stock separado por variante, crea un producto por variante.
- **Listados del panel:** se consultan por rango de fechas (hasta 1.000 pedidos o 2.000 ventas por consulta, con aviso si se alcanza) y se filtran en el navegador. Es adecuado para una tienda pequeña; con mucho volumen convendría paginar en el servidor.
- **Límite por IP:** es una defensa adicional y puede eludirse; la protección recomendada contra abuso es **App Check** más el límite por cuenta.
- **Revocación de roles:** inmediata en Firestore y Functions (espejo `users/{uid}`). En Storage el token antiguo puede servir para subir imágenes hasta 1 hora; al quitar un rol también se revocan las sesiones.
- **Favoritos** se guardan en el dispositivo (preferencia personal, no dato comercial). El carrito usa `localStorage` solo como lista temporal.

### Integrar un proveedor de pagos

1. Crea una función HTTP (webhook) que verifique la firma del proveedor (Mercado Pago, Flow, Webpay).
2. Con el ID de pago del proveedor como clave de idempotencia, llama a `applyOrderTransition(db, { orderId, target: 'pagado', actor, paymentReference })`. La venta se registra una sola vez aunque el webhook se repita.
3. Guarda las credenciales con `firebase functions:secrets:set` (nunca en el frontend ni en el repositorio).

---

## Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| Aviso "La tienda todavía no está conectada a Firebase" | Falta completar `public/js/firebase/config.js` o no estás en Firebase Hosting. |
| `auth/admin-restricted-operation` al confirmar un pedido | No está habilitado el acceso **Anónimo** (paso 5). |
| `auth/operation-not-allowed` al iniciar sesión | No está habilitado **Correo/contraseña** (paso 5). |
| Error de red/CORS o `functions/not-found` al confirmar | Funciones no desplegadas o región distinta entre `functions/src/config.js` y `config.js`. |
| "Falta un índice o configuración en Firestore" | Ejecuta `npx firebase deploy --only firestore:indexes` y espera a que el índice termine de construirse. |
| "Esta cuenta aún no verificó su correo" al asignar un rol | La persona debe abrir el enlace de verificación (puede reenviarlo desde *Mi cuenta*). |
| El panel redirige a `login.html?motivo=sin-permiso` | La cuenta no tiene rol o falta el espejo `users/{uid}`: asígnalo con `set-role.js` o desde *Usuarios y roles* y vuelve a iniciar sesión. |
| No se puede subir una imagen | Solo administración; JPG/PNG/WebP de hasta 3 MB; Storage debe estar creado (Blaze). |
| `firebase deploy --only functions` pide actualizar el plan | Cloud Functions requiere Blaze (paso 15). |
| Los emuladores no arrancan | Instala Java 21+; libera los puertos 4000, 5000, 5001, 8080, 9099 y 9199. Los avisos sobre `::1` (IPv6) son inofensivos. |
| Los iconos se ven como texto | Ejecuta `npm run icons` (falta un nombre en el subconjunto de la fuente). |
| Pedidos pendientes cancelados solos | Es el vencimiento automático (`orderHoldHours` en *Configuración*; 0 lo desactiva). |
| `PRICE_CHANGED` al confirmar | Un precio o el costo de envío cambió mientras la clienta compraba: revisa el resumen y confirma de nuevo. |

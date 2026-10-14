# Documento de Requisitos de Producto (PRD): The Honeycomb 4.1

> **Versión:** 4.1 (borrador) · **Base:** PRD The Honeycomb 4.0 · **Fecha:** 2026-10-13
> · **Fuente:** Auditoría UX/UI del 2026-10-07 (`UX-UI-AUDIT-2026-10-07.pdf`), §8 «Estándar
> propuesto» y §10 «Plan de acción por fases», menos lo que ya resolvieron el 4.0 y la Fase 0 (US-47)

## 1. Visión General del Producto y Objetivos

### 1.1. Visión y Propósito

Con la versión 4.0, todas las pestañas muestran los mismos números y las mismas etiquetas para un
mismo colega, y los textos usan un único vocabulario. La auditoría UX/UI encontró que el problema
que queda **no es la estética, sino la falta de un sistema de diseño**: cada componente reinventa
su propia receta de botón, campo, tarjeta y badge, y eso produce texto ilegible, controles sin foco
visible, pantallas que se rompen en móvil y una app que todavía se presenta como
`react-example`.

**The Honeycomb 4.1** construye ese sistema y lo aplica a toda la app:

- un juego de **tokens de diseño** (color, tipografía, radios, espaciado, z-index, movimiento) y un
  lint que impide volver a salirse de ellos;
- **fuentes servidas por la propia app**, para que Electron se vea igual sin red;
- **componentes base** reutilizables (botón, campo, diálogo, pestañas, toast, tabla…);
- **accesibilidad** de las pantallas que ya existían antes del 4.0;
- **móvil y tablet** sin roturas;
- **avisos de error y de estado** visibles, en lugar de fallas silenciosas;
- **marca y empaquetado** propios (ícono de la app, ventana sin destello blanco).

> **¿Por qué 4.1 y no 5.0?** Nada de esta versión cambia la forma de usar la app: las pestañas, los
> botones, los flujos y los textos que cita la guía `.docx` se mantienen. Quien ya usa The
> Honeycomb no tiene que aprender nada nuevo; solo la ve más clara y la puede usar con teclado, con
> lector de pantalla o desde el celular. Los cambios de la auditoría que sí cambiarían flujos o el
> vocabulario de marca siguen sin versión asignada (§4) (D-17 del PRD 4.0).

### 1.2. Objetivos Principales

0. **Snapshot de la app 4.0 (prerrequisito).** Antes de empezar cualquier ticket de esta versión,
   se congela el estado de la app al cerrar el 4.0 con **US-49** (versión, tag y Release con
   instalador) y **US-50** (backup de datos y paquete de regresión). Además, se registra la línea
   base de la auditoría. Es el punto al que se puede volver si algo sale mal y la referencia contra
   la que se compara cada cambio del 4.1 (§2.0).
1. **Sistema de diseño (improvement).** Tokens semánticos en `@theme` (`src/index.css`) que
   cumplan contraste AA, y un lint de estilos que prohíba hex arbitrarios, tamaños de texto sueltos,
   radios sueltos y colores crudos de Tailwind.
2. **Fuentes propias (improvement).** Inter, Playfair Display y JetBrains Mono se sirven desde la
   app; se retira Google Fonts de ambas Content-Security-Policy.
3. **Componentes base (improvement).** Primitivas en `src/components/ui/` (Button, Field, Dialog,
   Tabs, Toast, DataTable…) y migración de cada pantalla a ellas.
4. **Accesibilidad de las pantallas existentes (improvement).** Pestañas con ARIA, jerarquía de
   títulos, foco visible de marca, contraste, labels, diálogos reales y mensajes de estado.
5. **Móvil y tablet (improvement).** Sin scroll horizontal de página a 375 y 768 px en ninguna
   pestaña, con el nav siempre visible y las tablas completas.
6. **Feedback y estados (improvement).** Avisos globales (toasts), error de carga con **Retry** y
   errores de guardado visibles.
7. **Consistencia visual del dominio (improvement).** Un color y un ícono por actividad en toda la
   app, un solo formato de fechas y porcentajes, y gráficos del Progress Report con el mismo
   estándar que los paneles del 4.0.
8. **Marca y empaquetado (improvement).** Ícono de la app, color de fondo de la ventana de Electron,
   logo como asset y nombre del paquete.
9. **Gobernanza (improvement).** Tests e2e de teclado y responsive, chequeo automático de contraste
   y documentación del sistema de diseño.

### 1.3. 🐞 Corrección de Bugs

- **BUG-08: un guardado fallido se revierte en silencio.** Si el servidor rechaza un cambio (salvo
  el 401, que ya pasa a solo lectura), `persist()` deshace el cambio en pantalla sin avisar.
- **BUG-09: una carga inicial fallida deja la app vacía.** Si `GET` de datos falla al abrir la app,
  solo se escribe en la consola; la pantalla queda vacía y sin forma de reintentar.
- **BUG-10: las pestañas desaparecen en móvil.** A 375 px el header mide 121 px y el nav está fijo
  en `top-[73px]` debajo de él: al hacer scroll, las pestañas quedan ocultas.
- **BUG-11: tablas recortadas en pantallas angostas.** La tabla del Bee-havior Hub (911 px) está en
  un contenedor sin scroll: **Hive Status** y **Multi-Activity?** son inalcanzables. Igual en
  **Caserits & Progress** y en la vista previa del importador.
- **BUG-12: Manual Check-In se desborda en móvil.** A 375 px la página tiene scroll horizontal,
  `Add & Check In` se aplasta en 4 líneas y `Present` se corta a `Pres`.

> BUG-08 a BUG-12 vienen de la auditoría UX/UI (§5.5, R1, R2 y R3). Este PRD puede sumar más bugs
> encontrados durante la versión; se agregarán en §2.10.

### 1.4. Cambios respecto al PRD 4.0

- **§2.8 del PRD 4.0 pasa a ser regla general.** Los requisitos de interfaz que en el 4.0 aplicaban
  solo a los componentes nuevos (12 px mínimo, contraste 4.5:1 y 3:1, foco visible, botones
  solo-ícono con `aria-label`, diálogos reales, `textColor` en los badges de Hive Status) aplican a
  **toda la app** al cerrar esta versión.
- **No cambian** las reglas de negocio, los cálculos, las rutas del servidor ni los textos de la
  interfaz definidos en el 4.0 (§2.9 y D-14 a D-16 del PRD 4.0).

### 1.5. Definiciones comunes

- **Token:** variable de diseño con nombre (ej. `--color-danger`, `--radius-card`) definida en
  `@theme` de `src/index.css`. Los componentes usan tokens, no valores sueltos.
- **Primitiva:** componente base de `src/components/ui/` que encapsula una receta (ej. `Button`
  con sus variantes). Las pantallas componen primitivas en lugar de repetir clases.
- **Texto con información:** todo texto que el usuario necesita leer (datos, labels, mensajes,
  badges). No incluye bordes, rellenos ni íconos decorativos.
- **Anchos de prueba:** 1440 px (escritorio), 768 px (tablet) y 375 px (móvil).

---

## 2. Requisitos Funcionales y Especificación de Módulos

### 2.0. Snapshot de la app 4.0 (antes de cualquier ticket)

El 4.1 toca casi todos los archivos de la interfaz. Antes de mergear el primer ticket de la
versión, se congela la app tal como quedó al cerrar el 4.0. El mecanismo ya existe en dos tickets
creados con ese propósito; este PRD los usa para el 4.0 y agrega solo lo propio de la auditoría.

- **US-49 (NIC-50), aplicada al 4.0:**
  - `package.json` pasa a `"version": "4.0.0"` y la versión se ve en **Settings**;
  - tag anotado `v4.0.0` sobre el commit de cierre del 4.0 (el merge de US-49, que ya trae
    `"version": "4.0.0"`), así que el tag, `package.json` y **Settings** dicen la misma versión;
  - GitHub Release `v4.0.0` con el link a este PRD 4.0, la lista de US y el instalador de Windows
    generado por el workflow de release.
- **US-50 (NIC-51), aplicada al 4.0:**
  - base de prueba fija `e2e/fixtures/v4.0.0.json`;
  - capturas de referencia de Playwright (`toHaveScreenshot`) de las 6 pestañas con esa base;
  - checklist de regresión del 4.0 en el Release;
  - `schemaVersion` y backup automático de `honeycomb-data.json` al cambiar de versión, así que
    instalar el 4.1 deja una copia de los datos del 4.0 sin pasos manuales.
- **Línea base de la auditoría (ticket S de §3):** `docs/SNAPSHOT-4.0.md` registra, medido sobre
  el tag `v4.0.0`:
  - los conteos que va a vigilar el lint de §2.3 (hex arbitrarios, `text-[Npx]`, `rounded-[…]`,
    `animate-*` sin definir, colores crudos `amber`/`red`/`gray`);
  - por pestaña, a 1440, 768 y 375 px: nodos de texto con información por debajo de 12 px,
    controles sin nombre accesible y si hay scroll horizontal de página (`scrollWidth` vs
    `innerWidth`);
  - los pares de contraste del Apéndice A de la auditoría;
  - el resultado de `npm run lint`, `npm test` y `npm run test:e2e`.
  - Suma capturas a 768 y 375 px, y del **Progress Report** y el **Outcome Report** abiertos, que
    US-50 no cubre. Van junto a las capturas de US-50 y con la misma base fija.
- **Orden:**
  - las capturas y la base de `v4.0.0` se toman con la interfaz del 4.0;
  - por eso US-49, US-50 y S se mergean y el Release `v4.0.0` se publica **antes** que cualquier
    otro ticket de esta versión (D-12).
- **Capturas durante el 4.1:**
  - el 4.1 cambia la interfaz a propósito, así que cada ticket de pantalla **actualiza** las
    capturas de referencia vigentes de lo que toca y adjunta el diff en su PR;
  - las de `v4.0.0` quedan congeladas como referencia y no se regeneran.

### 2.1. Tokens de diseño

- Se agregan a `@theme` en `src/index.css` los tokens de la auditoría (§8.1). Los valores marcados
  **(v)** se confirman con una herramienta de contraste antes de fijarlos:

| Token | Valor propuesto | Uso |
|---|---|---|
| `--color-forest-hover` | `#213028` | Hover del botón primario |
| `--color-surface` | `#FFFFFF` | Tarjetas, inputs |
| `--color-sage-text` (v) | `#5F6F3A` (~5.4:1 sobre blanco) | Texto secundario y labels |
| `--color-sand-text` (v) | `#8A5A2B` (~5.9:1) | Texto de acento |
| `--color-text-muted` | forest al ~70 %, sólido | Placeholders y captions |
| `--color-input-border` (v) | `#8F8B7A` (~3.4:1) | Borde de controles |
| `--color-danger` (v) + fondo y borde | `#B3261E` (~6.5:1) + tintes | Errores y acciones destructivas |
| `--color-warning` / `success` / `info` | Derivados de sand / moss / sage, texto ≥ 4.5:1 | Alertas y badges |
| `--color-tier-*` | fg/bg/border desde `src/beehavior.ts` (fg = `textColor`) | Hive Status |
| `--color-activity-*` (+ `-text`) | Un único mapa para las 4 actividades (§2.8) | Color por actividad |
| `--color-chart-*` | Leídos por recharts desde las CSS vars | Gráficos |

- **Ink:** `#1A1A1A` deja de usarse y se unifica con `forest` (D-1).
- **Escalas cerradas:**
  - **Texto:** micro 12/16 (único micro-label: uppercase, `tracking-wider`) · body 14/20 · body-lg
    16 · h3 18 · h2 24 · h1 28–30 · KPI 36–40.
  - **Radios:** control 12 px · card 24 px · panel 32 px (solo el contenedor de pestaña) · chip
    full.
  - **Sombras:** sm (tarjetas), md (flotantes), 2xl (diálogos).
  - **Espaciado:** escala de 4 px, sin medios pasos.
  - **z-index:** nav 20 · header 30 · dropdown 40 · diálogo 50 · toast 60.
  - **Movimiento:** `--duration-fast` 150 ms, `--duration-base` 250 ms (los keyframes de la Fase 0
    pasan a usar estas duraciones).
  - **Opacidades:** 5 / 10 / 20 / 40 / 60 / 80.
- Los colores `sage`, `sand` y `moss` originales **no se usan como color de texto** sobre fondos
  claros; quedan para rellenos, bordes e íconos grandes.
- Se mantienen alias de los tokens viejos hasta que la última pantalla se migre (§3).
- Se declara `color-scheme: light` (sin modo oscuro, D-4).
- Los tokens y sus pares de contraste quedan documentados en `docs/DESIGN-TOKENS.md`.

### 2.2. Tipografía y fuentes

- **Fuentes propias:** Inter, Playfair Display y JetBrains Mono se instalan como paquetes
  (woff2 variable) en `dependencies` (D-7) y se cargan con `font-display: swap`. Se elimina el
  `@import` de Google Fonts de `src/index.css` y se retiran `fonts.googleapis.com` y
  `fonts.gstatic.com` de **ambas** CSP (`index.html` y `vite.config.ts`).
- Sin red, la app de Electron muestra las mismas fuentes que con red.
- **Roles:**
  - **Inter** para toda la interfaz: pestañas, botones, labels, badges, avatares.
  - **Playfair Display** solo para h1–h3, la marca y las cifras de los KPI (con cifras alineadas:
    `lining-nums tabular-nums`).
  - **JetBrains Mono** solo para datos tabulares (emails, fechas ISO), con una regla única.
  - Se elimina el alias `font-display`.
- **Pesos:** 400 cuerpo · 500 interfaz · 600 énfasis y botones · 700 solo títulos serif. Se cargan
  exactamente esos pesos (desaparecen `font-black` y el italic bold sintetizado del logo).
- **Mínimo de 12 px** para todo texto con información. Desaparecen `text-[9px]`, `text-[10px]` y
  `text-[11px]`.
- La pestaña activa no cambia de peso al seleccionarse (no salta de ancho).

### 2.3. Foco visible y lint de estilos

- **Foco global:** todo elemento interactivo muestra, al recibir foco por teclado
  (`:focus-visible`), un anillo de 2 px `forest` con 2 px de separación. Se elimina el
  `focus:outline-none` + `ring/20` (~1.2:1) de los campos, y el anillo no se recorta por
  `overflow`.
- **Lint de estilos:** un chequeo que corre en `npm run lint` y en `lint-staged` falla si
  encuentra:
  - hex arbitrarios en clases (`bg-[#…]`, `text-[#…]`, `border-[#…]`);
  - tamaños de texto sueltos (`text-[Npx]`);
  - radios sueltos (`rounded-[…]`);
  - clases `animate-*` sin keyframes definidos;
  - colores crudos de Tailwind fuera de la paleta (`amber-*`, `red-*`, `gray-*`).
- **Línea base (D-6):** el lint arranca con el conteo de cada regla registrado en el snapshot (§2.0) y **solo permite que
  baje**: un PR que agrega una violación nueva falla; un PR que migra una pantalla actualiza la
  línea base a la baja. Al cerrar la versión, la línea base es **0** y el chequeo pasa a ser
  absoluto.
- **Chequeo de contraste:** un test recorre los pares de tokens declarados (texto/fondo y
  borde/fondo) y falla si un par de texto queda por debajo de 4.5:1 o uno de borde por debajo de
  3:1.

### 2.4. Componentes base (`src/components/ui/`)

| Primitiva | Reglas clave |
|---|---|
| `Button` / `IconButton` | Variantes `primary` · `secondary` · `ghost` · `danger` · `link`; tamaños sm (h-9), md (h-11), lg (h-12); estado `loading`; un solo criterio de `disabled`. `IconButton` de 40 px con `aria-label` obligatorio (el tipo no compila sin él). |
| `Field` + `Input` / `Select` / `Textarea` / `DateInput` | Label, control, ayuda y error ligados con `htmlFor` / `aria-describedby`; `aria-invalid` cuando hay error; h-11, borde con `--color-input-border`. |
| `Card` / `Panel` | Un solo nivel de anidación; radio y padding por token. |
| `Badge` (+ `TierBadge`, `ActivityBadge`, `StatusBadge`) | Tono y tamaño por prop; texto ≥ 4.5:1. `TierBadge` usa el `textColor` del tier y su ícono (§2.8). |
| `Tabs` / `SegmentedControl` | `tablist` / `tab` / `tabpanel` con `aria-selected`, `aria-controls`, roving tabindex y flechas; `SegmentedControl` como `radiogroup` o con `aria-pressed`. |
| `Dialog` / `ConfirmDialog` | Portal, `role="dialog"`, `aria-modal`, `aria-labelledby`; foco inicial, trampa y restauración; Escape y clic fuera cierran; bloqueo de scroll; alto con `dvh`. `ConfirmDialog` nombra el objeto y sus consecuencias. |
| `Toast` / `Alert` | Región global (`role="status"` para éxito, `role="alert"` para error); los toasts se apilan arriba del contenido (z-index toast). |
| `DataTable` | Scroll horizontal propio, `<caption>`, `scope` en encabezados, encabezado sticky opaco, hover visible. |
| `EmptyState` / `PageHeader` / `Stat` / `ChartFrame` | `Stat` con `<dl>` (no h3); `PageHeader` da el h2 de cada pestaña; `ChartFrame` aplica ejes, tooltip con unidad, leyenda real, `role="img"` + `aria-label` y tabla alternativa. |

- El `OutcomeReportModal` del 4.0 ya cumple las reglas de diálogo: `Dialog` se extrae de él en
  lugar de escribirse de cero.
- Cada primitiva tiene un test de render (Vitest) que fija su semántica (roles, nombres
  accesibles, `aria-*`).
- No se agrega Storybook. Basta una página de ejemplos que solo existe en desarrollo y no entra en
  el build de producción (D-8).

### 2.5. Accesibilidad de las pantallas existentes

Aplica a **Dashboard**, **Manual Check-In**, **Caserits & Progress**, **Overlap Cross-Referencer**,
**Import Forage Logs**, **Admin Access** y el **Progress Report**:

- **Pestañas:** las 6 pestañas usan `Tabs` (§2.4): se navegan con flechas, `Home`/`End`, y el lector
  de pantalla anuncia cuál está seleccionada.
- **Estructura:**
  - un único h1 (la marca) y un h2 por pestaña (`PageHeader`);
  - los números de los KPI dejan de ser encabezados;
  - los nombres dentro de tablas dejan de ser h4;
  - un enlace `Skip to content` es lo primero que se enfoca con Tab;
  - el `<title>` cambia por pestaña: `<Pestaña> · The Honeycomb`.
- **Contraste:** ningún texto con información usa `sage`, `sand` ni `moss` sobre fondos claros; los
  botones activos `Present` / `Absent` cumplen 4.5:1; el error de **Admin Access** deja de ser arena
  sobre arena (~2:1).
- **Tablas:** todas usan `DataTable` (`caption`, `scope`).
- **Formularios:**
  - todo campo usa `Field`;
  - un campo con error lo muestra junto al campo con `aria-invalid` y `aria-describedby`, en lugar
    de solo deshabilitar el botón (ej. `Add & Check In` con el nombre vacío);
  - los campos obligatorios se indican visualmente y con `aria-required`.
- **Progress Report:** pasa a `Dialog`: Escape y clic fuera lo cierran, el foco entra al abrir y
  vuelve al botón de origen, y la página de fondo no hace scroll.
- **Confirmaciones:** borrar un colega usa `ConfirmDialog` y conserva el texto del 4.0 (nombra al
  colega y avisa que se borran sus registros y notas, TC-77).
- **Tamaño de objetivo:** todo control mide al menos 24 × 24 px (papelera, X, ojo de contraseña,
  fechas de la vista previa, `View excluded`); los de uso frecuente, 44 px en móvil.
- **Controles deshabilitados:** en modo solo lectura, `ReadOnlyNotice` aparece siempre en la misma
  posición (debajo del h2) y los controles deshabilitados lo referencian con `aria-describedby`.

### 2.6. Móvil y tablet

- A **375 px y 768 px**, `document.documentElement.scrollWidth` es igual a `innerWidth` en las 6
  pestañas y con el Progress Report abierto (sin scroll horizontal de página).
- **Header y nav (BUG-10):**
  - el nav de pestañas queda siempre visible al hacer scroll: la posición sticky se calcula con el
    alto real del header (variable CSS), no con `top-[73px]`;
  - el nav tiene fondo opaco (sin transparencia ni `backdrop-blur` que deje ver el contenido);
  - si las pestañas no caben, hacen scroll horizontal sin barra nativa visible, con indicación de
    que hay más pestañas, y la pestaña activa se centra al seleccionarse.
- **Tablas (BUG-11):** todas las columnas son alcanzables, con scroll horizontal dentro de la tabla
  (`DataTable`). La primera columna (nombre del colega) queda fija al desplazar.
- **Manual Check-In (BUG-12):** el formulario y la lista de asistencia se apilan en una columna;
  `Add & Check In` y `Present` / `Absent` se leen completos.
- **Grillas de KPI:** 1 → 2 → 4 columnas (sin saltar de 1 a 4).
- **Espaciado:** el margen lateral en móvil es de 16 px.
- **Campos:** en móvil, los inputs usan 16 px de texto para que iOS no haga zoom al enfocarlos.
- Los filtros y los encabezados de gráficos hacen wrap en lugar de desbordarse.

### 2.7. Feedback y estados

- **Avisos globales:** la app tiene una región de `Toast` (§2.4) para éxitos y errores que no
  pertenecen a un campo.
- **BUG-08 — error de guardado:** cuando `persist()` revierte un cambio por un error del servidor
  (distinto de 401), se muestra un toast de error que dice qué no se guardó y qué hacer (ej.
  `Couldn't save the attendance. Check the connection and try again.`). No se muestra el
  `err.message` crudo del servidor.
- **BUG-09 — error de carga:** si la carga inicial falla, se muestra una pantalla de error con
  causa y un botón `Retry` que vuelve a pedir los datos.
- **Éxitos:** los avisos de éxito existentes usan la región global (anunciados a lectores de
  pantalla) y sus temporizadores se limpian al desmontar.
- **Estados vacíos:** todas las listas, tablas y gráficos sin datos usan `EmptyState`, con los
  textos del glosario del 4.0. El vacío de la tabla del Hub distingue «no hay colegas» de «la
  búsqueda no encontró colegas».
- **Carga:** todo indicador de carga usa `role="status"` y el mismo componente.

### 2.8. Consistencia visual del dominio

- **Color e ícono por actividad (D-3):** un único módulo define, para **Speakeasy**, **Reading
  Club**, **Music Room** y **Writing Hood**, su color (token `--color-activity-*`) y su ícono
  Lucide. Lo usan el Dashboard, los paneles, el Bee-havior Hub, el **Overlap Cross-Referencer**, el
  **Progress Report**, el **Outcome Report** (en pantalla) y la vista previa del importador.
  - La paleta nueva de actividades cumple 3:1 contra blanco (hoy Writing Hood/moss tiene 1.53:1) y
    se distingue con deuteranopia; el ícono acompaña siempre al color, que nunca es la única
    señal.
- **Hive Status:** los badges usan `TierBadge` (evolución de `HiveStatusBadge` de US-42) en todas las pestañas, con el `textColor` del tier y
  un ícono Lucide en lugar del emoji (D-3). Las etiquetas (`Busy Bee`, `Forager`, `Hatcher`,
  `Dormant`, `No data`) no cambian.
- **Fechas y porcentajes:** un formateador único:
  - fechas guardadas en ISO (`2026-06-24`) y mostradas como `Jun 24, 2026` (D-9);
  - los inputs de fecha conservan el control nativo;
  - porcentajes sin decimales y con `%` pegado (`75%`).
- **Gráficos del Progress Report:** pasan a `ChartFrame`, con el mismo estándar que los paneles
  del 4.0 (§2.8 del PRD 4.0): eje `0`–`100` con `%`, meses sin eventos como sin datos (no `0 %`),
  leyenda real, tooltip con unidad y `role="img"` + `aria-label`.
- **Gráficos de los paneles del 4.0:** se migran a `ChartFrame` y a los colores
  `--color-chart-*` sin cambiar lo que muestran.
- **Íconos:** un ícono por significado (éxito, alerta, cerrar) y tres tamaños (16, 20, 24 px); los
  emoji dejan de usarse como íconos de interfaz.

### 2.9. Marca y empaquetado

- **Ícono de la app:** se generan `.ico` (Windows) y `.icns` (macOS) desde el SVG de la «H» que
  agregó la Fase 0 (`public/favicon.svg`), y `electron-builder` los usa para el instalador, la barra
  de tareas y la ventana (D-5).
- **Ventana de Electron:** `BrowserWindow` define `backgroundColor` con el color de fondo de la app;
  al abrir no hay destello blanco.
- **Logo:** la «H» del header pasa de un div con CSS a un asset SVG con `alt`/`aria-label`.
- **Nombre del paquete:** `package.json` deja de llamarse `react-example` y pasa a
  `the-honeycomb`, sin cambiar el `productName` ni la ruta de datos del usuario.

### 2.10. 🐞 Bugs

> Sección abierta: se agregarán los bugs que se encuentren durante la versión 4.1. BUG-08 a BUG-12
> se describen en §1.3 y sus requisitos están en §2.6 y §2.7.

### 2.11. Gobernanza

- **Tests e2e (Playwright):**
  - navegación por teclado de las 6 pestañas (flechas, foco visible);
  - Progress Report: foco al abrir, Escape cierra, el foco vuelve al botón;
  - sin scroll horizontal a 375 y 768 px en cada pestaña;
  - `<title>` por pestaña.
- **Documentación:** `docs/DESIGN-SYSTEM.md` (tokens, primitivas y cuándo usar cada una, reglas del
  lint) y una sección **UI rules** en `CLAUDE.md` que obliga a usar primitivas y tokens en todo
  código nuevo.

### 2.12. Restricciones técnicas (se mantienen de versiones anteriores)

- **Los textos de la interfaz no cambian.** Antes de tocar un componente se buscan sus textos en
  `e2e/*.spec.ts` y `*.test.ts`; el `.docx` y los e2e los citan literalmente.
- **No se tocan** reglas de negocio, cálculos, rutas mutantes (`requireAdmin`, `validateBody`) ni
  `canEdit`. Un refactor visual que necesite cambiar uno de ellos se separa en un ticket funcional.
- Todo origen nuevo va en **ambas** CSP (`index.html` y `vite.config.ts`). Esta versión debería
  **quitar** orígenes, no agregar.
- Las dependencias de runtime (fuentes incluidas) van **solo** en `dependencies` (electron-builder
  26). `npm audit` sigue en 0 (US-13) y toda dependencia con scripts de instalación se aprueba en
  `allowScripts`.
- No se modifican `honeycomb-data.json` ni `honeycomb-config.json`; las pruebas usan una base
  temporal (`HONEYCOMB_DB_PATH`) y otro `PORT`.
- La fecha de referencia del sistema sigue fija en el **24 de junio de 2026**.

---

## 3. Plan de entrega sin conflictos

El orden busca que dos tickets de la misma ola no compartan archivos, para poder trabajarlos en paralelo (worktree y rama
`gs/us-XX-…` por ticket).

### 3.1. Estado del 4.0 al 2026-10-14

Los últimos PRs del 4.0 se mergearon el 2026-10-14: #46 (US-47, Fase 0), #48 (US-42, Hive Status
única) y #39 (US-37, detección de actividad). **El 4.1 no tiene bloqueos externos**: todas las olas
parten de `main`. `HiveStatusBadge` (US-42) es la base de `TierBadge` (§2.4) y el importador ya no
tiene pestañas de actividad (US-37).

### 3.2. Olas

| Ola | Ticket (provisorio) | Alcance | Archivos principales | Arranca cuando |
|---|---|---|---|---|
| **Previo** | **US-49** · Versión, tag y Release (ya creado) | §2.0 | `package.json` (`version`), `SettingsPanel.tsx`, `.github/workflows/` (release), `docs/` | Ya |
| **Previo** | **US-50** · Datos y paquete de regresión (ya creado) | §2.0 | `db.ts`, `e2e/fixtures/`, capturas de referencia, `docs/` | Ya, en paralelo con US-49 |
| **Previo** | **S** · Línea base de la auditoría | §2.0 | `docs/SNAPSHOT-4.0.md`, capturas extra (768/375 px, Progress Report, Outcome Report) | Merge de US-50 (usa su base fija) |
| **0** | **A** · Branding y empaquetado | §2.9 (menos el logo del header) | `electron/main.js`, `package.json` (`build`, `name`), `build/` (íconos) | Snapshot publicado |
| **0** | **B** · Lint de estilos con línea base | §2.3 (lint) | `scripts/` (nuevo), `package.json` (`scripts`), `lint-staged.config.js` | Snapshot publicado |
| **1** | **C** · Tokens, foco global y chequeo de contraste | §2.1, §2.3 (foco y contraste) | `src/index.css`, `docs/DESIGN-TOKENS.md`, test nuevo | Snapshot publicado |
| **1** | **D** · Fuentes propias | §2.2 (fuentes) | `src/index.css` (línea del `@import`), `index.html`, `vite.config.ts`, `package.json` | Merge de C (comparten `index.css`) |
| **2** | **E** · Primitivas I | `Button`, `IconButton`, `Field` y controles, `Card`, `Badge` | `src/components/ui/` (archivos nuevos) | Merge de C |
| **2** | **F** · Primitivas II | `Dialog`, `ConfirmDialog`, `Toast`, `Tabs`, `SegmentedControl`, `DataTable`, `EmptyState`, `PageHeader`, `Stat`, `ChartFrame` | `src/components/ui/` (archivos nuevos, distintos de E) | Merge de C |
| **2** | **G** · Módulo de dominio visual | §2.8: color e ícono por actividad, `TierBadge`, formateador de fechas y porcentajes, `chartTheme` | `src/activityTheme.ts`, `src/format.ts` (nuevos), `src/beehavior.ts` | Merge de C |
| **3** | **H** · Shell | §2.5 (pestañas, estructura, skip-link, título), §2.6 (BUG-10), §2.7 (BUG-08, BUG-09, región de toasts), logo del header | `src/App.tsx`, `ReadOnlyNotice` | Merge de E, F y G |
| **3** | **I** · Manual Check-In | §2.5, §2.6 (BUG-12) | `AttendanceLogger.tsx` | Merge de E, F y G |
| **3** | **J** · Dashboard | §2.5, §2.6 (BUG-11 en el Hub, KPI 1→2→4), §2.8 (paneles) | `DashboardStats.tsx`, `DashboardPanels.tsx` | Merge de E, F y G |
| **3** | **K** · Caserits & Progress | §2.5 (`DataTable`, `ConfirmDialog`), §2.6 | `AttendeeDirectory.tsx` | Merge de E, F y G |
| **3** | **L** · Overlap Cross-Referencer | §2.5, §2.6, §2.8 | `CrossReferenceHub.tsx` | Merge de E, F y G |
| **3** | **M** · Progress Report y Outcome Report | §2.5 (`Dialog`), §2.8 (gráficos) | `ProgressReportModal.tsx`, `OutcomeReportModal.tsx` | Merge de E, F y G |
| **3** | **N** · Admin Access | §2.5 (error legible, `Field`, `Alert`) | `SettingsPanel.tsx` | Merge de E y F |
| **3** | **O** · Import Forage Logs | §2.5, §2.6 (BUG-11 en la vista previa), barra de acciones sticky con resumen, confirmación de `Discard` | `DocumentParser.tsx` | Merge de E, F y G |
| **4** | **P** · Gobernanza y cierre | §2.11, línea base del lint a 0, retirar alias de tokens viejos | `e2e/`, `docs/DESIGN-SYSTEM.md`, `CLAUDE.md`, `src/index.css` | Merge de H a O |

- **Orden:** primero US-49, US-50 y S, y la publicación del Release `v4.0.0`. Con el snapshot
  publicado, A, B y C arrancan en paralelo.
- **Cruce con US-49:** US-49 y A tocan `package.json` (`version` vs `build`/`name`); como A arranca
  después, solo hay que rebasar. E, F y G corren en paralelo. H a O corren en
  paralelo (cada una toca su propio componente).
- **Puntos de cruce conocidos:**
  - `package.json` lo tocan A, B y D en claves distintas (`build`/`name`, `scripts`,
    `dependencies`): conflicto trivial, se resuelve al rebasar.
  - Cada ticket de la ola 3 baja la línea base del lint (B): el archivo de línea base se actualiza
    al rebasar, tomando el menor valor de cada regla.
  - H es el único ticket que toca `App.tsx`; la región de toasts y la pantalla de error de carga
    viven ahí.
- **Comparación:** cada ticket de las olas 3 y 4 entrega capturas antes y después, comparadas con
  las de `v4.0.0`, a los mismos anchos.
- **Numeración:** US-49 y US-50 ya existen (NIC-50 y NIC-51). Los tickets nuevos del 4.1 se
  crean con la skill **Tefinha-crea-tickets** desde `US-51` (`NIC-52`), en el orden de la tabla: S
  es `US-51`, A es `US-52` y así hasta P.

---

## 4. Matriz de Criterios de Aceptación (QA & Testing)

| ID | Módulo / Componente | Escenario de Prueba | Resultado Esperado |
|---|---|---|---|
| **TC-78** | Tokens (§2.1) | Se corre el chequeo de contraste. | Todos los pares de texto declarados dan ≥ 4.5:1 y los de borde ≥ 3:1. |
| **TC-79** | Tokens (§2.1) | Se busca `#1A1A1A` en `src/`. | No aparece; títulos y cifras usan `forest`. |
| **TC-80** | Fuentes (§2.2) | Se abre la app de Electron sin conexión a internet. | Los títulos se ven en Playfair Display y el resto en Inter (no en Georgia ni en la fuente del sistema). |
| **TC-81** | Fuentes (§2.2) | Se revisan las CSP de `index.html` y `vite.config.ts` y la pestaña Network al cargar. | No mencionan `fonts.googleapis.com` ni `fonts.gstatic.com`; no hay pedidos a Google. |
| **TC-82** | Tipografía (§2.2) | En cada pestaña se buscan nodos de texto con información por debajo de 12 px. | No hay ninguno. |
| **TC-83** | Foco (§2.3) | Se recorre cada pestaña con Tab. | Cada botón, enlace y campo muestra el anillo forest de 2 px, sin recortes. |
| **TC-84** | Lint (§2.3) | Se agrega `bg-[#CCD5AE]` a un componente y se corre `npm run lint`. | El lint falla e indica el archivo, la línea y la regla. |
| **TC-85** | Lint (§2.3) | Se migra una pantalla y se corre `npm run lint`. | El lint pasa y la línea base baja para esa pantalla. |
| **TC-86** | Primitivas (§2.4) | Se corre `npm test`. | Cada primitiva tiene su test de render y pasa. |
| **TC-87** | Primitivas (§2.4) | Se usa `IconButton` sin `aria-label`. | `npm run lint` (`tsc`) falla. |
| **TC-88** | Pestañas (§2.5) | Con el foco en una pestaña, se pulsan flecha derecha, `End` y `Home`. | El foco y la selección pasan a la siguiente, la última y la primera; el lector de pantalla anuncia `tab, selected`. |
| **TC-89** | Estructura (§2.5) | Se abre la app y se pulsa Tab una vez. | Aparece `Skip to content`; al activarlo, el foco va al contenido de la pestaña. |
| **TC-90** | Estructura (§2.5) | Se cambia a **Caserits & Progress**. | El `<title>` dice `Caserits & Progress · The Honeycomb` y la pestaña tiene un único h2. |
| **TC-91** | Progress Report (§2.5) | Se abre el **Progress Report** de un colega con el teclado, se pulsa Escape. | El foco entra al diálogo al abrir; Escape lo cierra y el foco vuelve al botón que lo abrió. Mientras está abierto, la página de fondo no hace scroll. |
| **TC-92** | Formularios (§2.5) | En **Manual Check-In**, se intenta `Add & Check In` con el nombre vacío. | Se muestra un error junto al campo, el campo queda con `aria-invalid="true"` y el foco vuelve a él. |
| **TC-93** | Contraste (§2.5) | En **Admin Access**, se ingresa una contraseña incorrecta. | El error se lee con contraste ≥ 4.5:1 y se anuncia (`role="alert"`). |
| **TC-94** | Confirmaciones (§2.5) | Se borra un colega desde **Caserits & Progress**. | Se abre un diálogo que nombra al colega y avisa la cascada (mismo texto que TC-77); Escape cancela. |
| **TC-95** | Responsive (§2.6, BUG-10) | A 375 px, se hace scroll hasta el final del Dashboard. | Las pestañas siguen visibles debajo del header. |
| **TC-96** | Responsive (§2.6) | A 375 y 768 px, se recorren las 6 pestañas y el Progress Report. | `scrollWidth` es igual a `innerWidth` en todos los casos. |
| **TC-97** | Responsive (§2.6, BUG-11) | A 375 px, en el Bee-havior Hub, se desplaza la tabla horizontalmente. | Se llega a **Hive Status** y **Multi-Activity?**; la columna del nombre queda fija. |
| **TC-98** | Responsive (§2.6, BUG-12) | A 375 px, se abre **Manual Check-In**. | `Add & Check In`, `Present` y `Absent` se leen completos; no hay scroll horizontal. |
| **TC-99** | Responsive (§2.6) | A 768 px, se selecciona **Admin Access**. | La pestaña se desplaza hasta quedar visible y centrada; no se ve la barra de scroll nativa. |
| **TC-100** | Feedback (§2.7, BUG-08) | Con el servidor devolviendo 500 en `POST /api/records`, se guarda una asistencia. | Se revierte el cambio y aparece un toast de error que explica qué no se guardó, sin el mensaje crudo del servidor. |
| **TC-101** | Feedback (§2.7, BUG-09) | Se abre la app con el servidor caído y luego se levanta. | Se ve una pantalla de error con `Retry`; al pulsarlo, la app carga los datos. |
| **TC-102** | Feedback (§2.7) | Se busca un nombre inexistente en el Hub, y luego se abre el Hub sin colegas. | Los dos estados vacíos usan textos distintos. |
| **TC-103** | Dominio (§2.8) | Se recorre Dashboard, Hub, Overlap Cross-Referencer, Progress Report y la vista previa del importador. | Cada actividad tiene el mismo color e ícono en todas las vistas; Writing Hood se distingue del fondo (≥ 3:1). |
| **TC-104** | Dominio (§2.8) | Se miran los badges de Hive Status en el Hub, en **Caserits & Progress** y en el Progress Report. | Usan el mismo componente, color de texto e ícono Lucide; no hay emoji. |
| **TC-105** | Dominio (§2.8) | Se miran las fechas en las tablas y en el header. | Todas se muestran como `Jun 24, 2026`. |
| **TC-106** | Dominio (§2.8) | En el Progress Report de un colega con un mes sin eventos. | El gráfico va de `0` a `100%`, ese mes se ve como sin datos (no `0%`) y el tooltip muestra `%`. |
| **TC-107** | Branding (§2.9) | Se instala la app con el instalador generado por `npm run electron:build`. | El instalador, la ventana y la barra de tareas muestran el ícono de la «H»; al abrir no hay destello blanco. |
| **TC-108** | Branding (§2.9) | Se abre la app y se actualiza desde una versión anterior. | Los datos del usuario siguen ahí (la ruta de datos no cambió con el nombre del paquete). |
| **TC-109** | Gobernanza (§2.11) | Se corre `npm run test:e2e`. | Pasan los tests de teclado, diálogo, responsive y `<title>`. |
| **TC-110** | Restricciones (§2.12) | Se corren `npm run lint`, `npm test` y `npm run test:e2e` al cerrar cada ticket. | Pasan; ningún texto citado en e2e o en el `.docx` cambió. |
| **TC-111** | Cierre (§3) | Se corre el lint de estilos al cerrar la versión. | La línea base es 0 en todas las reglas. |
| **TC-112** | Snapshot (§2.0) | Se revisa el historial de `main` y el Release `v4.0.0`. | El tag `v4.0.0` existe, el Release tiene el instalador y el checklist de regresión (US-49 y US-50), y los dos se publicaron antes del primer commit de un ticket del 4.1. |
| **TC-113** | Snapshot (§2.0) | En una máquina sin el repo, se instala la app desde el Release `v4.0.0`. | La app abre como la 4.0 (pestañas, textos y fuentes de ese momento) y **Settings** muestra `v4.0.0`. |
| **TC-114** | Snapshot (§2.0) | Se revisan las capturas de referencia de `v4.0.0`. | Están las 6 pestañas a 1440, 768 y 375 px, más el Progress Report y el Outcome Report, tomadas con `e2e/fixtures/v4.0.0.json`. |
| **TC-115** | Snapshot (§2.0) | Se compara `docs/SNAPSHOT-4.0.md` con la línea base inicial del lint (B). | Los conteos de cada regla coinciden. |
| **TC-116** | Snapshot (§2.0) | Se instala el 4.1 sobre una instalación 4.0 con datos. | Queda una copia `honeycomb-data.backup-v4.0.0-{fecha}.json` y los datos se ven igual que en el 4.0 (US-50). |

---

## 5. Fuera de Alcance (4.1)

- **Modo oscuro** (se declara `color-scheme: light`, D-4).
- **Lo que cambia flujos o vocabulario** (sigue sin versión asignada, como en el PRD 4.0):
  - renombrar pestañas o términos de marca;
  - el importador con pasos (Select → Review → Done);
  - unificar los dos formularios de alta de **Manual Check-In**;
  - editar nombres o resolver `Needs review` en la vista previa del importador;
  - reducir los controles de fecha del importador (lote, grupo, fila) a uno por contexto.
- Imprimir o exportar el **Progress Report**.
- Abrir el **Progress Report** desde las filas del **Overlap Cross-Referencer**.
- Storybook o un catálogo de componentes publicado (D-8).
- Manifest de PWA o instalación como app web.
- Quitar la prop `onUpdateEnrollment` y la ruta `PUT /api/attendees/:id/enrollment` (toca el
  servidor; ticket técnico aparte).

## 6. Decisiones

- **D-1 (un solo «negro»):** `#1A1A1A` (34 usos) se unifica con `forest` (164 usos). Son casi
  indistinguibles y tener dos obliga a elegir en cada componente.
- **D-2 (mayúsculas):** se mantiene la regla D-16 del PRD 4.0 (Title Case en pestañas, títulos,
  botones, labels y badges; sentence case en mensajes).
- **D-3 (color e ícono):** cada actividad y cada tier se identifican con color **y** ícono Lucide,
  nunca solo con color. Los emoji de tier se reemplazan porque cambian según el sistema operativo
  y los lectores de pantalla los leen mal o no los leen.
- **D-4 (sin modo oscuro):** es una herramienta interna, la paleta está pensada para fondo claro y
  un modo oscuro duplica el costo de cada componente.
- **D-5 (ícono de la app):** se genera desde la «H» de la Fase 0. Si aparece un logo oficial, se
  reemplaza el SVG y se regeneran los íconos sin tocar el código.
- **D-6 (lint con línea base):** un lint absoluto desde el día uno haría fallar todos los PRs hasta
  migrar la última pantalla. La línea base permite activarlo ya, impide sumar deuda y la lleva a 0
  pantalla por pantalla.
- **D-7 (fuentes como paquetes):** paquetes npm de fuentes variables en `dependencies`, en lugar de
  copiar archivos a mano: se actualizan con npm, entran en `npm audit` y electron-builder 26 las
  empaqueta.
- **D-8 (sin Storybook):** una dependencia y una configuración más para un equipo chico. Una página
  de ejemplos solo en desarrollo y los tests de render cubren lo mismo.
- **D-9 (formato de fecha):** `Jun 24, 2026` al mostrar e ISO al guardar. Hoy conviven tres
  formatos; el del header ya era el más legible. Los inputs de fecha nativos no cambian (dependen
  del sistema operativo).
- **D-10 (olas):** el 4.1 se entrega en el orden de §3 para que los tickets no se pisen entre sí. Una pantalla se migra en un solo PR, completa, en lugar
  de migrar una primitiva a la vez en todas las pantallas.
- **D-11 (4.1 y no 5.0):** igual que D-17 del PRD 4.0: nada de esta versión obliga a quien usa la
  app a adaptarse.
- **D-12 (snapshot antes de empezar):** el 4.1 cambia casi toda la interfaz en muchos PRs. Sin
  un punto fijo no hay forma simple de volver a una app que funcionaba ni de mostrar qué mejoró.
  US-49 y US-50 ya definen ese punto fijo para todos los PRD (tag, Release con instalador, backup
  de datos, base y capturas congeladas), así que el 4.1 los reutiliza en lugar de duplicarlos, y
  solo agrega la línea base de la auditoría (S). Las capturas de referencia del 4.0 tienen que
  tomarse con la interfaz del 4.0; por eso van antes que cualquier otro ticket.

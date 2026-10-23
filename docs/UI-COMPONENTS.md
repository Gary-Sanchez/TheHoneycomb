# Componentes base (US-56, US-57)

Botones, campos, contenedores y badges en [`src/components/ui/`](../src/components/ui/), hechos solo
con los tokens de diseño de US-54 ([`DESIGN-TOKENS.md`](DESIGN-TOKENS.md)). Se importan desde el
barrel:

```tsx
import { Button, IconButton, Field, Input, Select, Textarea, DateInput, Card, Panel, Badge, StatusBadge, ActivityBadge } from "./ui";
// US-57
import { Dialog, ConfirmDialog, ToastProvider, useToast, Alert, Tabs, SegmentedControl, DataTable, EmptyState, PageHeader, Stat, ChartFrame } from "./ui";
```

La migración de las pantallas llega con US-59..66; US-59 ya usa `Tabs`, `ToastProvider` (montado en `src/main.tsx`), `Alert` y `Button` en el shell de la app (`App.tsx`).

## Página de ejemplos (solo desarrollo)

Con `npm run dev`, abrir **http://localhost:3000/examples.html**: muestra cada componente con sus
variantes, tamaños y estados. Entrada: [`examples.html`](../examples.html) →
[`src/components/ui/examples/main.tsx`](../src/components/ui/examples/main.tsx) →
`ExamplesPage.tsx`.

- **No entra al build:** `vite build` construye solo `index.html` porque `vite.config.ts` no declara
  `build.rollupOptions.input`. `examples.test.tsx` fija que `vite.config.ts` no mencione `examples`
  (si alguien lo agrega como entrada, el test falla) y que la app no importe la página.
- **CSP:** `examples.html` lleva la misma CSP estricta que `index.html` (lo fija el test); en dev,
  `cspDevServerPlugin` la relaja igual que para `index.html` (`transformIndexHtml` corre para todo
  HTML servido por Vite).
- **Agregar un componente**: escribir una sección y sumarla a `EXAMPLE_SECTIONS` en
  `ExamplesPage.tsx` (`{ id, title, render }`); el índice de arriba se arma solo. La página va
  envuelta en `ToastProvider` (US-57). Las secciones de US-57 cubren: un `Dialog` abierto por un
  botón, un `ConfirmDialog` que nombra objeto y consecuencias, toasts de éxito / error, `Tabs`,
  `SegmentedControl`, una `DataTable` ancha (12 meses, para probar el scroll a 375 px),
  `PageHeader` / `Stat` / `EmptyState`, un `ChartFrame` con un mes sin datos y, al final, contenido
  largo para comprobar el bloqueo de scroll del diálogo.

## Catálogo

| Componente | Props clave | Semántica / accesibilidad |
|---|---|---|
| `Button` | `variant`: `primary` · `secondary` · `ghost` · `danger` · `link`; `size`: `sm` (h-9) · `md` (h-11, default) · `lg` (h-12); `loading`; `icon` | `type="button"` por defecto. Nombre = el texto. `loading` → spinner `aria-hidden`, `aria-busy="true"` y deshabilitado, el nombre no cambia. `link` no tiene alto fijo (va dentro del texto) |
| `IconButton` | `aria-label` (**obligatorio por tipo**), `icon`, `variant` (sin `link`), `loading` | 40 px (`size-10`). Sin `aria-label`, `tsc` falla (`@ts-expect-error` en `IconButton.test.tsx`) |
| `Field` | `label`, `help`, `error`, `required`, `id` | `label[for]` → control; `aria-describedby` = ayuda + error; `aria-invalid="true"` con error; `aria-required="true"` si `required` (el `*` es `aria-hidden`). El `id` va en `Field`, no en el control |
| `Input` · `DateInput` · `Select` · `Textarea` | props nativas; `invalid` para uso suelto | h-11, `border-input-border` (3.42:1), borde `danger` si `aria-invalid`. `Textarea` crece desde `min-h-24`; `Select` es nativo con chevron decorativo. Fuera de un `Field` aceptan `id` / `aria-*` propios |
| `Panel` | `title` (→ `h2`), `actions` | `rounded-panel`. El contenedor de pestaña. Con `title` es un `<section>` nombrado por su encabezado |
| `Card` | `title` (→ `h3`), `actions` | `rounded-card`, `p-6`, `shadow-sm`. Va dentro de un `Panel`: **un solo nivel**, nunca Card dentro de Card |
| `Badge` | `tone`: `neutral` · `danger` · `warning` · `success` · `info`; `size`: `sm` · `md`; `icon` | `<span>` no interactivo; el texto es la etiqueta |
| `StatusBadge` | `tone` (obligatorio): `danger` · `warning` · `success` · `info`; `size` | `text-<tone> bg-<tone>-bg border-<tone>-border` + ícono `aria-hidden`, así el estado no depende solo del color |
| `ActivityBadge` | `activity: ActivityType`; `size` | Texto = nombre de la actividad en `text-activity-*-text` sobre `bg-surface`; borde y punto en el color de relleno (decorativos). Sin ícono (US-58) |

### Diálogos, mensajes, navegación, tablas y gráficos (US-57)

| Componente | Props clave | Semántica / accesibilidad |
|---|---|---|
| `Dialog` | `open`, `onClose`, `title` (→ `h2`), `description`, `footer`, `size`: `sm` · `md` · `lg`; `initialFocusRef`, `returnFocusRef`, `closeLabel` | Portal en `document.body`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby` = título (`useId`), `aria-describedby` = `description`. Al abrir: foco al `initialFocusRef` o al primer enfocable (`FOCUSABLE` incluye `a[href]` y `textarea`); Tab / Shift+Tab dan la vuelta adentro; Escape y clic en el overlay cierran; `body` sin scroll mientras está abierto (se restaura el valor previo); al cerrar, el foco vuelve al elemento enfocado al abrir (o a `returnFocusRef`). Alto máximo `90dvh` con el cuerpo scrolleable. Botón cerrar = `IconButton`. Con diálogos apilados solo el de arriba reacciona a Escape / Tab. Extraído de `OutcomeReportModal` (que todavía no lo usa) |
| `ConfirmDialog` | `open`, `onConfirm`, `onCancel`, `title`, `objectName`, `consequences`, `confirmLabel`, `cancelLabel`, `loading` | Sobre `Dialog`. Nombra el objeto y sus consecuencias en un bloque `danger` que es la descripción del diálogo (`aria-describedby`). Foco inicial en **Cancel** (`secondary`), así un Enter apresurado no destruye nada; el botón que confirma es `danger` y su texto dice la acción (no "OK") |
| `ToastProvider` + `useToast()` | `toast.success(msg, { duration })`, `toast.error(msg, { duration })`, `toast.dismiss(id)` | **Una sola región global** en un portal, `fixed`, `z-[var(--z-toast)]`, sobre todo el contenido. Adentro, dos regiones vivas que existen desde el principio: `role="status"` (éxitos, `polite`) y `role="alert"` (errores, `assertive`). Éxitos se cierran solos a los 5 s; errores quedan hasta cerrarlos (`IconButton` "Dismiss notification"). `useToast` fuera del provider lanza error. Fuera de alcance: toasts con acciones (deshacer / reintentar) o que sobrevivan un reload |
| `Alert` | `tone`: `danger` · `warning` · `success` · `info`; `title`, `onDismiss` | Mensaje en línea con tokens de estado + ícono. `danger` → `role="alert"`; el resto `role="status"` |
| `Tabs` | `label` (nombre del `tablist`), `tabs: { id, label, content }[]`, `value` / `defaultValue`, `onValueChange` | `tablist` / `tab` / `tabpanel`; `aria-selected`, `aria-controls` → panel y panel `aria-labelledby` → tab (todos los paneles están en el DOM, solo el seleccionado muestra contenido). Tabindex itinerante (solo el seleccionado tiene `tabIndex=0`), ← / → con vuelta, Inicio / Fin; la selección sigue al foco. Borde inferior de 2 px siempre presente y un solo peso de letra (Inter): no salta 1 px al seleccionar. **US-59:** `renderList` / `renderPanels` envuelven la lista y los paneles por separado (la app pone la lista en el `<nav>` sticky y los paneles en `<main>`), `panelClassName` (default `pt-4`). Si las pestañas no entran: scroll horizontal sin scrollbar nativa (`scrollbar-none`), borde con fundido (`scroll-fade-x`) + chevron `aria-hidden` del lado que tiene más (`data-overflow-start` / `data-overflow-end`), y la seleccionada se centra (scrollea solo la lista, nunca la página) |
| `SegmentedControl` | `label`, `options: { value, label }[]`, `value` / `defaultValue`, `onValueChange`, `disabled` | `role="radiogroup"` con botones `role="radio"` + `aria-checked`; tabindex itinerante; flechas (←→↑↓, con vuelta) e Inicio / Fin mueven y seleccionan. Borde de 1 px en ambos estados (solo cambia el color) y mismo peso: sin saltos |
| `DataTable` | `caption`, `hideCaption`, `columns: { key, header, cell?, align? }[]`, `rows`, `getRowKey`, `rowHeader` (default `true`), `stickyFirstColumn`, `emptyMessage`, `className` (p. ej. `max-h-80`) | Scroll horizontal propio (la página no scrollea a 375 px): wrapper `overflow-x-auto` + `focus-ring-inset`, `tabIndex=0`, `role="region"` nombrada por el `caption`, así se scrollea con teclado. `<caption>` (oculta con `sr-only` si `hideCaption`), `scope="col"` en encabezados y `scope="row"` en la primera columna. Encabezado `sticky top-0` opaco (`bg-cream`; para que quede fijo al scrollear vertical, darle alto máximo), hover de fila `bg-wheat`, primera columna fija opcional. Fuera de alcance: orden, filtros, paginación |
| `EmptyState` | `title` (→ `h3`, `headingLevel` 2–4), `description`, `icon`, `action` | Ícono decorativo `aria-hidden`; borde punteado |
| `PageHeader` | `title`, `description`, `actions`, `headingId` | Renderiza el **`h2` de la pestaña** (el `h1` es el header de la app); `headingId` para que un `tabpanel` o `section` lo use en `aria-labelledby` |
| `Stat` | `label`, `value`, `hint`, `icon` | `<dl><dt>label</dt><dd>valor</dd><dd>hint</dd></dl>`, **no** un `h3`: la etiqueta describe el valor, no abre una sección. Valor en `text-kpi` |
| `ChartFrame` | `title`, `data: { label, [serie]: number \| null }[]`, `series: { key, name, color? }[]`, `kind`: `line` · `bar`; `labelHeader`, `heightClass`, `controls`, `hideTable` | Eje Y `0`–`100` con `%` (`PERCENT_TICKS`), tooltip con unidad, leyenda con las series reales, `null` = hueco "No data" (nunca dibujado como `0%`, `connectNulls={false}`). Contenedor `role="img"` con `aria-label` que enumera cada punto (`chartAriaLabel`), `accessibilityLayer={false}` y tabla alternativa (`DataTable`) con los mismos datos. Colores neutros / de marca por variables CSS (`--color-chart-primary`, `--color-chart-grid`, `--color-chart-axis`…); los colores por actividad son US-58 |

## Reglas comunes

- **Un solo estilo deshabilitado** (`DISABLED` en `styles.ts`: `opacity-50` + `cursor-not-allowed`)
  para todas las variantes y controles; los hover usan `enabled:` para que un deshabilitado no
  reaccione.
- **Foco:** el anillo global de `:focus-visible` (2 px `forest`, separación 2 px). Ningún componente
  dibuja ni apaga el suyo (`designTokens.test.ts` lo prohíbe).
- **Contraste:** cada par texto/fondo de los badges está en `TEXT_PAIRS` de `designTokens.test.ts`
  (≥ 4.5:1); `Badge.test.tsx` comprueba que el par usado esté ahí.
- **Tipos:** el proyecto no tiene `@types/react`, así que las props nativas pasan por
  `NativeAttributes` (firma de índice) y las props propias de cada componente sí se chequean.
- Cada componente tiene su test de render (`*.test.tsx` al lado) que fija rol, nombre accesible y
  `aria-*`.

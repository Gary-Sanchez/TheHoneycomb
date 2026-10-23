# Componentes base (US-56)

Botones, campos, contenedores y badges en [`src/components/ui/`](../src/components/ui/), hechos solo
con los tokens de diseño de US-54 ([`DESIGN-TOKENS.md`](DESIGN-TOKENS.md)). Se importan desde el
barrel:

```tsx
import { Button, IconButton, Field, Input, Select, Textarea, DateInput, Card, Panel, Badge, StatusBadge, ActivityBadge } from "./ui";
```

Ninguna pantalla los usa todavía (la migración llega con US-59..66).

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
- **Agregar un componente** (p. ej. US-57: diálogos, toasts, tabs, tablas): escribir una sección y
  sumarla a `EXAMPLE_SECTIONS` en `ExamplesPage.tsx` (`{ id, title, render }`); el índice de arriba
  se arma solo.

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

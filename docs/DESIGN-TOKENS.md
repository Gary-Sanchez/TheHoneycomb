# Tokens de diseño (US-54)

Catálogo de los tokens de [PRD 4.1](PRD%20-%20The%20Honeycomb%204.1.md) §2.1, declarados en el
`@theme` de [`src/index.css`](../src/index.css). Cada token de Tailwind v4 genera sus utilidades
(`--color-sage-text` → `text-sage-text`, `bg-sage-text`, `border-sage-text`…; `--radius-card` →
`rounded-card`; `--text-h2` → `text-h2`) y además queda como variable CSS en `:root` (el bloque es
`@theme static`, así que se emiten aunque ninguna pantalla los use todavía).

- **Contraste:** [`src/designTokens.test.ts`](../src/designTokens.test.ts) recorre los pares
  declarados y falla, nombrando el par, si uno de texto queda por debajo de **4.5:1** o uno de borde /
  foco por debajo de **3:1** (WCAG 1.4.3 y 1.4.11). Corre en `npm test`. Un par nuevo se agrega a
  `TEXT_PAIRS`, `BORDER_PAIRS` o `FOCUS_PAIRS` de ese test y a la tabla de este documento.
- Los ratios de abajo son los que calcula ese test (fórmula de luminancia relativa de WCAG 2.x,
  redondeados a 2 decimales). «—» = sin requisito (decorativo o no es texto).
- Fuera de alcance de US-54: migrar las pantallas a estos tokens (US-59..66) y quitar los alias
  (US-67). Hoy ningún componente usa los tokens nuevos; por eso la app se ve igual que en
  `v4.0.0`, salvo el foco y el negro unificado (D-1).

## Alias de los tokens viejos (hasta US-67)

Los nombres `--color-natural-*` siguen existiendo y apuntan a los nuevos con `var()`, con los mismos
valores que en `v4.0.0`: todas las utilidades `*-natural-*` (incluidas las de opacidad, `/20`, `/60`…)
generan exactamente el mismo CSS. Se borran en US-67, cuando la última pantalla esté migrada.

| Alias (viejo) | Apunta a | Valor |
|---|---|---|
| `--color-natural-forest` | `--color-forest` | `#2D3E35` |
| `--color-natural-sage` | `--color-sage` | `#8A9A5B` |
| `--color-natural-sand` | `--color-sand` | `#D4A373` |
| `--color-natural-moss` | `--color-moss` | `#CCD5AE` |
| `--color-natural-wheat` | `--color-wheat` | `#FAEDCD` |
| `--color-natural-cream` | `--color-cream` | `#FDFBF7` |
| `--color-natural-border` | `--color-border` | `#E9E5D9` |

**Un solo negro (D-1):** `#1A1A1A` desapareció de `src/` (45 `text-[#1A1A1A]` → `text-natural-forest`).

## Color

### Marca (valores sin cambios)

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-forest` | `#2D3E35` | Texto principal, botón primario, anillo de foco | 11.34 sobre `surface` · 10.97 sobre `cream` · 9.75 sobre `wheat` · 7.40 sobre `moss` |
| `--color-sage` | `#8A9A5B` | Rellenos, íconos grandes. **No como texto** | 3.06 sobre `surface` (solo gráfico) |
| `--color-sand` | `#D4A373` | Rellenos, acentos. **No como texto** | 2.26 sobre `surface` (solo decorativo) |
| `--color-moss` | `#CCD5AE` | Rellenos y tintes. **No como texto** | 1.53 sobre `surface` (solo decorativo) |
| `--color-wheat` | `#FAEDCD` | Fondos cálidos; texto sobre `forest` | 9.75 sobre `forest` |
| `--color-cream` | `#FDFBF7` | Fondo de la app; texto y foco sobre `forest` | 10.97 sobre `forest` |
| `--color-border` | `#E9E5D9` | Divisores y bordes de tarjeta (decorativos) | 1.26 sobre `surface` · 1.22 sobre `cream` — decorativo, no delimita controles |

### Superficies y texto

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-forest-hover` | `#213028` | Hover del botón primario | Texto `surface` encima: 13.83 |
| `--color-surface` | `#FFFFFF` | Tarjetas, inputs | Texto `forest` encima: 11.34 |
| `--color-sage-text` (v) | `#5F6F3A` | Texto secundario y labels | 5.50 sobre `surface` · 5.32 sobre `cream` · 4.73 sobre `wheat` |
| `--color-sand-text` (v) | `#8A5A2B` | Texto de acento | 5.87 sobre `surface` · 5.68 sobre `cream` · 5.05 sobre `wheat` |
| `--color-text-muted` | `#626E68` | Placeholders y captions | 5.32 sobre `surface` · 5.14 sobre `cream` · 4.57 sobre `wheat` |
| `--color-input-border` (v) | `#8F8B7A` | Borde de controles (inputs, selects) | 3.42 sobre `surface` · 3.31 sobre `cream` (no usar sobre `wheat`: 2.94) |

- `--color-text-muted`: el PRD propone «forest al ~70 %, sólido». Forest al 70 % sobre blanco
  (`#6C7872`) da 4.60 sobre `surface` pero **4.45 sobre `cream`** (el fondo de la app), así que se
  fijó forest al ~75 % (`#626E68`).
- Los tres (v) se confirmaron con el cálculo: los valores propuestos por el PRD cumplen y se
  mantienen.

### Estados

Texto = nombre pelado, fondo = `-bg`, borde = `-border`. El borde cumple 3:1 contra su fondo para
que la alerta se delimite sin depender solo del tinte.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-danger` (v) | `#B3261E` | Texto de error, acción destructiva | 5.72 sobre `danger-bg` · 6.54 sobre `surface` |
| `--color-danger-bg` | `#FDECEA` | Fondo de alerta de error | — |
| `--color-danger-border` | `#D2554C` | Borde de alerta de error | 3.57 sobre `danger-bg` |
| `--color-warning` | `#7A4B12` | Texto de advertencia (derivado de sand) | 6.73 sobre `warning-bg` · 7.39 sobre `surface` |
| `--color-warning-bg` | `#FDF3E6` | Fondo de advertencia | — |
| `--color-warning-border` | `#A8733A` | Borde de advertencia | 3.70 sobre `warning-bg` |
| `--color-success` | `#4A5B22` | Texto de éxito (derivado de moss) | 6.75 sobre `success-bg` · 7.47 sobre `surface` |
| `--color-success-bg` | `#F2F5E6` | Fondo de éxito | — |
| `--color-success-border` | `#788A42` | Borde de éxito | 3.44 sobre `success-bg` |
| `--color-info` | `#34544A` | Texto informativo (derivado de sage, más frío) | 7.45 sobre `info-bg` · 8.36 sobre `surface` |
| `--color-info-bg` | `#EEF3F0` | Fondo informativo | — |
| `--color-info-border` | `#648479` | Borde informativo | 3.66 sobre `info-bg` |

### Hive Status (`tier-*`)

Mismos valores que [`src/beehavior.ts`](../src/beehavior.ts): fg = `textColor`, `-bg` = `bgLight`,
`-border` = `color`. El test verifica que sigan iguales a `getHiveTier` / `NO_DATA_TIER`.

| Token (fg · bg · border) | Valores | Uso | Contraste texto | Borde sobre bg |
|---|---|---|---|---|
| `--color-tier-busy-bee` · `-bg` · `-border` | `#7A5E00` · `#FFFDF0` · `#D4AF37` | Busy Bee (76–100 %) | 6.00 | 2.06 — decorativo |
| `--color-tier-forager` · `-bg` · `-border` | `#804C00` · `#FFF7E6` · `#E68A00` | Forager (51–75 %) | 6.67 | 2.46 — decorativo |
| `--color-tier-hatcher` · `-bg` · `-border` | `#6B5800` · `#FEFBEA` · `#B89F30` | Hatcher (26–50 %) | 6.69 | 2.51 — decorativo |
| `--color-tier-dormant` · `-bg` · `-border` | `#2F4F4F` · `#E6ECEC` · `#2F4F4F` | Dormant (0–25 %) | 7.47 | 7.47 |
| `--color-tier-no-data` · `-bg` · `-border` | `#4B5563` · `#F3F4F6` · `#6B7280` | No data | 6.87 | 4.39 |

El borde del badge es decorativo (la etiqueta de texto ya identifica el tier), por eso no entra en
el chequeo de 3:1; sí el texto sobre su fondo.

### Actividades (`activity-*`)

Definidas una sola vez en [`src/activityTheme.ts`](../src/activityTheme.ts) (US-58): por actividad, su
token de relleno, su token de texto, las clases Tailwind equivalentes y su ícono Lucide. El color
nunca va solo: donde una actividad se identifique por color, va con su ícono (o su nombre).

Los rellenos cumplen 3:1 contra blanco (WCAG 1.4.11) y se distinguen con deuteranopia: se separan
por luminosidad y por el eje azul–amarillo, no sólo por rojo–verde. `src/designTokens.test.ts`
simula deuteranopia (Machado et al. 2009, severidad 1.0, sobre sRGB lineal) y exige ΔE (CIE76) ≥ 20
entre cada par; el mínimo actual es 31.1 (Speakeasy / Music Room).

| Token | Valor | Ícono | Uso | Contraste |
|---|---|---|---|---|
| `--color-activity-speakeasy` | `#4A7A3C` | `MessagesSquare` | Relleno Speakeasy | 5.07 sobre `surface` |
| `--color-activity-speakeasy-text` | `var(--color-activity-speakeasy)` | | Texto Speakeasy | 5.07 sobre `surface` · 4.91 sobre `cream` |
| `--color-activity-reading-club` | `#2D3E35` | `BookOpen` | Relleno Reading Club | 11.34 sobre `surface` |
| `--color-activity-reading-club-text` | `var(--color-forest)` = `#2D3E35` | | Texto Reading Club | 11.34 sobre `surface` · 10.97 sobre `cream` |
| `--color-activity-music-room` | `#C68030` | `Music` | Relleno Music Room | 3.22 sobre `surface` (sólo relleno, no texto) |
| `--color-activity-music-room-text` | `var(--color-sand-text)` = `#8A5A2B` | | Texto Music Room | 5.87 sobre `surface` · 5.68 sobre `cream` |
| `--color-activity-writing-hood` | `#7A5C9E` | `PenLine` | Relleno Writing Hood | 5.45 sobre `surface` |
| `--color-activity-writing-hood-text` | `var(--color-activity-writing-hood)` | | Texto Writing Hood | 5.45 sobre `surface` · 5.27 sobre `cream` |

ΔE bajo deuteranopia entre pares: Speakeasy–Reading Club 32.3 · Speakeasy–Music Room 31.1 ·
Speakeasy–Writing Hood 57.2 · Reading Club–Music Room 63.0 · Reading Club–Writing Hood 39.3 ·
Music Room–Writing Hood 85.5.

Los rellenos son hex propios (antes eran alias de sage / forest / sand / moss): los tokens de marca
no cambian, porque el resto de la UI los usa. Las pantallas adoptan el módulo al migrar (US-59..US-66).

### Gráficos (`chart-*`)

recharts los lee con [`src/chartTheme.ts`](../src/chartTheme.ts) (US-58): `getChartTheme()` resuelve
cada `--color-chart-*` con `getComputedStyle` sobre `:root` y devuelve colores planos (`series1..4`,
`series`, `activity[<actividad>]`, `primary`, `grid`, `axis`, `axisMuted`, `tooltipBg`,
`tooltipText`, `tooltipAccent`). Sin DOM (tests, servidor) o con la variable vacía usa
`CHART_FALLBACK`, los mismos valores literales; `src/chartTheme.test.ts` verifica que coincidan con
`index.css`. Los paneles lo adoptan al migrar; hoy los gráficos siguen con sus constantes.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-chart-1` … `--color-chart-4` | `activity-speakeasy`, `-reading-club`, `-music-room`, `-writing-hood` | Serie por actividad (mismo orden que `ACTIVITIES`) | ver Actividades |
| `--color-chart-primary` | `var(--color-forest)` | Serie única (barras / líneas de los paneles) | 11.34 sobre `surface` |
| `--color-chart-grid` | `var(--color-border)` = `#E9E5D9` | Grilla | 1.26 — decorativo |
| `--color-chart-axis` | `var(--color-forest)` | Ticks y leyenda | 11.34 sobre `surface` |
| `--color-chart-axis-muted` | `var(--color-sage-text)` = `#5F6F3A` | Ticks secundarios | 5.50 sobre `surface` |
| `--color-chart-tooltip-bg` | `var(--color-forest)` | Fondo del tooltip | — |
| `--color-chart-tooltip-text` | `var(--color-cream)` | Texto del tooltip | 10.97 sobre `chart-tooltip-bg` |
| `--color-chart-tooltip-accent` | `var(--color-wheat)` | Ítems del tooltip | 9.75 sobre `chart-tooltip-bg` |

`--color-chart-axis-muted` reemplaza al `#6B7F60` de los ticks del Progress Report (4.35:1 sobre
blanco, no llega a 4.5); el componente lo adopta al migrar.

## Texto

| Token | Tamaño / interlineado | Uso |
|---|---|---|
| `--text-micro` | 12 px / 16 px (`0.75rem` / `1rem`) | Único micro-label (uppercase, `tracking-wider`) |
| `--text-body` | 14 px / 20 px | Cuerpo |
| `--text-body-lg` | 16 px / 24 px | Cuerpo destacado |
| `--text-h3` | 18 px / 28 px | Títulos de tarjeta |
| `--text-h2` | 24 px / 32 px | Títulos de sección |
| `--text-h1` | 30 px / 36 px | Título de pantalla (rango del PRD 28–30) |
| `--text-kpi` | 36 px / 40 px | Cifras de los KPI (rango del PRD 36–40; igual a `text-4xl` de hoy) |

Nombres propios: no pisan `--text-xs` / `--text-sm` / … de Tailwind, que siguen igual.

## Radios

| Token | Valor | Uso |
|---|---|---|
| `--radius-control` | 12 px | Botones, inputs, selects |
| `--radius-card` | 24 px | Tarjetas |
| `--radius-panel` | 32 px | Solo el contenedor de pestaña |
| `--radius-chip` | full (`calc(infinity * 1px)`) | Chips y badges |

## Sombras

| Token | Valor | Uso |
|---|---|---|
| `--shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | Tarjetas |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Flotantes (dropdowns, tooltips) |
| `--shadow-2xl` | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | Diálogos |

Son los mismos valores que los default de Tailwind: declararlos no cambia `shadow-sm`, `shadow-md`
ni `shadow-2xl`.

## z-index

| Token | Valor | Uso |
|---|---|---|
| `--z-nav` | 20 | Barra de pestañas (sticky) |
| `--z-header` | 30 | Header (sticky) |
| `--z-dropdown` | 40 | Menús y popovers |
| `--z-dialog` | 50 | Diálogos modales |
| `--z-toast` | 60 | Toasts |

Son variables (`z-[var(--z-nav)]`), no utilidades con nombre.

## Movimiento

| Token | Valor | Uso |
|---|---|---|
| `--duration-fast` | 150 ms | Hover, cambios de color |
| `--duration-base` | 250 ms | Entradas: `animate-fade-in`, `animate-slide-up`, `animate-slide-down` (Fase 0) ya la usan |

`prefers-reduced-motion` las sigue apagando (bloque al final de `src/index.css`).

## Esquema de color

`:root { color-scheme: light; }` — sin modo oscuro (D-4): controles nativos y scrollbars quedan
claros aunque el sistema operativo esté en oscuro.

## Anillo de foco

Regla global en `@layer base`: todo elemento con `:focus-visible` (foco por teclado; un clic con el
mouse en un botón no lo muestra) tiene un `outline` de **2 px `forest` con 2 px de separación**.

| Variable | Valor | Uso | Contraste |
|---|---|---|---|
| `--focus-ring-width` | `2px` | Grosor | — |
| `--focus-ring-offset` | `2px` | Separación | — |
| `--focus-ring-color` | `var(--color-forest)` | Color | 11.34 sobre `surface` · 10.97 sobre `cream` · 9.75 sobre `wheat` |

- Los campos ya no apagan el outline ni dibujan su anillo sage al 20 % (~1.2:1); los botones que
  tenían su propio anillo `forest` con `ring` pasaron a la regla global, así no hay dos anillos.
- **`focus-ring-inset`** (utilidad): dentro de un contenedor con `overflow` cuyos ítems tocan el
  borde, el anillo exterior se recortaría. Esta clase lleva el anillo hacia adentro del elemento
  (`outline-offset: -4px`), manteniendo los 2 px de grosor y 2 px de separación con el borde. La
  usa la barra de pestañas (`overflow-x-auto`).
- **`focus-ring-on-dark`** (utilidad): sobre fondos `forest` un anillo `forest` no se ve; esta
  clase lo cambia a `cream` (10.97:1 sobre `forest`). La usa la tarjeta «Compare Two Activities»
  del Overlap Cross-Referencer.
- La lista de chips «Shared Colleague Cohort» (`overflow-y-auto`) suma `p-1 -m-1` (y su `max-h`
  pasa de 120 a 128 px) para que el anillo entre sin cambiar el área visible.

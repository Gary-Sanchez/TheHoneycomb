# Línea base de la auditoría — snapshot 4.0 (US-51)

Medición de la app tal como quedó al cerrar el PRD 4.0, antes de cualquier ticket del 4.1. Es el
punto de comparación de la auditoría UX/UI (2026-10-07) y del lint de estilos de US-53: al cerrar
el PRD 4.1 se repite igual (ver [Cómo repetir la medición](#cómo-repetir-la-medición)) y se compara
contra estas tablas.

| | |
|---|---|
| Tag | `v4.0.0` (anotado, objeto `3355387`) → commit `26b4243241317c16af96a6763f5771d6a5645c90` (merge del PR #62, US-50) |
| Fecha del commit | 2026-10-20 12:26:50 -04:00 |
| Fecha del tag | 2026-10-20 12:30:52 -04:00 |
| Fecha de la medición | 2026-10-20 |
| Base de datos | `e2e/fixtures/v4.0.0.json` (US-50): seed demo, una nota y un fingerprint demo. Sin datos reales |
| Instancia | Electron 44.5.1 lanzado por Playwright 1.63.0 sobre una **copia temporal** de la base (`HONEYCOMB_DB_PATH` / `HONEYCOMB_CONFIG_PATH` en un directorio temporal), puerto propio (3105 capturas, 3106 métricas), sesión admin con contraseña de prueba, `--force-device-scale-factor=1` (DPR 1), contenido de la ventana fijado con `setContentSize` |
| Código medido | `src/` del tag (el script lee `git show v4.0.0:<archivo>`, no el checkout). Esta US no toca `src/` |

## 1. Conteos de código (lo que vigila el lint de US-53)

Script: `node scripts/snapshot-code-counts.mjs v4.0.0`. Cuenta **por ocurrencia** en los 23
archivos `.ts`/`.tsx` de `src/` (sin `*.test.*`). Una clase con variante u opacidad
(`hover:bg-[#…]`, `bg-[#…]/45`) cuenta igual: la regex busca la subcadena. US-53 tiene que
importar `STYLE_RULES` / `countStyleRules` / `checkAnimations` de ese script para que su línea base
sea exactamente esta (TC-115).

| Regla | Regex | Total v4.0.0 | Auditoría (Apéndice B, código anterior) |
|---|---|---:|---|
| Hex arbitrarios en clases `bg-[#…]` / `text-[#…]` / `border-[#…]` | `(bg\|text\|border)-\[#[0-9A-Fa-f]{3,8}\]` | **132** | 124 |
| Tamaños de texto sueltos `text-[Npx]` | `text-\[[0-9.]+px\]` | **28** (`[10px]` 19 · `[11px]` 7 · `[9px]` 2) | 29 (`[10px]` 19 · `[11px]` 8 · `[9px]` 2) |
| Radios sueltos `rounded-[…]` (incluye `rounded-t-[…]`, `rounded-tl-[…]`…) | `rounded(-[trblse]{1,2})?-\[[^\]]+\]` | **39** (`[24px]` 18 · `[32px]` 18 · `[20px]` 2 · `[40px]` 1) | 36 |
| `animate-*` sin keyframes | clase usada en `.tsx`, no built-in de Tailwind (`spin`, `ping`, `pulse`, `bounce`, `none`) y sin `--animate-<nombre>` en `@theme` de `src/index.css`; y `--animate-*` cuyo `@keyframes` no existe | **0** clases / 0 usos (de 7 clases / 22 usos) | 16 usos sin definir de 20, en 6 clases |
| Colores Tailwind crudos `amber-*` / `red-*` / `gray-*` | `\b(amber\|red\|gray)-[0-9]{2,3}\b` | **39** en 4 archivos | 19 en 3 archivos |
| *Informativo:* hex con otro prefijo | `(?<![\w-])(?!(?:bg\|text\|border)-)[a-z]+(?:-[a-z]+)*-\[#[0-9A-Fa-f]{3,8}\]` | 3 (`accent-[#2D3E35]`, `from-[#2D3E35]`, `to-[#1E2923]`) | — |

Los números de la auditoría se tomaron sobre código anterior al cierre del 4.0 (los tickets del
4.0 posteriores agregaron pantallas y definieron las animaciones, M1); quedan solo como referencia
histórica. **La línea base es la columna v4.0.0.**

### Detalle por archivo

| Archivo | hex | `text-[Npx]` | `rounded-[…]` | crudos |
|---|---:|---:|---:|---:|
| `src/App.tsx` | 4 | 1 | — | — |
| `src/components/AttendanceLogger.tsx` | 13 | 1 | 6 | — |
| `src/components/AttendeeDirectory.tsx` | 3 | — | 3 | 8 |
| `src/components/CrossReferenceHub.tsx` | 17 | 4 | 6 | — |
| `src/components/DashboardPanels.tsx` | 4 | — | 2 | — |
| `src/components/DashboardStats.tsx` | 39 | 14 | 8 | 7 |
| `src/components/DocumentParser.tsx` | 23 | 4 | 5 | 17 |
| `src/components/OutcomeReportModal.tsx` | 10 | — | 1 | 7 |
| `src/components/ProgressReportModal.tsx` | 13 | 4 | 5 | — |
| `src/components/SettingsPanel.tsx` | 6 | — | 3 | — |
| **Total** | **132** | **28** | **39** | **39** |

- **Hex por valor:** `text-[#1A1A1A]` 45 · `bg-[#213028]` 15 · `border-[#CCD5AE]` 15 ·
  `bg-[#CCD5AE]` 12 · `border-[#E9E5D9]` 10 · `text-[#CCD5AE]` 6 · `bg-[#FAEDCD]` 5 ·
  `border-[#D4A373]` 4 · `text-[#8A9A5B]` 3 · `bg-[#2D3E35]` 2 · `bg-[#FDFBF7]` 2 · 1 cada uno:
  `bg-[#556B2F]`, `bg-[#FEFBEA]`, `bg-[#FFF7E6]`, `bg-[#FFFDF0]`, `border-[#F0E68C]`,
  `border-[#FFA500]`, `border-[#FFD700]`, `text-[#2F4F4F]`, `text-[#6B5800]`, `text-[#7A5E00]`,
  `text-[#804C00]`, `text-[#855B32]`, `text-[#FDFBF7]`.
- **Crudos por valor:** `red-50` 5 · `amber-300` 4 · `amber-50` 4 · `amber-700` 4 · `red-800` 4 ·
  `red-200` 3 · `red-600` 3 · `red-700` 3 · `gray-100` 2 · `gray-200` 2 · `amber-400`, `amber-600`,
  `amber-800`, `gray-500`, `gray-700` 1 cada uno.
- **Animaciones usadas:** `animate-fade-in` 10 · `animate-spin` 4 (built-in) ·
  `animate-bounce-subtle` 2 · `animate-slide-down` 2 · `animate-slide-up` 2 ·
  `animate-pulse-subtle` 1 · `animate-pulse-slow` 1. Las 6 no built-in tienen `--animate-*` en
  `@theme` y sus `@keyframes` existen.

## 2. Por pestaña y ancho (1440, 768, 375 px)

Spec: `e2e/snapshot-metrics.spec.ts` (solo con `HONEYCOMB_SNAPSHOT_METRICS=1`). Ventana de
1440×900, 768×1024 y 375×812 CSS px a DPR 1 (Electron no tiene `minWidth`: 375 px funciona sin
recorte del sistema). Antes de medir aplica `e2e/visual.css` (sin scrollbar, como las capturas).

- **Texto < 12 px con información:** elemento visible (`checkVisibility` y rect no vacío), sin
  ancestro `aria-hidden="true"`, con un nodo de texto hijo directo que tiene una letra o un dígito,
  y `font-size` calculado < 12 px. Incluye SVG `text`/`tspan`. Cuenta elementos, no caracteres.
- **Controles sin nombre accesible:** visibles entre `button, a[href], input:not([type=hidden]),
  select, textarea, [role=button|link|tab|checkbox|combobox], summary`. Nombre = `aria-label` →
  `aria-labelledby` → `<label>` (for o envolvente) → `title` → `placeholder` → `value` de botones
  `input` → texto visible (sin subárboles `aria-hidden`, con `alt` de `img` y `aria-label` de
  `svg`). Vacío = sin nombre.
- **Scroll horizontal de página:** `document.documentElement.scrollWidth` ≠ `window.innerWidth`.

| Pestaña | Ancho | Texto < 12 px | Por tamaño | Controles sin nombre / visibles | Scroll horizontal (scrollWidth / innerWidth) |
|---|---:|---:|---|---:|---|
| Dashboard | 1440 | 68 | 10px: 55 · 11px: 13 | 0 / 16 | no (1440 / 1440) |
| Manual Check-In | 1440 | 4 | 10px: 1 · 11px: 3 | 0 / 31 | no (1440 / 1440) |
| Caserits & Progress | 1440 | 1 | 10px: 1 | 0 / 26 | no (1440 / 1440) |
| Overlap Cross-Referencer | 1440 | 7 | 10px: 3 · 9px: 4 | 0 / 14 | no (1440 / 1440) |
| Import Forage Logs | 1440 | 3 | 10px: 2 · 11px: 1 | 0 / 8 | no (1440 / 1440) |
| Settings | 1440 | 1 | 10px: 1 | 0 / 8 | no (1440 / 1440) |
| Dashboard | 768 | 68 | 10px: 55 · 11px: 13 | 0 / 16 | no (768 / 768) |
| Manual Check-In | 768 | 4 | 10px: 1 · 11px: 3 | 0 / 31 | no (768 / 768) |
| Caserits & Progress | 768 | 1 | 10px: 1 | 0 / 26 | no (768 / 768) |
| Overlap Cross-Referencer | 768 | 7 | 10px: 3 · 9px: 4 | 0 / 14 | no (768 / 768) |
| Import Forage Logs | 768 | 3 | 10px: 2 · 11px: 1 | 0 / 8 | no (768 / 768) |
| Settings | 768 | 1 | 10px: 1 | 0 / 8 | no (768 / 768) |
| Dashboard | 375 | 68 | 10px: 55 · 11px: 13 | 0 / 16 | no (375 / 375) |
| Manual Check-In | 375 | 4 | 10px: 1 · 11px: 3 | 0 / 31 | **sí (398 / 375)** |
| Caserits & Progress | 375 | 1 | 10px: 1 | 0 / 26 | no (375 / 375) |
| Overlap Cross-Referencer | 375 | 7 | 10px: 3 · 9px: 4 | 0 / 14 | **sí (603 / 375)** |
| Import Forage Logs | 375 | 3 | 10px: 2 · 11px: 1 | 0 / 8 | no (375 / 375) |
| Settings | 375 | 1 | 10px: 1 | 0 / 8 | no (375 / 375) |

- **Texto < 12 px:** el subtítulo del header (`Attendance & Cross-Referencing`, 10 px) aparece en
  las 6 pestañas. En el Dashboard, los 55 de 10 px son sobre todo encabezados de la matriz y textos
  de los tiers del Bee-havior Hub; en Overlap, los 4 de 9 px son los badges `Super Active` /
  `Multi-Activity`; en Manual Check-In, los 3 de 11 px son los nombres de la lista rápida. El
  conteo no cambia con el ancho (los tamaños son fijos, no responsivos).
- **Controles sin nombre accesible:** 0 en las 18 combinaciones (lista de detalle vacía). Los
  botones de solo ícono de estas pantallas ya tienen `aria-label` en el 4.0.
- **Scroll horizontal:** solo a 375 px, en Manual Check-In (+23 px) y Overlap Cross-Referencer
  (+228 px). Las capturas de página completa de esas dos pestañas a 375 salen de 398 y 603 px de
  ancho por eso.
- **Observación de las capturas (no medida por la spec):** el **Outcome Report** abierto queda
  debajo del header y la nav sticky (el título y el botón de cerrar quedan tapados a 1440 y 375 px,
  y el overlay no cubre el borde inferior de la página). Se ve en `outcome-report-*-win32.png`; la
  spec de capturas cierra ese modal con un `click` despachado porque el header intercepta el click
  real. Queda registrado como está; arreglarlo es de los tickets del 4.1.

Repetibilidad (QA-04): cinco corridas seguidas dieron el mismo JSON byte a byte (SHA-256
`0249f4241034ef2d…5b781c91`). Antes de medir, la spec termina las animaciones finitas (como
`animations: "disabled"` en las capturas): sin eso, el `animate-fade-in` de entrada (opacidad 0 al
empezar) hacía que un panel de Import Forage Logs a veces contara como invisible.

## 3. Contraste (Apéndice A)

Recalculado con la fórmula de luminancia relativa de WCAG 2.x a partir de los colores del tag:
tokens `--color-natural-*` del `@theme` de `src/index.css`, colores de tier de `src/beehavior.ts`
(`getHiveTier`), `#6B7F60` de `ProgressReportModal.tsx`, y los defaults de Tailwind v4 (`oklch` en
`node_modules/tailwindcss/theme.css`, convertidos a sRGB: amber-700 `#BB4D00`, amber-50 `#FFFBEB`,
red-600 `#E7000B`). Los pares con opacidad se componen en sRGB sobre el fondo indicado (Tailwind
mezcla `/NN` en oklab: puede variar ±1 por canal). Veredicto = AA texto (4.5) / AA UI (3.0).

| Par | Texto | Fondo | Auditoría | Veredicto auditoría | Recalculado | Veredicto v4.0.0 |
|---|---|---|---:|---|---:|---|
| forest / white | `#2D3E35` | `#FFFFFF` | 11.34 | P / P | 11.34 | P / P |
| forest / cream | `#2D3E35` | `#FDFBF7` | 10.97 | P / P | 10.97 | P / P |
| sage / white | `#8A9A5B` | `#FFFFFF` | 3.06 | F / límite | 3.06 | F / P (límite) |
| sage / cream | `#8A9A5B` | `#FDFBF7` | 2.96 | F / F | 2.96 | F / F |
| sage / wheat | `#8A9A5B` | `#FAEDCD` | 2.63 | F / F | 2.63 | F / F |
| sand / white | `#D4A373` | `#FFFFFF` | 2.26 | F / F | 2.26 | F / F |
| sand / cream | `#D4A373` | `#FDFBF7` | 2.19 | F / F | 2.19 | F / F |
| sand / wheat | `#D4A373` | `#FAEDCD` | 1.94 | F / F | 1.94 | F / F |
| sand / sand 10 % (texto de error; fondo sand 10 % sobre cream) | `#D4A373` | `#F9F2EA` | ~2.0–2.1 | F / F | 2.04 | F / F |
| moss / white | `#CCD5AE` | `#FFFFFF` | 1.53 | F / F | 1.53 | F / F |
| white / sage (botón Present activo) | `#FFFFFF` | `#8A9A5B` | 3.06 | F (12 px bold) / P | 3.06 | F / P |
| white / sand (botón Absent activo) | `#FFFFFF` | `#D4A373` | 2.26 | F / F | 2.26 | F / F |
| natural-border / white (bordes de controles) | `#E9E5D9` | `#FFFFFF` | 1.26 | — / F | 1.26 | — / F |
| forest 60 % sobre la nav (wheat 20 % sobre cream) | `#80887F` | `#FCF8EF` | ~3.4 | F / P | 3.45 | F / P |
| forest 70 % / white | `#6C7872` | `#FFFFFF` | ~4.7 | límite / P | 4.60 | P (límite) / P |
| tier Busy Bee `color` como texto / white | `#D4AF37` | `#FFFFFF` | 2.06 | F / F | 2.10 | F / F |
| tier Forager `color` como texto / white | `#E68A00` | `#FFFFFF` | 2.46 | F / F | 2.63 | F / F |
| tier Hatcher `color` como texto / white | `#B89F30` | `#FFFFFF` | 2.51 | F / F | 2.61 | F / F |
| tier Dormant `color` como texto / white | `#2F4F4F` | `#FFFFFF` | 7.47 | P / P | 8.93 | P / P |
| tier Busy Bee `textColor` / `bgLight` | `#7A5E00` | `#FFFDF0` | 6.0–7.5 | P / P | 6.00 | P / P |
| tier Forager `textColor` / `bgLight` | `#804C00` | `#FFF7E6` | 6.0–7.5 | P / P | 6.67 | P / P |
| tier Hatcher `textColor` / `bgLight` | `#6B5800` | `#FEFBEA` | 6.0–7.5 | P / P | 6.69 | P / P |
| `--` de la matriz (`#FAEDCD`) / white | `#FAEDCD` | `#FFFFFF` | 1.16 | F / F | 1.16 | F / F |
| `#6B7F60` / white (ticks del gráfico del modal) | `#6B7F60` | `#FFFFFF` | 4.35 | F (por poco) / P | 4.35 | F / P |
| amber-700 / amber-50 | `#BB4D00` | `#FFFBEB` | ~4.9 | P / P | 4.85 | P / P |
| red-600 / white | `#E7000B` | `#FFFFFF` | ~4.8 | P / P | 4.77 | P / P |

- Coinciden con la auditoría todos los pares de tokens `natural-*`. Difieren los de `color` de tier
  como texto (2.10 / 2.63 / 2.61 / 8.93 contra 2.06 / 2.46 / 2.51 / 7.47): la auditoría los midió
  sobre otro fondo o con otros valores; el veredicto no cambia (F×3, P×1).
- forest 70 % / white da 4.60 (pasa por poco); la auditoría lo daba ~4.7 "límite".
- Bordes (`natural-border`): no es texto, solo aplica el umbral de UI (3.0).

## 4. Resultados sobre el tag

Corridos en un worktree temporal y separado en `v4.0.0` (`git worktree add --detach … v4.0.0`),
con `npm ci`, Node 24.20.0, Windows 11. Ese worktree se borró al terminar.

| Comando | Resultado |
|---|---|
| `npm ci` | OK — 569 paquetes, `found 0 vulnerabilities` |
| `npm run lint` (`tsc --noEmit`) | OK — 0 errores |
| `npm test` (Vitest) | OK — 16 archivos, **222 tests pasados**, 0 fallados |
| `npm run test:e2e` (build + Playwright/Electron) | OK — build sin errores, **14 tests pasados**, 0 fallados, 0 saltados: `shutdown.spec.ts` 6, `smoke.spec.ts` 2, `visual.spec.ts` 6 (las 6 pestañas a 1440 contra `e2e/snapshots/current/`) |

En la rama de US-51 (que suma el script, su test, la spec de métricas y las 18 capturas, sin tocar
`src/`) los mismos comandos dan: lint OK; `npm test` 17 archivos / 229 tests (los 7 nuevos son de
`scripts/snapshot-code-counts.test.ts`); `npm run test:e2e` 32 pasados y 1 saltado
(`snapshot-metrics.spec.ts`, que solo corre con `HONEYCOMB_SNAPSHOT_METRICS=1`).

## 5. Capturas de referencia v4.0.0

En `e2e/snapshots/v4.0.0/` (congeladas) y `e2e/snapshots/current/` (las que compara
`e2e/visual.spec.ts`), todas con la base `e2e/fixtures/v4.0.0.json`, DPR 1, scrollbar oculta
(`visual.css`), `animations: "disabled"`, `caret: "hide"`, mouse en (0, 0), coincidencia exacta.

| Captura | Tamaño (px) | Origen |
|---|---|---|
| `dashboard-win32.png` | 1440×2593 | US-50 |
| `manual-check-in-win32.png` | 1440×1489 | US-50 |
| `caserits-progress-win32.png` | 1440×1084 | US-50 |
| `overlap-cross-referencer-win32.png` | 1440×1502 | US-50 |
| `import-forage-logs-win32.png` | 1440×943 | US-50 |
| `settings-win32.png` | 1440×900 | US-50 |
| `dashboard-768-win32.png` / `dashboard-375-win32.png` | 768×3009 / 375×4380 | US-51 |
| `manual-check-in-768-win32.png` / `manual-check-in-375-win32.png` | 768×1541 / 398×1985 | US-51 |
| `caserits-progress-768-win32.png` / `caserits-progress-375-win32.png` | 768×1180 / 375×1353 | US-51 |
| `overlap-cross-referencer-768-win32.png` / `overlap-cross-referencer-375-win32.png` | 768×1963 / 603×2498 | US-51 |
| `import-forage-logs-768-win32.png` / `import-forage-logs-375-win32.png` | 768×1228 / 375×1565 | US-51 |
| `settings-768-win32.png` / `settings-375-win32.png` | 768×1024 / 375×812 | US-51 |
| `progress-report-1440-win32.png` / `-768-` / `-375-` | 1440×900 / 768×1024 / 375×812 | US-51 |
| `outcome-report-1440-win32.png` / `-768-` / `-375-` | 1440×900 / 768×1024 / 375×812 | US-51 |

- Pestañas: página completa (`fullPage: true`) a 768×1024 y 375×812. El ancho de 398 y 603 px de
  dos capturas a 375 es el scroll horizontal de la sección 2.
- Modales: solo el viewport (`fullPage: false`), son overlays fijos. Progress Report: pestaña
  Caserits & Progress, fila **Elena Rostova**, botón **Progress Report**; espera a que las barras
  del gráfico (recharts, animadas por JS) dejen de cambiar. Outcome Report: Dashboard, botón
  **Generate Outcome Report** (`#generate-outcome-report`).
- Antes de cada pestaña la spec vuelve el scroll de la página y de la barra de pestañas a 0, así
  una captura no depende de la pestaña anterior (a 768/375 la barra de pestañas scrollea).
- Las 6 capturas de 1440 de US-50 no se regeneraron (`git status` limpio sobre esos archivos).

## Cómo repetir la medición

Al cerrar el PRD 4.1, sobre el tag nuevo (`v4.1.0`), y comparar con este documento:

```bash
# 1. Conteos de código: lee src/ del ref, no del checkout (sirve desde cualquier rama)
node scripts/snapshot-code-counts.mjs v4.1.0          # markdown (secciones 1 y 3)
node scripts/snapshot-code-counts.mjs v4.1.0 --json   # lo mismo en JSON

# 2. Métricas por pestaña y ancho: corre sobre el código del checkout, así que en el tag
git worktree add --detach ../hc-v4.1.0 v4.1.0
cd ../hc-v4.1.0 && npm ci && npm run build
HONEYCOMB_SNAPSHOT_METRICS=1 npx playwright test e2e/snapshot-metrics.spec.ts
#    → tabla en la salida y test-results/snapshot-metrics.json (Playwright vacía test-results/
#      en cada corrida: copiarlo, o HONEYCOMB_SNAPSHOT_METRICS_OUT=<ruta> para escribirlo afuera).
#    Correrlo dos veces: el JSON tiene que salir idéntico.

# 3. Lint, unit y e2e sobre el tag (en el mismo worktree)
npm run lint && npm test && npm run test:e2e

# 4. Limpiar
cd - && git worktree remove ../hc-v4.1.0
```

- La spec usa la base fija de la versión del checkout (`e2e/fixtures/vX.Y.0.json`, por el
  `MAJOR.MINOR` de `package.json`), siempre en una copia temporal, nunca datos reales. Para medir un
  tag que no tiene `snapshot-metrics.spec.ts` (anterior a US-51), copiar
  `e2e/snapshot-metrics.spec.ts` y `e2e/fixtures/visual-app.ts` a ese worktree.
- Las métricas dependen de las fuentes de Google Fonts (hasta US-55): correr con red.
- **US-53** tiene que importar las reglas de `scripts/snapshot-code-counts.mjs`
  (`STYLE_RULES`, `isStyleSource`, `countStyleRules`, `checkAnimations`) en lugar de copiarlas: así
  su línea base en `v4.0.0` es la de la sección 1 (TC-115). Si una regla cambia, se cambia ahí y se
  vuelve a medir el tag.
- Las capturas de `e2e/snapshots/v4.0.0/` no se regeneran nunca; el 4.1 actualiza solo
  `e2e/snapshots/current/` (ver `e2e/snapshots/README.md`).

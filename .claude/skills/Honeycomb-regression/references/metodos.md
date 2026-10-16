# Métodos de regresión, triage y reporte

## Por qué estos métodos

Cada US de The Honeycomb pasa QA **sola, en su rama** (super-tefinha-QA). Lo que ese QA no ve es
justo lo que busca una regresión:

- la **combinación** de varias US en `main` (dos PRs que tocaron `App.tsx` o `db.ts` y se mergearon
  con un merge "limpio" que rompió la lógica);
- efectos **lejos** del área de la US (cambiar `beehavior.ts` para el Dashboard y alterar el
  Progress Report);
- cosas que **ninguna** US pidió (dependencias, refactors, un PR sin ticket);
- **compatibilidad de datos**: un `honeycomb-data.json` real escrito por la versión anterior.

Por eso se combinan métodos **absolutos** (B solo, contra criterios fijos) y **diferenciales** (B
contra A con la misma entrada), más QA manual elegido por riesgo.

## Catálogo

| # | Método | Script / fuente | Atrapa | No atrapa |
|---|---|---|---|---|
| M1 | Gates absolutos | `npm run lint`, `npm test`, `npm run build`, `npm audit`, `node --test .claude/hooks/*.test.cjs`, Playwright | Tipos, tests de B, build, vulnerabilidades (US-13/48), hooks (US-07), arranque y shutdown de Electron (US-06/15) | Cambios de comportamiento que B "aprobó" reescribiendo sus propios tests |
| M2 | Diferencial de texto visible | `capture.mjs` + `compare.mjs` → `text-diff/` | Cualquier número, texto, orden o fila que cambió en las 6 pestañas (lectura y admin, paneles abiertos y cerrados) con el **mismo** golden DB | Flujos que mutan datos; estados que requieren interacción (modales) |
| M3 | Diferencial visual | `capture.mjs --baseline` → `visual-diff/` | Layout, color, íconos, CSS roto, elementos superpuestos | Nada que no se vea en la captura; umbral de ruido 0,2% (ver abajo) |
| M4 | Diferencial de API y datos | `api/data.json`, `api/auth-status.json` | Cambios de esquema, migraciones (modo US-49), normalización de datos al cargar | — |
| M5 | Diferencial del parser | `api/parser.json` (7 `.csv` del corpus, uno por uno y en lote) | Fechas, Title Case, blacklist, < 10 min, actividad detectada, `duplicateOf`, `alreadyLoaded` | Formatos no `.csv` (`.xlsx/.docx/.txt`: cubrir en el manual si el rango tocó `parser.ts`) |
| M6 | Tests de A sobre B | `tests-compat.mjs` | Comportamiento que A garantizaba con un test y B cambió **sin** que ninguna US lo pidiera | Lo que A no testeaba |
| M7 | Invariante de solo lectura | paso `db-unchanged` de `capture.mjs` | Que parsear (o simplemente abrir la app) escriba la base | — |
| M8 | QA manual por riesgo | navegador integrado + `checklist-base.md` + escenarios de Linear | Flujos con escritura (import, check-in, borrar con cascada, notas), modales, mensajes de error, sesión expirada | — |

**Ruido conocido** (medido al crear la skill, mismo código dos veces): texto, API y parser 100%
idénticos; píxeles: 9 de 14 capturas idénticas y 5 con < 0,11% distinto (transición del
subrayado de la pestaña activa y borde inferior). Por eso `compare.mjs` usa 0,2% como umbral de
ruido. Un delta de texto **nunca** es ruido.

## Selección por riesgo (M8)

1. Áreas tocadas: `range.json` → `byArea`.
2. Para cada área, las US históricas que la definen (tabla de abajo): elegir los escenarios de QA
   cuyo resultado esperado dependa del archivo tocado. Prioridad: 🔴 de la US > reglas de negocio
   (`CLAUDE.md`) > texto/estética.
3. Si dos US del rango tocaron la misma área, correr al menos un escenario de cada una **después**
   de haber ejecutado el de la otra (orden cruzado).

| Área (`range.mjs`) | US que la definen (escenarios a reusar) |
|---|---|
| parser / Import Forage Logs | US-12, US-18, US-19, US-22, US-25, US-26, US-27, US-30, US-32, US-33, US-37, US-38 |
| persistencia (`db.ts`) | US-04, US-15, US-20, US-23, US-26, US-33 |
| API / auth / validación | US-10, US-11, US-22 |
| Dashboard (KPIs, periodo, paneles, Bee-havior Hub, Activities Matrix Profile) | US-21, US-24, US-29, US-31, US-35, US-36, US-42, US-43, US-44, US-45 |
| Manual Check-In | US-20, US-23 |
| Caserits & Progress / Progress Report | US-28, US-39, US-41, US-44 |
| Overlap Cross-Referencer / Bee-havior Hub | US-21, US-24, US-31, US-42, US-43, US-44 |
| Outcome Report | US-40 |
| Settings / Admin Access | US-11, US-12 |
| App shell (`App.tsx`, `types`, `utils`, textos, a11y) | US-04, US-05, US-46, US-47 — y **todas** las de arriba si cambió un handler espejado en `db.ts` |
| Electron / CSP / build | US-06, US-14, US-15, US-47 |
| dependencias | US-13, US-48 |
| CI / tooling / e2e | US-07, US-08, US-09, US-06 |

## Triage

Para cada delta (o grupo de deltas que son el mismo cambio):

1. **Ubicar la causa** en el rango: `git log --format="%h %s" <A>..<B> -- <archivos del área>` y
   `range.json` → `merges`. Para texto, buscar el string nuevo: `git log -S "<texto nuevo>" <A>..<B>`.
2. **Buscar la autorización** en el contrato (Fase 1): un AC o escenario de una US del rango que
   describa ese cambio. Se cita literal (ej. *US-39 AC: "el Attendance Rate se calcula sobre los
   eventos de sus actividades"* → `82% (18/22 days)` → `78% (18 of 23 events)` ✅).
3. **Chequear el alcance**: aunque la US autorice el cambio en una pantalla, el mismo cambio en
   otra pantalla que su Out of Scope excluye es 🐞.
4. **Chequear el número**: un cambio "esperado" con un valor que no cuadra con la regla es 🐞
   (recalcular a mano 1 o 2 celdas con el golden DB: 47 eventos, fecha de referencia 2026-06-24,
   tiers Dormant 0–25 / Hatcher 26–50 / Forager 51–75 / Busy Bee 76–100).
5. Sin autorización → 🐞, aunque parezca mejor. Si el usuario confirma que era intencional, queda
   como ✅ con la nota "intencional sin US" y se recomienda documentarlo (ticket o PRD).

Fallas de `tests-compat.json`: misma lógica. `fileHistoryInRange` vacío + falla = 🐞 casi seguro.
`"<el archivo no carga>"` suele ser una función renombrada o movida: ✅ si una US lo hizo y su
comportamiento quedó cubierto por los tests de B; si no, 🐞 Baja (pérdida de cobertura).

Severidad de un 🐞: **Crítica** (pérdida o corrupción de datos, la app no arranca, se saltea
`requireAdmin`), **Alta** (cálculo de asistencia/Hive Status/KPI incorrecto, import que registra
mal), **Media** (flujo secundario roto, mensaje equivocado), **Baja** (texto, estética, cobertura).

## Plantilla del reporte

`$RUN/REPORT.md`:

```markdown
# 🧪 Regresión <A> → <B> | Veredicto: <✅ Sin regresiones | ❌ Con regresiones | ⛔ Bloqueada>
Fecha: <AAAA-MM-DD> · A: `<sha A>` (<tag>) · B: `<sha B>` (<ref>) · Modo: <liviano | US-49>
US del rango: US-NN, … · PRs: <n> · Fixture: golden-db.json `<sha8>`

## Gates absolutos
| Gate | Resultado | Detalle |
…

## Diferencial (A y B con el mismo golden DB)
- Texto: <n> pestañas con cambios · API: <n> · Parser: <n>/8 · Visual: <i> idénticas / <r> ruido / <c> cambiadas
| # | Superficie | Delta | Clase | Justificación (US + AC) |
…

## Tests de <A> sobre <B>
<p>/<t> ok · fallas: | test | clase | justificación |

## QA manual
| ID | Escenario | Esperado | Obtenido | Resultado |
…

## 🐞 Regresiones
- [<Severidad>] <título>: <pasos> → esperado <x>, obtenido <y>. Introducida por <PR/US>. Evidencia: <archivo>

## Alertas de proceso
<US del rango fuera de Done/Merge Ready, PRs sin US, …>

## Snapshot
<creado v<X> en <sha> | no creado: <motivo> | pendiente de gate>
```

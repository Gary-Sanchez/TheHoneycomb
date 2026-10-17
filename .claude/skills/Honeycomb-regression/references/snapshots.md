# Snapshots: qué son, cómo se eligen y cómo se crean

Basado en **US-49** ("Generar un Snapshot Versionado de la App al Completar Cada PRD", NIC-50 en
Linear; borrador original en `../US-49 Snapshots Versionados por PRD.md`, carpeta padre del repo) y
**US-50** ("Datos y paquete de regresión", NIC-51). El **PRD 4.1 §2.0**
(`docs/PRD - The Honeycomb 4.1.md`) las aplica al cierre del 4.0. Su estado cambia rápido: no lo
asumas, miralo en Linear y en `git branch -r` antes de cada corrida. Esta skill funciona antes y
después de US-49: antes en **modo liviano**, después en **modo US-49**.

**Precedencia:** si un PRD de `docs/` fija el commit o el procedimiento de un snapshot (hoy, el
PRD 4.1 §2.0 para `v4.0.0`), **manda el PRD** sobre este archivo.

## Qué es un snapshot

| Pieza | Modo liviano (hoy) | Modo US-49 |
|---|---|---|
| Identidad | Tag anotado `v{MAJOR}.{MINOR}.{PATCH}` sobre un commit de `main` | Igual + `package.json` → `version` igual al tag, visible en **Settings** |
| Entrada fija de regresión | `fixtures/golden-db.json` + `fixtures/corpus/` de esta skill | `e2e/fixtures/v{MAJOR}.{MINOR}.0.json` del propio tag (+ el corpus de la skill) |
| Huella | `.claude/regression/snapshots/v{X}/` (copia local de `capture-B`, solo registro) | Capturas `toHaveScreenshot` versionadas en `e2e/` |
| Checklist | `REPORT.md` de la corrida que lo aprobó | Checklist de QA Checks del PRD en el Release |
| Release | Texto listo para pegar (o `gh release create`) | Workflow de GitHub Actions al pushear `v*` con el instalador NSIS |

`MAJOR.MINOR` = número del PRD (PRD 4.0 → `4.0.x`); los hotfixes posteriores suben `PATCH`. El tag
es **inmutable**: nunca se mueve, se borra ni se re-pushea con `--force`.

La huella **no** reemplaza re-capturar: cada regresión re-captura A desde su tag en la misma
máquina y corrida que B, porque DPI, fuentes y versión de Windows cambian los píxeles.

### Convivencia con US-50 (un solo golden por modo)

US-50 congela por versión una base fija (`e2e/fixtures/v*.json`) y capturas `toHaveScreenshot`
de las 6 pestañas. Esta skill no mantiene un golden paralelo a ese:

- **Modo US-49 (A ya trae `e2e/fixtures/v<A>.json`):** la base fija de US-50 es **la** entrada de
  datos. `capture.mjs` la carga con `--fixture` en A y en B, y las capturas de referencia de US-50
  corren como gate de la Fase 3. `fixtures/golden-db.json` queda solo para regresiones cuya A sea
  anterior a US-50 (`v2.0.0`, `v3.0.0`) y no se actualiza más.
- **Lo que US-50 no cubre y la skill sigue aportando:** el corpus de `.csv`
  (`fixtures/corpus/`, parser y duplicados), el diferencial de texto visible y de `/api/data`, los
  tests de A sobre B y el QA manual. El corpus no es un golden de datos: no se lleva a `e2e/`.
- Si US-50 cambia de forma (otra ruta, otro formato), manda US-50: adaptá `--fixture` y esta
  sección, sin crear otra base.

## Detección (Fase 0)

En el worktree de B:

```bash
grep -n "schemaVersion" db.ts                 # migraciones (US-49)
ls e2e/fixtures/v*.json                       # bases fijas por versión
grep -rln "toHaveScreenshot" e2e/             # capturas de referencia
ls .github/workflows/ | grep -i release       # workflow de release por tag
ls docs/ | grep -i -E "cierre|release|snapshot"   # procedimiento de cierre de PRD
```

Si aparece cualquiera, modo US-49: sumar a la regresión los escenarios QA-07 a QA-12 de US-49
(archivo sin `schemaVersion`, migración con backup, backup fallido, datos más nuevos que la app,
capturas de referencia, cambio visual detectado) y seguir el procedimiento de `docs/` para el
snapshot. Si el documento de `docs/` contradice este archivo, **manda el de `docs/`**.

## Elegir la línea base A

1. Si hay tags: el `v*` más alto (`git tag -l "v*" --sort=-v:refname`). El usuario puede pedir
   otro (p. ej. `v3.0.0` para ver todo lo que cambió en el PRD 4.0 completo).
2. Si no hay tags: candidatos de cierre de PRD. Los retroactivos se calcularon el **2026-10-14**
   sobre `git log origin/main --first-parent --merges` y los PRD de `docs/`; **re-verificalos**
   antes de usarlos (la regla de US-49: el merge de la última US de ese PRD). Si un PRD fija el
   commit (ver "Precedencia"), usá el del PRD.

| Versión | Commit | Por qué | Alternativa |
|---|---|---|---|
| `v2.0.0` | `99479c6` (2026-09-30, PR #11 US-12) | Último merge antes de abrir el PRD 3.0 (`4efa501`, PR #20). Incluye las US del PRD 2.0 (US-18 a US-21), el fix US-23 de check-in y el hardening US-10 a US-15 | `ed1c035` (PR #16, US-18: última US *funcional* del PRD 2.0) |
| `v3.0.0` | `82567ad` (2026-10-02, PR #30 US-33) | Última US del PRD 3.0 (US-24 a US-33) | — |
| `v4.0.0` | **El merge de US-49 a `main`** (todavía no existe: no hay commit fijo) | Lo fija el PRD 4.1 §2.0: el tag va sobre el commit de cierre del 4.0, que ya trae `"version": "4.0.0"`, así que tag, `package.json` y **Settings** coinciden. Ese commit tiene que traer también `e2e/fixtures/v4.0.0.json` de US-50 (van en paralelo): si no lo trae, preguntá antes de taggear | **No** taggear `d160f0b` (PR #39, última US funcional del PRD 4.0): no trae el bump de versión ni la base de US-50 |

`v4.0.0` sí necesita regresión: su A natural es `v3.0.0` (`82567ad`) y su B, el merge de US-49.
Si el usuario pide una base para el 4.0 antes de que exista ese merge, decile que el snapshot
`v4.0.0` está pendiente de US-49/US-50 y ofrecé `d160f0b` solo como **B** de una regresión
exploratoria, nunca como commit a taggear.

Con estos candidatos, la primera regresión natural es **`82567ad` (PRD 3.0) → `origin/main`**, que
probó esta skill al crearse: el rango trae US-13 y US-35 a US-48, y la captura, el diff y los tests
de A sobre B funcionaron de punta a punta.

Un tag retroactivo (`v2.0.0`, `v3.0.0`) es tan visible como uno nuevo: lleva los mismos gates y no
necesita regresión contra otro snapshot (ya fue aprobado por la historia), pero sí que el commit
**compile y arranque** (Fase 2 + `capture.mjs` sin pasos `FAIL`) — es QA-03 de US-49.

## Crear un snapshot

Precondiciones (todas, o no se taggea):

- Veredicto de la corrida: ✅ Sin regresiones.
- `git merge-base --is-ancestor <sha B> origin/main` → B es parte de `main`.
- `git tag -l v<X>` y `git ls-remote --tags origin v<X>` vacíos.
- `<sha B>` es exactamente el que se capturó (`capture-B/manifest.json` → `commit`).

Versión: proponer, confirmar con el usuario (`AskUserQuestion`), y avisar si no coincide con
`package.json`.

### Mensaje del tag (`$RUN/tag-message.txt`)

```
The Honeycomb v<X> — PRD <MAJOR.MINOR>

US incluidas desde <A>: US-NN, US-NN, …
Regresión: <A> → <sha7 B> — ✅ Sin regresiones (<fecha>)
  Gates: lint, unit (<n>), build, npm audit 0, hooks, e2e (<n>)
  Diferencial: <n> deltas, todos esperados (<lista corta de US>) · visual <i> idénticas / <r> ruido
  Tests de <A> sobre <B>: <p>/<t> (fallas esperadas: US-NN, …)
  Manual: <n> escenarios (checklist base + <US>)
Fixture: golden-db.json sha256 <8 primeros>
```

### Notas del Release (`$RUN/release-notes.md`)

- Link al PRD: `docs/PRD - The Honeycomb <MAJOR.MINOR>.md`.
- Tabla de US incluidas: `US-NN: <título de Linear>` · `PR #<n>` (de `range.json` → `merges`).
- Checklist de regresión: los QA Checks de las US del PRD, marcados con el resultado de la corrida,
  más el checklist base.
- Resultado de la regresión y link al documento de Linear si se publicó.
- Para tags retroactivos: qué commit se eligió y por qué (la tabla de arriba).

### Gates

1. `git tag -a v<X> <sha B> -F $RUN/tag-message.txt` → mostrar `git show v<X> --stat | head -20`.
2. `git push origin v<X>` (solo ese tag; nunca `--tags`, que empujaría cualquier tag local suelto).
3. Release: `gh release create v<X> --title "The Honeycomb v<X>" --notes-file $RUN/release-notes.md`,
   o el link `https://github.com/Gary-Sanchez/TheHoneycomb/releases/new?tag=v<X>` + el texto.
4. Registro local: copiar `$RUN/capture-B` → `.claude/regression/snapshots/v<X>/`.

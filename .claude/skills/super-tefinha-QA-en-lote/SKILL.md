---
name: super-tefinha-QA-en-lote
description: Hace QA de VARIOS tickets US-XX de The Honeycomb a la vez aplicando el flujo de super-tefinha-QA a cada uno. Antes de probar nada, analiza la factibilidad de hacer QA de cada ticket (issue, estado, PR abierta, CI, conflictos con main, dependencias) y los conflictos entre las PRs del lote y con las demás PRs abiertas, y define un orden de QA (y de merge) que evita esos conflictos o reduce la chance de que aparezcan. Usa un git worktree por PR, subagentes en paralelo para la revisión estática (diff contra AC, lint, build, tests) y QA manual/e2e de a un ticket por vez, en ese orden. Publica un veredicto por ticket en Linear y en su PR como super-tefinha-QA. Usar cuando el usuario invoque /super-tefinha-QA-en-lote o pida QA de más de un ticket o PR a la vez ("haceles QA a la US-38, 42 y 46", "probá los PRs #51 y #52", "QA de todo lo que está en QA Ready") — incluso si no menciona la skill por nombre. Para un solo ticket usar super-tefinha-QA.
argument-hint: <lista de tickets: URLs, NIC-XX o US-XX; opcionalmente con su PR>
---

# Super Tefinha QA en lote — varios tickets, en el orden que no se pisan

Orquestador multi-ticket sobre [[super-tefinha-QA]]. Esa skill sigue siendo **la fuente de verdad
del QA de cada ticket**: herramientas, cómo leer el ticket, localizar y revisar la PR, criterios de
veredicto (Passed / Failed / Needs Fix), formato del comentario en Linear, qué hacer en la PR y en
qué estado queda el issue, y sus **Reglas** (nunca aprobar, mergear ni pushear a la PR). Leela
entera antes de arrancar: [`../super-tefinha-QA/SKILL.md`](../super-tefinha-QA/SKILL.md). Esta skill
agrega lo que cambia al probar N tickets:

| super-tefinha-QA (1 ticket) | super-tefinha-QA-en-lote (N tickets) |
|---|---|
| Arranca a probar directo | **Análisis previo**: factibilidad de cada ticket + conflictos entre PRs, con `main` y con PRs ajenas |
| `gh pr checkout` en el checkout principal | **Un worktree por PR** en `.claude/worktrees/qa-us-{NN}`; el checkout principal no se toca |
| Todo en el hilo principal | **Revisión estática en paralelo** (un subagente por PR) + QA manual/e2e **secuencial** |
| Un veredicto | Un veredicto por ticket + **orden de merge recomendado** para el lote |

Argumentos recibidos: `$ARGUMENTS`

## Entrada

Una lista de tickets (`US-XX`, `NIC-XX`, URLs de Linear), opcionalmente con su PR, o un pedido
genérico ("todo lo que está en `QA Ready`" → `list_issues` con `project: "The Honeycomb"` y
`state: "QA Ready"`). Normalizar a `US-{NN}` y mostrar la lista en una línea. Con un solo ticket,
avisar y seguir con [[super-tefinha-QA]].

## Fase A — Traer `origin` y juntar datos (solo lectura)

1. `git fetch origin --prune`. No cambiar de rama en el checkout principal; si tiene cambios sin
   commitear, no tocarlos.
2. Por ticket, pasos 1 y 2 de [[super-tefinha-QA]]: issue (`get_issue` con `includeRelations: true`,
   `list_comments`), AC, escenarios de QA, QA checks, estado, cabecera `**Dev:** · **QA:**`, y la PR
   (`gh pr list -R Gary-Sanchez/TheHoneycomb --state all --search "US-{NN}"` o links del issue). Si
   hay más de 4 tickets, se puede repartir esta lectura en subagentes `Explore` en paralelo.
3. Por PR: `gh pr view <n> --json number,state,isDraft,headRefName,baseRefName,mergeable,mergeStateStatus,reviewDecision,files,author`
   y `gh pr checks <n>`.

## Fase B — Factibilidad de cada ticket

Antes de gastar tiempo en probar, decidir si cada ticket **se puede probar ahora** y si el veredicto
va a seguir valiendo cuando la PR se mergee:

| Chequeo | Bloquea si… | Avisa si… |
|---|---|---|
| Issue en Linear | no existe ni hay archivo local del ticket | — |
| Escenarios de QA / AC | — | faltan o son ambiguos (se diseñan "escenarios añadidos por QA") |
| Estado del issue | — | no está en `QA Ready` (ej. `In Progress`) |
| PR | no existe, está cerrada sin merge, o ya está mergeada | está en draft |
| Base de la PR | — | no apunta a `main` (PR apilada: anotar sobre cuál) |
| CI (`gh pr checks`) | — | está en rojo o pendiente (se revisa igual; rojo por el cambio = Failed) |
| Conflictos con `main` | — | `git merge-tree --write-tree --name-only --no-messages origin/main origin/<headRef>` da exit 1 |
| Dependencias | depende (`blockedBy` en Linear o por código) de un ticket cuya PR no está mergeada **ni en este lote** | depende de otro ticket del lote (→ orden) |
| Cabecera `**QA:**` | — | ya hay otra persona haciendo QA (preguntar antes de seguir con ese) |
| QA previo | — | ya tiene un veredicto anterior: es un **re-QA**, enfocarlo en lo que cambió desde ese comentario |

Resultado por ticket: **✅ Factible**, **⚠️ Factible con avisos** o **⛔ No factible (motivo)**. Los
⛔ no se prueban: se informan en el reporte y, si corresponde, se propone moverlos a `Blocked` (con
gate, como en [[super-tefinha-QA]]).

**PR con conflictos con `main`:** el QA funcional puede pasar, pero la PR no se puede mergear (pasó
con el PR #46). Preguntar al usuario, una vez para todos los que estén así: (a) probar igual y, como
mucho, dar **Needs Fix** por los conflictos; o (b) no probarlos todavía y pedirle al Dev que traiga
`main` primero. Recomendar (b) si los archivos en conflicto se cruzan con los escenarios de QA (el
resultado podría cambiar después de resolverlos); (a) si el conflicto está lejos de lo que se prueba.

## Fase C — Conflictos entre PRs y orden de QA

Seguir [`../garyale-sobreexplotados/references/analisis-conflictos.md`](../garyale-sobreexplotados/references/analisis-conflictos.md)
con las huellas **reales** (todas las PRs existen): `git merge-tree` de cada PR contra `main`, de
cada par del lote, y contra las PRs abiertas ajenas que compartan archivos; más las relaciones de
Linear. Clasificar cada par (🟢 / 🟡 / 🔴 / ⛓️).

**El orden de QA es el orden de merge recomendado.** Un veredicto vale para el código que se va a
mergear; si dos PRs chocan, la que se mergee segunda va a cambiar al resolver el conflicto. Por eso:

- 🟢 independientes: cualquier orden; su revisión estática va en paralelo.
- ⛓️ / 🔴: se prueba primero la que va primero en el orden. Para la segunda, preguntar al usuario
  (una vez para todos los pares así): (a) **esperar** a que la primera se mergee y el Dev traiga
  `main` a la segunda, y recién ahí probarla; o (b) probarla **sobre la combinación**: en su worktree,
  `git merge --no-commit --no-ff origin/<headRef-de-la-primera>` (local, nunca se pushea) y correr el
  QA sobre ese resultado, dejando dicho en el veredicto que asume ese orden de merge. Recomendar (a)
  si la primera no dio Passed; (b) si la primera dio Passed y el usuario quiere cerrar el lote ya.
- 🟡 solapan: se prueban en el orden propuesto; anotar en el veredicto de la segunda que hay que
  actualizarla con `main` después del merge de la primera y re-correr los tests (no el QA completo).

Presentar el análisis (factibilidad + tabla de pares + orden de QA/merge) y esperar el visto bueno
del usuario antes de crear worktrees. Si todo es ✅ y 🟢, alcanza con una línea y se sigue.

## Fase D — Un worktree por PR

Por cada ticket factible, desde la raíz del repo:

```bash
git worktree add --detach ".claude/worktrees/qa-us-{NN}" origin/<headRef>
```

`--detach` a propósito: QA no crea ramas ni commitea. `.claude/worktrees/` está en
`.git/info/exclude`. Para PRs de forks, `git fetch origin pull/<n>/head` y usar ese commit. Si el
worktree ya existe (re-QA), `git -C <worktree> checkout --detach origin/<headRef>` tras el fetch.
Después, `npm ci` en cada worktree, en background y en paralelo, con el `PATH` de Node corregido
(ver [[Start-Honeycomb]]). No usar `isolation: "worktree"` del tool `Agent`: crea ramas aleatorias que
no apuntan a la PR.

## Fase E — Revisión estática en paralelo (un subagente por PR)

Lanzar **en un solo mensaje** un `Agent` `general-purpose` por ticket factible (hasta 4 a la vez). El
prompt de cada uno, autosuficiente:

- Ruta absoluta del worktree y la orden de trabajar **solo ahí** (`git -C`, `npm --prefix`, o `cd` en
  el mismo comando). No editar el checkout principal ni otros worktrees.
- El ticket completo (AC, escenarios de QA, QA checks) y el número de PR.
- Qué hacer — paso 3 y la parte **automatizada** del paso 4 de [[super-tefinha-QA]]: `gh pr view
  --comments`, `gh pr diff` contra cada AC (requisitos faltantes, bugs, casos límite, validaciones
  con `requireAdmin`/`validateBody`, tests que cubran los AC), `gh pr checks`, y en el worktree
  `npm run lint`, `npm run build` y `npm test`. Puede escribir tests locales para verificar un AC,
  sin commitearlos.
- Qué **no** hacer: comentar en Linear o en la PR, cambiar estados, `git commit`/`push`, levantar la
  app de Electron, ni `npm run test:e2e`.
- Qué devolver: por AC, ✅/❌/❓ con evidencia del diff; defectos con severidad (Crítica/Alta/Media/
  Baja), archivo y línea; salida resumida de lint/build/tests/CI; y qué AC necesitan prueba manual
  para confirmarse.

Revisar lo que devuelve cada uno contra el diff real antes de usarlo — un subagente puede aprobar
algo que no verificó. Lo que el subagente marca ❓ se resuelve en la Fase F.

## Fase F — QA manual y e2e, de a uno y en el orden de la Fase C

Para cada ticket, en orden:

1. **Re-chequear conflictos** (`git fetch` + `git merge-tree` contra `origin/main` y contra las PRs
   que van antes): si `main` cambió y la PR ahora choca, volver a la decisión de la Fase B para ese
   ticket antes de probarlo.
2. Anotarse en `**QA:**` de la cabecera del issue (paso 1.4 de [[super-tefinha-QA]]).
3. Levantar la app **desde su worktree** con [[Start-Honeycomb]] (o `npm run dev`), con un
   `HONEYCOMB_DB_PATH` propio dentro del worktree para no mezclar datos entre tickets ni tocar el
   `honeycomb-data.json` real. Una sola instancia a la vez: comparten puerto (`3000`), navegador y
   `userData` de Electron. Cerrarla antes de pasar al siguiente ticket.
4. Recorrer cada escenario de QA y QA check con el navegador integrado (parte **manual** del paso 4
   de [[super-tefinha-QA]]), más los ❓ de la Fase E. `npm run test:e2e`, si aplica, también acá y de
   a uno.
5. Decidir el veredicto (paso 5 de [[super-tefinha-QA]]) y publicarlo **en ese momento**, antes de
   pasar al siguiente: comentario en Linear (formato del paso 6), y pasos 7 u 8 en la PR y el estado
   del issue. Agregar al comentario una línea **"Orden de merge"** cuando el ticket esté en un par
   🟡/🔴/⛓️: después de qué PR hay que mergearlo, si hay que actualizarlo con `main` antes, y si el QA
   se hizo sobre la combinación (opción b de la Fase C). Una PR con conflictos con `main` no puede
   recibir **Passed**.

Si el veredicto de una PR que va primero es Failed o Needs Fix, revisar el plan para las que venían
detrás en su cadena 🔴/⛓️: las probadas sobre la combinación quedan invalidadas, y las pendientes
pasan a la opción (a), esperar.

## Fase G — Reporte consolidado y limpieza

Resumen final (además del de cada ticket, como en [[super-tefinha-QA]]):

- Tabla con una fila por ticket: factibilidad, PR, veredicto, AC y escenarios ✅/❌/⛔, defectos
  principales, estado nuevo del issue, links al comentario de Linear y a la PR.
- **Orden de merge recomendado** para las PRs con Passed, y qué hay que hacer entre merge y merge
  ("después de mergear #X, traer `main` a #Y y re-correr `npm test`").
- Los ⛔ no factibles y por qué, y qué subagentes se usaron.

Al final, ofrecer (con gate, nunca por cuenta propia) quitar los worktrees de QA:
`git worktree remove ".claude/worktrees/qa-us-{NN}"`. Si quedaron tests locales sin commitear, el
comando falla: avisar y preguntar, no forzar. Conviene conservar los de veredicto Needs Fix/Failed
hasta el re-QA.

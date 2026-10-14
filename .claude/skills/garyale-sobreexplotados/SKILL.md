---
name: garyale-sobreexplotados
description: Ejecuta VARIOS tickets US-XX de The Honeycomb en paralelo aplicando el flujo de Honeycomb-executor a cada uno, pero con un git worktree y una rama `gs/us-XX-...` propios por ticket (creados desde `origin/main` recién traído), subagentes de desarrollo trabajando en paralelo en cada worktree, y un Pull Request separado por ticket — nunca varios tickets en la misma rama o PR. Antes de crear nada corre un análisis previo de conflictos (entre los tickets, con main y con los PRs abiertos del equipo) y ordena el trabajo en tandas para evitarlos, y mantiene los gates humanos de commit, push, PR y Linear, decididos ticket por ticket. Usar cuando el usuario invoque /garyale-sobreexplotados o pida ejecutar, implementar o resolver más de un ticket a la vez ("hacé la US-38, US-42 y US-46", "arrancá con los tickets 39 a 41", "llevá adelante estas tres historias en paralelo") — incluso si no menciona la skill por nombre. Para un solo ticket usar Honeycomb-executor.
---

# garyale-sobreexplotados — varios tickets, un worktree y un PR por ticket

Orquestador multi-ticket sobre [[Honeycomb-executor]]. Esa skill sigue siendo **la fuente de verdad
del flujo por ticket** (fuentes del proyecto, Fase 0 de lectura del ticket, autoasignación en Linear,
research → plan → desarrollo → testing → reporte → gates de cierre). Leela entera antes de arrancar:
[`../Honeycomb-executor/SKILL.md`](../Honeycomb-executor/SKILL.md). Esta skill solo cambia lo que
cambia al trabajar N tickets a la vez:

| Honeycomb-executor (1 ticket) | garyale-sobreexplotados (N tickets) |
|---|---|
| `git checkout main` + `pull`, rama en el checkout principal | `git fetch` y **un worktree por ticket** en `.claude/worktrees/us-{NN}`, cada uno con su rama desde `origin/main`; el checkout principal no se toca |
| Desarrollo casi siempre en el hilo principal | **Un subagente de desarrollo por ticket**, en paralelo, cada uno encerrado en su worktree |
| Un plan | **Análisis previo de conflictos** (entre tickets, con `main` y con PRs abiertos del equipo) + un plan por ticket, en el orden que minimiza conflictos |
| Un commit / push / PR | **Un commit, un push y un PR por ticket**, con gates decididos ticket por ticket |

Regla dura: **1 ticket = 1 rama = 1 worktree = 1 PR.** Aunque dos tickets sean chicos o toquen el
mismo archivo, no se juntan en una rama (como pasó con `gs/us-38-42-46-...`): cada PR se revisa, se
hace QA y se mergea por separado. Si el usuario pide explícitamente juntarlos, es otro flujo —
avisarle que esta skill no lo hace y preguntar.

## Entrada

Una lista de tickets: "US-38, US-42 y US-46", "del 39 al 41", IDs `NIC-{n}`, links de Linear, o una
mezcla. Normalizar todo a `US-{NN}` y mostrar la lista resultante en una línea antes de arrancar. Si
algún ítem es ambiguo, preguntar solo por ese (no frenar los demás). Con un único ticket, avisar y
seguir con [[Honeycomb-executor]] en vez de esta skill.

**Tope de paralelismo:** hasta 4 tickets de desarrollo simultáneos (cada worktree lleva su propio
`node_modules` y cada subagente consume recursos). Con más, procesarlos en tandas de 4 en el orden
que salga del análisis previo de conflictos (Fase B).

## Fase A — Traer `origin` sin tocar el checkout principal

1. `git status` en el checkout principal: si hay cambios sin commitear, **no** tocarlos — avisar y
   seguir igual, porque esta skill no cambia de rama ahí (los worktrees son independientes). Solo
   frenar si el usuario quiere incluir esos cambios en algún ticket.
2. `git fetch origin --prune`. **No** hacer `git checkout main` ni `pull` en el checkout principal:
   puede estar en una rama de otro trabajo. Las ramas nuevas parten de `origin/main` directo.
3. Reportar en una línea qué trajo el fetch respecto del último `origin/main` conocido
   (`git log --oneline <antes>..origin/main`), resaltando cambios en `CLAUDE.md` o en las skills.
4. `git worktree list` para detectar trabajo previo: si ya existe un worktree o rama
   `gs/us-{NN}-...` (local o en `origin`) para alguno de los tickets, **se retoma**, no se crea otro
   — ver "Retomar" en la Fase C.

## Fase B — Leer todos los tickets y mapear solapamientos (antes de crear nada)

1. Para cada ticket, Fase 0 de [[Honeycomb-executor]]: archivo `US-{NN}*` en la carpeta padre del
   repo y/o issue en Linear (`list_issues` con `project: "The Honeycomb"`, `query: "US-{NN}"`).
   Leer los tickets enteros en el hilo principal — son cortos y el hilo principal necesita los AC y el
   Out of Scope de todos para coordinar. Si hay más de 4, se puede delegar la lectura a subagentes
   `Explore` en paralelo (uno por ticket) pidiendo de vuelta solo AC, Out of Scope, tabla de QA y
   archivos/componentes que probablemente toque.
2. **Research de impacto en paralelo:** lanzar en un mismo mensaje un subagente `Explore` por
   ticket (salvo los triviales de un archivo, que se investigan directo con `Grep`/`Read`). A cada uno
   pedirle la lista concreta de archivos, funciones y handlers que el ticket tocaría (incluido el
   espejo `App.tsx` ↔ `db.ts`, `types.ts` ↔ `validation.ts`, y lo que el Out of Scope prohíbe tocar).
   Indicarles que investiguen sobre `origin/main` (`git show origin/main:<archivo>`) si el checkout
   principal está en otra rama.
3. **Análisis previo de conflictos** — obligatorio, antes de crear worktrees. Seguir
   [`references/analisis-conflictos.md`](references/analisis-conflictos.md) completo: huella de cada
   ticket (estimada con el research del paso 2, o real con `git merge-tree` si el ticket ya tiene
   rama), puntos calientes del repo, cruce **contra los PRs abiertos del equipo** y contra las
   relaciones de Linear, clasificación de cada par (🟢 independientes / 🟡 solapan / 🔴 chocan /
   ⛓️ dependen) y orden en tandas. Ese orden manda sobre el orden en que el usuario listó los tickets.
   - 🔴 entre tickets del lote: no van en la misma tanda; el segundo arranca cuando el PR del primero
     se mergea (o sobre su rama, ver ⛓️).
   - ⛓️ dependientes: preguntar al usuario entre (a) hacer primero el base, y el dependiente después
     de que el PR base se mergee; o (b) **PR apilado**: la rama dependiente nace de la rama base y su
     PR apunta con `--base` a la rama base (hay que re-apuntarlo a `main` cuando el base se mergee).
     Por defecto recomendar (a).
   - 🔴 con un PR ajeno: avisar quién lo tiene y preguntar si se espera ese merge o se arranca igual.
4. **Plan.** Armar un plan por ticket (Fase 2 de [[Honeycomb-executor]]) más el reporte del análisis
   (tabla de pares, tandas y orden de merge recomendado) y qué se delega. Si al menos un ticket es
   no trivial o el análisis encontró algún 🔴/⛓️, presentarlo todo junto con `EnterPlanMode` — una
   sola alineación para todos, no una por ticket. El usuario puede sacar tickets o cambiar el orden
   en este punto.

## Fase C — Linear, worktrees y ramas (una vez aprobado el plan)

Por cada ticket aprobado, sin gate (igual que la Fase 0.5 de [[Honeycomb-executor]]):

1. **Linear:** `save_issue` con `assignee: "me"`, `state: "In Progress"` y la cabecera `**Dev:**`
   actualizada. Si el issue ya tiene **otro** assignee, ese ticket queda en pausa hasta que el
   usuario confirme — los demás siguen.
2. **Worktree + rama**, desde la raíz del repo:
   ```bash
   git worktree add ".claude/worktrees/us-{NN}" -b gs/us-{NN}-{slug} origin/main
   ```
   (Para un PR apilado, reemplazar `origin/main` por la rama base.) `.claude/worktrees/` ya está en
   `.git/info/exclude`, así que no ensucia el `git status` del checkout principal. Verificar con
   `git -C ".claude/worktrees/us-{NN}" log --oneline -1` que la base coincide con `origin/main`.
   No usar `isolation: "worktree"` del tool `Agent`: crea ramas con nombres aleatorios
   (`agent-xxxx`) que no siguen la convención `gs/us-{NN}-...` y que el hilo principal no controla.
3. **Dependencias:** en cada worktree, `npm ci` con el `PATH` de Node corregido (ver
   [[Start-Honeycomb]]). Lanzarlos en background y en paralelo; si `npm ci` falla por `allowScripts`
   (npm ≥ 11), ver la sección Dependencies de `CLAUDE.md` — no aprobar scripts nuevos por cuenta
   propia.

**Retomar:** si el worktree ya existe, usarlo tal cual. Si solo existe la rama, crear el worktree
sobre ella (`git worktree add ".claude/worktrees/us-{NN}" gs/us-{NN}-...`, sin `-b`). En ambos casos
traerle `main` con `git -C <worktree> merge origin/main` (no rebase si ya está pusheada) y mostrar los
conflictos resueltos antes de seguir.

## Fase D — Desarrollo en paralelo (un subagente por ticket)

Lanzar **en un solo mensaje** un `Agent` `general-purpose` por ticket independiente (respetando las
tandas y dependencias de la Fase B). El prompt de cada subagente tiene que ser autosuficiente e incluir:

- La **ruta absoluta del worktree** y la orden explícita de trabajar **solo ahí**: leer, editar y
  correr comandos únicamente bajo esa carpeta (`git -C <worktree>`, `npm --prefix <worktree>` o `cd`
  al worktree en el mismo comando). Nunca editar el checkout principal ni otro worktree.
- El ticket completo (AC, Out of Scope, tabla de QA) y el resultado del research de ese ticket.
- Las secciones relevantes de `CLAUDE.md` (o la indicación de leer `<worktree>/CLAUDE.md`).
- Qué hacer: implementar los AC en orden (Fase 3 de [[Honeycomb-executor]]), agregar o ajustar
  tests unitarios `*.test.ts` si el ticket lo amerita, y correr `npm run lint` y `npm test` en el
  worktree hasta que pasen.
- Qué **no** hacer: `git commit`, `git push`, crear PRs, tocar Linear, levantar la app de
  Electron, ni `npm run test:e2e` — eso lo coordina el hilo principal.
- Qué devolver: archivos tocados, AC cubiertos uno por uno, salida final de lint/tests, y cualquier
  duda o desvío del plan.

Mientras corren, el hilo principal no edita los worktrees. Cuando vuelve cada uno, **revisar el diff
real** (`git -C <worktree> diff`) contra los AC y el Out of Scope — un subagente describe lo que
intentó, no necesariamente lo que hizo. Si algo falta, se puede continuar ese mismo subagente con
`SendMessage` en vez de arrancar uno nuevo. Si un ticket depende de otro (opción a), recién se lanza
cuando el base esté terminado y mergeado.

**Huella real vs. estimada.** Con el diff de cada worktree en mano (`git -C <worktree> diff
--name-only`), comparar contra la huella estimada de la Fase B: si un ticket terminó tocando
archivos que otro ticket del lote (o un PR abierto del equipo) también toca y el análisis no lo
había previsto, avisarlo y reclasificar ese par antes de seguir. **Antes de lanzar cada tanda
siguiente**, `git fetch origin --prune` y repetir el paso 2 del análisis
([`references/analisis-conflictos.md`](references/analisis-conflictos.md)): lo que se mergeó mientras
tanto puede cambiar el orden de lo que falta.

## Fase E — Testing contra cada ticket (secuencial para la app)

- **Estático (en paralelo, ya hecho en la Fase D):** `npm run lint` y `npm test` por worktree.
  Re-correrlos tras cualquier corrección.
- **QA de la app (secuencial):** la tabla de Escenarios de QA de cada ticket se recorre de a **un
  ticket por vez**, levantando la app desde **su** worktree con [[Start-Honeycomb]] (ajustando la ruta
  al worktree). No levantar varias instancias a la vez: comparten puerto por defecto (`3000`),
  ventana de navegador y la carpeta `userData` de Electron. Usar un `HONEYCOMB_DB_PATH` propio por
  ticket (ej. dentro del worktree, que está excluido de git) para no mezclar datos entre tickets ni
  pisar el `honeycomb-data.json` real.
- `npm run test:e2e` también va de a uno, por la misma razón.
- Marcar los QA Checks y, si un escenario falla, volver a la Fase D solo para ese ticket (los demás
  pueden seguir hacia el cierre).

## Fase F — Reporte consolidado

Una tabla con una fila por ticket: rama, worktree, AC cubiertos, resultado de QA (`QA-XX` ✅/❌),
solapamientos/conflictos esperables con los otros PRs, y estado (listo / bloqueado / en pausa), más el
**orden de merge recomendado** que salió del análisis (actualizado con la huella real). Debajo,
por ticket, los **"Pasos para testear la solución"** (Fase 5 de [[Honeycomb-executor]]), sacados de
lo que se ejecutó de verdad. Una línea final con qué se delegó a subagentes y por qué.

## Fase G — Cierre: gates por ticket, un PR por ticket

Mismos gates que la Fase 6 de [[Honeycomb-executor]] (commit → push → PR → link en Linear →
comentario en Linear → `QA Ready`), cada uno su propia pregunta. La diferencia: cada gate se hace
**una vez para todos los tickets listos**, con `AskUserQuestion` `multiSelect: true` listando cada
`US-{NN}` como opción, así el usuario elige ticket por ticket (ej. commit de US-38 y US-46 pero no de
US-42). Nunca interpretar un sí a un ticket como sí a los demás, ni un sí a un gate como sí al
siguiente.

1. **Commit** (por ticket elegido, en su worktree: `git -C <worktree> add …` + `commit`): mensaje con
   el estilo del repo y **un solo** `US-{NN}`, clasificación patch/minor/major, sección
   `## Cómo testear`, y la línea de co-autoría que indique la sesión. El hook de pre-commit corre
   `tsc` sobre el worktree; si falla, arreglar — no usar `--no-verify` sin pedirlo.
2. **Chequeo de conflictos antes del push** (sin gate, es de solo lectura): ya con commits, `git fetch
   origin --prune` y `git merge-tree --write-tree --name-only --no-messages origin/main gs/us-{NN}-...`
   por ticket, más cada par del lote. Si una rama choca con `main` (exit 1), traerle `main`
   (`git -C <worktree> merge origin/main`), resolver, re-correr lint/tests y mostrar al usuario cómo
   quedaron los conflictos **antes** de pedir el push — así el PR nace mergeable. Los choques entre
   ramas del lote no se resuelven acá: quedan documentados en el PR y en el orden de merge.
3. **Push** (por ticket elegido): `git -C <worktree> push -u origin gs/us-{NN}-...`.
4. **PR** (por ticket elegido), uno por rama:
   ```bash
   gh pr create --repo Gary-Sanchez/TheHoneycomb --base main --head gs/us-{NN}-{slug} \
     --title "US-{NN}: <título del ticket>" --body-file <archivo en el scratchpad>
   ```
   Cuerpo: resumen, AC cubiertos, test plan con los "Pasos para testear", y una sección
   **"Relación con otros PRs"** si el análisis marcó 🟡/🔴/⛓️ ("toca `App.tsx` igual que #X; mergear
   después de #X y actualizar con `main` antes"; "apilado sobre #X, re-apuntar a `main` cuando se
   mergee"), con el lugar de este PR en el orden de merge recomendado. Para PRs apilados usar `--base gs/us-{MM}-...`. Si `gh` no está
   autenticado, dar el link `https://github.com/Gary-Sanchez/TheHoneycomb/pull/new/<rama>` de cada uno.
   Después de crear los PRs, vincularlos en la app con las tools `ccd_pr` (`get_status` / `bind_pr`)
   según lo que permita la sesión.
5. **Linear**, por ticket elegido y con gates separados: link del PR en el issue (`save_issue` con
   `links`, va junto con el sí al PR), comentario con los "Pasos para testear" (`save_comment`), y paso
   a `QA Ready`.

## Fase H — Limpieza de worktrees (opcional, con gate)

Los worktrees no se borran solos y cada uno pesa lo que su `node_modules`. Al final, ofrecer (no
hacer por cuenta propia) quitar los de tickets cuyo PR ya se mergeó:
`git worktree remove ".claude/worktrees/us-{NN}"` (falla si hay cambios sin commitear — en ese caso
avisar, no forzar). La rama local se puede borrar con `git branch -d` (nunca `-D`) una vez mergeada.
Mientras el PR esté abierto, dejar el worktree: sirve para atender comentarios de review o de
[[super-tefinha-QA]]. Para el QA de todo el lote, [[super-tefinha-QA-en-lote]] reusa el mismo análisis
de conflictos y prueba los PRs en el orden de merge recomendado.

## Bloqueos

Un bloqueo en un ticket (dependencia externa, acceso, decisión de negocio) no frena a los demás:
ese ticket se marca bloqueado en el reporte y se propone moverlo a `Blocked` en Linear con un
comentario explicando el motivo — con gate explícito, igual que en [[Honeycomb-executor]].

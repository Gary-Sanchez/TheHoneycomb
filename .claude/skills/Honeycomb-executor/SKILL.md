---
name: Honeycomb-executor
description: Ejecuta un ticket US-XX de The Honeycomb de punta a punta (asignación en Notion → research → desarrollo → testing → cierre con gate humana antes de commit y push) a partir de solo el número o nombre del ticket, trabajando siempre sobre una rama dedicada `gs/us-XX-...`. En cada fase evalúa si conviene delegar el trabajo a un subagente (uno de research, uno de desarrollo, uno de testing) o hacerlo directamente. Usar esta skill siempre que el usuario pegue un número de ticket ("US-05", "la US-06", "ticket 4") y pida ejecutarlo, implementarlo, resolverlo, "hacé la US-05", "arrancá con el ticket 6", "llevá adelante la historia US-04" — incluso si no menciona la skill por nombre.
---

# Honeycomb Executor

Toma un ticket US-XX ya redactado (ver [[Tefinha-crea-tickets]]) y lo lleva de punta a punta:
asignártelo en Notion, investigar el código relevante, implementar los Criterios de Aceptación, y
verificar con los Escenarios de Prueba de QA del propio ticket — todo sobre una rama dedicada. En
cada fase de research/desarrollo/testing decide — no asume de entrada — si conviene repartir el
trabajo en subagentes (`Agent` tool) o hacerlo en el hilo principal. Adaptada de la skill
`execute-ticket` de otro proyecto (NFC-MVP/Jira) al contexto de este repo (Notion + sin subtareas
formales), agregando lo que ese proyecto no necesitaba: autoasignación en el tablero y gates de git
explícitos antes de `commit`/`push`.

Este archivo vive dentro del propio repositorio (`the-honeycomb(1)/.claude/skills/Honeycomb-executor/`),
igual que [[Tefinha-crea-tickets]] y [[Start-Honeycomb]]. Los tickets, en cambio, viven **en la
carpeta padre de este repositorio** (`The Honeycomb/`), no dentro de `the-honeycomb(1)/` — son
archivos `US-{NN} {Título}.md` (o `.txt` para US-03, el ticket original). Igual que en
[[Start-Honeycomb]], los comandos de abajo asumen que la sesión arranca parada en esa carpeta padre;
si tu sesión ya arranca directamente en la raíz de este repositorio (clonaste `TheHoneycomb.git`
solo, sin la carpeta contenedora), ajustá las rutas relativas un nivel — y tené en cuenta que en ese
caso los archivos de ticket sueltos no van a estar disponibles, porque no están versionados en git.

## Fuentes fijas del proyecto

- **Tickets**: archivos `US-{NN} {Título}.md`/`.txt` en la carpeta padre de este repo (no
  versionados en git).
- **Notion**: base **The Honeycomb Board** — ver [`notion-board.md`](../Tefinha-crea-tickets/references/notion-board.md)
  para el esquema completo (`Name`, `Status`, `Dev`, `QA`, ...) y el data source
  (`collection://8cc326dd-ee75-415d-a78a-951a0cc146e7`).
  > Nota Claude Code: MCP de Notion (`notion-fetch`, `notion-query-data-sources`,
  > `notion-update-page`). `notion-fetch` con `id: "self"` da el user ID propio para asignarte
  > (`Dev`) sin tener que preguntarlo.
- **GitHub**: `https://github.com/Gary-Sanchez/TheHoneycomb` (rama por defecto `main`, protegida —
  requiere PR, no acepta push directo).
- **CLAUDE.md** (raíz del repo): stack, arquitectura (persistencia server-side vía `db.ts`,
  handlers espejados `App.tsx` ↔ `db.ts`), y reglas de negocio no negociables (4 actividades fijas,
  fecha de referencia fija, tiers de Hive Status, etc.).

## Entrada

El usuario da un número o referencia corta ("US-05", "la 5", "ticket 06", un link/ID de Notion).
Si describe el ticket sin ID claro y hay ambigüedad real sobre cuál es, listar los `US-*` existentes
y preguntar — no adivinar el ticket equivocado. Si da el ID, no confirmarlo, proceder directo.

## Fase 0 — Localizar el ticket, leerlo completo, y no arrancar sin haberlo leído

1. Buscar el archivo en la carpeta padre de este repositorio con un glob tipo `US-0{N}*` (probar
   con y sin cero a la izquierda). Si hay más de un match o ninguno, listar los `US-*.md`/`US-*.txt`
   existentes y preguntar al usuario en vez de adivinar.
2. Leer el archivo entero y extraer sus secciones tal como las define
   [`Tefinha-crea-tickets`](../Tefinha-crea-tickets/SKILL.md): Prioridad, Historia de Usuario,
   Criterios de Aceptación, Out of Scope, Escenarios de Prueba de QA (tabla
   `ID | Escenario | Resultado Esperado`), QA Checks (checklist).
3. Si el ticket referencia otro (ej. "Out of Scope" menciona "cubierto por US-04"), leer también
   ese otro ticket si es corto — a menudo aclara el límite exacto de lo que hay que tocar.
4. Repasar [`CLAUDE.md`](../../../CLAUDE.md) para ubicar qué componente/handler del código
   corresponde a la funcionalidad del ticket antes de decidir el plan — evita perder tiempo
   buscando a ciegas en la fase de research.
5. Buscar la página del ticket en **The Honeycomb Board** (`notion-query-data-sources`, filtro
   `Name contains "US-{NN}"`). Si no existe todavía, seguir igual con el archivo local y avisar al
   usuario al final que no hay página que actualizar — no es bloqueante para desarrollar.

**No empezar a programar sin haber leído el ticket completo.** Los Criterios de Aceptación y el
Out of Scope son el contrato: implementar de más (ej. tocar algo que el propio ticket excluye
explícitamente) es tan incorrecto como implementar de menos.

## Fase 0.5 — Autoasignarte, pasar a `InProgress`, y crear la rama de trabajo

Estos tres pasos van juntos, apenas termina la Fase 0, **antes** de tocar código. No son
destructivos ni ambiguos (autoasignarte un ticket que vas a trabajar ahora mismo), así que no
llevan gate de confirmación — a diferencia del cierre (Fase 6), que sí lo lleva.

1. Si la página de Notion existe: `notion-fetch id: "self"` para obtener tu user ID, y
   `notion-update-page` sobre esa página con `properties: {"Dev": ["<tu user ID>"], "Status": "InProgress"}`.
   Si el `Status` actual no era `ToDo` (ej. ya estaba en otro estado), avisar la discrepancia en el
   reporte final igual, pero no dejar de avanzar por eso — el pedido del usuario de ejecutar el
   ticket ya es la confirmación de que corresponde ponerlo en progreso.
2. Confirmar que el working tree está limpio (`git status`) antes de crear rama — si hay cambios
   sin commitear de otra tarea, avisar y no pisarlos.
3. Crear y pararse en una rama dedicada desde `main` actualizado:
   ```bash
   git checkout main && git pull && git checkout -b gs/us-{NN}-{slug-del-titulo}
   ```
   Formato de nombre: `gs/us-{NN}-{título en kebab-case, corto}` (ej.
   `gs/us-09-pre-commit-hooks-husky-lint-staged`) — mismas iniciales/convención ya usadas en este
   repo. **Todo** el trabajo de las fases siguientes (investigación de solo lectura aparte) se hace
   sobre esta rama, nunca directo en `main` (además `main` tiene branch protection en GitHub y
   rechaza push directo).

## Fase 1 — Investigación (research)

**Casi siempre conviene delegar.** Es de solo lectura, acotado, y no consume el contexto principal
con archivos que después no hacen falta. Delegar a `Agent` con `subagent_type: "Explore"` (o
`general-purpose` si además necesita leer el `.docx` de la guía de uso) pidiéndole que ubique: los
componentes/handlers involucrados, las funciones espejadas en `db.ts` si aplica (ver "Mirrors
handleX" en `CLAUDE.md`), y cualquier otro lugar del código que el Out of Scope obligue a **no**
tocar. Si el ticket es trivial y de un solo archivo (como US-05), research directo con `Grep`/`Read`
es más rápido que el overhead de un subagente — no delegar por delegar.

## Fase 2 — Plan

Con el resultado de investigación, sintetizar el plan de implementación uno mismo (no delegarlo a
un subagente). Si el ticket es no trivial (toca más de un archivo, afecta una regla de negocio, o
cambia el modelo de datos), entrar en modo de planificación (`EnterPlanMode`) y presentarlo al
usuario para alineación antes de escribir código. Si el ticket es trivial y acotado (un fix chico,
texto, config), se puede saltar el plan formal y decirlo explícitamente.

## Fase 3 — Desarrollo

**Delegar solo si el ticket se parte en partes realmente independientes.** La mayoría de los
cambios en este proyecto son transversales: un handler en `App.tsx` tiene su espejo en `db.ts`, y
un cambio de UI en un componente suele tocar `types.ts`. Repartir eso en subagentes paralelos
arriesga inconsistencias (un subagente cambia la firma de un tipo mientras otro ya escribió contra
la firma vieja). Por default, implementar en el hilo principal, con el contexto que ya trajo
research. Considerar subagentes de desarrollo en paralelo únicamente cuando el propio ticket
describe módulos sin relación de datos entre sí — y aun así, revisar el diff combinado antes de
seguir a testing.

1. Implementar cada Criterio de Aceptación, en el orden en que aparecen.
2. Respetar el Out of Scope al pie de la letra.
3. Seguir las convenciones ya establecidas en `CLAUDE.md`.
4. Correr `npm run lint` (`tsc --noEmit`, con el `PATH` de Node corregido igual que en
   [[Start-Honeycomb]]) antes de pasar a testing.

Después de implementar (propio o de subagentes), revisar el diff real antes de decir que está
listo — un subagente describe lo que intentó, no necesariamente lo que hizo.

## Fase 4 — Testeo, contra el propio ticket

**Depende de qué tipo de verificación pide el QA del ticket.** Hoy no hay suite de tests
automatizada (`npm run lint` es solo `tsc --noEmit`; Playwright recién se agregaría si se ejecuta
`US-06`). La verificación real es: correr la app (ver [[Start-Honeycomb]]) y recorrer la tabla de
Escenarios de Prueba de QA a mano. Eso es inherentemente secuencial e interactivo con un único
navegador — no repartirlo en varios subagentes que compitan por la misma ventana. Sí puede convenir
un subagente separado y en paralelo para verificaciones estáticas independientes de la UI mientras
el hilo principal hace el recorrido manual — pero es la excepción.

1. Usar [[Start-Honeycomb]] para compilar y levantar la app (o el modo dev si ya está corriendo).
2. Recorrer la tabla de **Escenarios de Prueba de QA** del ticket fila por fila.
3. Marcar cada ítem de **QA Checks** en el archivo local según el resultado real observado (esto no
   lleva gate — es edición de un archivo del repo, no algo visible para todo el equipo).
4. Si algún escenario falla, volver a la Fase 3 para ese punto puntual antes de seguir — no
   reportar el ticket como terminado con QA en rojo.

## Fase 5 — Reporte al usuario

Resumen corto: qué Criterios de Aceptación quedaron cubiertos, resultado de cada fila de QA (✅/❌
por `QA-XX`), qué quedó explícitamente fuera de alcance, y qué fases se delegaron a subagente y
cuáles no (una línea de motivo alcanza).

Además, redactar unos **"Pasos para testear la solución"**: una lista corta, concreta y
reproducible (comandos/clicks puntuales, no descripciones vagas) para que otra persona —revisor
del PR, QA, el yo del futuro— pueda validar el cambio sin releer el ticket entero. Sacarla
directamente de lo que se ejecutó de verdad en la Fase 4 (no inventar pasos hipotéticos ni
copiar la tabla de QA tal cual si no se corrió así) — típicamente: cómo levantar la app
([[Start-Honeycomb]]), qué acción puntual dispara el comportamiento, y qué resultado esperar. Esta
lista se reutiliza en la Fase 6, tanto en el mensaje de commit como en el comentario de Notion.

## Fase 6 — Cierre: gates de confirmación (git y Notion)

Todo lo de esta fase es visible para el equipo o difícil de revertir — a diferencia de la
autoasignación de la Fase 0.5, **cada paso siguiente lleva su propio gate explícito**, incluso si
el usuario ya aprobó el paso anterior:

1. **Gate 1 — antes de `git commit`.** Preguntar si se hace commit de los cambios. Nunca commitear
   sin que lo pidan. Al commitear:
   - Mensaje siguiendo el estilo de commits ya usado en el repo, indicando el ticket (`US-{NN}`).
   - Clasificar el cambio (patch / minor / major, o "sin bump" si es tooling interno sin impacto en
     runtime/versión pública) y anotarlo en el cuerpo del mensaje — igual que se hizo en US-09.
   - Incluir en el cuerpo del mensaje una sección `## Cómo testear` con los "Pasos para testear la
     solución" redactados en la Fase 5 — para que quede en el historial de git, no solo en el chat.
2. **Gate 2 — antes de `git push`.** Aunque el commit ya se haya aprobado, pedir confirmación
   aparte antes de pushear — pushear a un branch remoto ya es visible para el equipo. Nunca asumir
   que "commit aprobado" implica "push aprobado".
3. **Gate 3 — PR y Notion**, después de un push exitoso:
   - Preguntar si se crea el Pull Request (rama `gs/us-{NN}-...` contra `main`; recordar que `main`
     tiene branch protection y no acepta push directo, así que un PR es obligatorio para mergear).
     Si no hay `gh` CLI autenticado disponible, dar el link directo de creación de PR que devuelve
     `git push` (`https://github.com/Gary-Sanchez/TheHoneycomb/pull/new/<rama>`) en vez de
     inventar uno. Al redactar la descripción del PR, reusar los mismos "Pasos para testear la
     solución" en su sección de test plan.
   - Preguntar si se deja un **comentario en la página de Notion del ticket** (`notion-create-comment`)
     con los mismos "Pasos para testear la solución" — así alguien de QA que solo mira Notion (no
     el PR ni el commit) sabe cómo validar sin pedirlo por chat. Es una acción visible para el
     equipo igual que las anteriores, así que lleva el mismo gate: no postear sin un sí explícito.
   - Preguntar si se pasa el `Status` del ticket en Notion a `QA Ready` (ver
     [`notion-board.md`](../Tefinha-crea-tickets/references/notion-board.md)) — solo si la página
     ya existe. Recién con un sí explícito, actualizar la página; si no hay confirmación clara,
     dejarlo como está y avisar que queda pendiente a mano.

No agrupar estos gates en una sola pregunta genérica ("¿aviso todo?") — son decisiones distintas y
el usuario puede querer, por ejemplo, el commit local ya pero el push todavía no, o el PR sí pero
el comentario en Notion no.

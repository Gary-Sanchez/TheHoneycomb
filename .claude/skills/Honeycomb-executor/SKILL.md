---
name: Honeycomb-executor
description: Ejecuta un ticket US-XX de The Honeycomb de punta a punta (research → desarrollo → testing) a partir de solo el número o nombre del ticket, y en cada fase evalúa si conviene delegar el trabajo a un subagente (uno de research, uno de desarrollo, uno de testing) o hacerlo directamente. Usar esta skill siempre que el usuario pegue un número de ticket ("US-05", "la US-06", "ticket 4") y pida ejecutarlo, implementarlo, resolverlo, "hacé la US-05", "arrancá con el ticket 6", "llevá adelante la historia US-04" — incluso si no menciona la skill por nombre.
---

# Honeycomb Executor

Toma un ticket US-XX ya redactado (ver [[Tefinha-crea-tickets]]) y lo lleva de punta a punta:
investigar el código relevante, implementar los Criterios de Aceptación, y verificar con los
Escenarios de Prueba de QA del propio ticket. En cada fase decide — no asume de entrada — si
conviene repartir el trabajo en subagentes (`Agent` tool) o hacerlo en el hilo principal.

Este archivo vive dentro del propio repositorio (`the-honeycomb(1)/.claude/skills/Honeycomb-executor/`),
igual que [[Tefinha-crea-tickets]] y [[Start-Honeycomb]]. Los tickets, en cambio, viven **en la
carpeta padre de este repositorio** (`The Honeycomb/`), no dentro de `the-honeycomb(1)/` — son
archivos `US-{NN} {Título}.md` (o `.txt` para US-03, el ticket original). Igual que en
[[Start-Honeycomb]], los comandos de abajo asumen que la sesión arranca parada en esa carpeta padre;
si tu sesión ya arranca directamente en la raíz de este repositorio (clonaste `TheHoneycomb.git`
solo, sin la carpeta contenedora), ajustá las rutas relativas un nivel — y tené en cuenta que en ese
caso los archivos de ticket sueltos no van a estar disponibles, porque no están versionados en git.

## 1. Localizar y leer el ticket completo

El usuario solo va a dar un número o una referencia corta ("US-05", "la 5", "ticket 06"). Antes
de tocar código:

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
   corresponde a la funcionalidad del ticket antes de decidir el plan (mapeo de pestañas a
   `src/components/`, dónde vive la persistencia, etc.) — evita perder tiempo buscando a ciegas en
   la fase de research.

**No empezar a programar sin haber leído el ticket completo.** Los Criterios de Aceptación y el
Out of Scope son el contrato: implementar de más (ej. tocar algo que el propio ticket excluye
explícitamente) es tan incorrecto como implementar de menos.

## 2. Evaluar la factibilidad de subagentes — por fase, no de una

La idea de origen es un pipeline de tres subagentes (research / desarrollo / testing), pero no
todos los tickets de este proyecto lo justifican — `US-05` (sacar un botón) no tiene nada que
paralelizar, mientras que `US-03` (import con parser + UI + varios formatos) sí tiene partes
independientes. Antes de ejecutar, decidí explícitamente para **cada** fase, y contale al usuario
en una frase el criterio usado (no hace falta preguntarle, es una decisión técnica):

**Research — casi siempre conviene delegar.**
Es de solo lectura, acotado, y no consume el contexto principal con archivos que después no hacen
falta. Delegar a `Agent` con `subagent_type: "Explore"` (o `general-purpose` si además necesita
leer el `.docx` de la guía de uso) pidiéndole que ubique: los componentes/handlers involucrados,
las funciones espejadas en `db.ts` si aplica (ver "Mirrors handleX" en `CLAUDE.md`), y cualquier
otro lugar del código que el Out of Scope obligue a **no** tocar. Si el ticket es trivial y de un
solo archivo (como US-05), research directo con `Grep`/`Read` es más rápido que el overhead de un
subagente — no delegar por delegar.

**Desarrollo — delegar solo si el ticket se parte en partes realmente independientes.**
La mayoría de los cambios en este proyecto son transversales: un handler en `App.tsx` tiene su
espejo en `db.ts`, y un cambio de UI en un componente suele tocar `types.ts`. Repartir eso en
subagentes paralelos arriesga inconsistencias (un subagente cambia la firma de un tipo mientras
otro ya escribió contra la firma vieja). Por default, implementar en el hilo principal, con el
contexto que ya trajo research. Considerar subagentes de desarrollo en paralelo únicamente cuando
el propio ticket describe módulos sin relación de datos entre sí (ej. "agregar exportación a PDF"
+ "agregar un filtro de fecha" en el mismo ticket, si no comparten estado) — y aun así, revisar el
diff combinado antes de seguir a testing.

**Testing — depende de qué tipo de verificación pide el QA del ticket.**
Hoy no hay suite de tests automatizada (`npm run lint` es solo `tsc --noEmit`; Playwright recién
se agregaría si se ejecuta `US-06`). La verificación real es: correr la app (ver
[[Start-Honeycomb]]) y recorrer la tabla de Escenarios de Prueba de QA a mano en el navegador. Eso
es inherentemente secuencial e interactivo con un único navegador — no tiene sentido repartirlo en
varios subagentes que compitan por la misma ventana. Sí puede convenir un subagente separado y en
paralelo para verificaciones estáticas independientes de la UI (ej. `Grep` para confirmar que no
queda ninguna otra referencia al control eliminado, o que el Out of Scope no se tocó) mientras el
hilo principal hace el recorrido manual — pero es la excepción, no la regla.

Si en algún ticket concreto la asignación no es obvia, es preferible pecar de conservador (menos
subagentes, más control) antes que fragmentar un cambio pequeño en tres agentes que después hay
que reconciliar.

## 3. Fase de desarrollo

1. Implementar cada Criterio de Aceptación, en el orden en que aparecen (suele ser el orden en que
   el usuario los experimenta en la interfaz).
2. Respetar el Out of Scope al pie de la letra — no "aprovechar" para tocar algo excluido aunque
   parezca relacionado.
3. Seguir las convenciones ya establecidas en `CLAUDE.md` (strings de UI en inglés y literales,
   handlers espejados en `db.ts`, etc.).
4. Correr `npm run lint` (`tsc --noEmit`, con el `PATH` de Node corregido igual que en
   [[Start-Honeycomb]]) antes de pasar a testing — es la única verificación automática disponible
   hoy y es gratis detectarlo acá en vez de en QA manual.

## 4. Fase de testing — contra el propio ticket, no en abstracto

1. Usar [[Start-Honeycomb]] para compilar y levantar la app (o el modo dev en navegador si ya está
   corriendo y solo hace falta refrescar).
2. Recorrer la tabla de **Escenarios de Prueba de QA** del ticket fila por fila, reproduciendo el
   escenario descrito y comparando contra el "Resultado Esperado" — no inventar casos nuevos que
   el ticket no pidió verificar.
3. Marcar cada ítem de **QA Checks** según el resultado real observado (no tildar de antemano).
4. Si algún escenario falla, volver a la fase de desarrollo para ese punto puntual antes de seguir
   con el resto de la tabla — no reportar el ticket como terminado con QA en rojo.

## 5. Reporte final al usuario

Resumen corto: qué Criterios de Aceptación quedaron cubiertos, resultado de cada fila de QA (✅/❌
por `QA-XX`), y si algo del Out of Scope se dejó explícitamente afuera. Mencionar qué fases se
delegaron a subagente y cuáles no, con el motivo (una línea alcanza, ya quedó razonado en el paso
2).

## 6. Cierre del ticket — gate de confirmación, igual que al crearlo

No editar el estado del ticket en Notion sin confirmación explícita, por la misma razón que en
[`Tefinha-crea-tickets`](../Tefinha-crea-tickets/SKILL.md): es un tablero compartido por todo el
equipo. Una vez que QA cerró en verde:

1. Preguntar si se actualiza el Status a `Done` en **The Honeycomb Board** (ver
   [`notion-board.md`](../Tefinha-crea-tickets/references/notion-board.md) para el mapeo de
   propiedades) — solo si la página de ese ticket ya existe ahí.
2. Recién con un sí explícito, actualizar la página. Si no hay confirmación clara, dejarlo como
   está y avisar que queda pendiente de actualizar a mano.

No hace falta gate para dejar tildado el checklist de **QA Checks** dentro del propio archivo
`.md`/`.txt` local del ticket — eso es edición de un archivo del repo, no una publicación visible
para todo el equipo.

# Tablero de Linear: proyecto The Honeycomb

Desde el 2026-10-05 el seguimiento de tickets vive en **Linear** (migrado desde The Honeycomb Board
de Notion — ver [`notion-board.md`](notion-board.md), que queda solo como referencia histórica:
**no** crear ni mover tickets ahí).

- **Board:** https://linear.app/nicky-arias/project/the-honeycomb-9611df6b5f72/issues
- **Proyecto:** The Honeycomb (`P-NIC-1`)
- **Team:** `Nicky Arias` (key `NIC`) — los issues se identifican `NIC-{n}`.
- **Herramientas:** MCP de Linear (`get_issue`, `list_issues`, `save_issue`, `list_comments`,
  `save_comment`, `list_issue_statuses`, `list_users`, `get_user`). Cargarlas con ToolSearch
  (`"linear issue"` / `select:<nombre completo>`) antes de usarlas.

## Equipo

| Persona | Nombre en Linear | Email (usar como `assignee`) |
|---------|------------------|------------------------------|
| Fabiola Arias | `Nicky Arias` | fabiola.arias@jalasoft.com |
| Alejandra Rivera | `Alejandra Rivera` | alejandra.rivera@jalasoft.com |
| Gary Sanchez | `Gary Ro Sanchez` | garyronald.sanchez@jalasoft.com |
| Karen Teran | `Karen Teran` | karen.teran@jalasoft.com |

- Para asignar, usar el **email** (o `"me"` para uno mismo): los nombres en Linear no siempre
  coinciden con el nombre real (Fabiola figura como `Nicky Arias`, Gary como `Gary Ro Sanchez`).
- En la cabecera Dev/QA de la descripción va el **nombre real** (columna "Persona").
- Si aparece alguien que no está en esta tabla, confirmar con `list_users` antes de asignar; si no
  está en el workspace, no inventar: dejar su nombre en la cabecera y avisar al usuario.

## Mapeo ticket ↔ issue

| Ticket (US-XX) | Issue de Linear |
|----------------|-----------------|
| Título `US-{NN}: {Título}` | `title` — idéntico, sin el `#` de markdown |
| Cuerpo (desde `**Prioridad:**`) | `description` (markdown) |
| Prioridad Crítica / Alta / Media / Baja | `priority` 1 / 2 / 3 / 4 |
| Dev | `assignee` (un solo usuario) + `**Dev:**` en la cabecera |
| QA | `**QA:**` en la cabecera — Linear no tiene un segundo campo de persona |
| Tipo | `labels`: `Bug` (corrección), `Feature` (funcionalidad nueva), `Improvement` (tooling, seguridad, refactor) |
| PR de GitHub | `links` del issue (`{url, title: "PR #<n>"}`) |

El número `US-{NN}` está en el **título**, no en el identificador (`US-05` es `NIC-6`). Para
encontrar un ticket por número: `list_issues` con `project: "The Honeycomb"` y `query: "US-{NN}"`, y
quedarse con el issue cuyo título empieza exactamente con `US-{NN}:` (ojo `US-1` vs `US-10`).

### Cabecera Dev / QA

La `description` de cada issue arranca con una línea de cita con los responsables:

```
> **Dev:** <nombre(s)> · **QA:** <nombre(s)>
```

(Los issues migrados la tienen como `> Migrado desde Notion — The Honeycomb Board · **Dev:** … · **QA:** …`.)
Para cambiar Dev o QA, editar esa línea con `save_issue` + `patch` (`replace` sobre
`**QA:** <valor actual>` o `**Dev:** <valor actual>`); si el issue no la tiene, agregarla con `patch`
`prepend`. Sin asignar se escribe `—`. No reescribir la `description` completa para esto.

## Flujo de estados (columnas del board)

| Columna       | Categoría Linear | Significado | Quién lo mueve | Assignee |
|---------------|------------------|-------------|----------------|----------|
| `Backlog`     | backlog   | Idea sin priorizar | Manual | — |
| `To Do`       | unstarted | Ticket creado, listo para arrancar | [`Tefinha-crea-tickets`](../SKILL.md) al crearlo | sin asignar |
| `In Progress` | started   | En desarrollo (o devuelto por QA con Failed / Needs Fix) | [`Honeycomb-executor`](../../Honeycomb-executor/SKILL.md) al arrancar; [`super-tefinha-QA`](../../super-tefinha-QA/SKILL.md) si falla | Dev |
| `QA Ready`    | started   | PR abierto, listo para (o en) QA | `Honeycomb-executor` al cierre, con gate | Dev (QA en cabecera) |
| `Blocked`     | started   | Bloqueado por una dependencia externa | Manual, o cualquier skill **con gate** si detecta un bloqueo real | Dev |
| `Merge Ready` | completed | QA aprobado (Passed), listo para mergear el PR | `super-tefinha-QA` con veredicto Passed | Dev |
| `Done`        | completed | PR mergeado / ticket cerrado | Manual, o con confirmación explícita del usuario | Dev |
| `Canceled` / `Duplicate` | canceled | Descartado | Manual | — |

- Los nombres son exactos: **`To Do`** (con espacio), `In Progress`, `QA Ready`, `Merge Ready`,
  `Blocked`, `Done`.
- **`Merge Ready` está en la categoría *completed***: Linear lo trata como cerrado (cuenta para el
  progreso del proyecto y le pone `completedAt`). Por eso un ticket en `Merge Ready` con la PR
  todavía sin mergear sigue siendo responsabilidad del Dev hasta pasar a `Done`.
- Si `list_issue_statuses` (`team: "Nicky Arias"`) no devuelve un estado de esta tabla (alguien lo
  renombró o borró), **no** sustituirlo por otro parecido: dejar el issue como está y avisar.

## Asignaciones

- **Dev = `assignee`**, durante todo el ciclo de vida del ticket (de `In Progress` a `Done`). El
  assignee **no cambia** al pasar a QA: el QA se anota en la cabecera.
- **Al arrancar** (Honeycomb-executor): `assignee: "me"` + `**Dev:**` con tu nombre real.
- **Al empezar QA** (super-tefinha-QA): `**QA:**` con el nombre real de quien prueba; assignee intacto.
- **Si QA devuelve el ticket** (`In Progress`): assignee intacto (vuelve al mismo Dev).
- Reasignar el Dev a otra persona (no a uno mismo) es una decisión del equipo: solo con un pedido
  explícito del usuario.

## Cómo crear un issue nuevo

Lo usa [`Tefinha-crea-tickets`](../SKILL.md), **solo después** de su gate de confirmación:

```
save_issue(
  team: "Nicky Arias",
  project: "The Honeycomb",
  state: "To Do",
  title: "US-{NN}: {Título}",          # igual al H1 del ticket, sin "# "
  priority: 2 | 3 | 4,                 # 🔴 Alta → 2, 🟡 Media → 3, 🟢 Baja → 4 (Crítica → 1)
  labels: ["Feature" | "Improvement" | "Bug"],
  description: <línea "> **Dev:** — · **QA:** —">, línea en blanco, <cuerpo del ticket desde **Prioridad:**>
)
```

- La `description` **no** repite el título: Linear ya lo muestra desde `title`.
- Sin `assignee`, salvo que el usuario indique explícitamente quién lo va a desarrollar (en ese caso,
  su email de la tabla Equipo y su nombre en `**Dev:**`).
- Antes de crear, verificar con `list_issues` (`query: "US-{NN}"`) que no exista ya un issue con
  ese número.

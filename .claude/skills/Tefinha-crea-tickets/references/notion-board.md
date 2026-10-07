# Tablero de Notion: The Honeycomb Board

> ⚠️ **Histórico.** Desde el 2026-10-05 los tickets viven en Linear — ver
> [`linear-board.md`](linear-board.md). Honeycomb-executor y super-tefinha-QA ya no usan este board.

- **URL:** https://app.notion.com/p/24fea5f14da54b248862418052185c36
- **Tipo:** Database de Notion (ya conectada por MCP, no requiere autenticación adicional).
- **Data source (para crear páginas):** `collection://8cc326dd-ee75-415d-a78a-951a0cc146e7`
- **Vistas:** `Default view` (tabla) y `Board` (kanban agrupado por `Status`).

## Esquema actual

| Propiedad | Tipo   | Valores |
|-----------|--------|---------|
| `Name`    | title  | Título de la historia de usuario |
| `Status`  | select | `To Do`, `In Progress`, `QA Ready`, `Merge Ready`, `Done`, `Blocked` |
| `Dev`     | person | Quién está desarrollando el ticket (asignación) |
| `QA`      | person | Quién lo está testeando |
| `Date`    | date   | Sin uso definido todavía en las skills existentes |
| `Place` / `Place 1` / `Place 2` | place | Sin uso definido todavía en las skills existentes |

Este esquema **no tiene columna de Prioridad** — la redacción completa de la historia (Prioridad,
Historia de Usuario, Criterios de Aceptación, Out of Scope, QA) vive en el **contenido** de la
página, no en propiedades. El esquema sí evolucionó respecto a versiones anteriores de este
documento (se agregaron `Dev`, `QA`, `Date`, `Place*` y nuevos valores de `Status`) — si algo no
coincide con lo que ves acá, volvé a hacer `fetch` del data source
(`collection://8cc326dd-ee75-415d-a78a-951a0cc146e7`) para confirmar el esquema vigente antes de
asumir que sigue siendo el mismo.

### Flujo de `Status`

| Estado        | Significado | Quién lo mueve |
|---------------|-------------|----------------|
| `To Do`       | Ticket creado, sin arrancar | [`Tefinha-crea-tickets`](../SKILL.md) al crearlo |
| `In Progress` | En desarrollo (o devuelto por QA con Failed / Needs Fix) | [`Honeycomb-executor`](../../Honeycomb-executor/SKILL.md) al arrancar; [`super-tefinha-QA`](../../super-tefinha-QA/SKILL.md) si falla |
| `QA Ready`    | PR abierto, listo para (o en) QA | `Honeycomb-executor` al cierre, con gate |
| `Merge Ready` | QA aprobado (Passed), listo para mergear el PR | `super-tefinha-QA` con veredicto Passed |
| `Done`        | PR mergeado / ticket cerrado | Manual, o con confirmación explícita del usuario |
| `Blocked`     | Bloqueado por una dependencia externa | Manual |

Los nombres llevan espacio (`To Do`, `In Progress`, `Merge Ready`); las versiones viejas `ToDo`,
`InProgress` y `Under Testing` ya **no existen** en el select — no usarlas.

### Asignación (`Dev`) al arrancar un ticket

[`Honeycomb-executor`](../../Honeycomb-executor/SKILL.md) autoasigna el ticket al usuario actual en
`Dev` y pasa `Status` a `In Progress` al arrancar el desarrollo. Para obtener el ID del usuario
actual (necesario para el property `Dev`, que espera un array de user IDs), usar
`notion-fetch` con `id: "self"` — devuelve `self.user.id`. No hace falta pedir confirmación para
este paso puntual (asignarse a uno mismo y marcar en progreso no es una decisión ambigua ni
destructiva), a diferencia de mover a `Done`, que si requiere gate explícito.

## Cómo mapear un ticket a una página de Notion

- `properties.Name` = el título completo de la historia, igual que el H1 del ticket
  (`US-{NN}: {Título}`) — **sin** el `#` de markdown.
- `properties.Status` = `"To Do"` por default (ticket recién creado), salvo que el usuario indique
  explícitamente otro estado.
- `content` = el resto del ticket en markdown (desde `**Prioridad:**` en adelante), **sin repetir
  el título** — la herramienta de creación de páginas ya lo toma de `properties.Name` y lo muestra
  como encabezado de la página.
- Parent al crear la página:
  ```json
  { "type": "data_source_id", "data_source_id": "8cc326dd-ee75-415d-a78a-951a0cc146e7" }
  ```

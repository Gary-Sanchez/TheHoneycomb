# Tablero de Notion: The Honeycomb Board

- **URL:** https://app.notion.com/p/24fea5f14da54b248862418052185c36
- **Tipo:** Database de Notion (ya conectada por MCP, no requiere autenticación adicional).
- **Data source (para crear páginas):** `collection://8cc326dd-ee75-415d-a78a-951a0cc146e7`
- **Vistas:** `Default view` (tabla) y `Board` (kanban agrupado por `Status`).

## Esquema actual

| Propiedad | Tipo   | Valores |
|-----------|--------|---------|
| `Name`    | title  | Título de la historia de usuario |
| `Status`  | select | `ToDo`, `InProgress`, `QA Ready`, `Under Testing`, `Done`, `Blocked` |
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

### Asignación (`Dev`) al arrancar un ticket

[`Honeycomb-executor`](../../Honeycomb-executor/SKILL.md) autoasigna el ticket al usuario actual en
`Dev` y pasa `Status` a `InProgress` al arrancar el desarrollo. Para obtener el ID del usuario
actual (necesario para el property `Dev`, que espera un array de user IDs), usar
`notion-fetch` con `id: "self"` — devuelve `self.user.id`. No hace falta pedir confirmación para
este paso puntual (asignarse a uno mismo y marcar en progreso no es una decisión ambigua ni
destructiva), a diferencia de mover a `Done`, que si requiere gate explícito.

## Cómo mapear un ticket a una página de Notion

- `properties.Name` = el título completo de la historia, igual que el H1 del ticket
  (`US-{NN}: {Título}`) — **sin** el `#` de markdown.
- `properties.Status` = `"ToDo"` por default (ticket recién creado), salvo que el usuario indique
  explícitamente otro estado.
- `content` = el resto del ticket en markdown (desde `**Prioridad:**` en adelante), **sin repetir
  el título** — la herramienta de creación de páginas ya lo toma de `properties.Name` y lo muestra
  como encabezado de la página.
- Parent al crear la página:
  ```json
  { "type": "data_source_id", "data_source_id": "8cc326dd-ee75-415d-a78a-951a0cc146e7" }
  ```

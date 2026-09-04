# Tablero de Notion: The Honeycomb Board

- **URL:** https://app.notion.com/p/24fea5f14da54b248862418052185c36
- **Tipo:** Database de Notion (ya conectada por MCP, no requiere autenticación adicional).
- **Data source (para crear páginas):** `collection://8cc326dd-ee75-415d-a78a-951a0cc146e7`
- **Vistas:** `Default view` (tabla) y `Board` (kanban agrupado por `Status`).

## Esquema actual

| Propiedad | Tipo   | Valores |
|-----------|--------|---------|
| `Name`    | title  | Título de la historia de usuario |
| `Status`  | select | `ToDo`, `InProgress`, `Done` |

Este esquema **no tiene columna de Prioridad** ni ninguna otra propiedad estructurada — toda la
redacción de la historia (Prioridad, Historia de Usuario, Criterios de Aceptación, Out of Scope,
QA) vive en el **contenido** de la página, no en propiedades. Si en algún momento el tablero
incorpora nuevas propiedades (ej. una columna `Priority`), volvé a hacer `fetch` de este data
source para confirmar el esquema actual antes de asumir que sigue siendo el mismo.

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

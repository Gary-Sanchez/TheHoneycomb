# Checklist base de regresión manual (siempre, en cada corrida)

Cubre lo que `capture.mjs` no puede: flujos que **escriben** datos, modales y errores. Se corre
sobre B con el server de la Fase 5 (copia del golden DB, puerto propio, contraseña de prueba
generada en el momento) en el navegador integrado. Los textos entre `` ` `` son los de la UI
actual (después de US-46); si el rango los cambió a propósito, vale el texto de la US.

Antes de cada bloque que escribe, anotar los números que deberían cambiar (Dashboard, Caserits &
Progress) y verificarlos **después**: el cambio tiene que reflejarse sin recargar (US-21).

| ID | Flujo | Pasos | Esperado |
|---|---|---|---|
| RB-01 | Solo lectura (US-11) | Sin sesión, recorrer las 6 pestañas | Se ven los datos; los controles que escriben están deshabilitados con el aviso de solo lectura; el header muestra `Sign In` |
| RB-02 | Login / logout (US-11) | Settings → `Admin Access` → contraseña de prueba → entrar; después `Sign Out` | `Signed in as admin. Editing is enabled.`; el header pasa a `Admin`; al salir vuelve a solo lectura |
| RB-03 | Import `.csv` feliz (US-18/25/37) | Import Forage Logs → `Browse Files` → `01 Speakeasy - Attendance report 6-1-26.csv` del corpus → `Extract the Buzz` → `Confirm & Import Caserits` | Preview con Speakeasy `from file name`, 3 colegas (Ana Lopez fuera por < 10 min, Fabiola fuera por blacklist); al confirmar `Import Complete`; Dashboard y Bee-havior Hub suben el total de eventos de Speakeasy en 1 |
| RB-04 | Mismo archivo otra vez (US-26) | Volver a subir `01 …` (o `06 copia renombrada.csv`) | Bloqueado como ya importado, sin registros nuevos |
| RB-05 | Evento ya cargado (US-33) | Subir `07 Speakeasy - Attendance report 6-10-26.csv` | Aviso de evento ya cargado; si se intenta confirmar, `No New Attendance Records` / sin cambios |
| RB-06 | Actividad no detectada (US-37) | Subir `03 Weekly sync.csv` | `Activity Not Detected`, selector por archivo, `Confirm & Import Caserits` deshabilitado hasta elegir actividad **y** fecha |
| RB-07 | Lote mixto (US-27/38) | Subir los 7 `.csv` juntos | El lote no se rechaza; cada archivo con su actividad; `06` marcado como duplicado de `01` |
| RB-08 | Descartar preview | Con un preview abierto, descartarlo | Pide confirmación (`Discard this preview? …`) y no importa nada |
| RB-09 | Manual Check-In (US-20/23) | `Log Event Attendance` → fecha y actividad de un evento existente → `Add & Check In` con un nombre nuevo, después `Save Attendance Records` | Se une al evento existente (no crea otro con la misma fecha+actividad); el colega nuevo aparece en Caserits & Progress, en orden alfabético (US-28) |
| RB-10 | Check-In duplicado (US-23) | Repetir RB-09 con el mismo nombre (otra capitalización) | No se duplica ni en el directorio ni en el evento |
| RB-11 | Progress Report y notas (US-41) | Caserits & Progress → `Progress Report` de Elena Rostova → editar la nota → guardar → cerrar y reabrir | La nota persiste; tasas y meses coherentes con la fila de la tabla |
| RB-12 | Borrado en cascada | `Delete Elena Rostova` → `Delete` | Pide confirmación (`… Their attendance records and coaching notes will also be deleted.`); desaparece de todas las pestañas y sus registros dejan de contar en los KPIs |
| RB-13 | Filtro de periodo (US-35) | Dashboard → `Period` → `Custom range` 2026-06-01 a 2026-06-30; cambiar de pestaña y volver; recargar | Las métricas cambian al periodo; se mantiene al navegar; al recargar vuelve a `All time` |
| RB-14 | Outcome Report (US-40) | Dashboard → `Generate Outcome Report` → descargar | Se genera el archivo; `Top overall` / `Top per activity` coherentes con el Bee-havior Hub |
| RB-15 | Sesión vencida (US-22) | Con sesión, reiniciar el server (las sesiones viven en memoria) e intentar un import | Mensaje de sesión expirada y la app pasa a solo lectura sin perder lo que había en pantalla del servidor |
| RB-16 | Persistencia y shutdown (US-15) | Después de RB-03 y RB-11, parar el server con Ctrl+C / SIGINT y volver a levantarlo con la misma base | Los datos importados y la nota siguen ahí |
| RB-17 | Consola limpia | Durante todo el recorrido, `read_console_messages` (`onlyErrors`) | Sin errores nuevos (ni violaciones de CSP, US-14) |

Formatos no `.csv` (`.xlsx`, `.docx`, `.txt`): si el rango tocó `parser.ts`, sumar al menos uno de
cada tipo con el ejemplo de la propia pestaña (`Date: June 15, 2026` / `Activity: Music Room` /
`- Elena Rostova (Present)`), y verificar que un `.xlsx` sin actividad en el nombre quede
`Activity Not Detected` (US-37).

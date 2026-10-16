# Corpus de regresión del parser

Archivos fijos que `capture.mjs` sube a `POST /api/parse-attendance-batch` (uno por uno y todos
juntos en un lote) en cada snapshot. **No editarlos**: cambiar un archivo cambia la línea base de
todos los snapshots. Para cubrir un caso nuevo, agregar un archivo con el siguiente número.

| Archivo | Qué ejercita |
|---|---|
| `01 Speakeasy - Attendance report 6-1-26.csv` | Teams con duración: Title Case (US-18), sufijo `(Guest)`, < 10 min (US-25, `8m` fuera y `10m 0s` dentro), blacklist (US-19/30), actividad por nombre de archivo (US-37), fecha nueva |
| `02 attendance-6-3.csv` | Actividad por `Meeting title` (US-37), colega nuevo vs. existente |
| `03 Weekly sync.csv` | Sin actividad (`email` no cuenta, US-37) y sin fecha (`dateDetected: false`, US-18) |
| `04 Music Room - Attendance report 6-24-26.csv` | Nombre de archivo gana sobre el título (US-37); además el golden DB ya tiene ese evento de Music Room con los mismos 2 colegas → `alreadyLoaded` (US-33) |
| `05 Writing Hood 2026-06-03.csv` | Encabezados en español, < 10 min con `Duración en la reunión` (US-25). La fecha `3/6/26` hoy se lee como **2026-03-06** (M/D): si una versión la cambia a D/M, el delta tiene que estar autorizado por una US |
| `06 copia renombrada.csv` | Mismo contenido que `01` con CRLF y otro nombre → `duplicateOf` en el lote (US-26/27) |
| `07 Speakeasy - Attendance report 6-10-26.csv` | Evento ya cargado en el golden DB sin fingerprint → `alreadyLoaded` (US-33) |

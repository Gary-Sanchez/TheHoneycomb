# Documento de Requisitos de Producto (PRD): The Honeycomb 4.0

> **Versión:** 4.0 (borrador) · **Base:** PRD The Honeycomb 3.0 (criterios cumplidos) · **Fecha:** 2026-10-06
> · **Actualizado:** 2026-10-07 con lo que entra al 4.0 de la Auditoría UX/UI (`UX-UI-AUDIT-2026-10-07.pdf`)

## 1. Visión General del Producto y Objetivos

### 1.1. Visión y Propósito

Con la versión 3.0, los porcentajes del **Caserits Bee-havior Hub** se calculan sobre los eventos
reales de cada actividad, el Doc Parser filtra asistencias de menos de 10 minutos, detecta archivos
duplicados y acepta lotes de hasta 20 `.csv`. **The Honeycomb 4.0** se enfoca en **analizar** esos
datos y en **simplificar la carga**:

- el **Dashboard** permite elegir un periodo de tiempo y ver métricas solo de ese periodo;
- los gráficos del Dashboard se reemplazan por paneles desplegables con métricas más útiles;
- el **Smart Doc Parser** detecta la actividad por el nombre del archivo (y, en `.csv`, también por
  el título de la reunión), sin tener que elegirla antes de subir;
- **Caserits & Progress** muestra porcentajes de asistencia reales;
- la app genera un **reporte de resultados** (Outcome Report) con los colegas más activos de cada
  actividad y los colegas de cada Hive Status, para todo el historial o para un periodo;
- todas las pestañas muestran **los mismos números y las mismas etiquetas** para un mismo colega, y
  los textos de la interfaz usan **un único vocabulario**.

> **¿Por qué 4.0 y no 3.1?** Esta versión cambia la forma de trabajar: la carga de archivos deja de
> tener pestañas por actividad, los lotes pueden mezclar actividades, el Dashboard se rediseña y los
> porcentajes que ya se veían cambian de valor. Por convención, un cambio que obliga a quien usa la
> app a adaptarse es una versión mayor.

### 1.2. Objetivos Principales

1. **Filtro por periodo en el Dashboard (feature).** Agrupar la asistencia en un periodo de tiempo
   específico y calcular las métricas solo sobre ese periodo.
2. **Paneles desplegables de métricas (feature).** Reemplazar los cuadros **Attendance Trends** y
   **Cross-Activity Comparisons** por paneles desplegables con métricas más útiles, que también
   respeten el periodo elegido.
3. **Detección automática de la actividad (improvement).** El Smart Doc Parser lee el nombre de
   cada archivo (y, en `.csv`, el título de la reunión) para decidir en qué actividad registrar la
   asistencia. Desaparecen las pestañas de selección de actividad de **Import Forage Logs**.
4. **Attendance rate real en Caserits & Progress (improvement).** Hoy el **Attendance Rate** muestra
   `100%` en todos los casos. Debe calcularse sobre la cantidad de eventos de las actividades a las
   que asiste cada colega.
5. **Outcome Report (feature).** Generar un archivo `.txt` con los colegas más activos de cada
   actividad (o en general) y con los colegas de uno o más Hive Status (ej. todos los `Busy Bee` o
   todos los `Dormant`), para todo el historial o para un periodo específico.
6. **Lotes de hasta 50 archivos (improvement).** La carga múltiple de `.csv` pasa de 20 a 50 archivos
   por lote, ya que un lote puede mezclar actividades.
7. **Textos y terminología unificados (improvement).** Un glosario y un verbo por acción, y se
   corrigen los errores de redacción detectados por la auditoría UX/UI (§2.9).
8. **Interfaz nueva accesible (improvement).** Los componentes que agrega esta versión cumplen
   requisitos mínimos de accesibilidad y consistencia (§2.8).

### 1.3. 🐞 Corrección de Bugs

- **BUG-03: el Progress Report muestra tasas de casi 100 %.** Usa el mismo cálculo incorrecto que
  Caserits & Progress. Además, solo muestra los meses abril–junio y dice que las notas se guardan
  "localmente". Detalle en §2.6.
- **BUG-04: tres escalas de rendimiento distintas.** Caserits & Progress y el Progress Report usan
  una escala 90/75 (`Excellent Performance`, `Good Standing`, `Needs Support`) que contradice el
  Hive Status del Bee-havior Hub.
- **BUG-05: "Multi-activity" cuenta ausencias en el Overlap Cross-Referencer.** Un colega aparece
  en una actividad a la que solo faltó.
- **BUG-06: un colega sin datos aparece como `Dormant`.** Sin eventos contra los que calcular, se le
  asigna el tier más bajo en lugar de indicar que no hay datos.
- **BUG-07: el KPI `Avg. Attendance` del Dashboard da casi 100 %.** Usa `presentes ÷ registros`, el
  mismo cálculo incorrecto de BUG-03.

> BUG-04 a BUG-07 vienen de la auditoría UX/UI del 2026-10-07 (hallazgos D1, D3, D6 y D2).

> Este PRD puede sumar más bugs encontrados durante la versión. Se agregarán en §2.6 a medida que
> se reporten.

### 1.4. Cambios respecto al PRD 3.0

- **Fecha de ingreso (`joinedDate`):** la decisión D-2 del PRD 3.0 (los eventos anteriores al
  `joinedDate` no cuentan) se reemplazó con US-31. Hoy, el denominador de una actividad es **el total
  de eventos de esa actividad, igual para todos los colegas inscritos**. Esta regla es la base de
  todos los porcentajes de este documento.
- **Carga múltiple (US-27):** se elimina la regla "100 % de los archivos de un lote pertenecen a la
  misma actividad". Como cada archivo declara su actividad, un lote puede mezclar actividades, y el
  máximo sube de **20 a 50** archivos `.csv` por lote (§2.3).

### 1.5. Definiciones comunes

- **Evento:** cada combinación única de **actividad + fecha** con al menos un registro en la base,
  sin importar su origen (`.csv`, otro archivo o **Manual Check-In**). Igual que en el PRD 3.0.
- **Inscripción:** un colega está inscrito en una actividad si tiene al menos un registro `present`
  en ella (PRD 3.0, D-1).
- **Tasa de asistencia de un colega en una actividad** = `eventos de la actividad a los que asistió
  (present) ÷ total de eventos de la actividad` (US-31).
- **Tasa de asistencia general (Overall) de un colega** = `total de asistencias en sus actividades
  inscritas ÷ suma del total de eventos de esas actividades` (US-31).

---

## 2. Requisitos Funcionales y Especificación de Módulos

### 2.1. Dashboard: filtro por periodo de tiempo

- En la parte superior de la pestaña **Dashboard** se agrega un **selector de periodo** con dos
  opciones:
  - **All time** (todos los registros; es el valor por defecto y equivale al comportamiento actual).
  - **Custom range**: fecha de inicio y fecha de fin elegidas por el usuario, ambas incluidas.
- Con un periodo elegido, **solo cuentan los eventos con fecha dentro del periodo**. Esto afecta:
  - los KPIs de la parte superior del Dashboard;
  - el **Caserits Bee-havior Hub**: porcentajes por actividad, **Overall**, **Hive Status** y
    **Multi-Activity?** se calculan solo con los eventos del periodo;
  - las tarjetas del **Activities Matrix Profile** (eventos, promedio de asistentes, tasa);
  - los paneles desplegables de §2.2.
- La **inscripción no depende del periodo**: un colega inscrito en una actividad (al menos un
  `present` en cualquier fecha) que no asistió a ningún evento del periodo muestra `0%` en esa
  actividad, y esos eventos cuentan en su **Overall** (D-1).
- Si una actividad **no tuvo eventos** dentro del periodo, su celda muestra `—` para todos y no
  entra en el **Overall**, porque no hay eventos contra los cuales calcular.
- Un colega no inscrito en una actividad sigue mostrando `—` en ella.
- El Dashboard muestra siempre qué periodo está activo (ej. `Showing: Apr 1 – Jun 30, 2026`).
- Si el periodo no tiene eventos, cada sección muestra un estado vacío (`No events in this period`)
  en lugar de ceros o porcentajes engañosos.
- En **Custom range**, una fecha de inicio posterior a la de fin no se acepta y se muestra un aviso.
- El periodo elegido **no modifica datos**: es solo una vista. Se mantiene mientras el usuario
  navega por las demás pestañas, y vuelve a **All time** al recargar la app.

### 2.2. Dashboard: paneles desplegables de métricas

Los cuadros **Attendance Trends** y **Cross-Activity Comparisons** se reemplazan por **paneles
desplegables** (acordeón): cada uno muestra su título y un resumen de una línea, y se abre o se
cierra con un clic. Todos respetan el periodo de §2.1.

**Problemas actuales que se corrigen:**
- **Attendance Trends** solo muestra abril, mayo y junio de 2026 (`Q2 Year 2026` fijo).
- Ambos cuadros calculan la tasa como `presentes ÷ registros`, lo que da casi siempre `100%`,
  porque los `.csv` solo traen asistentes.

**Paneles** (alcance cerrado para esta versión, D-2):

1. **Attendance Trends:** evolución dentro del periodo, agrupada por semana o por mes. Para cada
   intervalo muestra:
   - cantidad de eventos realizados;
   - promedio de asistentes por evento;
   - tasa de asistencia basada en eventos.
2. **Cross-Activity Comparisons:** tabla y gráfico comparando las 4 actividades en el periodo:
   - eventos realizados;
   - promedio de asistentes por evento;
   - Caserits únicos que asistieron;
   - tasa de asistencia promedio de los inscritos.
3. **Engagement:** cuántos colegas hay en cada Hive Status (`Dormant`, `Hatcher`, `Forager`,
   `Busy Bee`) en el periodo, y cuántos colegas **nuevos** (primera asistencia dentro del periodo)
   tuvo cada actividad.

- Por defecto, solo el primer panel aparece abierto. El estado abierto/cerrado de cada panel se
  mantiene mientras se cambia de periodo.

### 2.3. Smart Doc Parser: actividad detectada automáticamente

- Se eliminan las pestañas **Select Activity Import Log** de **Import Forage Logs** y el texto
  `Currently displaying the ... Import Log`. Hay una única zona de carga.
- Para cada `.csv`, la actividad se detecta en este orden (D-6):
  1. el **nombre del archivo** (ej. `Reading Club - Attendance report 6-24-26.csv`);
  2. si el nombre no declara ninguna actividad, el **título de la reunión** dentro del archivo
     (fila `Meeting title` / `Título de la reunión` de los exportes de Teams).
- Para los demás formatos (`.xlsx`, `.xls`, `.docx`, `.doc`, `.txt`), la actividad sale **solo del
  nombre del archivo** (D-5).
- El nombre o el título declaran una actividad solo si **nombran literalmente** una de las 4
  actividades, sin distinguir mayúsculas ni acentos: `Speakeasy`, `Reading Club`, `Music Room`,
  `Writing Hood`. Se mantiene el criterio de US-27 para no confundir palabras sueltas (ej. "email",
  "book").
- Si el nombre (o el título, cuando corresponde) nombra **más de una** actividad, o **ninguna**, el
  archivo queda marcado como `Activity Not Detected` en la vista previa.
- Un archivo `Activity Not Detected` muestra en la vista previa un **selector de actividad** con las
  4 actividades, para elegirla a mano (D-4). La actividad elegida se aplica a todos los registros de
  ese archivo.
- La vista previa **Review Extracted Records** muestra, para cada archivo, la actividad y de dónde
  salió (`from file name`, `from meeting title` o `selected manually`). Una actividad detectada
  también puede cambiarse con el mismo selector.
- La columna `Activity` / `Actividad` de un `.csv`, si existe, sigue teniendo prioridad sobre el
  nombre y el título para esas filas.
- **Lotes mixtos (D-3):** un lote puede **mezclar actividades**. Cada archivo se registra en su
  actividad. Se elimina el rechazo del lote por actividades distintas de US-27.
- **Máximo de 50 archivos por lote (D-9):** el límite de la carga múltiple de `.csv` sube de 20 a
  **50 archivos**, porque un mismo lote ahora puede traer las sesiones de las 4 actividades.
  - Con **51 o más**, se rechaza la selección completa con un mensaje que indica el máximo de 50.
  - El límite se aplica en la interfaz y en el servidor (`POST /api/parse-attendance-batch`).
  - Se mantiene el límite de **10 MB por archivo**, y se agrega un **tope de 50 MB para el lote
    completo** (D-10), porque el servidor guarda los archivos en memoria mientras los procesa.
  - El texto de ayuda de la zona de carga se actualiza: deja de decir "of the same activity" e
    indica el nuevo máximo (ej. `Select up to 50 .csv files at once, from any activity.`).
  - La vista previa agrupada por archivo debe poder recorrerse con 50 archivos (ej. grupos que se
    pueden colapsar), sin que la página se vuelva lenta.
- Los demás formatos (`.xlsx`, `.xls`, `.docx`, `.doc`, `.txt`) siguen subiéndose de a uno.
- **Confirm & Import Caserits** no se habilita mientras quede algún archivo sin actividad.
- Se mantienen sin cambios: el filtro de menos de 10 minutos (US-25), la blacklist (US-19 / US-30),
  la detección de duplicados (US-26 / US-33), la fecha obligatoria (US-18) y la confirmación
  atómica (US-27).

### 2.4. Caserits & Progress: attendance rate real

**Comportamiento actual (incorrecto).** El **Attendance Rate** de cada colega se calcula como
`presentes ÷ registros propios del colega`. Como los `.csv` solo traen asistentes, casi todos
muestran `100%`.

**Comportamiento esperado.**

- El **Attendance Rate** de cada colega es su **Overall** (§1.5): `total de asistencias en sus
  actividades inscritas ÷ suma del total de eventos de esas actividades`.
- Es el **mismo valor** que muestra la columna **Overall** del **Caserits Bee-havior Hub** con el
  periodo **All time**. Ambas vistas usan el mismo cálculo (`src/beehavior.ts`), para que nunca se
  contradigan.
- Un tooltip muestra la fracción, ej. `Attended 5 of 12 events`.
- Si el colega no tiene ninguna asistencia `present`, muestra `—`.
- La vista **Caserits & Progress** no tiene selector de periodo: siempre usa todos los eventos.
- El valor se actualiza de inmediato tras una importación, un check-in manual o la eliminación de un
  colega.

### 2.5. Outcome Report: colegas más activos y Hive Status

Un reporte descargable con los resultados de asistencia, para compartir o archivar.

**Dónde y cómo se genera**

- En la pestaña **Dashboard** se agrega el botón **Generate Outcome Report**, que abre un panel de
  configuración.
- El reporte usa un **periodo**, con las mismas opciones del selector de §2.1:
  - **All time**: todos los datos ingresados.
  - **Custom range**: fecha de inicio y de fin, ambas incluidas (ej. del 2026-10-06 al 2026-11-20).
  Por defecto toma el periodo activo del Dashboard, pero se puede cambiar en el panel.
- El reporte se arma con uno o más de estos bloques. Se puede marcar cualquier combinación:
  1. **Top por actividad:** un número **N distinto para cada actividad**. Ej.: Speakeasy `5`,
     Reading Club `2`, Music Room `3`, Writing Hood `0`. Con `0` (o vacío), esa actividad no aparece.
  2. **Top general:** un único número **N** sobre el **Overall** de cada colega, sin separar por
     actividad (ej. los 10 colegas más activos de todas las actividades).
  3. **Hive Status:** uno o más tiers (`Busy Bee`, `Forager`, `Hatcher`, `Dormant`). Lista a
     **todos** los colegas que tienen ese Hive Status en el periodo.
- Al confirmar con **Download Report**, la app descarga un archivo `.txt` (D-7).
- El reporte es de solo lectura: no modifica datos ni necesita rutas nuevas en el servidor. Se
  arma con los mismos datos y cálculos del Dashboard (`src/beehavior.ts`).

**Cómo se calcula**

- Todos los porcentajes siguen las reglas de §1.5 y §2.1: solo cuentan los eventos del periodo, y
  la tasa de cada colega en una actividad es `eventos asistidos ÷ total de eventos de la actividad
  en el periodo`.
- **Top por actividad:** se ordena a los colegas inscritos en la actividad de mayor a menor tasa en
  esa actividad.
- **Top general:** se ordena a todos los colegas de mayor a menor **Overall** en el periodo.
- **Desempates:** primero el que asistió a **más eventos**, y después por orden alfabético.
- En los rankings (top por actividad y top general) **solo aparecen colegas con al menos una
  asistencia en el periodo** (D-8). Si hay menos colegas que el N pedido, se listan los que haya y
  el reporte lo indica (ej. `Only 3 colleagues attended Reading Club in this period`).
- **Hive Status:** se usa el tier calculado con el **Overall** del periodo, igual que en el
  Bee-havior Hub. Como la inscripción no depende del periodo (D-1), un colega inscrito que no
  asistió a nada en el periodo aparece como `Dormant` (0%). Un colega `No data` (BUG-06) no aparece
  en ningún tier.
- Una actividad sin eventos en el periodo aparece en el reporte con el aviso
  `No events in this period`.
- La blacklist y el filtro de menos de 10 minutos ya se aplicaron al importar, así que esas personas
  nunca aparecen en el reporte.

**Contenido del archivo**

- **Encabezado:**
  - título `The Honeycomb — Outcome Report`;
  - periodo (`All time` o `Oct 6 – Nov 20, 2026`);
  - fecha y hora de generación;
  - criterios elegidos (los N por actividad, el N general y los tiers).
- **Una sección por bloque elegido.** Cada fila muestra:
  - posición (solo en los rankings);
  - **nombre**;
  - **actividad** (en el top general y en Hive Status, la columna dice `All activities`);
  - **porcentaje de asistencia** con su fracción, ej. `80% (4 of 5 events)`.
- Dentro de cada sección de Hive Status, los colegas se ordenan de mayor a menor porcentaje.
- Columnas alineadas con espacios para que el archivo se lea bien en cualquier editor de texto.
- Nombre del archivo: `honeycomb-outcome-report_<inicio>_<fin>.txt` (ej.
  `honeycomb-outcome-report_2026-10-06_2026-11-20.txt`), o `honeycomb-outcome-report_all-time.txt`.

**Ejemplo de salida**

```text
The Honeycomb — Outcome Report
Period: Oct 6 – Nov 20, 2026
Generated: 2026-11-21 09:30
Criteria: Top by activity (Speakeasy 5, Reading Club 2) · Hive Status: Busy Bee

TOP BY ACTIVITY — Speakeasy (7 events)
  #  Name                 Activity     Attendance
  1  Ana Lopez            Speakeasy    100% (7 of 7 events)
  2  Carlos Vega          Speakeasy     86% (6 of 7 events)
  ...

HIVE STATUS — Busy Bee (76–100%)
  Name                 Activity         Attendance
  Ana Lopez            All activities   92% (11 of 12 events)
  ...
```

**Validaciones del panel**

- **Download Report** no se habilita si no se eligió ningún bloque, o si el top por actividad y el
  top general tienen todos sus N en `0`.
- Los N aceptan enteros de `0` a `50`.
- En **Custom range**, una fecha de inicio posterior a la de fin no se acepta (igual que en §2.1).

### 2.6. 🐞 Bugs

> Sección abierta: se agregarán los bugs que se encuentren durante la versión 4.0.

#### 🐞 BUG-03: el Progress Report muestra tasas de casi 100 %

**Comportamiento actual (incorrecto).** El modal **Progress Report** de cada colega calcula sus
tasas como `presentes ÷ registros propios del colega`. Como los `.csv` solo traen asistentes, casi
siempre muestra `100%`. Afecta a:

- **Overall Engagement**, la tasa general del colega;
- el desglose por actividad (una tasa por cada una de las 4 actividades).

**Comportamiento esperado.**

- **Overall Engagement** (que pasa a llamarse **Attendance Rate**, §2.9) muestra el **Overall** del
  colega (§1.5), el mismo valor que su **Overall** en el Bee-havior Hub con **All time** y su
  **Attendance Rate** en **Caserits & Progress**.
- El desglose por actividad muestra la tasa basada en eventos (§1.5): `eventos asistidos ÷ total de
  eventos de la actividad`, con la fracción como ayuda (ej. `Attended 3 of 8 events`).
- En una actividad no inscrita, el desglose muestra `—`.
- El cálculo se reutiliza de `src/beehavior.ts`, igual que en §2.4.

**También en el Progress Report** (detectado en la auditoría UX/UI):

- La evolución mensual está fija en abril, mayo y junio (`["04","05","06"]`), así que descarta los
  registros de otros meses. Debe mostrar **los meses que tengan registros**, igual que
  **Attendance Trends** en §2.2.
- El texto `Notes are saved locally on this device.` es incorrecto, porque las notas se guardan en el
  servidor. Pasa a decir `Notes are saved to The Honeycomb server.`

#### 🐞 BUG-04: tres escalas de rendimiento distintas

**Comportamiento actual (incorrecto).** El Bee-havior Hub clasifica a cada colega por **Hive Status**
(0–25 / 26–50 / 51–75 / 76–100). Caserits & Progress (color del porcentaje) y el Progress Report
(etiqueta y color) usan otra escala: `≥ 90` `Excellent Performance`, `≥ 75` `Good Standing` y el
resto `Needs Support`, más `Unlogged` sin registros. Un colega con 70 % es `Needs Support` en el
modal y `Forager` en el Hub.

**Comportamiento esperado.**

- Hay **una sola escala**: Hive Status (`Dormant`, `Hatcher`, `Forager`, `Busy Bee`), con la misma
  función `getHiveTier` de `src/beehavior.ts`.
- **Caserits & Progress** y el **Progress Report** muestran el Hive Status del colega (con su Overall
  de **All time**), con la **misma etiqueta y los mismos colores** que el Bee-havior Hub.
- Se eliminan `Excellent Performance`, `Good Standing`, `Needs Support` y sus descripciones.
- Un colega sin datos sigue la regla de BUG-06.

#### 🐞 BUG-05: "Multi-activity" cuenta ausencias en el Overlap Cross-Referencer

**Comportamiento actual (incorrecto).** El Overlap Cross-Referencer considera que un colega
participa en una actividad si tiene **cualquier** registro en ella, incluso `absent`. El Dashboard y
`src/beehavior.ts` solo cuentan registros `present`. Las dos vistas pueden mostrar cantidades
distintas de colegas multi-actividad, y el Cross-Referencer puede marcar una actividad a la que el
colega solo faltó.

**Comportamiento esperado.**

- "Participar en una actividad" significa **estar inscrito** (al menos un `present`, §1.5), en todas
  las vistas.
- El filtro (`Single`, `Multi-Activity`, `Super Active`), los contadores, la matriz y la comparación
  entre dos actividades del Cross-Referencer usan **el mismo cálculo** que el Bee-havior Hub, desde
  `src/beehavior.ts`.

#### 🐞 BUG-06: un colega sin datos aparece como `Dormant`

**Comportamiento actual (incorrecto).** Cuando un colega no tiene eventos contra los que calcular
(Overall vacío), `src/beehavior.ts` le asigna el tier de `0 %` (`getHiveTier(overallRate ?? 0)`):
aparece como `Dormant`.

**Comportamiento esperado.**

- Sin Overall calculable, el Hive Status muestra `No data` (en gris, sin color de tier) y el
  porcentaje muestra `—`.
- Se distinguen dos casos:
  - **inscrito que no asistió a ningún evento del periodo** (las actividades sí tuvieron eventos):
    `0 %` y `Dormant` (D-1);
  - **sin eventos contra los que calcular** (no inscrito en nada, o sus actividades no tuvieron
    eventos en el periodo): `No data`.
- En el Outcome Report, los colegas `No data` no aparecen en ningún bloque (§2.5).

#### 🐞 BUG-07: el KPI `Avg. Attendance` del Dashboard da casi 100 %

**Comportamiento actual (incorrecto).** El KPI se calcula como `presentes ÷ registros`. Como los
`.csv` solo traen asistentes, da casi siempre `100%`. El subtítulo muestra `Based on N records`.

**Comportamiento esperado.**

- El KPI pasa a llamarse `Avg. Attendance Rate` (§2.9) y muestra el **promedio del Overall** de los
  colegas que tienen Overall en el periodo (se excluyen los `No data`).
- El subtítulo indica la base del cálculo, ej. `Average of 24 colleagues`.
- Respeta el periodo de §2.1 y coincide con el promedio de la columna **Overall** del Bee-havior Hub.

### 2.7. Restricciones técnicas (se mantienen de versiones anteriores)

- El parser sigue siendo **determinista y offline**.
- Toda ruta nueva que modifique datos usa `requireAdmin` y `validateBody`. El filtro por periodo y
  los paneles son de solo lectura y no necesitan rutas nuevas.
- La fecha de referencia del sistema sigue fija en el **24 de junio de 2026**.

### 2.8. Requisitos de interfaz para los componentes nuevos

La auditoría UX/UI encontró fallas de accesibilidad y consistencia en toda la app. Su corrección
general queda para la versión 4.1 (§4). En esta versión, **todo componente nuevo o reescrito** debe
cumplir lo siguiente, para no sumar deuda:

- **Selector de periodo (§2.1):** cada fecha tiene un `label` asociado (`htmlFor`/`id`), y el aviso
  de rango inválido usa `role="alert"` y queda ligado al campo con `aria-describedby`.
- **Paneles desplegables (§2.2):** el encabezado de cada panel es un `<button>` con `aria-expanded`
  y `aria-controls`, y funciona con teclado (Enter / Espacio).
- **Gráficos de los paneles (§2.2):**
  - el eje de porcentajes va de `0` a `100` con `%`;
  - un intervalo sin eventos se muestra como sin datos, no como `0 %`;
  - la leyenda refleja las series reales;
  - cada gráfico tiene `role="img"` y un `aria-label` que resume el dato.
- **Panel del Outcome Report (§2.5):**
  - es un diálogo real: `role="dialog"`, `aria-modal` y `aria-labelledby`;
  - el foco entra al abrir y vuelve al botón al cerrar;
  - Escape y el botón de cierre lo cierran;
  - la página de fondo no hace scroll mientras está abierto.
- **Selector de actividad del importador (§2.3):** tiene `label` visible o `aria-label` que nombra
  el archivo.
- **Lote de hasta 50 archivos (§2.3):** cada grupo colapsable usa el mismo patrón que los paneles
  (`aria-expanded`). El resultado de la carga se anuncia en una región `aria-live`.
- **Para todo lo nuevo:**
  - texto con información de **12 px como mínimo**;
  - contraste de texto **≥ 4.5:1** (y ≥ 3:1 para bordes de controles), así que no se usan sage ni
    sand como color de texto sobre fondos claros;
  - botones solo-ícono con `aria-label`;
  - foco visible por teclado;
  - los badges de Hive Status usan el `textColor` de `src/beehavior.ts`, no `color`.

### 2.9. Textos y terminología

Los textos de la interfaz se unifican con un glosario. Todos los textos nuevos de esta versión lo
siguen. El alcance es **corregir errores de redacción** y **usar un solo término por concepto**.
**No se renombran** las pestañas ni el vocabulario propio de la marca (`Import Forage Logs`,
`Caserits & Progress`, `Overlap Cross-Referencer`, `Extract the Buzz`, `Hive Status` y sus tiers,
`Confirm & Import Caserits`) (D-15).

**Glosario**

| Concepto | Término | Regla |
|---|---|---|
| Persona | **Caserits** / **colleague(s)** | `Caserits` en títulos, pestañas y nombres de sección (marca); `colleague` / `colleagues` en frases y botones. No se usan `attendees` ni `participants` en la interfaz (D-14). |
| Crear un colega | **Add** | `Add Colleague`; `Add & Check In` se mantiene (agrega y registra en un paso). |
| Cerrar un formulario sin guardar | **Cancel** | — |
| Quitar una fila de la vista previa (aún no guardada) | **Remove** | — |
| Descartar toda la vista previa del importador | **Discard** | Pide confirmación si hay filas revisadas. |
| Borrar algo guardado (irreversible) | **Delete** | Siempre con confirmación que nombra al colega y avisa que también se borran sus registros y notas. |
| Tasa de un colega | **Attendance Rate** | Es su Overall (§1.5). |
| Registros | **attendance records** | En lugar de `logs` / `entries`. `present` / `absent` como estados. |
| Sesión de una actividad | **event** | Las fracciones dicen `X of Y events`, nunca `days`. |
| 2 o más actividades | **Multi-Activity** | 3 o más: **Super Active**. |
| Importador | **Smart Doc Parser** | Un solo nombre para el título y la tarjeta del Dashboard. |

**Mayúsculas y puntuación**

- **Title Case** en pestañas, títulos, botones, labels de campo y badges. **Sentence case** en
  mensajes, ayudas, tooltips, placeholders y estados vacíos (D-16).
- Elipsis con `…` (un carácter), no `...`.
- Rangos con guion largo y sin repetir `%`: `Hatcher (26–50%)`.
- Sin `!` en mensajes de éxito.
- Plurales correctos según la cantidad (`1 colleague` / `2 colleagues`), con un helper único.
- Fechas en pantalla con el formato `Jun 24, 2026` (un solo formateador). La fecha del header sale de
  `REFERENCE_DATE`, no de un texto fijo. En archivos generados y nombres de archivo se usa ISO
  (`2026-06-24`).
- Errores con **qué pasó + qué hacer**. No se muestran mensajes técnicos crudos (stack, código HTTP,
  JSON). Los mensajes del servidor ya escritos para el usuario (ej. archivo ya importado, US-26 /
  US-33) se mantienen.

**Cambios de texto**

| Pantalla | Texto actual | Texto nuevo |
|---|---|---|
| Manual Check-In | `Quick Add Colleague` | `Add Colleague` |
| Manual Check-In | `Quick Register New Colleague` (título del formulario) | `Add Colleague` |
| Manual Check-In | `Register Colleague` (botón del formulario) | `Add Colleague` |
| Manual Check-In | `Register First Colleague` | `Add First Colleague` |
| Manual Check-In | `Registered and checked in …` | `Added and checked in …` |
| Manual Check-In | `Introduce new name (e.g. …)...` | `Enter the colleague's full name…` |
| Caserits & Progress | `Register New Colleague` | `Add Colleague` |
| Caserits & Progress | `Add Colleague to Directory` (título del formulario) | `Add Colleague` |
| Caserits & Progress | `Register Colleague` (botón del formulario) | `Add Colleague` |
| Caserits & Progress | `Remove Colleague` (tooltip de la papelera) | `Delete Colleague` |
| Caserits & Progress | `(x/y days)` | `(x of y events)` |
| Caserits & Progress | `No Logs` | `No attendance yet` |
| Caserits & Progress | `Search colleagues by name or email...` | `Search colleagues by name or email…` |
| Dashboard | `Avg. Attendance` · `Based on N records` | `Avg. Attendance Rate` · `Average of N colleagues` (BUG-07) |
| Dashboard | `Inter-Activity Hub` | `Multi-Activity Caserits` |
| Dashboard | `Multi-Activity?` (columna del Hub) | `Multi-Activity` |
| Dashboard | `Dormant (0% - 25%)` y demás tiers | `Dormant (0–25%)`, `Hatcher (26–50%)`, `Forager (51–75%)`, `Busy Bee (76–100%)` |
| Dashboard | `No Caserits found matching your search query.` (también con 0 colegas) | Con búsqueda: `No colleagues match your search.` · Sin colegas: `No colleagues yet.` |
| Overlap Cross-Referencer | `Multi-Activity Overlap` | `Multi-Activity` |
| Overlap Cross-Referencer | `Super Active Overlap` | `Super Active` |
| Overlap Cross-Referencer | `Overlap (2+)` (filtro) | `Multi-Activity (2+)` |
| Overlap Cross-Referencer | `Interactive Overlap Cross-Referencer` (título) | `Compare Two Activities` |
| Overlap Cross-Referencer | `No colleagues have registered attendance in both activities yet.` | `No colleagues attended both activities yet.` |
| Import Forage Logs | `Smart Document Parser` (título) | `Smart Doc Parser` |
| Import Forage Logs | `Analyzing document semantics and isolating attendance logs...` | `Detecting attendance rows…` |
| Import Forage Logs | `Compiling File Data...` | `Reading File…` |
| Import Forage Logs | `N attendees` · `N attendees excluded (less than 10 minutes)` | `N colleague(s)` · `N colleague(s) excluded (under 10 minutes)` |
| Import Forage Logs | `New Colleague (Registered)` | `New Colleague` (se registra al confirmar) |
| Import Forage Logs | `Existing Colleague Linked` (texto plano) | badge `Existing Colleague`, con el mismo estilo que `New Colleague` |
| Import Forage Logs | `Needs review` · `Not a duplicate` · `Hide excluded` | `Needs Review` · `Not a Duplicate` · `Hide Excluded` |
| Import Forage Logs | `Remove item` | `Remove Row` |
| Import Forage Logs | `Import Successful!` · `Successfully registered N new attendance logs and registered any new colleagues.` | `Import Complete` · `Imported N new attendance records.` (+ `Added N new colleagues.` si corresponde) |
| Progress Report | `Overall Engagement` · `Present Rate` | `Attendance Rate` (sin etiqueta secundaria) |
| Progress Report | `Presents` · `Absents` | `Present` · `Absent` |
| Progress Report | `Unlogged` · `No attendance recorded yet.` · `No attendance records logged yet` · `No attendance logged yet.` | `No attendance yet` |
| Progress Report | `Notes are saved locally on this device.` | `Notes are saved to The Honeycomb server.` (BUG-03) |
| General | `Loading The Honeycomb...` | `Loading The Honeycomb…` |

> **Textos nuevos de esta versión.** Siguen el glosario: el badge del importador es
> `Activity Not Detected` (Title Case por ser badge), y las etiquetas de origen (`from file name`,
> `from meeting title`, `selected manually`) y los estados vacíos (`No events in this period`) van en
> sentence case.

> **Guía de uso (`.docx`).** Cita los textos de la interfaz de forma literal. Al cerrar esta versión
> se actualiza con los textos nuevos de esta tabla y de las secciones §2.1–§2.5.

---

## 3. Matriz de Criterios de Aceptación (QA & Testing)

| ID | Módulo / Componente | Escenario de Prueba | Resultado Esperado |
|---|---|---|---|
| **TC-25** | Filtro por periodo | Se abre el selector de periodo. | Solo ofrece **All time** (por defecto) y **Custom range**. |
| **TC-26** | Filtro por periodo | Speakeasy tuvo 4 eventos en mayo y 4 en junio; un colega asistió a los 4 de junio. Se elige **Custom range** del 2026-06-01 al 2026-06-30. | Se muestra `Showing: Jun 1 – Jun 30, 2026` y su celda de Speakeasy muestra `100%` (4/4); con **All time** muestra `50%` (4/8). |
| **TC-27** | Filtro por periodo | Un colega inscrito en Reading Club no asistió a ninguno de los 2 eventos de Reading Club del rango elegido. | Su celda de Reading Club muestra `0%` (0/2) y esos eventos cuentan en su **Overall**. |
| **TC-28** | Filtro por periodo | Writing Hood no tuvo eventos en el rango elegido. | Su columna muestra `—` para todos y no entra en el **Overall**. |
| **TC-29** | Filtro por periodo | Se elige un **Custom range** sin eventos. | Todas las secciones muestran `No events in this period`. |
| **TC-30** | Filtro por periodo | En **Custom range**, la fecha de inicio es posterior a la de fin. | No se aplica el rango y se muestra un aviso. |
| **TC-31** | Filtro por periodo | Se cambia de periodo y se navega a otra pestaña y de vuelta. | El periodo se mantiene; al recargar la app vuelve a **All time**. |
| **TC-32** | Paneles desplegables | Se abre el Dashboard. | **Attendance Trends** aparece abierto y los demás paneles cerrados; cada uno se abre o se cierra con un clic. |
| **TC-33** | Paneles desplegables | Hay registros de enero a junio de 2026 y se elige **All time**. | **Attendance Trends** muestra los 6 meses, no solo abril a junio. |
| **TC-34** | Paneles desplegables | Una actividad tuvo 4 eventos con 6, 8, 7 y 9 asistentes en el periodo. | **Cross-Activity Comparisons** muestra 4 eventos y promedio `7.5` para esa actividad. |
| **TC-35** | Doc Parser | Se abre **Import Forage Logs**. | No aparecen las pestañas **Select Activity Import Log**. |
| **TC-36** | Doc Parser | `.csv` llamado `Music Room - Attendance report 6-24-26.csv` con `Meeting title: Reading Club`. | Se registra en Music Room (prioriza el nombre), con la etiqueta `from file name`. |
| **TC-37** | Doc Parser | `.csv` llamado `attendance-6-24.csv` con `Meeting title: Reading Club – Session 12`. | Se registra en Reading Club, con la etiqueta `from meeting title`. |
| **TC-38** | Doc Parser | `.csv` cuyo nombre y título no nombran ninguna actividad (ej. `Weekly sync.csv`). | Se marca `Activity Not Detected`, aparece el selector de actividad y **Confirm & Import Caserits** queda deshabilitado hasta elegir una. |
| **TC-39** | Doc Parser | Se elige **Writing Hood** en el selector de un archivo `Activity Not Detected` y se confirma. | Todos sus registros se guardan en Writing Hood, con la etiqueta `selected manually`. |
| **TC-40** | Doc Parser | `.docx` llamado `Speakeasy 2026-06-24.docx`. | Se registra en Speakeasy. Un `.xlsx` sin actividad en el nombre se marca `Activity Not Detected`, aunque su contenido mencione una. |
| **TC-41** | Doc Parser | Lote de 5 `.csv`: 3 de Speakeasy y 2 de Music Room. | El lote no se rechaza; cada archivo se registra en su actividad. |
| **TC-42** | Doc Parser | Archivo cuyo nombre nombra dos actividades. | Se marca `Activity Not Detected`. |
| **TC-43** | Doc Parser | Lote de 50 `.csv` de las 4 actividades. | Se aceptan los 50; la vista previa los agrupa por archivo y cada uno se registra en su actividad al confirmar. |
| **TC-44** | Doc Parser | Se seleccionan 51 `.csv`. | Se rechaza la selección completa con el mensaje del máximo de 50. |
| **TC-45** | Doc Parser | Se envían 51 `.csv` directo a `POST /api/parse-attendance-batch`, sin usar la interfaz. | El servidor rechaza el lote. |
| **TC-46** | Doc Parser | Lote de `.csv` que en total supera los 50 MB. | Se rechaza el lote con un mensaje que indica el tope de 50 MB. |
| **TC-47** | Doc Parser | Se abre **Import Forage Logs**. | El texto de ayuda indica `up to 50 .csv files` y ya no dice "of the same activity". |
| **TC-48** | Caserits & Progress | Colega con 1/8 en Speakeasy y 2/4 en Writing Hood. | **Attendance Rate** muestra `25%` (3/12), igual que su **Overall** en el Bee-havior Hub. |
| **TC-49** | Caserits & Progress | Directorio con colegas de distintas tasas. | Ya no aparece `100%` en todos los casos; cada uno coincide con su **Overall**. |
| **TC-50** | Caserits & Progress | Se importa un evento nuevo de Speakeasy en el que no figura un colega inscrito. | Su **Attendance Rate** baja de inmediato. |
| **TC-51** | Outcome Report | Con **Custom range** del 2026-10-06 al 2026-11-20, se pide top Speakeasy `5` y Reading Club `2`. | El `.txt` muestra 5 colegas en Speakeasy y 2 en Reading Club, ordenados de mayor a menor %, con nombre, actividad y `X% (n of m events)`; las otras actividades no aparecen. |
| **TC-52** | Outcome Report | Se pide top general `10` con **All time**. | Se listan los 10 colegas con mayor **Overall**, con la actividad `All activities`. |
| **TC-53** | Outcome Report | Dos colegas empatan en 80%: uno con 4 de 5 eventos y otro con 8 de 10. | Primero aparece el de 8 de 10 (más eventos asistidos). Si también empatan en eventos, van en orden alfabético. |
| **TC-54** | Outcome Report | Se pide top Reading Club `5`, pero solo 3 colegas asistieron en el periodo. | Se listan los 3 y aparece `Only 3 colleagues attended Reading Club in this period`. Nadie con 0% aparece en el ranking. |
| **TC-55** | Outcome Report | Se marca Hive Status `Busy Bee` con **All time**. | Se lista a todos los colegas con Overall de 76–100%, y nadie más. |
| **TC-56** | Outcome Report | Se marca `Dormant` en un periodo en el que un colega inscrito no asistió a nada. | Ese colega aparece como `Dormant` con `0% (0 of n events)`. |
| **TC-57** | Outcome Report | Se pide top Writing Hood `3` en un periodo sin eventos de Writing Hood. | La sección de Writing Hood muestra `No events in this period`. |
| **TC-58** | Outcome Report | Se abre el panel sin elegir ningún bloque. | **Download Report** queda deshabilitado. |
| **TC-59** | Outcome Report | Se descarga el reporte de un **Custom range** y el de **All time**. | Los archivos se llaman `honeycomb-outcome-report_2026-10-06_2026-11-20.txt` y `honeycomb-outcome-report_all-time.txt`, y el encabezado muestra periodo, fecha de generación y criterios. |
| **TC-60** | Outcome Report | Los porcentajes del reporte se comparan con el Bee-havior Hub, con el mismo periodo. | Coinciden. |
| **TC-61** 🐞 | Progress Report (BUG-03) | Se abre el **Progress Report** de un colega con 1/8 en Speakeasy y 2/4 en Writing Hood. | El KPI (antes **Overall Engagement**, ahora **Attendance Rate**) muestra `25%`, igual que su **Attendance Rate** en Caserits & Progress. |
| **TC-62** 🐞 | Progress Report (BUG-03) | Mismo colega, desglose por actividad. | Speakeasy muestra `13%` (`Attended 1 of 8 events`), Writing Hood `50%`, y Reading Club y Music Room `—`. |
| **TC-63** 🐞 | Progress Report (BUG-03) | Un colega tiene registros de enero a junio de 2026. | La evolución mensual muestra los 6 meses, no solo abril a junio. |
| **TC-64** 🐞 | Progress Report (BUG-03) | Se abre el Progress Report con sesión de admin. | El texto de las notas dice `Notes are saved to The Honeycomb server.` |
| **TC-65** 🐞 | Escala única (BUG-04) | Un colega tiene 70 % de Overall. | Caserits & Progress, Progress Report y Bee-havior Hub muestran `Forager`, con la misma etiqueta y los mismos colores. No aparece `Needs Support` en ninguna vista. |
| **TC-66** 🐞 | Escala única (BUG-04) | Se buscan en la app los textos `Excellent Performance`, `Good Standing` y `Needs Support`. | No aparecen. |
| **TC-67** 🐞 | Multi-activity (BUG-05) | Un colega tiene `present` en Speakeasy y solo `absent` en Music Room. | El Overlap Cross-Referencer lo cuenta como `Single`, no como `Multi-Activity`, y la matriz no marca Music Room. Los contadores coinciden con el Dashboard. |
| **TC-68** 🐞 | Sin datos (BUG-06) | Un colega registrado no tiene ningún `present`. | El Bee-havior Hub muestra `—` y `No data` (no `Dormant`), y no aparece en el Outcome Report. |
| **TC-69** 🐞 | Sin datos (BUG-06) | Un colega inscrito solo en Writing Hood; se elige un periodo sin eventos de Writing Hood. | Muestra `No data`. Si Writing Hood tuvo eventos en el periodo y no asistió, muestra `0%` y `Dormant`. |
| **TC-70** 🐞 | KPI (BUG-07) | Se abre el Dashboard con colegas de distintas tasas. | El KPI se llama `Avg. Attendance Rate`, no muestra `100%` por defecto y coincide con el promedio de la columna **Overall** del Hub para el mismo periodo. |
| **TC-71** | Interfaz nueva (§2.8) | Se recorre con Tab el selector de periodo, los paneles desplegables y el panel del Outcome Report. | Todo se alcanza y se opera con teclado, con foco visible. Los paneles exponen `aria-expanded`. |
| **TC-72** | Interfaz nueva (§2.8) | Se abre el panel del Outcome Report y se pulsa Escape. | El panel se cierra y el foco vuelve a **Generate Outcome Report**. Mientras está abierto, la página de fondo no hace scroll. |
| **TC-73** | Interfaz nueva (§2.8) | Se mide el texto de los componentes nuevos. | Ningún texto con información mide menos de 12 px, y el contraste del texto es ≥ 4.5:1. |
| **TC-74** | Textos (§2.9) | Se recorren las pantallas de la tabla de cambios de texto. | Cada texto actual de la tabla fue reemplazado por el nuevo, y los nombres de las pestañas no cambiaron. |
| **TC-75** | Textos (§2.9) | Se importa un `.csv` con un solo colega. | La vista previa dice `1 colleague`, no `1 attendees`. |
| **TC-76** | Textos (§2.9) | Se busca `...` (tres puntos) en los textos visibles de la interfaz. | No aparece; se usa `…`. |
| **TC-77** | Textos (§2.9) | Se intenta borrar a un colega desde Caserits & Progress. | La confirmación nombra al colega y avisa que también se borran sus registros de asistencia y sus notas. |

---

## 4. Fuera de Alcance (4.0)

- Periodos relativos predefinidos (este mes, mes pasado, trimestre); solo **All time** y **Custom
  range**.
- Paneles de métricas distintos de los tres de §2.2.
- Exportar las métricas del periodo (PDF, Excel).
- Guardar periodos personalizados o recordar el último periodo usado entre sesiones.
- Selector de periodo en **Caserits & Progress**, **Overlap Cross-Referencer** o **Progress Report**.
- Detectar la actividad por el contenido de archivos distintos de `.csv`.
- Comparar dos periodos lado a lado.
- Outcome Report en `.pdf`, `.csv` o Excel; enviarlo por correo o programarlo de forma automática.
- Incluir en el Outcome Report notas de coaching o datos de contacto de los colegas.
- **De la auditoría UX/UI, queda para la versión 4.1** (no cambia la forma de usar la app, D-17):
  - sistema de diseño: tokens de color, tipografía, radios, espaciado y z-index, más un lint que
    prohíba hex arbitrarios y tamaños sueltos;
  - fuentes servidas desde la propia app en lugar de Google Fonts;
  - componentes base (Button, Field, Dialog, Tabs, Toast…) y su migración pantalla por pantalla;
  - arreglos de móvil y tablet (nav oculto, desbordes, tablas recortadas);
  - accesibilidad de las pantallas existentes (pestañas con ARIA, labels, contraste, foco global);
  - animaciones definidas y `prefers-reduced-motion`;
  - branding y empaquetado: `<title>`, favicon, ícono de la app y color de fondo de la ventana de
    Electron.
  - Los quick wins de la Fase 0 de la auditoría pueden entrar antes como un PR suelto, sin versión
    propia.
- **De la auditoría UX/UI, sin versión asignada** (cambiaría flujos o el vocabulario de marca, así que
  sería una versión mayor):
  - renombrar pestañas o términos de marca;
  - el importador con pasos (Select → Review → Done);
  - unificar los dos formularios de alta de Manual Check-In;
  - editar nombres en la vista previa del importador.

## 5. Decisiones

- **D-1 (inscripción y periodo):** la inscripción no depende del periodo. Un inscrito que no asistió
  a ningún evento del periodo muestra `0%`. Una actividad sin eventos en el periodo muestra `—`.
- **D-2 (paneles):** para esta versión, los paneles son solo los tres de §2.2: Attendance Trends,
  Cross-Activity Comparisons y Engagement.
- **D-3 (lotes mixtos):** un lote puede mezclar actividades; cada archivo se registra en la suya.
- **D-4 (actividad no detectada):** se elige a mano con un selector en la vista previa de ese
  archivo.
- **D-5 (otros formatos):** `.xlsx`, `.xls`, `.docx`, `.doc` y `.txt` toman la actividad solo del
  nombre del archivo.
- **D-6 (orden de detección en `.csv`):** primero el nombre del archivo y, si no declara ninguna
  actividad, el título de la reunión.
- **D-7 (formato del Outcome Report):** `.txt`. Es la opción más simple: se genera en el navegador
  sin librerías nuevas, no requiere cambios a la Content-Security-Policy (US-14) y se abre en
  cualquier equipo. Un `.pdf` necesitaría una librería externa o el diálogo de impresión.
- **D-8 (rankings sin 0%):** los rankings del Outcome Report solo incluyen colegas con al menos una
  asistencia en el periodo; quien no asistió no figura como "más activo". Los colegas con 0% sí
  aparecen en la sección `Dormant`.
- **D-9 (tamaño del lote):** hasta 50 archivos `.csv` por lote, de cualquier actividad.
- **D-10 (tope de 50 MB por lote):** 50 archivos de 10 MB sumarían hasta 500 MB en la memoria del
  servidor. Los `.csv` de Teams pesan pocos KB, así que un tope de 50 MB por lote no limita el uso
  real y evita que una carga excesiva sature el servidor.
- **D-11 (una sola escala, BUG-04):** Hive Status es la única escala de rendimiento. La escala
  90/75 era un resto de una versión anterior y contradice al Hub.
- **D-12 (participar = asistir, BUG-05):** una actividad cuenta para un colega solo si tiene al
  menos un `present` en ella, en todas las vistas.
- **D-13 (sin datos ≠ Dormant, BUG-06):** `Dormant` es para quien tuvo eventos y no asistió. Sin
  eventos contra los que calcular, el estado es `No data`.
- **D-14 (Caserits / colleague):** `Caserits` en títulos, pestañas y secciones (marca);
  `colleague(s)` en frases y botones. Se dejan de usar `attendees` y `participants` en la interfaz.
- **D-15 (alcance de los textos):** esta versión corrige errores de redacción y unifica términos.
  No renombra pestañas ni vocabulario de marca: la guía `.docx` está escrita alrededor de ellos.
  Esta versión ya obliga a adaptarse, así que conviene hacer aquí los cambios de texto en lugar de
  forzar después otra versión mayor solo por ellos.
- **D-16 (mayúsculas):** se mantiene Title Case en pestañas, títulos, botones, labels y badges, y
  sentence case en mensajes. Es la regla mayoritaria hoy y evita cambiar textos que cita el `.docx`.
- **D-17 (auditoría UX/UI fuera del 4.0):** el sistema de diseño, la accesibilidad de las pantallas
  existentes, el responsive y el branding van en la versión **4.1**, porque no cambian la forma de
  usar la app. Mezclarlos con los cambios funcionales del 4.0 multiplicaría el riesgo de
  regresiones. Lo nuevo del 4.0 ya nace cumpliendo §2.8.

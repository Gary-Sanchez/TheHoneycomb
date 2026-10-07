# Documento de Requisitos de Producto (PRD): The Honeycomb 4.0

> **Versión:** 4.0 (borrador) · **Base:** PRD The Honeycomb 3.0 (criterios cumplidos) · **Fecha:** 2026-10-06

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
  actividad y los colegas de cada Hive Status, para todo el historial o para un periodo.

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

### 1.3. 🐞 Corrección de Bugs

- **BUG-03: el Progress Report muestra tasas de casi 100 %.** Usa el mismo cálculo incorrecto que
  Caserits & Progress. Detalle en §2.6.

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
  archivo queda marcado como `Activity not detected` en la vista previa.
- Un archivo `Activity not detected` muestra en la vista previa un **selector de actividad** con las
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
  asistió a nada en el periodo aparece como `Dormant` (0%).
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

- **Overall Engagement** muestra el **Overall** del colega (§1.5), el mismo valor que su **Overall**
  en el Bee-havior Hub con **All time** y su **Attendance Rate** en **Caserits & Progress**.
- El desglose por actividad muestra la tasa basada en eventos (§1.5): `eventos asistidos ÷ total de
  eventos de la actividad`, con la fracción como ayuda (ej. `Attended 3 of 8 events`).
- En una actividad no inscrita, el desglose muestra `—`.
- El cálculo se reutiliza de `src/beehavior.ts`, igual que en §2.4.

### 2.7. Restricciones técnicas (se mantienen de versiones anteriores)

- El parser sigue siendo **determinista y offline**.
- Toda ruta nueva que modifique datos usa `requireAdmin` y `validateBody`. El filtro por periodo y
  los paneles son de solo lectura y no necesitan rutas nuevas.
- La fecha de referencia del sistema sigue fija en el **24 de junio de 2026**.

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
| **TC-38** | Doc Parser | `.csv` cuyo nombre y título no nombran ninguna actividad (ej. `Weekly sync.csv`). | Se marca `Activity not detected`, aparece el selector de actividad y **Confirm & Import Caserits** queda deshabilitado hasta elegir una. |
| **TC-39** | Doc Parser | Se elige **Writing Hood** en el selector de un archivo `Activity not detected` y se confirma. | Todos sus registros se guardan en Writing Hood, con la etiqueta `selected manually`. |
| **TC-40** | Doc Parser | `.docx` llamado `Speakeasy 2026-06-24.docx`. | Se registra en Speakeasy. Un `.xlsx` sin actividad en el nombre se marca `Activity not detected`, aunque su contenido mencione una. |
| **TC-41** | Doc Parser | Lote de 5 `.csv`: 3 de Speakeasy y 2 de Music Room. | El lote no se rechaza; cada archivo se registra en su actividad. |
| **TC-42** | Doc Parser | Archivo cuyo nombre nombra dos actividades. | Se marca `Activity not detected`. |
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
| **TC-61** 🐞 | Progress Report (BUG-03) | Se abre el **Progress Report** de un colega con 1/8 en Speakeasy y 2/4 en Writing Hood. | **Overall Engagement** muestra `25%`, igual que su **Attendance Rate** en Caserits & Progress. |
| **TC-62** 🐞 | Progress Report (BUG-03) | Mismo colega, desglose por actividad. | Speakeasy muestra `13%` (`Attended 1 of 8 events`), Writing Hood `50%`, y Reading Club y Music Room `—`. |

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

# Documento de Requisitos de Producto (PRD): The Honeycomb 3.0

> **Versión:** 3.0 (borrador) · **Base:** PRD The Honeycomb 2.0 · **Fecha:** 2026-10-01

## 1. Visión General del Producto y Objetivos

### 1.1. Visión y Propósito

**The Honeycomb 3.0** parte de lo que dejó la versión 2.0 (parser `.csv` determinista, blacklist,
check-in manual agrupado por fecha y actualización reactiva del **Caserits Bee-havior Hub**). La
versión 3.0 busca que los datos de asistencia sean **más confiables**: que solo cuente quien
realmente participó, que no se pueda cargar dos veces la misma sesión y que los porcentajes se
calculen contra los eventos que de verdad se realizaron. Además, permite **cargar varios archivos
`.csv` a la vez** y muestra mejor la información en pantalla.

### 1.2. Corrección de Bugs

- 🔴 **BUG-01 (ALTA PRIORIDAD): porcentajes del Bee-havior Hub mal calculados.** En la vista
  **Caserits Bee-havior Hub**, el % de asistencia de cada colega a cada actividad debe calcularse
  sobre el **número de eventos registrados de esa actividad**. Hoy se calcula sobre los registros
  propios del colega, lo que infla los porcentajes. Detalle en §2.1.
- 🟢 **BUG-02 (baja prioridad): la blacklist excluye a colegas por error.** La blacklist reconoce
  a las personas por nombre + primer apellido, así que también descarta a colegas con nombres
  parecidos (ej. **Nicolas Rios Cardozo** se excluye como si fuera **Nicolas Rios Lopez**). Debe
  reconocerlas por su **nombre completo**. Detalle en §2.7.

### 1.3. Nuevas Funcionalidades

1. **Filtro por tiempo mínimo de asistencia.** El Doc Parser excluye a quien estuvo **menos de 10
   minutos** en la reunión según el `.csv`.
2. **Detección de `.csv` duplicados.** El Doc Parser reconoce un archivo que ya se importó y bloquea
   que se registre dos veces.
3. **Carga múltiple de `.csv`.** El Doc Parser acepta **hasta 20 archivos `.csv`** en una sola
   importación, siempre que **el 100 % pertenezca a la misma actividad**.
4. **Orden alfabético en Caserits & Progress.** El directorio de colegas se muestra ordenado
   alfabéticamente.
5. **Eventos y promedio de asistentes en Activities Matrix Profile.** Cada tarjeta de actividad
   muestra cuántos eventos se registraron y el promedio de asistentes por evento.

### 1.4. Corrección respecto al PRD 2.0

El PRD 2.0 (§2.2) menciona la *base de datos local (localStorage)*. La persistencia real es
**del lado del servidor** (`lowdb` sobre `honeycomb-data.json`). Todo lo que este documento dice
sobre "guardar" o "registrar" se refiere a esa base.

La lista de exclusión del PRD 2.0 (§2.1) nombra a las personas con nombre y un solo apellido, y no
incluye a **Stephanie Mariscal Rodriguez**. La lista vigente es la de §2.7 de este documento.

### 1.5. Definición común: Evento

Un **evento** es cada combinación única de **actividad + fecha** que tenga al menos un registro en
la base, venga de un `.csv`, de otro archivo o del check-in manual. Es la misma unidad de "sesión"
que define el PRD 2.0 (§2.2, Consolidación por Fecha). La usan BUG-01 (§2.1) y la funcionalidad 5
(§2.6).

---

## 2. Requisitos Funcionales y Especificación de Módulos

### 2.1. 🔴 BUG-01: Bee-havior Hub, porcentajes basados en eventos (ALTA PRIORIDAD)

**Comportamiento actual (incorrecto).** El % de una actividad se calcula como
`presentes / registros propios del colega en esa actividad`. Si alguien tiene un solo registro
(presente) en Reading Club, muestra **100 %**, aunque Reading Club haya tenido 8 sesiones.

**Comportamiento esperado.**

- **Actividad inscrita:** un colega está **inscrito** en toda actividad en la que haya participado
  (`present`) **al menos una vez**. No hace falta una inscripción manual.
- **Eventos que cuentan para el colega:** los eventos de cada actividad inscrita con fecha **igual o
  posterior a su `joinedDate`**. Los eventos anteriores a su ingreso no cuentan.
- **% por actividad** = `eventos de esa actividad a los que el colega asistió (present) ÷ eventos de
  esa actividad que cuentan para el colega`, redondeado al entero más cercano.
- **La ausencia se deduce, no se guarda:** si hubo un evento y el colega no figura como `present`
  en él, cuenta como no asistido. No se crean registros `Absent` automáticos (ver §5, D-4). Un
  registro `absent` que ya exista (ej. check-in manual) cuenta igual que no haber ido.
- En una actividad **no inscrita**, la celda muestra `—` (no `0 %`) y no entra en el Overall.
- Cada celda muestra el porcentaje y, como ayuda (tooltip o texto secundario), la fracción, ej.
  `38 % (3/8)`.
- **Overall** = `total de asistencias del colega en sus actividades inscritas ÷ total de eventos que
  cuentan para él en esas actividades`.
- **Hive Status** (Dormant 0–25 %, Hatcher 26–50 %, Forager 51–75 %, Busy Bee 76–100 %) y la
  **insignia Multi-Activity** (`Yes (X Clubs)` / `Single (1)`) se recalculan con los nuevos
  porcentajes.
- El recálculo sigue siendo **reactivo** (PRD 2.0 §2.3): cualquier importación, check-in manual o
  borrado de colega/registro actualiza la tabla de inmediato. Un evento nuevo **baja** el % de
  quienes no asistieron.

### 2.2. Doc Parser: exclusión por menos de 10 minutos de asistencia

- Al procesar un `.csv` con una columna de duración por participante (ej. exportes de Teams:
  `In-Meeting Duration`, `Duration`, `Duración en la reunión`, `Tiempo en la reunión`), el sistema
  **descarta a quien tenga una duración menor a 10 minutos**.
  - **10:00 minutos o más → se incluye.** **9:59 o menos → se excluye.**
  - Formatos de duración a soportar: `1h 5m 30s`, `45m 12s`, `9m`, `00:45:12`, `45:12`, y sus
    equivalentes en español (`1 h 5 min`).
  - Si una persona aparece **en varias filas** (salió y volvió a entrar), se **suman** sus
    duraciones antes de aplicar el umbral.
- El filtro se aplica **antes** de mostrar la vista previa, junto con la blacklist del PRD 2.0
  (§2.1). La vista previa muestra un resumen: *"N attendees excluded (less than 10 minutes)"*, con
  la opción de ver la lista de excluidos.
- Si el `.csv` **no tiene columna de duración**, no se excluye a nadie por tiempo y la vista previa
  avisa que el filtro no se pudo aplicar.
- Si la duración de una fila no se puede interpretar, esa persona **se incluye** y queda marcada
  para revisión en la vista previa.

### 2.3. Doc Parser: detección de `.csv` duplicado

- Cada `.csv` importado con éxito deja una **huella** guardada en la base: hash del contenido del
  archivo (SHA-256), nombre del archivo, actividad, fecha del evento, cantidad de asistentes y fecha
  de importación.
- Al subir un `.csv`, se considera **duplicado** si:
  1. su **hash coincide** con el de un archivo ya importado (mismo archivo, aunque tenga otro
     nombre), **o**
  2. tiene la **misma actividad + misma fecha + el mismo conjunto de asistentes** (ya filtrados)
     que un evento existente (mismo contenido re-exportado).
- Ante un duplicado, el sistema **bloquea la importación de ese archivo** y muestra un mensaje que
  indica cuándo y con qué nombre se importó la primera vez. No se crean registros nuevos.
- Si el archivo comparte actividad y fecha con un evento existente **pero con otros asistentes**,
  no es duplicado: se integra al mismo evento (regla de consolidación del PRD 2.0) y los colegas
  que ya estaban registrados en ese evento no se duplican.
- La detección también aplica **dentro de una carga múltiple** (§2.4): si hay dos archivos iguales
  en el mismo lote, el segundo se marca como duplicado.
- `POST /api/reset` borra también el historial de huellas.

### 2.4. Doc Parser: carga múltiple de hasta 20 `.csv`

- El selector de archivos de **Import Forage Logs** permite elegir **de 1 a 20 archivos `.csv`** a
  la vez. La carga múltiple aplica solo a `.csv`; los demás formatos (`.xlsx .xls .docx .doc .txt`)
  siguen siendo de a uno.
- **Más de 20 archivos** → se rechaza el lote completo con un mensaje que indica el máximo.
- **Regla de actividad única (100 %):** todos los archivos del lote deben pertenecer a la **misma
  actividad**.
  - Si el usuario eligió una actividad para la carga, todos los archivos se toman como de esa
    actividad, salvo que un archivo declare explícitamente otra (columna `Activity`/`Actividad` o
    título de la reunión).
  - Si **al menos un archivo** pertenece a otra actividad, se rechaza **el lote completo** y el
    mensaje dice qué archivos no coinciden. No se importa nada parcialmente.
- **Cada archivo es un evento** con su propia fecha. Si un archivo no tiene fecha detectable, se
  pide al usuario (PRD 2.0 §2.1, `Batch Edit Session Date`) antes de confirmar.
- La vista previa agrupa los registros **por archivo** y muestra, para cada uno: nombre, fecha,
  cantidad de asistentes, excluidos por blacklist, excluidos por < 10 min y estado de duplicado.
- **La confirmación es atómica:** se importan todos los archivos válidos del lote en una sola
  operación, o ninguno si falla la validación del lote. Los archivos duplicados se excluyen del lote
  y se informan, sin bloquear al resto.
- Si dos archivos del lote tienen la misma fecha (y no son duplicados), sus asistentes se
  consolidan en un mismo evento.

### 2.5. Caserits & Progress: orden alfabético

- La lista de colegas de **Caserits & Progress** se muestra ordenada **alfabéticamente por nombre
  (A → Z)**.
- El orden no distingue mayúsculas/minúsculas ni acentos (ej. `Álvaro` va junto a `Alvaro`, antes
  de `Beatriz`).
- El orden se mantiene al buscar, al filtrar por actividad, al agregar un colega nuevo y después de
  una importación.

### 2.6. Activities Matrix Profile: eventos registrados y promedio de asistentes

En la sección **Activities Matrix Profile** (tarjetas por actividad del Dashboard), cada una de las
4 tarjetas (Speakeasy, Reading Club, Music Room, Writing Hood) suma dos indicadores a los que ya
tiene (*Active Attendees* y *Attendance rate*):

- **Eventos registrados:** cantidad de eventos de esa actividad (definición en §1.5).
- **Promedio de asistentes por evento** = `total de asistencias (present) de esa actividad ÷
  eventos registrados de esa actividad`, con **un decimal** (ej. `7.5`).
- Si la actividad **no tiene eventos**, se muestra `0` eventos y el promedio como `—`.
- Ambos indicadores se actualizan de inmediato al importar, hacer check-in manual, borrar un
  colega o reiniciar la base.
- Los colegas de la blacklist y los excluidos por < 10 min nunca llegan a la base, así que no
  cuentan en el promedio.

### 2.7. 🟢 BUG-02: Blacklist por nombres completos

**Comportamiento actual (incorrecto).** La blacklist excluye a todo nombre que contenga el nombre y
el primer apellido de alguien de la lista. Así, al importar, **Nicolas Rios Cardozo** (colega) se
descarta como si fuera **Nicolas Rios Lopez** (equipo), y cualquier "Pablo Rico ..." se descarta
como si fuera Pablo Rico Schmidt.

**Comportamiento esperado.**

- La blacklist contiene exactamente estos 13 nombres completos:
  1. Nadine Hinojosa Ramos
  2. Fabiola Arias Navia
  3. Alejandra Barrientos Garrido
  4. Rodrigo Rivero Rocha
  5. Gary Ronald Sanchez Suarez
  6. Nicolas Rios Lopez
  7. Wara Hermosa Fernandez
  8. Angela Guzman Rusinque
  9. Gustavo Ramos Soria
  10. Alejandra Rivera Crespo
  11. Pablo Rico Schmidt
  12. Eric Revollo Ayala
  13. Stephanie Mariscal Rodriguez
- Un nombre se excluye solo si contiene **todas las palabras** de uno de esos nombres completos. La
  comparación ignora el orden (`Guzman Rusinque, Angela`), las mayúsculas y los acentos.
- Un nombre incompleto (ej. `Nicolas Rios`, `Fabiola Arias`) **no** se excluye: si alguien del
  equipo aparece con un solo apellido, se borra a mano su fila en la vista previa.
- El filtro se sigue aplicando solo en la ingesta de archivos (vista previa de **Import Forage
  Logs** y consolidación). No se aplica en **Manual Check-In** ni en el alta de colegas desde
  **Caserits & Progress**.

### 2.8. Restricciones técnicas (se mantienen de versiones anteriores)

- Toda ruta nueva que modifique datos (ej. guardar huellas de importación, importación por lote)
  requiere sesión de administrador (`requireAdmin`) y validación del cuerpo (`validateBody` con
  esquema `zod`).
- El parser sigue siendo **determinista y offline** (sin llamadas a IA externas).
- El borrado de un colega sigue eliminando en cascada sus registros y notas. Al borrar registros,
  los totales de eventos del Bee-havior Hub y del Activities Matrix Profile se recalculan.

---

## 3. Matriz de Criterios de Aceptación (QA & Testing)

| ID | Módulo / Componente | Escenario de Prueba | Resultado Esperado |
|---|---|---|---|
| **TC-05** 🔴 | Bee-havior Hub (BUG-01) | Reading Club tiene 8 eventos registrados; un colega asistió a 3. | La celda de Reading Club muestra `38 %` (3/8), no `100 %`. |
| **TC-06** 🔴 | Bee-havior Hub (BUG-01) | Se importa un evento nuevo de Speakeasy al que un colega **no** asistió. | El % de Speakeasy de ese colega baja de inmediato; Overall y Hive Status se recalculan. |
| **TC-07** 🔴 | Bee-havior Hub (BUG-01) | Un colega asistió solo a Speakeasy; Reading Club tiene 5 eventos. | Reading Club muestra `—` para ese colega y no entra en su Overall. |
| **TC-07b** 🔴 | Bee-havior Hub (BUG-01) | Colega con `joinedDate` 2026-06-01; Music Room tuvo 3 eventos en mayo y 2 en junio, y asistió a 1 en junio. | Music Room muestra `50 %` (1/2): los eventos de mayo no cuentan. |
| **TC-07c** 🔴 | Bee-havior Hub (BUG-01) | Se importa un `.csv` de Speakeasy; un colega inscrito en Speakeasy no figura en el archivo. | No se crea ningún registro `Absent`; igual su % de Speakeasy baja porque el evento cuenta en su denominador. |
| **TC-08** | Filtro < 10 min | `.csv` con duraciones `9m 59s`, `10m 0s` y `45m`. | Se excluye solo al de `9m 59s`; la vista previa muestra "1 attendees excluded (less than 10 minutes)". |
| **TC-09** | Filtro < 10 min | Colega en dos filas: `6m` + `5m`. | Se suman 11 min → se incluye. |
| **TC-10** | Filtro < 10 min | `.csv` sin columna de duración. | No se excluye a nadie por tiempo; aparece el aviso de que el filtro no se aplicó. |
| **TC-11** | Duplicados | Se sube el mismo `.csv` ya importado (incluso renombrado). | Importación bloqueada con mensaje que indica la importación original; no se crean registros. |
| **TC-12** | Duplicados | `.csv` con misma actividad y fecha que un evento existente pero con otros asistentes. | No se marca duplicado; los asistentes nuevos se suman al mismo evento sin duplicar a los existentes. |
| **TC-13** | Carga múltiple | Se suben 20 `.csv` de Music Room con fechas distintas. | Vista previa agrupada por archivo; al confirmar se crean 20 eventos. |
| **TC-14** | Carga múltiple | Se suben 21 `.csv`. | Lote rechazado con mensaje del máximo de 20. |
| **TC-15** | Carga múltiple | Lote de 5 `.csv` donde 1 es de Writing Hood y 4 de Speakeasy. | Lote completo rechazado; el mensaje nombra el archivo que no coincide. Nada se importa. |
| **TC-16** | Carga múltiple | Lote con 2 archivos idénticos. | El segundo se marca duplicado y se excluye; el resto se importa. |
| **TC-17** | Caserits & Progress | Directorio con `zoe`, `Álvaro`, `beatriz`, `Carlos`. | Se muestra: Álvaro, beatriz, Carlos, zoe. Se mantiene al buscar y al agregar un colega. |
| **TC-18** | Activities Matrix Profile | Speakeasy tiene 4 eventos con 6, 8, 7 y 9 asistentes presentes. | La tarjeta muestra `4` eventos y promedio `7.5` asistentes. |
| **TC-19** | Activities Matrix Profile | Writing Hood sin eventos. | La tarjeta muestra `0` eventos y promedio `—`. |
| **TC-20** | Activities Matrix Profile | Se importa un evento nuevo de Speakeasy con 10 asistentes. | La tarjeta pasa a `5` eventos y promedio `8.0` sin recargar la página. |
| **TC-21** | Blacklist (BUG-02) | `.csv` con `Nicolas Rios Lopez` y `Nicolas Rios Cardozo`. | Se excluye a Nicolas Rios Lopez; Nicolas Rios Cardozo se importa. |
| **TC-22** | Blacklist (BUG-02) | `.csv` con `Nicolas Rios` y `Fabiola Arias` (sin segundo apellido). | No se excluye a ninguno. |
| **TC-23** | Blacklist (BUG-02) | `.csv` con los 13 nombres completos, en distinto orden, mayúsculas y acentos. | Se excluye a los 13 antes de la vista previa. |
| **TC-24** | Blacklist (BUG-02) | `.csv` con `Pablo Rico Vargas`. | No se excluye. |

---

## 4. Fuera de Alcance (3.0)

- Configurar el umbral de 10 minutos desde la UI (queda fijo en esta versión).
- Carga múltiple de formatos distintos a `.csv`.
- Deshacer una importación ya confirmada.

## 5. Decisiones

- **D-1 (Overall):** el Overall solo incluye las actividades **inscritas**. Un colega queda inscrito
  en una actividad desde que participa en ella **al menos una vez**.
- **D-2 (fecha de ingreso):** los eventos anteriores al `joinedDate` del colega **no cuentan** en
  su denominador.
- **D-3 (registros `absent`):** un `absent` cuenta igual que no haber ido. Los `.csv` solo traen
  asistentes, así que en la práctica los `absent` solo vienen del check-in manual.
- **D-4 (ausencias automáticas):** **no** se crean registros `Absent` automáticos para los inscritos
  que no figuran en un `.csv`. La ausencia **se deduce** de los eventos (§2.1). Motivos:
  - Con el cálculo por eventos se obtiene el mismo resultado sin escribir nada extra en la base.
  - Si se guardaran, cada importación, check-in manual tardío (convertir `Absent` en `Present`),
    borrado de colega o nueva inscripción tendría que crear, corregir o borrar `Absent` en cascada.
    Eso suma puntos de inconsistencia.
  - La base crecería con un registro por inscrito y por evento sin aportar información nueva.
  - La detección de duplicados (§2.3) y el promedio de asistentes (§2.6) se complicarían.
- **D-5 (blacklist):** la blacklist reconoce solo nombres completos (nombre y dos apellidos) y se
  aplica únicamente a la ingesta de archivos (§2.7).

## 6. Tickets en The Honeycomb Board

| Ticket | Punto del PRD | Prioridad |
|---|---|---|
| [US-24](https://app.notion.com/p/3ec7669ddc9e8180ac26e75fba594daf) | BUG-01: porcentajes del Bee-havior Hub (§2.1) | 🔴 Alta |
| [US-25](https://app.notion.com/p/3ec7669ddc9e811db061ed0390ffd717) | Exclusión por menos de 10 minutos (§2.2) | 🟡 Media |
| [US-26](https://app.notion.com/p/3ec7669ddc9e814b8deefea7f366f656) | Detección de `.csv` duplicado (§2.3) | 🟡 Media |
| [US-27](https://app.notion.com/p/3ec7669ddc9e81b4b885c1c1c5a7af69) | Carga múltiple de hasta 20 `.csv` (§2.4) | 🟡 Media |
| [US-28](https://app.notion.com/p/3ec7669ddc9e81598defce92d42be4c7) | Orden alfabético en Caserits & Progress (§2.5) | 🟢 Baja |
| [US-29](https://app.notion.com/p/3ec7669ddc9e8198a736ecb9148f6de4) | Eventos y promedio en Activities Matrix Profile (§2.6) | 🟡 Media |
| [US-30](https://app.notion.com/p/3ec7669ddc9e81299b44c20a797e8767) | BUG-02: blacklist por nombres completos (§2.7) | 🟢 Baja |

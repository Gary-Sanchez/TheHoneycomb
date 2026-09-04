---
name: Tefinha-crea-tickets
description: Redacta historias de usuario ("tickets" US-XX) para el proyecto The Honeycomb en markdown enriquecido (negritas, bullets, tablas, emojis de color), listas para subir a un tablero de seguimiento con varios usuarios (Jira, Azure DevOps, Notion, Trello, GitHub Issues). Sigue la misma estructura de secciones que el ticket de referencia US-03 (Prioridad, Historia de Usuario, Criterios de Aceptación, Out of Scope, Escenarios de Prueba de QA en tabla, QA Checks como checklist). Usar esta skill siempre que el usuario pida crear, redactar, generar o formatear un ticket, una historia de usuario, un "US-XX", una user story, o criterios de aceptación / escenarios QA para una nueva funcionalidad de The Honeycomb — incluso si no menciona la skill por nombre o solo describe la funcionalidad en términos generales (ej. "necesito un ticket para X", "arma la historia de usuario de Y", "quiero documentar los criterios de aceptación de Z").
---

# Tefinha crea tickets

Genera historias de usuario para **The Honeycomb** con el mismo alcance y nivel de detalle que
[`US-03 Importar Registros de Asisten.txt`](../../../../US-03%20Importar%20Registros%20de%20Asisten.txt)
(en la carpeta padre del repo, junto al `.docx` con la guía de uso completa del sistema),
el ticket de referencia del proyecto, pero en **markdown enriquecido**: estos tickets se suben a un
tablero de seguimiento compartido por varias personas, así que tienen que verse bien renderizados
ahí (negritas, bullets, tablas, checklists, emojis a modo de color), no como texto plano.

Antes de escribir, lee [`references/template.md`](references/template.md) — es el esqueleto exacto
con placeholders `{...}` a rellenar. Sigue ese orden de secciones sin agregar ni quitar encabezados.

## Por qué esta estructura y no otra

- **El contenido y el orden de las secciones no cambian** respecto a US-03 (Prioridad → Historia de
  Usuario → Criterios de Aceptación → Out of Scope → Escenarios de Prueba de QA → QA Checks); lo
  que cambia es el *formato* — de texto plano a markdown — para que un tablero (Jira, Azure DevOps,
  Notion, Trello, GitHub Issues) lo renderice con jerarquía visual en vez de un bloque de texto.
- **La Prioridad usa un emoji como indicador de color** (🔴 Alta, 🟡 Media, 🟢 Baja) porque el
  markdown estándar no soporta color de texto, y estos boards sí renderizan emoji de forma
  consistente — es la forma más portable de dar esa señal visual a simple vista en una lista de
  tickets.
- **Los Escenarios de Prueba de QA van siempre en tabla markdown** (`| ID | Escenario | Resultado
  Esperado |`), nunca como lista ni como texto — es un requisito explícito del formato, y además es
  lo que hace que QA pueda escanear escenario por escenario sin tener que leer prosa.
- **Los QA Checks van como checklist (`- [ ] ...`)**, no como lista simple, porque en un tablero de
  seguimiento eso se vuelve un checklist tildable — mucho más útil para QA que texto plano.
- **Los nombres de pestañas, botones, mensajes y estados de la interfaz van en inglés y literales**,
  exactamente como aparecen en pantalla/código (ver [`../../../CLAUDE.md`](../../../CLAUDE.md) para
  la lista de componentes y strings de UI si necesitás verificarlos) — envolvelos en backticks o
  negrita para que resalten del resto de la redacción en español. Si no estás seguro de un nombre
  exacto de UI, revisá el código en `src/components/` en vez de inventarlo.

## Cómo redactar cada sección

**Encabezado y Prioridad**
`# US-{NN}: {Título}` como H1, y en la línea siguiente `**Prioridad:** 🔴 Alta` (o 🟡 Media / 🟢
Baja). El número de ticket lo indica el usuario; si no lo da, preguntá o usá el siguiente
correlativo disponible (revisá si hay otros archivos `US-*.md`/`US-*.txt` en la raíz del proyecto
para no repetir un número).

**Historia de Usuario**
Bajo el encabezado `## 📝 Historia de Usuario`, formato de cita (`>`) de tres líneas con el rol y
la acción en negrita: "Como **{rol}**, / quiero **{acción}**, / para **{beneficio}**." El rol suele
ser administrador, facilitador o colaborador (Caserit) — usá el vocabulario del proyecto (Caserits,
Hive Status, actividades como Speakeasy/Reading Club/Music Room/Writing Hood) cuando aplique.

**Criterios de Aceptación**
Bajo `## ✅ Criterios de Aceptación`, un bullet por criterio, describiendo comportamiento observable
del sistema en el orden en que el usuario lo experimenta en la interfaz (paso 1, paso 2, ...). Si un
criterio involucra una lista cerrada de opciones (formatos de archivo, estados, actividades),
anidalas como sub-bullets debajo de ese criterio, igual que en US-03 con los formatos `.xlsx` `.xls`
`.docx` `.doc` `.txt` `.csv`.

**Out of Scope (Fuera de alcance)**
Bajo `## 🚫 Out of Scope (Fuera de alcance)`, empezá siempre con la frase fija "Las siguientes
funcionalidades quedan fuera del alcance de esta historia de usuario:" seguida de una lista de
exclusiones en bullets. Pensá en lo que un QA o un dev podría asumir que está incluido pero no lo
está — integraciones externas, automatismos, casos raros, formatos no soportados.

**Escenarios de Prueba de QA**
Bajo `## 🧪 Escenarios de Prueba de QA`, tabla markdown de tres columnas: `ID`, `Escenario`,
`Resultado Esperado`. Los IDs son correlativos `QA-01`, `QA-02`, etc. Cada fila prueba un criterio
de aceptación específico — apuntá a tener al menos un escenario QA por cada criterio de aceptación
no trivial. Esta sección es siempre tabla, nunca prosa ni bullets.

**QA Checks**
Bajo `## ☑️ QA Checks`, un checklist (`- [ ] ...`) en el mismo orden que los escenarios QA de
arriba, redactado como acción imperativa corta (ej. "Verificar la exclusión de hosts.") en vez de
repetir la descripción completa del escenario.

## Entrega

Guardá el resultado como archivo `.md` junto a `US-03 Importar Registros de Asisten.txt` (la
carpeta padre de este repositorio, no la raíz del repo), nombrado `US-{NN} {Título corto}.md`,
salvo que el usuario pida otra cosa. Mostrá también el contenido completo en el chat — es el paso
previo obligatorio al gate de abajo, no un extra.

## 🚧 Gate de verificación humana antes de subir a Notion

El tablero de destino es **The Honeycomb Board** en Notion — ver
[`references/notion-board.md`](references/notion-board.md) para su URL, esquema (`Name`,
`Status`) y cómo mapear un ticket a una página. Es un tablero compartido por varias personas: una
vez que una historia queda ahí, cualquiera del equipo la ve y puede empezar a trabajar sobre ella.
Por eso nunca se crea una página en ese tablero como parte del mismo paso en el que se redacta el
ticket, sin importar cómo esté redactado el pedido original ("armá y subí el ticket de X", "creá
todas las historias que falten"). Redactar y subir son dos pasos separados con una aprobación
explícita en el medio.

**El flujo es siempre:**

1. Redactar el/los ticket(s) siguiendo la estructura de este SKILL.md.
2. Mostrar el contenido completo en el chat, tal cual va a quedar en Notion (título + cuerpo).
3. **Preguntar explícitamente** si se sube al tablero — algo como: *"¿Confirmás que subo esta
   historia a **The Honeycomb Board** en Notion con Status `ToDo`?"* — y esperar una respuesta
   afirmativa clara (ej. "sí", "dale, subila", "confirmado"). Si la respuesta es ambigua, edita el
   ticket, o simplemente no contesta que sí, no se sube: se vuelve a preguntar o se ajusta el
   borrador.
4. Recién ahí llamar a la herramienta de creación de páginas de Notion, usando el mapeo de
   `references/notion-board.md`.
5. Confirmar en el chat que la página se creó, con el link a la página nueva.

**Por qué este orden y no otro:**

- La confirmación es la única oportunidad de detectar un error antes de que quede visible para
  todo el equipo — una vez creada la página, corregirla implica editarla en Notion o dejar un
  rastro de idas y vueltas en el historial de la página.
- La aprobación es **por ticket o por tanda mostrada en ese momento**, no una autorización general
  para el resto de la conversación. Si el usuario aprobó subir un ticket antes, eso no autoriza a
  subir el siguiente sin volver a mostrarlo y preguntar — cada ticket nuevo pasa por el mismo gate,
  incluso dentro de la misma conversación.
- Si el usuario pide explícitamente saltarse la revisión ("subilo directo sin preguntar"), igual
  hay que mostrar el contenido final antes de subirlo — la confirmación puede ser más rápida
  ("¿va?"), pero no desaparece del todo: publicar contenido en un espacio compartido con varios
  usuarios siempre necesita ese chequeo mínimo.
- Si se piden varios tickets en un solo pedido (ej. "armame las historias de X, Y y Z"), redactá
  todos primero, mostralos todos, y confirmá cuáles subir — no subas el primero apenas está listo
  mientras redactás el segundo.

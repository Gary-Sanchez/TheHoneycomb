---
name: Start-Honeycomb
description: Compila y levanta la app de escritorio (Electron) de The Honeycomb en la máquina local, dejándola corriendo para que el usuario la use, y verifica que arrancó bien antes de avisar. Usar esta skill siempre que el usuario pida correr, levantar, abrir, iniciar o probar "la aplicación" / "la app" / "Honeycomb" en local — incluso si no menciona la skill por nombre (ej. "corré la app en local", "abrí Honeycomb", "levantá el server", "quiero ver la app andando").
---

# Start Honeycomb

Compila y lanza la app de escritorio de **The Honeycomb** (Electron + Express embebido) en esta
máquina Windows, la deja corriendo en segundo plano para que el usuario la use, y confirma con una
verificación real (no solo "el comando no tiró error") antes de decir que está lista.

Este archivo vive dentro del propio repositorio (`the-honeycomb(1)/.claude/skills/Start-Honeycomb/`),
pero los comandos de abajo asumen que la sesión de Claude Code arranca parada en la **carpeta
padre** de este repositorio (`The Honeycomb/`, donde también viven los tickets `US-XX` y la guía de
uso completa del sistema) — por eso todos empiezan con `cd "the-honeycomb(1)"`. Si tu sesión ya
arranca directamente adentro de este repositorio (por ejemplo, clonaste `TheHoneycomb.git` solo,
sin esa carpeta contenedora), salteá ese `cd` y corré el resto de los comandos tal cual desde la
raíz del repo.

## Por qué este flujo y no un simple `npm start`

- **Esta máquina tiene un `node.exe` viejo (v6.14.0, de una instalación de Brackets) antes en el
  `PATH`** que el Node real (v24.20.0 en `C:\Program Files\nodejs`). Si no se fuerza el `PATH`
  correcto, `npm`/`node`/`electron` fallan con errores crípticos de sintaxis vieja. **Siempre**
  anteponer `C:\Program Files\nodejs` al `PATH` en cada comando de esta skill.
- **El puerto por defecto (3000) puede estar ocupado** por otro proceso (dev server de otra sesión,
  instancia anterior de Honeycomb, etc.). No matar procesos ajenos a ciegas: primero chequear qué
  hay en el puerto, y si está ocupado por algo que no es una instancia vieja de esta misma app,
  arrancar en otro puerto vía `PORT=<otro>`.
- **`electron .` es un proceso de ventana (GUI) de larga duración** — no termina solo. Si se
  lanza sin `run_in_background: true` en el tool de Bash, el tool queda bloqueado hasta que el
  usuario cierre la ventana a mano. Siempre lanzarlo en background y **no matarlo después** (a
  diferencia de una corrida de verificación/testing, acá el objetivo es dejarlo andando para el
  usuario).
- **La primera vez que se compila, el bundle del server tarda ~10-20s** (Vite + esbuild). Hay que
  esperar y confirmar con un `curl` real a `/api/health` (y opcionalmente `/api/data`) antes de
  avisar que está lista — no asumir que "arrancó" solo porque el proceso `electron` figura vivo en
  la lista de procesos (puede estar arriba pero el server interno no haber bindeado el puerto
  todavía, o haber fallado silenciosamente en un `.then()` sin `.catch()`).

## Pasos

1. **Chequear el puerto por defecto (3000) antes de arrancar:**
   ```bash
   netstat -ano | grep ':3000' | grep LISTENING
   ```
   - Si no hay nada, seguir con `PORT=3000` (o simplemente no fijar `PORT`, ya que `electron/main.js`
     lo toma como default).
   - Si hay algo, identificar de qué se trata antes de decidir (no matar a ciegas):
     ```bash
     powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"ProcessId=<PID>\" | Select-Object CommandLine"
     ```
     Si es una instancia vieja de Honeycomb (electron.exe o `node dist/server.cjs` de este mismo
     proyecto) y el usuario no dijo que la necesita, se puede cerrar. Si es de otra cosa/otra sesión
     (por ejemplo un `tsx server.ts` de un dev server ajeno), **no tocarlo** — elegir otro puerto,
     ej. `PORT=3456`.

2. **Compilar y lanzar, en background, con el `PATH` corregido:**
   ```bash
   export PATH="/c/Program Files/nodejs:$PATH" && cd "the-honeycomb(1)" && PORT=<puerto-elegido> npm run electron:start > /tmp/honeycomb-electron.log 2>&1
   ```
   Este comando **debe** ir con `run_in_background: true` en el tool de Bash — no agregar un `&`
   manual al final del comando (eso duplica el backgrounding y el tool pierde la salida real, como
   pasó la primera vez que se probó esto).

3. **Esperar a que termine el build y arranque el server**, chequeando el log cada ~60-90s en vez de
   sondear en loop corto (usar `ScheduleWakeup` con 60-90s si se está en un flujo async, o
   simplemente reintentar la verificación del paso 4 después de una espera breve):
   ```bash
   cat /tmp/honeycomb-electron.log
   ```
   Se ve primero la salida de `vite build` y `esbuild`, y recién después el log del server
   (`Server running on http://0.0.0.0:<puerto>`). Si en el log aparece `ERR_REQUIRE_ESM` o
   `UnhandledPromiseRejectionWarning`, algo se rompió (ver Troubleshooting abajo) — no reportar
   éxito.

4. **Verificar de verdad, no asumir:**
   ```bash
   curl -s http://localhost:<puerto-elegido>/api/health
   curl -s http://localhost:<puerto-elegido>/api/data
   ```
   `/api/health` debe responder `{"status":"ok"}` y `/api/data` un JSON con `attendees`/`records`/
   `notes` (8 asistentes y 139 registros si es la primera vez que corre y usa datos semilla; menos
   o distinto si ya había datos guardados de una corrida anterior en
   `%APPDATA%\The Honeycomb\honeycomb-data.json`). Solo después de ver esta respuesta se confirma
   al usuario que la app está lista.

5. **Avisar al usuario** que la ventana ya está abierta en su escritorio (título "The Honeycomb"),
   mencionar el puerto usado si no fue el 3000, y dónde persisten los datos
   (`%APPDATA%\The Honeycomb\honeycomb-data.json`). **No cerrar el proceso** — a diferencia de una
   verificación de prueba, acá se deja corriendo para que el usuario la use. Si en algún momento hay
   que cerrarla, matar los procesos `electron.exe` asociados:
   ```bash
   powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force"
   ```

## Alternativa: modo dev en el navegador (no Electron)

Si el usuario específicamente pide correrla "en el navegador" o "en modo dev" en lugar de la app de
escritorio, usar en cambio:
```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd "the-honeycomb(1)" && npm run dev
```
Esto corre `tsx server.ts` con Vite en modo middleware (hot reload de frontend), sirviendo todo en
`http://localhost:3000` (o el puerto libre que se elija). Mismo cuidado con el `PATH` y el puerto
que en el flujo de Electron. Esta vía es útil para iterar sobre el código; la vía de Electron
(default de esta skill) es la que refleja el producto final tal como lo va a usar el usuario.

## Troubleshooting conocido

- **`ERR_REQUIRE_ESM` en el log** — no debería pasar; `db.ts` ya usa `import()` dinámico para
  `lowdb` específicamente porque el Node embebido en Electron no soporta `require()` de ESM (ver
  comentario en `db.ts` y en `CLAUDE.md`). Si reaparece, alguien revirtió ese fix — no tocar el
  `import` estático de `lowdb/node`.
- **`EADDRINUSE`** — el puerto elegido ya estaba ocupado; volver al paso 1 y elegir otro.
- **La carpeta de datos aparece como `react-example` en vez de `The Honeycomb`** — `electron/main.js`
  tiene `app.setName("The Honeycomb")` al principio del archivo; si falta, `app.getPath("userData")`
  cae al nombre de `package.json`.
- **Errores de sintaxis raros de Node muy viejo** — el `PATH` no se corrigió antes del comando;
  repetir con `export PATH="/c/Program Files/nodejs:$PATH"` primero en la misma línea de comando.

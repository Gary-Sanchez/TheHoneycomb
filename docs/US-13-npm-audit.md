# US-13 — Remediación de `npm audit`

Registro de qué se corrigió, cómo y por qué. Relevado el 2026-09-30 sobre `main` @ `7e7276c`
(Node 26.8.1 / npm 11.19.0).

## Estado inicial

`npm ci` + `npm audit` en checkout limpio: **27 vulnerabilidades — 1 crítica, 20 altas, 6 moderadas**.

> El ticket documentaba 25 (1 / 19 / 5) al 2026-09-09. La diferencia son advisories publicados
> después: **`brace-expansion`** (alta) e **`ip-address`** (moderada), ambos transitivos y
> resueltos por `npm audit fix` igual que el resto.

## 1. `npm audit fix` (sin `--force`) — 12 resueltas

| Paquete | Severidad | Versión antes → después |
|---|---|---|
| `@xmldom/xmldom` | alta | 0.8.13 → 0.8.15 |
| `browserslist` | alta | 4.28.4 → 4.29.3 |
| `multer` | alta | 2.2.0 → 2.4.0 |
| `nanoid` | alta | 3.3.15 → 3.3.19 |
| `postcss` | alta | 8.5.15 → 8.5.28 |
| `brace-expansion` | alta | 5.0.9 → 5.0.12 (+ copias anidadas 1.1.18 → 1.1.21, 2.1.4 → 2.1.7) |
| `baseline-browser-mapping` | moderada | 2.10.38 → 2.11.26 |
| `body-parser` | moderada | 1.20.5 → 1.20.8 |
| `protobufjs` | moderada | 7.6.4 → 7.6.6 |
| `qs` / `express` | moderada | express 4.22.2 → 4.22.3, qs 6.15.3 → 6.16.0 |
| `ip-address` | moderada | parcheado por el fix; luego sale del árbol con electron-builder 26 (llegaba vía `socks` → proxy agents de `make-fetch-happen`) |

Resultado intermedio: 15 vulnerabilidades (1 crítica, 14 altas). `npm run lint` y `npm run build` OK.

## 2. Bumps mayores (lo que pedía `--force`) — **migrado**, no diferido

No se corrió `npm audit fix --force` a ciegas: se subieron a mano las dos dependencias raíz y se
retesteó el empaquetado.

| Paquete(s) | Severidad | Decisión | Detalle |
|---|---|---|---|
| **`tar`** (vía `@electron/rebuild` → `node-gyp` → `make-fetch-happen` → `cacache`) | **crítica** | ✅ Migrado | Se resuelve con `electron-builder@26`: `@electron/rebuild` 3.6 → 4.2, `node-gyp` 12.4, `tar` 7.5.22. |
| `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish` | alta (incl. fuga de `PRIVATE-TOKEN`/`Authorization` en redirects de `electron-updater`) | ✅ Migrado | `electron-builder` ^25.1.8 → **^26.15.3**. |
| **`electron`** | alta (bypass de integridad ASAR, inyección AppleScript, spoofing de service worker) | ✅ Migrado | `electron` ^33.2.1 → **^44.5.1**. `electron/main.js` solo usa APIs estables (`BrowserWindow`, `app.whenReady`, `webContents` events) → sin cambios de código. |
| `extract-zip` | alta (arrastrada por `electron`) | ✅ Migrado | Electron 44 usa `@electron-internal/extract-zip`; `extract-zip` ya no está en el árbol. |

**Riesgo de no migrar**: todas estas afectan al pipeline de desarrollo/release (build de Electron,
descarga de binarios, auto-update), no al runtime web de Express. Aun así `electron` sí es runtime
del ejecutable de escritorio, y el costo de migrar resultó bajo, así que se migró.

**Breaking change encontrado y corregido**: electron-builder 26 excluye del `app.asar` los paquetes
que figuran en `devDependencies`. `vite` estaba duplicado en `dependencies` **y** `devDependencies`,
así que quedaba afuera y el ejecutable empaquetado fallaba al arrancar
(`Cannot find module 'vite'` desde `dist/server.cjs`). Se eliminó la entrada duplicada de
`devDependencies` (misma versión, `vite` sigue en `dependencies`, que es lo correcto: `server.ts`
lo importa en runtime).

**Nota**: Electron 44 ya no tiene `postinstall`; descarga su binario en el primer
`electron .`/Playwright. En un checkout nuevo el primer `npm run test:e2e` puede exceder los 30 s
del timeout mientras descarga — reintentar, o precalentar con `npx install-electron`.

## 3. `xlsx` (alta — "No fix available") — **mitigado con la versión corregida oficial**

- Advisories: [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
  (Prototype Pollution, corregido en 0.19.3) y
  [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) (ReDoS, corregido en 0.20.2).
- Por qué "No fix available": SheetJS dejó de publicar en el registro npm; la última versión ahí
  es 0.18.5 (vulnerable). Las versiones corregidas se distribuyen solo desde su CDN oficial.
- **Decisión**: instalar la **misma librería** en su versión corregida desde la fuente oficial:
  `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`. No es un reemplazo de librería
  (eso quedaba fuera de alcance); la API usada (`read`, `utils.sheet_to_csv`) no cambió.
  `package-lock.json` fija el hash `integrity` del tarball, así que `npm ci` rechaza cualquier
  contenido distinto.
- **Defensa en profundidad** (`server.ts`, `/api/parse-attendance-file`): `xlsx.read` ahora corre
  con `cellFormula`, `cellHTML`, `cellStyles`, `bookVBA`, `bookProps` en `false` — solo hacen falta
  los valores de celda para `sheet_to_csv`. Se mantienen el límite de 10 MB de `multer` y el bind a
  `127.0.0.1` por default (US-11).
- **Dueño / mantenimiento**: al actualizar `xlsx` a futuro, hacerlo desde
  `https://cdn.sheetjs.com/` (ver su changelog) — **no** volver a `npm i xlsx`, que traería de
  nuevo 0.18.5.

## 4. Install scripts (npm ≥ 11)

npm 11 bloquea los install scripts de dependencias salvo que estén en `allowScripts`
(`package.json`). Se aprobaron con `npm install-scripts approve` los que el árbol actual necesita:
`esbuild` (binario nativo, requerido por Vite y el build), `protobufjs`, `electron-winstaller`,
`@google/genai` (no-op). Al subir la versión de alguno, npm avisa de nuevo — correr
`npm install-scripts ls` y aprobar la nueva versión.

## Estado final

```
$ npm audit
found 0 vulnerabilities
```

**0 críticas, 0 altas, 0 moderadas.** No queda ninguna vulnerabilidad aceptada ni diferida.

Verificado después de los cambios: `npm ci` limpio, `npm run lint`, `npm run build`, `npm run dev`
(API + frontend, subida real de `.xlsx` y `.xls`), `npm run test:e2e` (smoke de Electron 44), y
`npm run electron:build` + arranque del ejecutable empaquetado (`/api/health` → ok, ventana abierta).

## 5. Regresión de 2026-10 (US-48)

Relevado el 2026-10-12 sobre `main` @ `a506764` (Node 26.8.1 / npm 11.19.0): `npm audit` volvió a
reportar **13 vulnerabilidades — 1 crítica, 2 altas, 10 moderadas**. No las introdujo ningún
cambio del repo: son advisories publicados después del cierre de US-13 (se detectaron al trabajar
US-36).

### 5.1 `npm audit fix` (sin `--force`) — 3 resueltas

| Paquete | Severidad | Advisory | Llega vía | Versión antes → después |
|---|---|---|---|---|
| `proxy-addr` | crítica | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | `express` (runtime) | 2.0.7 → 2.0.8 |
| `http-cache-semantics` | alta | [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | `electron-builder` → `@electron/get` → `got` | 4.2.0 → 4.3.0 |
| `source-map-js` | alta | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | `postcss`, `@tailwindcss/vite` (build) | 1.2.1 → 1.2.2 |

El mismo `npm audit fix` subió, dentro de los rangos ya declarados en `package.json`:
`electron-builder` 26.15.3 → 26.17.0 (con `app-builder-lib`, `dmg-builder`,
`electron-builder-squirrel-windows` 26.17.0 y `builder-util`, `electron-publish` 26.16.0),
`mammoth` 1.12.0 → 1.13.0, `@electron/rebuild` 4.2.0 → 4.2.1 y `node-abi` 4.35.0 → 4.37.0.
`@noble/hashes` pasa de 2.4.0 a 1.8.0 en la raíz porque `app-builder-lib` 26.17 pide la línea 1.x
(decisión de upstream, no una degradación nuestra). La salida HTML de `mammoth` 1.13.0 sobre un
`.docx` de asistencia es idéntica a la de 1.12.0.

### 5.2 `sprintf-js` (moderada, todas las versiones) — resuelta con `overrides`

[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) no tiene versión
corregida. Lo que propone `npm audit fix --force` son **degradaciones** y se descartaron:
`mammoth` → 0.3.29 (rompe el import de `.docx`) y `electron-builder` → 26.5.0. En vez de eso se
sacó `sprintf-js` del árbol reemplazando a quienes lo traían, con dos `overrides` en `package.json`:

| Override | Camino que corta | Por qué es seguro |
|---|---|---|
| `"mammoth": { "argparse": "^2.0.1" }` | `mammoth` → `argparse` 1.0.10 → `sprintf-js` | `argparse` lo usa **solo** la CLI de mammoth (`bin/mammoth`); la librería que importa `parser.ts` no lo carga. `argparse` 2 no depende de `sprintf-js` y mantiene alias deprecados de la API 1.x (`addArgument`…): la CLI sigue convirtiendo, con `DeprecationWarning`. |
| `"@electron/get@3": { "global-agent": "^4.1.3" }` | `app-builder-lib` → `@electron/get` 3.1.0 → `global-agent` 3 → `roarr` 2 → `sprintf-js` | `global-agent` es dependencia **opcional** de `@electron/get`, usada solo en `initializeProxy()` (descarga de Electron detrás de un proxy al empaquetar), dentro de un `try/catch`. `global-agent` 4 ya no usa `roarr` y mantiene `bootstrap()`, la única API que llama `@electron/get`. El `@electron/get` 5.x de la raíz no depende de `global-agent`, así que el override no lo afecta. |

**Al subir `mammoth` o `electron-builder`**: revisar si sus nuevas versiones ya traen
`argparse` ≥ 2 / `@electron/get` sin `global-agent` 3, y en ese caso borrar el override
correspondiente (`npm ls argparse global-agent`).

### 5.3 Estado final

```
$ npm ci && npm audit
found 0 vulnerabilities
```

**0 críticas, 0 altas, 0 moderadas.** Ningún riesgo aceptado. `npm ls sprintf-js roarr` → vacío.
Sin install scripts nuevos (`npm install-scripts ls` → nada pendiente).

Verificado después de los cambios: `npm ci` limpio, `npm run lint`, `npm run build`, Vitest
(136/136), un `.docx` y un `.xlsx` de asistencia pasados por `extractTextFromFile` →
`parseAttendance` (mismos 3 colegas, actividad y fecha), `initializeProxy()` de `@electron/get`
con `global-agent` 4 (arranca sin errores), `npm run electron:build` + arranque del ejecutable
empaquetado (servidor responde, sin `Cannot find module`) y `npm run test:e2e` (7/7).

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

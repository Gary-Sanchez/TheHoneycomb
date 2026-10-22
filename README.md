<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# The Honeycomb

Herramienta interna para trackear asistencia de colegas ("Caserits") en 4 actividades voluntarias
de inglés, con import asistido por IA de logs de asistencia.

View your app in AI Studio: https://ai.studio/apps/0c432aff-7771-470e-a387-c47f2799667b

## Clonar el repositorio

```bash
git clone https://github.com/Gary-Sanchez/TheHoneycomb
cd TheHoneycomb
```

> Si vas a usar las skills de `.claude/skills/` (creación de tickets, ejecución de tickets,
> levantar la app), esas asumen que también tenés a mano la carpeta padre del repo con los
> archivos `US-*.md`/`.txt` y el `.docx` de la guía de uso — pedíselos a quien te compartió el
> proyecto si no los tenés, ya que no están versionados en git.

## Prerequisitos

- **Node.js** (v18+; en Windows verificá que no haya una versión vieja de Node más adelante en
  el `PATH` — puede romper `npm`/`electron` con errores crípticos)

## Setup del proyecto

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Correr la app en modo desarrollo (Express + Vite con hot reload, en el navegador):
   ```bash
   npm run dev
   ```
   Por default sirve en `http://localhost:3000`.
4. Crear la contraseña de administrador: abrí **Settings → Admin Access** y usá "Create Admin
   Password" (mínimo 8 caracteres; solo se permite desde la misma máquina y mientras no exista
   una). Sin sesión de admin la app queda en modo lectura. Alternativa: setear
   `HONEYCOMB_ADMIN_PASSWORD` en `.env.local` (tiene prioridad sobre la guardada).

### Acceso en red y autenticación

- El servidor **solo escucha en `127.0.0.1`** — otros dispositivos de la red no pueden
  alcanzarlo. Para exponerlo a la LAN hay que setear explícitamente `HONEYCOMB_ALLOW_LAN=true`
  (el arranque loguea una advertencia; va por HTTP plano, usalo solo detrás de VPN/proxy).
- Toda operación que crea, modifica o borra datos (Caserits, asistencia, notas, import, reset)
  exige sesión de admin; sin ella la API responde `401`. Las lecturas son
  públicas. Detalle técnico en [`CLAUDE.md`](CLAUDE.md#security-server-bind--admin-auth-us-11).

> **Nota:** el "Smart Doc Parser" ahora es 100% offline (parser determinístico en `parser.ts`,
> sin ningún LLM externo ni `GEMINI_API_KEY`). Si antes habías configurado una API key de Gemini,
> no hace falta hacer nada: al arrancar, el servidor borra esa clave de `honeycomb-config.json`
> (guardaba la key en texto plano). **No borres ese archivo a mano**: también guarda el hash de la
> contraseña de admin (US-11) y perderías el acceso de admin.

### Otros comandos disponibles

- `npm run build` — build de producción (Vite + esbuild bundlea `server.ts` a `dist/server.cjs`)
- `npm start` — corre el build ya generado
- `npm run lint` — chequeo de tipos (`tsc --noEmit`) + lint de estilos (ver
  [Lint de estilos](#lint-de-estilos-us-53)); no hay test suite automatizada todavía
- `npm run electron:start` — compila y abre la app de escritorio (Electron)
- `npm run electron:build` — genera el instalador de escritorio (electron-builder)

## Tests end-to-end (Playwright)

El repo usa [Playwright](https://playwright.dev/) para testear la app de escritorio (Electron) de
punta a punta. Los specs viven en `e2e/` (ver `e2e/README.md`) y la config base en
`playwright.config.ts`. Los tests lanzan Electron directamente (`_electron.launch`), no un
navegador, así que no hace falta `npx playwright install`.

Correr la suite (compila la app antes de lanzarla, igual que `electron:start`):

```bash
npm run test:e2e
```

Hoy solo existe un test de humo (`e2e/smoke.spec.ts`) que confirma que la app compila, la ventana
principal abre, y el servidor embebido responde. Nuevos escenarios de QA (de historias como US-03,
US-04, US-05) se agregan como specs nuevos ahí mismo, sin tocar la config base.

## Pre-commit hook (husky + lint-staged)

El repo tiene un hook `pre-commit` (via `husky`) que corre `lint-staged` sobre los archivos
staged. Actualmente eso significa: si hay algún `.ts`/`.tsx` staged, corre `tsc --noEmit` sobre
**todo el proyecto** (el chequeo de tipos de TypeScript no se puede acotar de forma confiable a
un subconjunto de archivos sin perder el `tsconfig.json`). Si falla, el `git commit` se bloquea
hasta corregir el error.

### Lint de estilos (US-53)

`npm run lint` y el pre-commit (con un `.tsx`, `src/index.css` o la línea base staged) también
corren `node scripts/lint-styles.mjs`: cuenta en los `.tsx` de `src/` los hex arbitrarios en
clases, los `text-[Npx]`, los `rounded-[…]`, los `animate-*` sin keyframes y los colores Tailwind
crudos (`amber-*`, `red-*`, `gray-*`), y falla si alguna regla supera su línea base
(`scripts/style-lint-baseline.json`, que arranca en los valores de `docs/SNAPSHOT-4.0.md` y solo
puede bajar). Cada ocurrencia sale con archivo, línea y regla. Reglas, salida y cómo bajar la
línea base: [`docs/STYLE-LINT.md`](docs/STYLE-LINT.md).

El hook se instala solo al correr `npm install` (script `prepare`), sin pasos manuales.

Para saltearlo en un caso excepcional:

```bash
git commit --no-verify -m "..."
```

No es la práctica recomendada — úsalo solo cuando sepas exactamente por qué el chequeo está
fallando y sea intencional saltearlo.

## CI (GitHub Actions)

El repo tiene un workflow en `.github/workflows/ci.yml` que corre en cada `push` a `main` y en
cada `pull request` contra `main`. El job instala dependencias (`npm ci`), corre el chequeo de
tipos (`npm run lint`), los tests unitarios (`npm test`) y el build de producción (`npm run build`),
en ese orden, sobre Node.js 24.
Si alguno de esos pasos falla, el check queda en rojo (❌) en la pestaña **Checks** del PR — no
requiere `GEMINI_API_KEY` ni ninguna otra variable de entorno.

## Releases y cierre de PRD

`version` en `package.json` es el número del PRD (`4.0.0` para el PRD 4.0; un hotfix sube el
PATCH) y se muestra en **Settings** (`The Honeycomb v4.0.0`). Al cerrar un PRD se sube la versión,
se crea el tag anotado `vX.Y.0` y se pushea; eso dispara `.github/workflows/release.yml`, que en
Windows corre lint, tests unitarios y build, genera el instalador `nsis` con electron-builder y lo
adjunta al GitHub Release del tag, con las notas de `docs/releases/vX.Y.0.md`. Si algo falla, no se
publica instalador. `ci.yml` no cambia.

El procedimiento completo (commit de cierre, tag, hotfix, tags retroactivos `v2.0.0`/`v3.0.0` y
cómo probar el workflow) está en [`docs/PRD-CLOSING.md`](docs/PRD-CLOSING.md).

## Íconos de la app

El ícono de la app de escritorio (instalador, ventana y barra de tareas) es la «H» de
`public/favicon.svg`, rasterizada a `electron/icons/`: `icon.png` (512 px), `icon.ico` (Windows,
16–256 px) e `icon.icns` (macOS, 16–1024 px). Esos tres archivos se commitean; `electron-builder`
los toma de `build.win.icon` / `build.mac.icon` en `package.json`.

Para regenerarlos (por ejemplo, si aparece un logo oficial):

1. Reemplazar `public/favicon.svg` por el SVG nuevo (cuadrado; el favicon del navegador cambia
   con él), o pasar otra ruta: `npm run icons -- ruta/al/logo.svg`.
2. `npm run icons` — corre `scripts/generate-icons.cjs` con Electron (sin dependencias extra) y
   sobrescribe los tres archivos de `electron/icons/`.
3. `npm run electron:build` para que el instalador lleve el ícono nuevo, y commitear
   `electron/icons/`.

La «H» actual es texto en Georgia, así que el resultado depende de las fuentes instaladas en la
máquina que corre el script (Windows y macOS la traen). Un logo oficial con el texto convertido a
trazos no tiene ese problema.

## Setup de MCPs

Este proyecto usa Claude Code con un par de MCP servers para las skills en `.claude/skills/`.

### Context7 (documentación de librerías)

Se usa para traer documentación actualizada de librerías/frameworks (React, Vite, Express, etc.)
en vez de depender solo del conocimiento entrenado del modelo.

```bash
claude mcp add --transport http context7 https://mcp.context7.com/mcp
```

(Si tu instalación de Claude Code ya lo trae configurado globalmente, podés omitir este paso.)

### Linear (tablero de tickets — "The Honeycomb")

Se usa para crear/actualizar los tickets `US-XX` en Linear (workspace `nicky-arias`, team `NIC`) vía las
skills `Tefinha-crea-tickets`, `Honeycomb-executor`, `super-tefinha-QA`, `garyale-sobreexplotados`, `super-tefinha-QA-en-lote` y `Honeycomb-regression` (ver
`.claude/skills/Tefinha-crea-tickets/references/linear-board.md` para el detalle del tablero, su esquema
y el flujo de estados).

1. Agregar el MCP server de Linear:
   ```bash
   claude mcp add --transport http linear https://mcp.linear.app/mcp
   ```
2. Al primer uso, autorizar desde Claude Code con `/mcp` → `linear`: se abre el login de Linear en el
   navegador; elegí el workspace `nicky-arias` y aceptá. No hace falta repetir este paso en cada sesión.
3. Verificá que quedó conectado:
   ```bash
   claude mcp list
   ```

Con ambos MCPs conectados, las skills del repo (`Tefinha-crea-tickets`, `Honeycomb-executor`,
`Start-Honeycomb`, `super-tefinha-QA`, `garyale-sobreexplotados`, `super-tefinha-QA-en-lote`, `Honeycomb-regression`) quedan operativas tal como están documentadas en `.claude/skills/`.

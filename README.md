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
- Una **API key de Gemini** (para el "Smart Doc Parser" — sin ella, el import de logs cae a un
  parser offline determinístico, así que no es estrictamente bloqueante para levantar la app)

## Setup del proyecto

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Copiar `.env.example` a `.env.local` y completar `GEMINI_API_KEY` con tu API key de Gemini:
   ```bash
   cp .env.example .env.local
   ```
3. Correr la app en modo desarrollo (Express + Vite con hot reload, en el navegador):
   ```bash
   npm run dev
   ```
   Por default sirve en `http://localhost:3000`.

### Otros comandos disponibles

- `npm run build` — build de producción (Vite + esbuild bundlea `server.ts` a `dist/server.cjs`)
- `npm start` — corre el build ya generado
- `npm run lint` — chequeo de tipos (`tsc --noEmit`); no hay test suite automatizada todavía
- `npm run electron:start` — compila y abre la app de escritorio (Electron)
- `npm run electron:build` — genera el instalador de escritorio (electron-builder)

## Pre-commit hook (husky + lint-staged)

El repo tiene un hook `pre-commit` (via `husky`) que corre `lint-staged` sobre los archivos
staged. Actualmente eso significa: si hay algún `.ts`/`.tsx` staged, corre `tsc --noEmit` sobre
**todo el proyecto** (el chequeo de tipos de TypeScript no se puede acotar de forma confiable a
un subconjunto de archivos sin perder el `tsconfig.json`). Si falla, el `git commit` se bloquea
hasta corregir el error.

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
tipos (`npm run lint`) y el build de producción (`npm run build`), en ese orden, sobre Node.js 20.
Si alguno de esos pasos falla, el check queda en rojo (❌) en la pestaña **Checks** del PR — no
requiere `GEMINI_API_KEY` ni ninguna otra variable de entorno.

## Setup de MCPs

Este proyecto usa Claude Code con un par de MCP servers para las skills en `.claude/skills/`.

### Context7 (documentación de librerías)

Se usa para traer documentación actualizada de librerías/frameworks (React, Vite, Express, etc.)
en vez de depender solo del conocimiento entrenado del modelo.

```bash
claude mcp add --transport http context7 https://mcp.context7.com/mcp
```

(Si tu instalación de Claude Code ya lo trae configurado globalmente, podés omitir este paso.)

### Notion (tablero de tickets — "The Honeycomb Board")

Se usa para crear/actualizar los tickets `US-XX` en Notion vía las skills `Tefinha-crea-tickets` y
`Honeycomb-executor` (ver `.claude/skills/Tefinha-crea-tickets/references/notion-board.md` para el
detalle del tablero y su esquema).

1. Agregar el MCP server de Notion:
   ```bash
   claude mcp add --transport http notion https://mcp.notion.com/mcp
   ```
2. Al primer uso, Claude te va a pedir autorización: se abre una pantalla de Notion
   ("Connect with Notion MCP") pidiendo que selecciones el workspace (ej. el que tiene acceso a
   **The Honeycomb Board**) y confirmes con **Continue**. Con eso queda autorizado — no hace
   falta repetir este paso en cada sesión.
3. Verificá que quedó conectado:
   ```bash
   claude mcp list
   ```

Con ambos MCPs conectados, las skills del repo (`Tefinha-crea-tickets`, `Honeycomb-executor`,
`Start-Honeycomb`) quedan operativas tal como están documentadas en `.claude/skills/`.

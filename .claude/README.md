# Guardrails de Claude Code en este repo

Este `.claude/` no solo tiene skills (`Start-Honeycomb`, `Tefinha-crea-tickets`,
`Honeycomb-executor`) — también define `settings.json`, la config de Claude Code que aplica a
cualquier agente de IA que trabaje sobre The Honeycomb. Ver US-07 para el ticket que originó esto.

## `settings.json` — allow / ask / deny

| Lista | Patrón | Por qué |
|---|---|---|
| `allow` | `Bash(npm run *)` | Cubre sin fricción todos los scripts de `package.json` (`dev`, `build`, `lint`, `electron:start`, `electron:build`, `clean`, `preview`), incluido el `rm -rf dist server.js` interno del script `clean` — ese `rm -rf` corre *dentro* de `npm run clean`, no como comando suelto, así que no lo bloquea la deny list de abajo. |
| `allow` | `Bash(npm start)` / `Bash(npm start *)` | `npm start` no matchea `npm run *` (no lleva `run`), necesita su propia regla. |
| `ask` | `Bash(git push --force*)` / `Bash(git push -f*)` | Un force-push nunca debería pasar sin que un humano lo confirme en el momento. No es `deny` duro porque un patrón estático no puede distinguir "rama protegida" de una rama de feature propia — `ask` fuerza el prompt siempre, sea cual sea la rama. |
| `deny` | `Bash(rm -rf*)` | Borrado recursivo forzado genérico. Sin excepciones porque no hay ningún flujo legítimo del repo que lo necesite como comando suelto (el único caso legítimo, el de `npm run clean`, ya está cubierto por el `allow` de arriba). |
| `deny` | `Bash(git reset --hard*)` | Descarta cambios sin posibilidad de deshacer vía git normal. |
| `deny` | `Bash(git clean -f*)` | Borra archivos no trackeados sin confirmación de git. |

Todas estas reglas matchean por prefijo (`*` al final = "lo que sea después"), como documenta
Claude Code para patrones de `Bash(...)`.

## Hook `PreToolUse`: `.claude/hooks/guard-writes.cjs`

Corre en cada `Edit`/`Write` (ver el `matcher` en `settings.json`). Es un script de **Node**, no
bash+`jq` — este entorno de desarrollo no tiene `jq` instalado, y Node ya es una dependencia dura
del proyecto. Lee el `tool_input.file_path` por stdin y hace dos chequeos, en orden; si alguno
dispara, devuelve `permissionDecision: "ask"` (nunca bloquea de forma dura — el objetivo es que un
humano confirme, no impedir el flujo):

1. **¿La ruta cae fuera del árbol esperado?** Fuera de la raíz del repo (`CLAUDE_PROJECT_DIR`) y
   fuera de su carpeta padre (donde viven los tickets sueltos `US-*.md`/`.txt`, igual carpeta que ya
   asumen `Tefinha-crea-tickets`, `Honeycomb-executor` y `Start-Honeycomb` para leer/escribir) → se
   pide confirmación. Esto cubre, por ejemplo, que Claude intente escribir en una ruta arbitraria
   del sistema.
2. **¿Es un archivo de datos persistentes?** `honeycomb-data.json` o `honeycomb-config.json` — el
   hook los reconoce tanto por su ruta resuelta (respetando `HONEYCOMB_DB_PATH`/
   `HONEYCOMB_CONFIG_PATH` si están seteadas en el entorno) como por su nombre de archivo pelado, así
   que da igual si apuntan a la raíz del repo (dev, `npm run dev`/`npm start`) o a
   `%APPDATA%\The Honeycomb\...` (empaquetado Electron, ver [[Start-Honeycomb]]) — cualquiera de los
   dos dispara la misma confirmación.

### Por qué esto no frena el desarrollo normal

El hook solo mira esos dos nombres de archivo puntuales. El **seed** de datos de desarrollo vive en
`src/mockData.ts` — código fuente, no el archivo de datos en sí — así que editar el seed, correr
tests manuales, o iterar sobre el código no dispara nada. Lo único que pide confirmación es
sobrescribir el archivo *real* donde vive la asistencia guardada (sea el de dev en la raíz del repo,
o el de producción/Electron bajo `%APPDATA%`), que es exactamente el caso que este guardrail existe
para frenar.

## Qué queda explícitamente fuera (ver Out of Scope de US-07)

Auth de la app en sí, CI/CD, pre-commit hooks (husky/lint-staged — eso es US-09), validación zod de
`server.ts`, cifrado de secretos, hardening de Electron (`webPreferences`/CSP — eso es US-14). Este
`settings.json` cubre únicamente guardrails locales de Claude Code.

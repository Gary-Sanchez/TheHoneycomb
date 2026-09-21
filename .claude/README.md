# Guardrails de Claude Code en este repo

Este `.claude/` no solo tiene skills (`Start-Honeycomb`, `Tefinha-crea-tickets`,
`Honeycomb-executor`) — también define `settings.json`, la config de Claude Code que aplica a
cualquier agente de IA que trabaje sobre The Honeycomb. Ver US-07 para el ticket que originó esto.

## `settings.json` — allow / deny

| Lista | Patrón | Por qué |
|---|---|---|
| `allow` | `Bash(npm run *)` | Cubre sin fricción todos los scripts de `package.json` (`dev`, `build`, `lint`, `electron:start`, `electron:build`, `clean`, `preview`), incluido el `rm -rf dist server.js` interno del script `clean` — ese `rm -rf` corre *dentro* de `npm run clean`, no como comando suelto, así que no lo bloquea la deny list de abajo. |
| `allow` | `Bash(npm start)` / `Bash(npm start *)` | `npm start` no matchea `npm run *` (no lleva `run`), necesita su propia regla. |
| `deny` | `Bash(rm -rf*)` | Borrado recursivo forzado genérico. Sin excepciones porque no hay ningún flujo legítimo del repo que lo necesite como comando suelto (el único caso legítimo, el de `npm run clean`, ya está cubierto por el `allow` de arriba). |
| `deny` | `Bash(git reset --hard*)` | Descarta cambios sin posibilidad de deshacer vía git normal. |
| `deny` | `Bash(git clean -f*)` | Borra archivos no trackeados sin confirmación de git. |
| `deny` | `Bash(git push --force*)` / `Bash(git push -f*)` | Ver más abajo por qué esto pasó de `ask` a `deny` duro. |

Todas estas reglas matchean por **prefijo literal** del string completo del comando (`*` al final =
"lo que sea después"), como documenta Claude Code para patrones de `Bash(...)`. Eso es justo su
límite: **no** matchean si el comando real no empieza exactamente con ese prefijo — por ejemplo
`git -C "<ruta>" reset --hard <ref>` (para no depender de `cd`) o `cd repo && rm -rf ./algo` esquivan
esta lista sin que nadie lo busque a propósito. Por eso esta lista es una primera capa rápida, no la
única — el hook `guard-bash.cjs` de abajo cubre esos casos.

### `ask` ya no se usa para nada destructivo

La versión original de esta historia usaba `ask` para `git push --force`/`-f`, con la idea de que un
humano confirme en el momento sin necesidad de distinguir rama protegida de rama propia. En la
práctica, verificado en vivo durante el QA de US-07: en una sesión automática/no interactiva (sin un
humano contestando el prompt) **`ask` se autoaprueba en silencio** — el comando corre exactamente
igual que si la regla no existiera. Por eso `git push --force`/`-f` pasó a `deny` duro. Esto tiene un
costo real: forzar un push legítimo sobre tu propia rama de feature (típico después de un rebase) ya
no se puede hacer *desde* Claude Code — hay que correrlo a mano fuera del agente. Se aceptó ese costo
porque la alternativa (mantener `ask`) no protegía nada en sesiones automáticas.

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

## Hook `PreToolUse`: `.claude/hooks/guard-bash.cjs`

Corre en cada `Bash` (ver el `matcher` en `settings.json`). Complementa la deny list de arriba
buscando los mismos patrones destructivos (`rm -rf`/`-fr`, `git reset --hard`, `git clean -f*`,
`git push --force`/`-f`) como **substring en cualquier parte del comando completo**, no como prefijo
— así cubre `git -C "<ruta>" reset --hard`, `cd repo && rm -rf ./x`, `--git-dir=...`, etc. A
diferencia de `guard-writes.cjs`, siempre devuelve `permissionDecision: "deny"` (nunca `"ask"`) para
estos casos puntuales — ver la sección de arriba sobre por qué `ask` no alcanza en sesiones
automáticas. Un `git reset`/`git clean` sin el flag de forzado (ej. `git reset --soft`, `git reset
HEAD~1`) no dispara nada; tampoco lo hace un `rm` de un archivo puntual sin `-r`+`-f`.

## Qué queda explícitamente fuera (ver Out of Scope de US-07)

Auth de la app en sí, CI/CD, pre-commit hooks (husky/lint-staged — eso es US-09), validación zod de
`server.ts`, cifrado de secretos, hardening de Electron (`webPreferences`/CSP — eso es US-14). Este
`settings.json` cubre únicamente guardrails locales de Claude Code.

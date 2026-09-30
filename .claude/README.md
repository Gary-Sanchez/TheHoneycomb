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
| `allow` / `deny` | `PowerShell(...)` equivalentes | Ver "La tool `PowerShell`" abajo. |

Todas estas reglas matchean por **prefijo literal** del string completo del comando (`*` al final =
"lo que sea después"), como documenta Claude Code para patrones de `Bash(...)`. Eso es justo su
límite: **no** matchean si el comando real no empieza exactamente con ese prefijo — por ejemplo
`git -C "<ruta>" reset --hard <ref>` (para no depender de `cd`) o `cd repo && rm -rf ./algo` esquivan
esta lista sin que nadie lo busque a propósito. Por eso esta lista es una primera capa rápida, no la
única — el hook `guard-bash.cjs` de abajo cubre esos casos.

### La tool `PowerShell`

En Windows (el entorno principal de este repo) Claude Code tiene una tool `PowerShell` aparte de
`Bash`, y **las reglas `Bash(...)` no aplican a ella**: sin reglas propias, `git reset --hard`,
`git push --force` o `Remove-Item -Recurse -Force .\src` corrían por PowerShell sin ningún freno.
Por eso `settings.json` repite la lista con `PowerShell(...)`:

- `allow`: `PowerShell(npm run *)`, `PowerShell(npm start)`, `PowerShell(npm start *)` (misma razón
  que sus equivalentes `Bash`).
- `deny`: `PowerShell(git reset --hard*)`, `PowerShell(git clean -f*)`,
  `PowerShell(git push --force*)`, `PowerShell(git push -f*)`,
  `PowerShell(Remove-Item *-Recurse*-Force*)` y `PowerShell(Remove-Item *-Force*-Recurse*)`.

Según la doc de permisos de Claude Code, las reglas `PowerShell(...)` tienen la misma forma que las
de `Bash`, el `*` matchea en cualquier posición, el match no distingue mayúsculas y los alias
comunes se canonicalizan (una regla sobre `Remove-Item` también cubre `rm`/`del`/`ri`...). No hay un
`PowerShell(rm -rf*)`: en PowerShell `rm` es alias de `Remove-Item`, y `rm -rf` falla con error de
parámetro — el borrado real es `-Recurse -Force`. Las reglas `Remove-Item` solo cubren los nombres
completos de los flags; los prefijos (`-r`, `-fo`) los cubre el hook.

El hook `guard-bash.cjs` también corre para `PowerShell` (`"matcher": "Bash|PowerShell"`) y lee el
mismo campo `tool_input.command`.

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

Corre en cada `Edit`/`Write`/`NotebookEdit` (ver el `matcher` en `settings.json`). Es un script de
**Node**, no bash+`jq` — este entorno de desarrollo no tiene `jq` instalado, y Node ya es una
dependencia dura del proyecto. Lee el `tool_input.file_path` (o `notebook_path` para
`NotebookEdit`) por stdin y hace dos chequeos, en orden; si alguno
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
   dos dispara la misma confirmación. En Windows (NTFS) y macOS (APFS por defecto) la comparación
   **no distingue mayúsculas**: `Honeycomb-Data.json` es el mismo archivo en disco, así que también
   pide confirmación. En Linux se compara exacto (ahí son archivos distintos).

### Qué no cubre

`guard-writes.cjs` solo intercepta las tools de edición de archivos (`Edit`, `Write`,
`NotebookEdit`), que es lo que pide el criterio de aceptación de US-07. Una escritura hecha **desde
un shell** (`echo ... > honeycomb-data.json`, `cp`, `Set-Content`, `Out-File`, un script de Node,
etc.) no pasa por este hook — el hook de shell (`guard-bash.cjs`) solo busca los patrones
destructivos de abajo, no redirecciones ni copias. Cubrir eso con fiabilidad requeriría parsear
redirecciones y argumentos de cada comando que escribe; queda fuera de alcance.

### Por qué esto no frena el desarrollo normal

El hook solo mira esos dos nombres de archivo puntuales. El **seed** de datos de desarrollo vive en
`src/mockData.ts` — código fuente, no el archivo de datos en sí — así que editar el seed, correr
tests manuales, o iterar sobre el código no dispara nada. Lo único que pide confirmación es
sobrescribir el archivo *real* donde vive la asistencia guardada (sea el de dev en la raíz del repo,
o el de producción/Electron bajo `%APPDATA%`), que es exactamente el caso que este guardrail existe
para frenar.

## Hook `PreToolUse`: `.claude/hooks/guard-bash.cjs`

Corre en cada `Bash` y cada `PowerShell` (`"matcher": "Bash|PowerShell"`). Complementa la deny
list de arriba buscando los patrones destructivos **en cualquier statement del comando**, no solo
como prefijo del string. A diferencia de `guard-writes.cjs`, siempre devuelve
`permissionDecision: "deny"` (nunca `"ask"`) — ver la sección de arriba sobre por qué `ask` no
alcanza en sesiones automáticas.

**Qué bloquea:**

| Patrón | Detalle |
|---|---|
| `rm` recursivo + forzado (Bash) | `-rf`, `-fr`, `-Rf`, `-r -f`, `--recursive --force`, flags al final (`rm ./x -rf`). |
| `Remove-Item` con `-Recurse` y `-Force` (PowerShell) | También los alias `rm`, `ri`, `del`, `rd`, `rmdir`, `erase`. Los flags de PowerShell no distinguen mayúsculas y aceptan prefijos no ambiguos (`-r`, `-Rec`, `-fo`, `-Forc`), también con guion largo (`–Force`) y `-Force:$true`. **Decisión:** `-f` solo es ambiguo para `Remove-Item` (`-Force`/`-Filter`) y PowerShell lo rechaza con error, pero el hook lo trata como `-Force` a propósito — bloquear un comando que igual iba a fallar no cuesta nada. `-Force:$false` no cuenta. `-Recurse` sin `-Force` (o al revés) no se bloquea. |
| `rd /s /q`, `del /s /q` (cmd.exe) | Cuando llega vía `cmd /c ...` (o `cmd //c` desde Git Bash). |
| `git reset --hard` | En cualquier posición tras opciones globales (`git -C "<ruta con espacios>"`, `git -c k=v`). |
| `git clean` con `-f`/`--force` | Salvo que venga `-n`/`--dry-run` (no borra nada), ej. `git clean -n -f` pasa. |
| `git push` forzado | `--force`, `-f` (también agrupado), `--force-with-lease`, `--force-if-includes`, o un refspec con `+` (`git push origin +b:main`). |

**Cómo encuentra el comando real** (esto es lo que la deny list por prefijo no puede hacer):

- **Separadores:** `;`, `&&`, `||`, `|`, `&`, **saltos de línea** (`\n`, `\r\n`), y los agrupadores
  `( ... )` / `{ ... }` (subshells, bloques, script blocks de PowerShell como
  `ForEach-Object { Remove-Item ... }`). Una continuación de línea (`\` o `` ` `` + newline) no
  separa.
- **Wrappers:** `sudo`, `doas`, `env` (incluidos `VAR=val` y `env -S "..."`), `command`, `builtin`,
  `exec`, `nohup`, `time`, `nice`, `timeout`, `stdbuf`, `xargs` — se saltan con sus opciones y se
  analiza el comando que ejecutan. También `find ... -exec|-execdir|-ok <cmd>`. Aplica igual a los
  detectores de git (`sudo git push --force`).
- **Shells anidados, re-analizados recursivamente:** `bash|sh|zsh|dash|ksh|fish -c "<cmd>"` (y
  `-lc`, `-ec`...), `bash <<EOF ... EOF`, `pwsh|powershell -Command "<cmd>"` (o sin `-Command`),
  `-EncodedCommand <base64>` (se decodifica), `cmd /c "<cmd>"`, `eval "<cmd>"`,
  `Invoke-Expression`/`iex`, y sustituciones de comando `$(...)`, `` `...` ``, `<(...)`.
- **Indirección simple por variable:** `X=rm; $X -rf ./d`, `G=git; ${G} push --force`.
- **Ruta o extensión del ejecutable:** `/bin/rm`, `git.exe`, `"C:\...\git.exe"`; el nombre del
  comando se compara sin distinguir mayúsculas.

**Qué no dispara nada (a propósito):** texto que solo *menciona* los patrones — dentro de comillas
(`git commit -m "... rm -rf ..."`, `echo "git push --force"`), cuerpos de heredoc que no van a un
shell (el patrón `git commit -m "$(cat <<'EOF' ... EOF)"`), here-strings de PowerShell
(`@' ... '@`) y comentarios (`# ...`, `<# ... #>`). Tampoco `git reset --soft`, `git reset HEAD~1`,
`rm file.txt`, `rm -r dir` (sin `-f`), `Remove-Item .\file.txt`, `Get-ChildItem -Recurse -Force`.

**Límites conocidos:** es una heurística sobre texto, no un shell real. Cierra las variantes que un
agente genera sin querer, pero no resiste ofuscación deliberada: aliases de git
(`git config alias.x 'reset --hard'`), variables construidas por partes o en PowerShell
(`$x = 'git'; & $x reset --hard`), splatting (`Remove-Item @params`), scripts en archivos
(`bash script.sh`), APIs de .NET (`[IO.Directory]::Delete(..., $true)`), etc. Si el parser mismo
falla con una excepción, el hook niega por precaución.

## Tests de los hooks

`.claude/hooks/guard-bash.test.cjs` y `.claude/hooks/guard-writes.test.cjs` usan `node:test` (sin
dependencias): cada caso lanza el hook real con un payload JSON por stdin, igual que Claude Code, y
verifica la decisión (`deny`/`ask`/ninguna). Cubren todos los patrones de arriba, los casos del QA de
US-07 y los comandos normales que tienen que seguir pasando sin decisión. Correr desde la raíz del
repo (Node ≥ 21, que expande el glob solo — funciona igual en Bash y en PowerShell):

```sh
node --test .claude/hooks/*.test.cjs
```

Al cambiar cualquiera de los dos hooks, agregá el caso nuevo a su test y corré esto antes de
commitear. (No los toma Vitest ni Playwright: son `.cjs`, no `*.test.ts` / `e2e/*.spec.ts`.)

## Qué queda explícitamente fuera (ver Out of Scope de US-07)

Auth de la app en sí, CI/CD, pre-commit hooks (husky/lint-staged — eso es US-09), validación zod de
`server.ts`, cifrado de secretos, hardening de Electron (`webPreferences`/CSP — eso es US-14). Este
`settings.json` cubre únicamente guardrails locales de Claude Code.

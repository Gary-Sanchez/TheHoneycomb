#!/usr/bin/env node
// PreToolUse hook (Bash | PowerShell) — ver US-07 y .claude/README.md.
//
// Por qué existe además de la deny list de settings.json: esas reglas
// (`Bash(rm -rf*)`, `PowerShell(git reset --hard*)`, ...) hacen *prefix match*
// sobre el string literal del comando. Cualquier variante que no empiece
// exactamente con ese prefijo la esquiva sin querer — por ejemplo
// `git -C "<ruta>" reset --hard <ref>`, `cd repo && rm -rf ./algo`,
// `sudo rm -rf ./x`, `bash -c "rm -rf ./x"` o un comando en otra línea.
// Este hook tokeniza el comando completo (respetando comillas, heredocs,
// here-strings de PowerShell y comentarios), lo parte en statements (`;`, `&&`,
// `||`, `|`, `&`, saltos de línea, `(...)`, `{...}`), salta wrappers
// (`sudo`, `env`, `xargs`, `find -exec`, ...), re-analiza recursivamente lo
// que corre un shell anidado (`bash -c`, `pwsh -Command`, `cmd /c`, `eval`,
// `$(...)`, backticks) y busca los patrones destructivos en cada uno.
//
// Devuelve "deny" (bloqueo duro), nunca "ask": "ask" se autoaprueba en
// sesiones automáticas/no interactivas, así que para esto no protege nada.
//
// Es una heurística sobre texto, no un shell real: está pensada para cerrar
// las variantes que un agente genera sin querer, no para resistir a alguien
// que ofusca a propósito (ver "Límites conocidos" en .claude/README.md).

const HEREDOC = "\u0000HEREDOC:";
const MAX_DEPTH = 8;

function deny(reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

// Busca el `)` que cierra un `(` ya abierto antes de `start`. Ignora
// paréntesis dentro de comillas. Devuelve su índice (o cmd.length si no
// cierra).
function findClosingParen(cmd, start) {
  let depth = 1;
  let i = start;
  while (i < cmd.length) {
    const c = cmd[i];
    if (c === "'" || c === '"') {
      const j = cmd.indexOf(c, i + 1);
      i = j === -1 ? cmd.length : j + 1;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return cmd.length;
}

// Tokeniza un comando. `mode` es "bash", "powershell" o "cmd" y cambia el
// carácter de escape (`\` en bash, `` ` `` en PowerShell, ninguno en cmd) y
// qué construcciones se reconocen. Devuelve tokens (strings); los separadores
// de statement salen como tokens formados solo por `;`, `&` o `|`. Cada
// sustitución de comando encontrada (`$(...)`, `` `...` ``, `<(...)`) se agrega
// a `subs` para analizarla aparte. Los cuerpos de heredoc salen como un token
// con prefijo HEREDOC, pegado al statement que los recibe.
function tokenize(cmd, mode, subs) {
  const tokens = [];
  const pendingHeredocs = [];
  const esc = mode === "bash" ? "\\" : mode === "powershell" ? "`" : null;
  let cur = "";
  let i = 0;
  const n = cmd.length;

  const flush = () => {
    if (cur !== "") {
      tokens.push(cur);
      cur = "";
    }
  };

  // `openIdx` apunta al "(" de "$(" / "<(" / ">(". Devuelve el índice
  // siguiente al ")" de cierre.
  const readSubstitution = (openIdx) => {
    const close = findClosingParen(cmd, openIdx + 1);
    subs.push({ text: cmd.slice(openIdx + 1, close), mode });
    return close + 1;
  };

  // bash: `...` es sustitución de comando.
  const readBacktick = (idx) => {
    let j = idx + 1;
    while (j < n && cmd[j] !== "`") {
      if (cmd[j] === "\\") j++;
      j++;
    }
    subs.push({ text: cmd.slice(idx + 1, j), mode });
    return j + 1;
  };

  const consumeHeredocs = (start) => {
    let pos = start;
    while (pendingHeredocs.length) {
      const { delim, stripTabs } = pendingHeredocs.shift();
      let body = "";
      while (pos < n) {
        let end = cmd.indexOf("\n", pos);
        if (end === -1) end = n;
        const line = cmd.slice(pos, end).replace(/\r$/, "");
        pos = end + 1;
        const cmp = stripTabs ? line.replace(/^\t+/, "") : line;
        if (cmp === delim) break;
        body += line + "\n";
      }
      tokens.push(HEREDOC + body);
    }
    return Math.min(pos, n);
  };

  while (i < n) {
    const c = cmd[i];

    // Continuación de línea (`\` + newline en bash, `` ` `` + newline en PS).
    if (esc && c === esc && (cmd[i + 1] === "\n" || (cmd[i + 1] === "\r" && cmd[i + 2] === "\n"))) {
      i += cmd[i + 1] === "\r" ? 3 : 2;
      continue;
    }
    // Carácter escapado: se toma literal.
    if (esc && c === esc && i + 1 < n) {
      cur += cmd[i + 1];
      i += 2;
      continue;
    }

    // Salto de línea = separador de comandos (fuera de comillas).
    if (c === "\n" || c === "\r") {
      flush();
      if (c === "\r" && cmd[i + 1] === "\n") i++;
      i++;
      if (pendingHeredocs.length) i = consumeHeredocs(i);
      tokens.push(";");
      continue;
    }

    // Comentarios: `<# ... #>` en PowerShell; `#` al inicio de palabra
    // (bash/PS) hasta fin de línea.
    if (mode === "powershell" && c === "<" && cmd[i + 1] === "#") {
      const end = cmd.indexOf("#>", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (mode !== "cmd" && c === "#" && cur === "") {
      while (i < n && cmd[i] !== "\n" && cmd[i] !== "\r") i++;
      continue;
    }

    // Here-strings de PowerShell: @'<nl> ... <nl>'@ y @"<nl> ... <nl>"@.
    // Su contenido es dato (salvo `$(...)` dentro de @"..."@).
    if (mode === "powershell" && c === "@" && (cmd[i + 1] === "'" || cmd[i + 1] === '"')) {
      const q = cmd[i + 1];
      const m = /^[ \t]*\r?\n/.exec(cmd.slice(i + 2));
      if (m) {
        const bodyStart = i + 2 + m[0].length;
        const re = new RegExp("\\r?\\n" + q + "@");
        const tail = re.exec(cmd.slice(bodyStart));
        const bodyEnd = tail ? bodyStart + tail.index : n;
        const body = cmd.slice(bodyStart, bodyEnd);
        if (q === '"') {
          for (let k = body.indexOf("$("); k !== -1; k = body.indexOf("$(", k + 2)) {
            const close = findClosingParen(body, k + 2);
            subs.push({ text: body.slice(k + 2, close), mode });
          }
        }
        cur += body === "" ? "''" : body;
        i = tail ? bodyEnd + tail[0].length : n;
        continue;
      }
    }

    // Heredocs de bash: <<DELIM / <<-DELIM / <<'DELIM'. El cuerpo es dato
    // (no se analiza como comandos) salvo que lo reciba un shell.
    if (mode === "bash" && c === "<" && cmd[i + 1] === "<") {
      if (cmd[i + 2] === "<") {
        cur += "<<<";
        i += 3;
        continue;
      }
      flush();
      let j = i + 2;
      let stripTabs = false;
      if (cmd[j] === "-") {
        stripTabs = true;
        j++;
      }
      while (cmd[j] === " " || cmd[j] === "\t") j++;
      let delim = "";
      while (j < n && !/[\s;&|<>()]/.test(cmd[j])) {
        if (cmd[j] === "'" || cmd[j] === '"') {
          const q = cmd[j];
          j++;
          while (j < n && cmd[j] !== q) delim += cmd[j++];
          j++;
        } else if (cmd[j] === "\\") {
          j++;
          if (j < n) delim += cmd[j++];
        } else {
          delim += cmd[j++];
        }
      }
      if (delim) pendingHeredocs.push({ delim, stripTabs });
      i = j;
      continue;
    }

    // Comillas simples: literal (en PS, '' dentro es una comilla escapada).
    if (c === "'" && mode !== "cmd") {
      let j = i + 1;
      let buf = "";
      while (j < n) {
        if (cmd[j] === "'") {
          if (mode === "powershell" && cmd[j + 1] === "'") {
            buf += "'";
            j += 2;
            continue;
          }
          break;
        }
        buf += cmd[j++];
      }
      cur += buf === "" && cur === "" ? "''" : buf;
      i = j + 1;
      continue;
    }

    // Comillas dobles: literal salvo escapes y sustituciones de comando.
    if (c === '"') {
      let j = i + 1;
      let buf = "";
      while (j < n && cmd[j] !== '"') {
        const d = cmd[j];
        if (mode === "bash" && d === "\\" && j + 1 < n) {
          buf += cmd[j + 1];
          j += 2;
          continue;
        }
        if (mode === "powershell" && d === "`" && j + 1 < n) {
          buf += cmd[j + 1];
          j += 2;
          continue;
        }
        if (mode !== "cmd" && d === "$" && cmd[j + 1] === "(") {
          const end = readSubstitution(j + 1);
          buf += cmd.slice(j, end);
          j = end;
          continue;
        }
        if (mode === "bash" && d === "`") {
          const end = readBacktick(j);
          buf += cmd.slice(j, end);
          j = end;
          continue;
        }
        buf += d;
        j++;
      }
      cur += buf === "" && cur === "" ? '""' : buf;
      i = j + 1;
      continue;
    }

    // Sustitución de comando fuera de comillas: $(...), <(...), >(...), `...`.
    if (mode !== "cmd" && c === "$" && cmd[i + 1] === "(") {
      const end = readSubstitution(i + 1);
      cur += cmd.slice(i, end);
      i = end;
      continue;
    }
    if (mode === "bash" && (c === "<" || c === ">") && cmd[i + 1] === "(") {
      flush();
      i = readSubstitution(i + 1);
      continue;
    }
    if (mode === "bash" && c === "`") {
      const end = readBacktick(i);
      cur += cmd.slice(i, end);
      i = end;
      continue;
    }

    // ${VAR} / ${env:X}: se lee literal hasta la llave de cierre.
    if (mode !== "cmd" && c === "$" && cmd[i + 1] === "{") {
      const end = cmd.indexOf("}", i + 2);
      const stop = end === -1 ? n : end + 1;
      cur += cmd.slice(i, stop);
      i = stop;
      continue;
    }

    // `{}` literal (placeholder de find/xargs): no es un bloque.
    if (c === "{" && cmd[i + 1] === "}") {
      cur += "{}";
      i += 2;
      continue;
    }

    // Agrupadores: (...) subshell, {...} bloque / script block. Se tratan
    // como separadores para que el comando de adentro quede en posición de
    // comando (`(rm -rf ./x)`, `{ rm -rf ./x; }`, `% { Remove-Item ... }`).
    if (c === "(" || c === ")" || c === "{" || c === "}") {
      flush();
      tokens.push(";");
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      flush();
      i++;
      continue;
    }

    if (c === "&" || c === "|" || c === ";") {
      flush();
      let j = i;
      while (j < n && "&|;".includes(cmd[j])) j++;
      tokens.push(cmd.slice(i, j));
      i = j;
      continue;
    }

    cur += c;
    i++;
  }
  flush();
  if (pendingHeredocs.length) consumeHeredocs(n);
  return tokens;
}

function isSeparator(tok) {
  return /^[&|;]+$/.test(tok);
}

function splitStatements(tokens) {
  const statements = [[]];
  for (const t of tokens) {
    if (isSeparator(t)) statements.push([]);
    else statements[statements.length - 1].push(t);
  }
  return statements.filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Resolución del comando real de un statement
// ---------------------------------------------------------------------------

function commandName(token) {
  return token
    .replace(/^.*[\\/]/, "")
    .replace(/\.(exe|cmd|bat|com)$/i, "")
    .toLowerCase();
}

function isAssignment(tok) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok);
}

// `$X` / `${X}` resuelto contra las asignaciones vistas antes en el mismo
// comando (`X=rm; $X -rf ./x`).
function resolveVarRef(tok, vars) {
  const m = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(tok);
  if (!m) return null;
  return vars.has(m[1]) ? vars.get(m[1]) : null;
}

// Wrappers que ejecutan el comando que les sigue. Para cada uno: opciones que
// consumen el token siguiente como argumento, y cuántos posicionales hay
// antes del comando (ej. la duración de `timeout`).
const WRAPPERS = {
  sudo: { argOpts: ["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U", "-T"] },
  doas: { argOpts: ["-u", "-C"] },
  env: { argOpts: ["-u", "-C", "-S", "--unset", "--chdir", "--split-string"] },
  command: { argOpts: [] },
  builtin: { argOpts: [] },
  exec: { argOpts: ["-a"] },
  nohup: { argOpts: [] },
  time: { argOpts: ["-f", "-o", "--format", "--output"] },
  nice: { argOpts: ["-n", "--adjustment"] },
  timeout: { argOpts: ["-s", "-k", "--signal", "--kill-after"], positional: 1 },
  stdbuf: { argOpts: ["-i", "-o", "-e"] },
  xargs: {
    argOpts: [
      "-I", "-n", "-P", "-L", "-s", "-d", "-E", "-a",
      "--max-args", "--max-procs", "--delimiter", "--arg-file", "--max-lines", "--max-chars",
    ],
  },
};

// Cuántos tokens de `rest` ocupan las opciones (y posicionales) del wrapper.
function skipWrapperOptions(spec, rest) {
  let k = 0;
  while (k < rest.length) {
    const t = rest[k];
    if (t === "--") {
      k++;
      break;
    }
    if (!t.startsWith("-") || t === "-") break;
    k += spec.argOpts.includes(t) ? 2 : 1;
  }
  k += spec.positional || 0;
  return Math.min(k, rest.length);
}

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "mksh", "ash", "fish"]);
const PWSH = new Set(["pwsh", "powershell", "pwsh-preview"]);
const PWSH_COMMAND_FLAG = /^[-/](c|co|com|comm|comma|comman|command)$/i;
const PWSH_ENCODED_FLAG = /^[-/](e|ec|en|enc|encodedcommand|encodedcomman|encodedcomma|encodedcomm|encodedcom|encodedco|encodedc|encoded|encode|encod|enco)$/i;
const PWSH_OPTS_WITH_ARG = /^[-/](ex|ep|executionpolicy|w|windowstyle|version|v|psconsolefile|inputformat|inf|if|outputformat|of|configurationname|config|workingdirectory|wd|settingsfile|file|f)$/i;

// ---------------------------------------------------------------------------
// Detectores
// ---------------------------------------------------------------------------

// GNU rm: -r/-R/--recursive + -f/--force, juntos o separados, en cualquier
// posición (antes de `--`).
function isRmRecursiveForce(rest) {
  let hasR = false;
  let hasF = false;
  for (const tok of rest) {
    if (tok === "--") break;
    if (tok === "--recursive") hasR = true;
    if (tok === "--force") hasF = true;
    if (/^-[a-zA-Z]+$/.test(tok)) {
      if (/[rR]/.test(tok)) hasR = true;
      if (/[fF]/.test(tok)) hasF = true;
    }
  }
  return hasR && hasF;
}

// PowerShell Remove-Item (y sus alias): -Recurse + -Force. Los nombres de
// parámetro de PowerShell no distinguen mayúsculas y aceptan cualquier prefijo
// no ambiguo (-r, -Rec, -fo, -forc...), también con guion largo (– — ―).
// `-f` solo es ambiguo para Remove-Item (-Force / -Filter) y PowerShell lo
// rechaza con error, pero acá se trata como -Force a propósito: conservador,
// bloquear algo que igual iba a fallar no cuesta nada. `-Force:$false` /
// `-Recurse:$false` no cuentan.
const REMOVE_ITEM_NAMES = new Set(["remove-item", "rm", "ri", "del", "rd", "rmdir", "erase"]);

function isRemoveItemRecurseForce(rest) {
  let hasR = false;
  let hasF = false;
  for (const tok of rest) {
    const m = /^[-–—―]([A-Za-z]+)(?::(.*))?$/.exec(tok);
    if (!m) continue;
    const p = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2].trim().toLowerCase() : null;
    if (value === "$false" || value === "0") continue;
    if ("recurse".startsWith(p)) hasR = true;
    if ("force".startsWith(p)) hasF = true;
  }
  return hasR && hasF;
}

// cmd.exe: rd/rmdir /s /q y del/erase /s /q (desde Git Bash se escribe `//s`).
function isCmdRecursiveQuietDelete(name, rest) {
  if (!["rd", "rmdir", "del", "erase"].includes(name)) return false;
  const parts = rest
    .filter((t) => t.startsWith("/"))
    .flatMap((t) => t.toLowerCase().split("/").filter(Boolean));
  return parts.includes("s") && parts.includes("q");
}

function gitArgsAfter(rest, sub) {
  const idx = rest.indexOf(sub);
  return idx === -1 ? null : rest.slice(idx + 1);
}

function isGitResetHard(rest) {
  const args = gitArgsAfter(rest, "reset");
  return !!args && args.includes("--hard");
}

function isGitCleanForce(rest) {
  const args = gitArgsAfter(rest, "clean");
  if (!args) return false;
  // "-n"/"--dry-run" es un no-op de git clean incluso si también viene "-f":
  // no borra nada, así que no debe denegarse.
  const isDryRun = args.some(
    (tok) => tok === "--dry-run" || (/^-[a-zA-Z]+$/.test(tok) && /n/.test(tok))
  );
  if (isDryRun) return false;
  return args.some((tok) => tok === "--force" || (/^-[a-zA-Z]+$/.test(tok) && /f/i.test(tok)));
}

function isGitPushForce(rest) {
  const args = gitArgsAfter(rest, "push");
  if (!args) return false;
  return args.some(
    (tok) =>
      tok === "--force" ||
      tok.startsWith("--force-with-lease") ||
      tok === "--force-if-includes" ||
      // -f, también agrupado con otros short flags (-fu, -uf).
      (/^-[a-zA-Z]+$/.test(tok) && /f/.test(tok)) ||
      // Refspec con prefijo "+" (ej. "+feature:main") fuerza el push sin
      // necesidad de "-f"/"--force" — es la sintaxis estándar de git.
      tok.startsWith("+")
  );
}

const REASONS = {
  rm:
    'el comando contiene un borrado recursivo forzado ("rm -rf" o equivalente, también detrás de ' +
    "sudo/env/xargs/find -exec/bash -c/subshells)",
  removeItem:
    'el comando contiene un "Remove-Item" (o alias rm/ri/del/rd/rmdir/erase) con -Recurse y -Force ' +
    "(o prefijos como -r/-fo)",
  cmdDelete: 'el comando contiene un borrado recursivo silencioso de cmd.exe ("rd /s /q" / "del /s /q")',
  reset: 'el comando contiene "git reset --hard", que descarta cambios sin poder deshacerlos',
  clean:
    'el comando contiene "git clean" con un flag de forzado (ej. -f/-fd), que borra archivos no ' +
    "trackeados sin confirmación de git",
  push:
    'el comando contiene un push forzado ("--force"/"-f"/"--force-with-lease" o un refspec "+..."). ' +
    'Un force-push nunca debería salir de un agente sin que un humano lo corra a mano — "ask" no ' +
    "alcanza en sesiones automáticas. Si hace falta forzar un push (ej. tras un rebase en tu propia " +
    "rama de feature), corré ese comando vos mismo fuera de Claude Code",
};

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------

// Devuelve el motivo de denegación, o null si el comando no matchea nada.
function analyze(command, mode, depth, vars) {
  if (depth > MAX_DEPTH || typeof command !== "string" || !command.trim()) return null;
  const subs = [];
  const statements = splitStatements(tokenize(command, mode, subs));
  const scope = vars || new Map();
  for (const statement of statements) {
    const reason = analyzeStatement(statement, mode, depth, scope);
    if (reason) return reason;
  }
  for (const sub of subs) {
    const reason = analyze(sub.text, sub.mode, depth + 1, new Map(scope));
    if (reason) return reason;
  }
  return null;
}

function analyzeStatement(statement, mode, depth, vars) {
  const heredocs = statement
    .filter((t) => t.startsWith(HEREDOC))
    .map((t) => t.slice(HEREDOC.length));
  const toks = statement.filter((t) => !t.startsWith(HEREDOC));
  let i = 0;

  for (;;) {
    // Asignaciones como prefijo (`FOO=bar cmd`, `X=rm; $X -rf`).
    while (i < toks.length && isAssignment(toks[i])) {
      const eq = toks[i].indexOf("=");
      vars.set(toks[i].slice(0, eq), toks[i].slice(eq + 1));
      i++;
    }
    if (i >= toks.length) return null;

    const resolved = resolveVarRef(toks[i], vars);
    const name = commandName(resolved !== null ? resolved : toks[i]);
    const rest = toks.slice(i + 1);

    // sudo / env / xargs / nohup / ...: el comando real viene después.
    if (Object.prototype.hasOwnProperty.call(WRAPPERS, name)) {
      if (name === "env") {
        // `env -S "cmd args"` parte el string y lo ejecuta.
        const sIdx = rest.findIndex((t) => t === "-S" || t === "--split-string");
        if (sIdx !== -1 && rest[sIdx + 1]) {
          const r = analyze(rest[sIdx + 1], "bash", depth + 1, new Map(vars));
          if (r) return r;
        }
      }
      i = i + 1 + skipWrapperOptions(WRAPPERS[name], rest);
      continue;
    }

    // Shells anidados: bash -c "<cmd>" (también -lc, -ec, ...).
    if (SHELLS.has(name)) {
      const cIdx = rest.findIndex((t) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(t));
      if (cIdx !== -1 && rest[cIdx + 1] !== undefined) {
        return analyze(rest[cIdx + 1], "bash", depth + 1, new Map(vars));
      }
      // `bash <<EOF ... EOF`: el heredoc es el script.
      for (const body of heredocs) {
        const r = analyze(body, "bash", depth + 1, new Map(vars));
        if (r) return r;
      }
      return null;
    }

    // pwsh / powershell -Command "<cmd>" | -EncodedCommand <base64>.
    if (PWSH.has(name)) {
      const encIdx = rest.findIndex((t) => PWSH_ENCODED_FLAG.test(t));
      if (encIdx !== -1 && rest[encIdx + 1]) {
        const decoded = Buffer.from(rest[encIdx + 1], "base64").toString("utf16le");
        const r = analyze(decoded, "powershell", depth + 1, new Map());
        if (r) return r;
      }
      const cIdx = rest.findIndex((t) => PWSH_COMMAND_FLAG.test(t));
      let script;
      if (cIdx !== -1) {
        script = rest.slice(cIdx + 1).join(" ");
      } else {
        // Sin -Command: Windows PowerShell 5.1 toma los posicionales como
        // comando (pwsh 7 como -File). Se analizan igual, por las dudas.
        const positional = [];
        for (let k = 0; k < rest.length; k++) {
          if (positional.length === 0 && /^[-/]/.test(rest[k])) {
            if (PWSH_OPTS_WITH_ARG.test(rest[k])) k++;
            continue;
          }
          positional.push(rest[k]);
        }
        script = positional.join(" ");
      }
      const r = analyze(script, "powershell", depth + 1, new Map());
      if (r) return r;
      for (const body of heredocs) {
        const rh = analyze(body, "powershell", depth + 1, new Map());
        if (rh) return rh;
      }
      return null;
    }

    // cmd /c "<cmd>" (o //c desde Git Bash).
    if (name === "cmd") {
      const cIdx = rest.findIndex((t) => /^\/\/?[ck]$/i.test(t));
      if (cIdx !== -1) return analyze(rest.slice(cIdx + 1).join(" "), "cmd", depth + 1, new Map());
      return null;
    }

    // eval / Invoke-Expression: el resto es código.
    if (name === "eval" && mode !== "powershell") {
      return analyze(rest.join(" "), "bash", depth + 1, new Map(vars));
    }
    if (mode === "powershell" && (name === "invoke-expression" || name === "iex")) {
      const args = rest.filter((t) => !PWSH_COMMAND_FLAG.test(t));
      return analyze(args.join(" "), "powershell", depth + 1, new Map());
    }

    // find ... -exec / -execdir / -ok / -okdir <cmd> {} + | \;
    if (name === "find") {
      for (let k = 0; k < rest.length; k++) {
        if (/^-(exec|execdir|ok|okdir)$/.test(rest[k])) {
          const r = analyzeStatement(rest.slice(k + 1), mode, depth + 1, new Map(vars));
          if (r) return r;
        }
      }
      return null;
    }

    // --- Detectores sobre el comando real ---
    if (name === "git") {
      if (isGitResetHard(rest)) return REASONS.reset;
      if (isGitCleanForce(rest)) return REASONS.clean;
      if (isGitPushForce(rest)) return REASONS.push;
      return null;
    }
    if (mode === "powershell") {
      // En PowerShell `rm` es alias de Remove-Item, no GNU rm.
      if (REMOVE_ITEM_NAMES.has(name) && isRemoveItemRecurseForce(rest)) return REASONS.removeItem;
      return null;
    }
    if (mode === "cmd") {
      if (isCmdRecursiveQuietDelete(name, rest)) return REASONS.cmdDelete;
      return null;
    }
    if (name === "rm" && isRmRecursiveForce(rest)) return REASONS.rm;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entrada del hook
// ---------------------------------------------------------------------------

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // no se pudo parsear: seguir el flujo normal de permisos
  }

  const command = input && input.tool_input && input.tool_input.command;
  if (!command || typeof command !== "string") process.exit(0);

  const mode = input.tool_name === "PowerShell" ? "powershell" : "bash";
  let reason;
  try {
    reason = analyze(command, mode, 0, null);
  } catch (err) {
    // Un bug del parser no debe dejar pasar el comando en silencio: se
    // bloquea con el motivo y el humano puede correrlo a mano.
    reason = `el análisis del comando falló (${err && err.message}); se bloquea por precaución`;
  }
  if (reason) {
    deny(
      `US-07: ${reason}: "${command}". Confirmá manualmente fuera de Claude Code si de verdad hace falta.`
    );
    return;
  }
  process.exit(0);
});

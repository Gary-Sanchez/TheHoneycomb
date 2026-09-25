#!/usr/bin/env node
// PreToolUse hook (Bash) — ver US-07 y .claude/README.md.
//
// Por qué existe además de la deny list de settings.json: esas reglas
// (`Bash(rm -rf*)`, `Bash(git reset --hard*)`, ...) hacen *prefix match* sobre
// el string literal del comando. Cualquier variante que no empiece exactamente
// con ese prefijo la esquiva sin querer — por ejemplo `git -C "<ruta>" reset
// --hard <ref>` (para no depender de `cd`) o `cd repo && rm -rf ./algo`. Este
// hook tokeniza el comando completo (respetando comillas, incluso con rutas
// que tienen espacios como las de este repo) y busca los mismos patrones
// destructivos en cualquier posición, no solo al principio del string.
// Devuelve "deny" (bloqueo duro), nunca "ask": "ask" se autoaprueba en
// sesiones automáticas/no interactivas, así que para esto no protege nada.

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

// Tokeniza un comando de shell respetando comillas simples/dobles (el
// contenido entre comillas se toma literal, sin partir por espacios), y
// separa los operadores de encadenado (&&, ||, ;, |) como tokens propios.
function tokenize(cmd) {
  const tokens = [];
  let cur = "";
  let i = 0;
  const n = cmd.length;
  while (i < n) {
    const c = cmd[i];
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let buf = "";
      while (j < n && cmd[j] !== quote) {
        buf += cmd[j];
        j++;
      }
      cur += buf;
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
      i++;
      continue;
    }
    if (c === "&" || c === "|" || c === ";") {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
      let j = i;
      while (j < n && "&|;".includes(cmd[j])) j++;
      tokens.push(cmd.slice(i, j));
      i = j;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

const SEPARATORS = new Set(["&&", "||", ";", "|"]);

function splitStatements(tokens) {
  const statements = [[]];
  for (const t of tokens) {
    if (SEPARATORS.has(t)) {
      statements.push([]);
    } else {
      statements[statements.length - 1].push(t);
    }
  }
  return statements.filter((s) => s.length > 0);
}

function basename(token) {
  return token.replace(/^.*[\\/]/, "");
}

// Resuelve el "comando" real de un statement: salta prefijos de asignación de
// variable de entorno (`FOO=bar cmd ...`) y, si el token de comando es una
// referencia simple a una variable (`$X`, `${X}`), la resuelve contra las
// asignaciones vistas hasta ahora en el mismo comando (`X=rm; $X -rf ./x`).
// Es una heurística sobre texto, no un shell real — no cubre todo (command
// substitution, exports desde otro proceso, etc.), pero cierra el caso
// concreto de indirección simple que un agente podría generar sin querer.
function isAssignment(tok) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok);
}

function parseAssignment(tok) {
  const eq = tok.indexOf("=");
  return { name: tok.slice(0, eq), value: tok.slice(eq + 1) };
}

function resolveVarRef(tok, vars) {
  const m = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(tok);
  if (!m) return null;
  return vars.has(m[1]) ? vars.get(m[1]) : null;
}

function resolveCommand(statement, vars) {
  let i = 0;
  while (i < statement.length && isAssignment(statement[i])) {
    const { name, value } = parseAssignment(statement[i]);
    vars.set(name, value);
    i++;
  }
  if (i >= statement.length) return null;
  const tok = statement[i];
  const resolved = resolveVarRef(tok, vars);
  return { name: basename(resolved !== null ? resolved : tok), rest: statement.slice(i + 1) };
}

function isRmStatement(cmd) {
  if (!cmd || cmd.name !== "rm") return false;
  let hasR = false;
  let hasF = false;
  for (const tok of cmd.rest) {
    if (tok === "--recursive") hasR = true;
    if (tok === "--force") hasF = true;
    if (/^-[a-zA-Z]+$/.test(tok)) {
      if (/[rR]/.test(tok)) hasR = true;
      if (/[fF]/.test(tok)) hasF = true;
    }
  }
  return hasR && hasF;
}

function gitSubcommandIndex(cmd, name) {
  if (!cmd || cmd.name !== "git") return -1;
  return cmd.rest.indexOf(name);
}

function isGitResetHardStatement(cmd) {
  const idx = gitSubcommandIndex(cmd, "reset");
  if (idx === -1) return false;
  return cmd.rest.slice(idx + 1).includes("--hard");
}

function isGitCleanForceStatement(cmd) {
  const idx = gitSubcommandIndex(cmd, "clean");
  if (idx === -1) return false;
  const args = cmd.rest.slice(idx + 1);
  // "-n"/"--dry-run" es un no-op de git clean incluso si también viene "-f":
  // no borra nada, así que no debe denegarse.
  const isDryRun = args.some(
    (tok) => tok === "--dry-run" || (/^-[a-zA-Z]+$/.test(tok) && /n/.test(tok))
  );
  if (isDryRun) return false;
  return args.some((tok) => tok === "--force" || (/^-[a-zA-Z]+$/.test(tok) && /f/i.test(tok)));
}

function isGitPushForceStatement(cmd) {
  const idx = gitSubcommandIndex(cmd, "push");
  if (idx === -1) return false;
  return cmd.rest
    .slice(idx + 1)
    .some(
      (tok) =>
        tok === "-f" ||
        tok === "--force" ||
        tok.startsWith("--force-with-lease") ||
        // Refspec con prefijo "+" (ej. "+feature:main") fuerza el push sin
        // necesidad de "-f"/"--force" — es la sintaxis estándar de git.
        tok.startsWith("+")
    );
}

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

  const statements = splitStatements(tokenize(command));
  const vars = new Map();

  for (const statement of statements) {
    const cmd = resolveCommand(statement, vars);
    if (isRmStatement(cmd)) {
      deny(
        `US-07: el comando contiene un borrado recursivo forzado ("rm -rf" o equivalente): "${command}". ` +
          `Confirmá manualmente fuera de Claude Code si de verdad hace falta.`
      );
      return;
    }
    if (isGitResetHardStatement(cmd)) {
      deny(
        `US-07: el comando contiene "git reset --hard", que descarta cambios sin poder deshacerlos: "${command}". ` +
          `Confirmá manualmente fuera de Claude Code si de verdad hace falta.`
      );
      return;
    }
    if (isGitCleanForceStatement(cmd)) {
      deny(
        `US-07: el comando contiene "git clean" con un flag de forzado (ej. -f/-fd), que borra archivos no ` +
          `trackeados sin confirmación de git: "${command}". Confirmá manualmente fuera de Claude Code si de ` +
          `verdad hace falta.`
      );
      return;
    }
    if (isGitPushForceStatement(cmd)) {
      deny(
        `US-07: el comando contiene un push forzado ("--force"/"-f"/"--force-with-lease" o un refspec "+..."): ` +
          `"${command}". Un force-push nunca debería salir de un agente sin que un humano lo corra a mano — "ask" ` +
          `no alcanza en sesiones automáticas. Si hace falta forzar un push (ej. tras un rebase en tu propia rama ` +
          `de feature), corré ese comando vos mismo fuera de Claude Code.`
      );
      return;
    }
  }

  process.exit(0);
});

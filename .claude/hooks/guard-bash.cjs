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

function isRmStatement(statement) {
  if (basename(statement[0]) !== "rm") return false;
  let hasR = false;
  let hasF = false;
  for (const tok of statement.slice(1)) {
    if (tok === "--recursive") hasR = true;
    if (tok === "--force") hasF = true;
    if (/^-[a-zA-Z]+$/.test(tok)) {
      if (/[rR]/.test(tok)) hasR = true;
      if (/[fF]/.test(tok)) hasF = true;
    }
  }
  return hasR && hasF;
}

function gitSubcommandIndex(statement, name) {
  if (basename(statement[0]) !== "git") return -1;
  return statement.indexOf(name);
}

function isGitResetHardStatement(statement) {
  const idx = gitSubcommandIndex(statement, "reset");
  if (idx === -1) return false;
  return statement.slice(idx + 1).includes("--hard");
}

function isGitCleanForceStatement(statement) {
  const idx = gitSubcommandIndex(statement, "clean");
  if (idx === -1) return false;
  return statement
    .slice(idx + 1)
    .some((tok) => tok === "--force" || (/^-[a-zA-Z]+$/.test(tok) && /f/i.test(tok)));
}

function isGitPushForceStatement(statement) {
  const idx = gitSubcommandIndex(statement, "push");
  if (idx === -1) return false;
  return statement
    .slice(idx + 1)
    .some((tok) => tok === "-f" || tok === "--force" || tok.startsWith("--force-with-lease"));
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

  for (const statement of statements) {
    if (isRmStatement(statement)) {
      deny(
        `US-07: el comando contiene un borrado recursivo forzado ("rm -rf" o equivalente): "${command}". ` +
          `Confirmá manualmente fuera de Claude Code si de verdad hace falta.`
      );
      return;
    }
    if (isGitResetHardStatement(statement)) {
      deny(
        `US-07: el comando contiene "git reset --hard", que descarta cambios sin poder deshacerlos: "${command}". ` +
          `Confirmá manualmente fuera de Claude Code si de verdad hace falta.`
      );
      return;
    }
    if (isGitCleanForceStatement(statement)) {
      deny(
        `US-07: el comando contiene "git clean" con un flag de forzado (ej. -f/-fd), que borra archivos no ` +
          `trackeados sin confirmación de git: "${command}". Confirmá manualmente fuera de Claude Code si de ` +
          `verdad hace falta.`
      );
      return;
    }
    if (isGitPushForceStatement(statement)) {
      deny(
        `US-07: el comando contiene "git push --force"/"-f": "${command}". Un force-push nunca debería salir de ` +
          `un agente sin que un humano lo corra a mano — "ask" no alcanza en sesiones automáticas. Si hace falta ` +
          `forzar un push (ej. tras un rebase en tu propia rama de feature), corré ese comando vos mismo fuera de ` +
          `Claude Code.`
      );
      return;
    }
  }

  process.exit(0);
});

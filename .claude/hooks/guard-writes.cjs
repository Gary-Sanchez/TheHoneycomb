#!/usr/bin/env node
// PreToolUse hook (Edit|Write) — ver US-07 y .claude/README.md.
// Pide confirmación explícita ("ask") antes de escribir fuera del árbol
// esperado del proyecto, o sobre los archivos de datos persistentes reales
// de The Honeycomb. No bloquea nada de forma dura: solo fuerza el prompt.

const path = require("node:path");

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function ask(reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
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

  const filePath = input && input.tool_input && input.tool_input.file_path;
  if (!filePath) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const parentDir = path.dirname(projectDir);
  const resolved = path.resolve(filePath);

  // Chequear primero si es un archivo de datos persistentes: HONEYCOMB_DB_PATH/
  // HONEYCOMB_CONFIG_PATH suele apuntar fuera del árbol del repo en la build de Electron
  // (%APPDATA%\The Honeycomb\...), y ese caso tiene que disparar el motivo específico de
  // "datos persistentes", no el genérico de "fuera del árbol" — son la misma confirmación
  // sin importar si el archivo vive en la raíz del repo (dev) o en %APPDATA% (empaquetado).
  const dbPath = path.resolve(
    process.env.HONEYCOMB_DB_PATH || path.join(projectDir, "honeycomb-data.json")
  );
  const configPath = path.resolve(
    process.env.HONEYCOMB_CONFIG_PATH || path.join(projectDir, "honeycomb-config.json")
  );
  const base = path.basename(resolved);

  if (
    resolved === dbPath ||
    resolved === configPath ||
    base === "honeycomb-data.json" ||
    base === "honeycomb-config.json"
  ) {
    ask(
      `US-07: "${filePath}" es un archivo de datos persistentes de The Honeycomb (o el destino ` +
        `configurado vía HONEYCOMB_DB_PATH/HONEYCOMB_CONFIG_PATH). Confirmá antes de ` +
        `sobrescribirlo para no perder datos reales de asistencia.`
    );
    return;
  }

  if (!isInside(resolved, projectDir) && !isInside(resolved, parentDir)) {
    ask(
      `US-07: "${filePath}" queda fuera del árbol del repo (${projectDir}) y de la carpeta ` +
        `padre donde viven los tickets US-* (${parentDir}). Confirmá que la ruta es intencional ` +
        `antes de escribir ahí.`
    );
    return;
  }

  process.exit(0);
});

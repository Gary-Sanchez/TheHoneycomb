// Tests de guard-writes.cjs (US-07). Sin dependencias: `node --test .claude/hooks/*.test.cjs`
// (ver .claude/README.md). Lanza el hook real con un payload JSON por stdin.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const HOOK = path.join(__dirname, "guard-writes.cjs");
const REPO = path.resolve(__dirname, "..", "..");
const OUTSIDE = path.join(path.parse(REPO).root, "honeycomb-guard-test-outside", "x.txt");

function decisionFor(toolName, toolInput, extraEnv = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: REPO, ...extraEnv };
  delete env.HONEYCOMB_DB_PATH;
  delete env.HONEYCOMB_CONFIG_PATH;
  Object.assign(env, extraEnv);
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    encoding: "utf8",
    env,
  });
  assert.equal(res.status, 0, `el hook salió con ${res.status}: ${res.stderr}`);
  const out = res.stdout.trim();
  if (!out) return null;
  return JSON.parse(out).hookSpecificOutput.permissionDecision;
}

test("Write sobre honeycomb-data.json en la raíz del repo → ask", () => {
  assert.equal(decisionFor("Write", { file_path: path.join(REPO, "honeycomb-data.json") }), "ask");
});

test("Edit sobre honeycomb-config.json → ask", () => {
  assert.equal(decisionFor("Edit", { file_path: path.join(REPO, "honeycomb-config.json") }), "ask");
});

test("Write sobre el destino de HONEYCOMB_DB_PATH con otro nombre → ask", () => {
  const custom = path.join(REPO, "data", "custom-db.json");
  assert.equal(decisionFor("Write", { file_path: custom }, { HONEYCOMB_DB_PATH: custom }), "ask");
});

const caseInsensitiveFs = process.platform === "win32" || process.platform === "darwin";

test(
  "QA #4: cambio de mayúsculas en el nombre del archivo de datos → ask",
  { skip: !caseInsensitiveFs && "solo aplica a sistemas de archivos case-insensitive" },
  () => {
    assert.equal(decisionFor("Write", { file_path: path.join(REPO, "Honeycomb-Data.json") }), "ask");
    assert.equal(decisionFor("Write", { file_path: path.join(REPO, "HONEYCOMB-CONFIG.JSON") }), "ask");
    const custom = path.join(REPO, "data", "Custom-DB.json");
    assert.equal(
      decisionFor("Write", { file_path: custom.toUpperCase() }, { HONEYCOMB_DB_PATH: custom }),
      "ask"
    );
  }
);

test("Write fuera del árbol del repo y de su carpeta padre → ask", () => {
  assert.equal(decisionFor("Write", { file_path: OUTSIDE }), "ask");
});

test("NotebookEdit fuera del árbol → ask; dentro → sin decisión", () => {
  assert.equal(decisionFor("NotebookEdit", { notebook_path: OUTSIDE.replace(/\.txt$/, ".ipynb") }), "ask");
  assert.equal(decisionFor("NotebookEdit", { notebook_path: path.join(REPO, "nb.ipynb") }), null);
});

test("Edit normal dentro del repo → sin decisión", () => {
  assert.equal(decisionFor("Edit", { file_path: path.join(REPO, "src", "App.tsx") }), null);
  assert.equal(decisionFor("Write", { file_path: path.join(REPO, "src", "mockData.ts") }), null);
});

test("Write en la carpeta padre (tickets US-*) → sin decisión", () => {
  assert.equal(decisionFor("Write", { file_path: path.join(path.dirname(REPO), "US-99 test.md") }), null);
});

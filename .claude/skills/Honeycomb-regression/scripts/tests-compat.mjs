#!/usr/bin/env node
// Honeycomb-regression — "tests viejos sobre código nuevo": corre los unit tests (Vitest) del
// snapshot A sobre el código del snapshot B. Un test de A que falla en B es una regresión salvo
// que una US del rango haya cambiado ese comportamiento a propósito (y casi siempre también ese
// test: por eso se lista el historial del archivo en el rango).
//
// Trabaja en un worktree DESCARTABLE de B (lo crea si no existe) con node_modules enlazado
// (junction) al worktree de B ya instalado, así no hace falta otro `npm ci`.
//
// Uso: node tests-compat.mjs --from <ref A> --to <ref B> --modules <dir con node_modules de B>
//        --work <dir worktree descartable> --out <file.json> [--repo .]

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
for (const k of ["from", "to", "modules", "work", "out"]) {
  if (!args[k]) { console.error("Uso: tests-compat.mjs --from A --to B --modules <dir> --work <dir> --out <file> [--repo .]"); process.exit(2); }
}
const repo = path.resolve(args.repo || ".");
const work = path.resolve(args.work);
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

const fromSha = git(repo, "rev-parse", args.from), toSha = git(repo, "rev-parse", args.to);
if (!fs.existsSync(work)) git(repo, "worktree", "add", "--detach", work, toSha);
if (git(work, "rev-parse", "HEAD") !== toSha) {
  console.error(`[tests-compat] ${work} no está en ${toSha}; usá un worktree descartable nuevo.`);
  process.exit(2);
}
const modules = path.join(path.resolve(args.modules), "node_modules");
const link = path.join(work, "node_modules");
if (!fs.existsSync(link)) fs.symlinkSync(modules, link, "junction");

// Overlay A's unit tests (only *.test.ts[x]; e2e specs need the full app and run separately).
const oldTests = git(repo, "ls-tree", "-r", "--name-only", fromSha).split("\n").filter(f => /\.test\.tsx?$/.test(f) && !f.startsWith(".claude/"));
// --worktree only: the index stays at B, so A-only files remain untracked and easy to drop.
git(work, "restore", `--source=${fromSha}`, "--worktree", "--", ...oldTests);

const report = path.join(work, "vitest-compat.json");
const run = spawnSync(process.execPath, [path.join(link, "vitest", "vitest.mjs"), "run", "--reporter=json", `--outputFile=${report}`, ...oldTests], {
  cwd: work, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});
// Leave the throwaway worktree back at B so a rerun starts clean.
git(work, "restore", "--worktree", "--", ".");
for (const f of oldTests) if (!git(work, "ls-files", f)) fs.rmSync(path.join(work, f), { force: true });

if (!fs.existsSync(report)) {
  console.error("[tests-compat] Vitest no produjo reporte:\n" + (run.stderr || run.stdout).slice(-3000));
  process.exit(1);
}
const json = JSON.parse(fs.readFileSync(report, "utf8"));
fs.rmSync(report, { force: true });
const failures = [];
for (const file of json.testResults || []) {
  const rel = path.relative(work, file.name).replace(/\\/g, "/");
  const history = git(repo, "log", "--format=%h %s", `${fromSha}..${toSha}`, "--", rel).split("\n").filter(Boolean);
  const failed = (file.assertionResults || []).filter(t => t.status === "failed");
  if (file.status === "failed" && !failed.length) {
    // Whole file failed to load (e.g. an import that B renamed or removed).
    failures.push({ file: rel, test: "<el archivo no carga>", message: (file.message || "").slice(0, 1500), fileHistoryInRange: history });
  }
  for (const t of failed) {
    failures.push({ file: rel, test: t.fullName, message: (t.failureMessages || []).join("\n").slice(0, 1500), fileHistoryInRange: history });
  }
}
const summary = {
  from: fromSha, to: toSha,
  files: oldTests.length,
  tests: { total: json.numTotalTests, passed: json.numPassedTests, failed: json.numFailedTests },
  failures,
};
fs.writeFileSync(path.resolve(args.out), JSON.stringify(summary, null, 2) + "\n");
console.log(`[tests-compat] tests de ${args.from} sobre ${args.to}: ${json.numPassedTests}/${json.numTotalTests} ok, ${failures.length} fallas → ${args.out}`);
process.exitCode = failures.length ? 1 : 0;

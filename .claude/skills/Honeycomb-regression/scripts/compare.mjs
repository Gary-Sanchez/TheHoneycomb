#!/usr/bin/env node
// Honeycomb-regression — compara dos capturas de capture.mjs (base = snapshot A, cand = B) y
// deja la lista de deltas a triar. No decide si un delta es regresión o cambio esperado: eso lo
// hace quien corre la skill, cruzando cada delta con las US del rango A..B.
//
// Uso: node compare.mjs --base <dir captura A> --cand <dir captura B> --out <dir reporte>
//        [--noise 0.002]   (fracción de píxeles distintos que se considera ruido de render)
//
// Sale con código 0 si no hay deltas, 1 si hay deltas a triar o la captura B tuvo pasos fallidos.

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[argv[i].slice(2)] = true;
    else { args[argv[i].slice(2)] = next; i++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.base || !args.cand || !args.out) {
  console.error("Uso: compare.mjs --base <dir> --cand <dir> --out <dir> [--noise 0.002]");
  process.exit(2);
}
const baseDir = path.resolve(args.base);
const candDir = path.resolve(args.cand);
const outDir = path.resolve(args.out);
const noise = Number(args.noise ?? 0.002);
fs.mkdirSync(outDir, { recursive: true });

const readJson = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
const listFiles = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort() : []);

// Values that legitimately change between runs (generated ids, timestamps) are masked before
// diffing, so they never show up as deltas.
const VOLATILE_KEYS = new Set(["importedAt", "capturedAt", "token"]);
const VOLATILE_VALUE = /^(att|log)-\d{13}(-.*)?$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/i;
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = VOLATILE_KEYS.has(key) ? "<volatile>" : normalize(value[key]);
    return out;
  }
  if (typeof value === "string" && VOLATILE_VALUE.test(value)) return "<volatile>";
  return value;
}

// Deep diff → list of { path, base, cand } leaves.
function deepDiff(a, b, at = "$", acc = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return acc;
  const isObj = v => v && typeof v === "object";
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) deepDiff(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : `${at}.${k}`, acc);
    return acc;
  }
  acc.push({ path: at, base: a === undefined ? "<ausente>" : a, cand: b === undefined ? "<ausente>" : b });
  return acc;
}

// Minimal line diff (LCS) → unified-ish text with only the changed lines and 2 lines of context.
function lineDiff(aText, bText) {
  const a = aText.split("\n"), b = bText.split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push([" ", a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(["-", a[i++]]);
    else ops.push(["+", b[j++]]);
  }
  while (i < n) ops.push(["-", a[i++]]);
  while (j < m) ops.push(["+", b[j++]]);
  const keep = new Set();
  ops.forEach(([op], k) => { if (op !== " ") for (let c = k - 2; c <= k + 2; c++) keep.add(c); });
  const lines = [];
  let last = -1;
  ops.forEach(([op, line], k) => {
    if (!keep.has(k)) return;
    if (last !== -1 && k !== last + 1) lines.push("@@");
    lines.push(`${op} ${line}`);
    last = k;
  });
  return { added: ops.filter(o => o[0] === "+").length, removed: ops.filter(o => o[0] === "-").length, text: lines.join("\n") };
}

const deltas = [];
const add = (kind, key, detail) => deltas.push({ kind, key, ...detail });

// 1. Visible text of every tab, read-only and admin.
for (const mode of ["readonly", "admin"]) {
  const bDir = path.join(baseDir, "tabs", mode), cDir = path.join(candDir, "tabs", mode);
  const names = new Set([...listFiles(bDir, ".txt"), ...listFiles(cDir, ".txt")]);
  for (const f of [...names].sort()) {
    const key = `${mode}/${f.replace(/\.txt$/, "")}`;
    const bf = path.join(bDir, f), cf = path.join(cDir, f);
    if (!fs.existsSync(cf)) { add("text", key, { status: "missing-in-candidate" }); continue; }
    if (!fs.existsSync(bf)) { add("text", key, { status: "new-in-candidate" }); continue; }
    const d = lineDiff(fs.readFileSync(bf, "utf8"), fs.readFileSync(cf, "utf8"));
    if (d.added || d.removed) {
      const file = path.join(outDir, "text-diff", mode, f.replace(/\.txt$/, ".diff"));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, d.text + "\n");
      add("text", key, { status: "changed", added: d.added, removed: d.removed, diff: path.relative(outDir, file), preview: d.text.split("\n").slice(0, 12).join("\n") });
    }
  }
}

// 2. API state loaded from the same fixture (shows schema/migration differences).
for (const name of ["data", "auth-status"]) {
  const a = readJson(path.join(baseDir, "api", `${name}.json`)), b = readJson(path.join(candDir, "api", `${name}.json`));
  const diffs = deepDiff(normalize(a), normalize(b));
  if (diffs.length) add("api", name, { status: "changed", count: diffs.length, sample: diffs.slice(0, 15) });
}

// 3. Parser corpus, file by file and as one batch.
{
  const a = readJson(path.join(baseDir, "api", "parser.json")) || {}, b = readJson(path.join(candDir, "api", "parser.json")) || {};
  const files = new Set([...Object.keys(a.single || {}), ...Object.keys(b.single || {})]);
  for (const f of [...files].sort()) {
    const diffs = deepDiff(normalize(a.single?.[f]), normalize(b.single?.[f]));
    if (diffs.length) add("parser", f, { status: "changed", count: diffs.length, sample: diffs.slice(0, 15) });
  }
  const diffs = deepDiff(normalize(a.batch), normalize(b.batch));
  if (diffs.length) add("parser", "<lote completo>", { status: "changed", count: diffs.length, sample: diffs.slice(0, 15) });
}

// 4. Pixels (computed by capture.mjs --baseline inside the app window).
const visual = readJson(path.join(candDir, "visual-diff.json"));
const visualSummary = { identical: 0, noise: 0, changed: 0, other: 0 };
if (visual) {
  for (const [key, v] of Object.entries(visual)) {
    if (v.status === "identical") { visualSummary.identical++; continue; }
    if (v.status === "changed" && v.ratio < noise && JSON.stringify(v.sizeA) === JSON.stringify(v.sizeB)) { visualSummary.noise++; continue; }
    if (v.status === "changed") visualSummary.changed++; else visualSummary.other++;
    add("visual", key, { status: v.status, ratio: v.ratio, sizeA: v.sizeA, sizeB: v.sizeB, diff: v.diff ? path.join(candDir, v.diff) : undefined });
  }
}

// 5. Health of the candidate run itself: failed steps, missing tabs, new console/page errors.
const mBase = readJson(path.join(baseDir, "manifest.json")) || {};
const mCand = readJson(path.join(candDir, "manifest.json")) || {};
const failedSteps = (mCand.steps || []).filter(s => !s.ok);
for (const s of failedSteps) add("run", s.name, { status: "failed-step", detail: s.detail });
for (const kind of ["consoleErrors", "pageErrors"]) {
  const before = new Set(mBase[kind] || []);
  const fresh = (mCand[kind] || []).filter(e => !before.has(e));
  if (fresh.length) add("run", kind, { status: "new-errors", errors: fresh.slice(0, 10) });
}

const summary = {
  base: { label: mBase.label, commit: mBase.commit, fixtureSha256: mBase.fixtureSha256 },
  cand: { label: mCand.label, commit: mCand.commit, fixtureSha256: mCand.fixtureSha256 },
  sameFixture: mBase.fixtureSha256 === mCand.fixtureSha256,
  noiseThreshold: noise,
  visual: visual ? visualSummary : "sin --baseline: no se compararon píxeles",
  totals: deltas.reduce((acc, d) => ({ ...acc, [d.kind]: (acc[d.kind] || 0) + 1 }), {}),
  deltas,
};
fs.writeFileSync(path.join(outDir, "deltas.json"), JSON.stringify(summary, null, 2) + "\n");

const md = [];
md.push(`# Deltas ${mBase.label} → ${mCand.label}`, "");
md.push(`- Base: \`${mBase.commit}\` · Candidato: \`${mCand.commit}\``);
md.push(`- Mismo fixture: ${summary.sameFixture ? "sí" : "**NO** (los deltas de datos no son comparables)"}`);
md.push(`- Visual: ${visual ? `${visualSummary.identical} idénticas, ${visualSummary.noise} ruido (< ${(noise * 100).toFixed(1)}%), ${visualSummary.changed} cambiadas` : summary.visual}`);
md.push(`- Deltas a triar: **${deltas.length}** ${JSON.stringify(summary.totals)}`, "");
for (const d of deltas) {
  md.push(`## [${d.kind}] ${d.key} — ${d.status}`);
  if (d.preview) md.push("```diff", d.preview, "```", d.diff ? `Diff completo: \`${d.diff}\`` : "");
  if (d.sample) md.push("```json", JSON.stringify(d.sample, null, 2).slice(0, 2500), "```");
  if (d.ratio !== undefined) md.push(`Píxeles distintos: ${(d.ratio * 100).toFixed(2)}% · tamaño ${JSON.stringify(d.sizeA)} → ${JSON.stringify(d.sizeB)}${d.diff ? ` · diff: \`${d.diff}\`` : ""}`);
  if (d.detail) md.push("```", String(d.detail).slice(0, 1500), "```");
  if (d.errors) md.push("```", d.errors.join("\n").slice(0, 1500), "```");
  md.push("");
}
fs.writeFileSync(path.join(outDir, "deltas.md"), md.join("\n"));
console.log(`[compare] ${deltas.length} deltas ${JSON.stringify(summary.totals)} → ${path.join(outDir, "deltas.md")}`);
process.exitCode = deltas.length || failedSteps.length ? 1 : 0;

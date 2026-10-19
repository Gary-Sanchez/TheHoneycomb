#!/usr/bin/env node
// Honeycomb-regression — captura la "huella" observable de UNA versión de la app.
//
// Lanza la app de escritorio (Electron) de --repo con el golden DB en un directorio temporal
// (nunca toca %APPDATA%), recorre las 6 pestañas en modo lectura y en modo admin guardando el
// texto visible y una captura de cada una, guarda /api/data y /api/auth/status, y pasa el
// corpus de .csv por el parser (archivo por archivo y en un solo lote). Con --baseline compara
// además las capturas contra las de otra corrida, píxel a píxel, dentro de la propia ventana.
//
// Uso (desde la raíz del repo candidato, con dist/ ya compilado en --repo):
//   node .claude/skills/Honeycomb-regression/scripts/capture.mjs --repo <dir> --out <dir>
//        [--label v4.0.0] [--port 3210] [--fixture <db.json>] [--corpus <dir>] [--baseline <dir>]
//
// `@playwright/test` se resuelve desde este archivo (node_modules del checkout que contiene la
// skill); el Electron que se lanza es siempre el del propio --repo.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, "..");

const TABS = [
  "Dashboard",
  "Manual Check-In",
  "Caserits & Progress",
  "Overlap Cross-Referencer",
  "Import Forage Logs",
  "Settings",
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key.slice(2)] = true;
    else { args[key.slice(2)] = next; i++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.repo || !args.out) {
  console.error("Uso: capture.mjs --repo <dir> --out <dir> [--label X] [--port N] [--fixture f] [--corpus d] [--baseline d]");
  process.exit(2);
}

const repo = path.resolve(args.repo);
const out = path.resolve(args.out);
const port = String(args.port || 3210);
const fixture = path.resolve(args.fixture || path.join(SKILL_DIR, "fixtures", "golden-db.json"));
const corpusDir = path.resolve(args.corpus || path.join(SKILL_DIR, "fixtures", "corpus"));
const baseline = args.baseline ? path.resolve(args.baseline) : null;
const base = `http://localhost:${port}`;

const slug = s => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};
const git = (...a) => {
  try { return execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" }).trim(); } catch { return null; }
};

if (!fs.existsSync(path.join(repo, "dist", "server.cjs"))) {
  console.error(`[capture] Falta ${path.join(repo, "dist", "server.cjs")}: corré \`npm run build\` en ${repo} primero.`);
  process.exit(2);
}
const electronPath = createRequire(path.join(repo, "package.json"))("electron");
fs.mkdirSync(out, { recursive: true });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-regression-"));
const dbPath = path.join(tmpDir, "honeycomb-data.json");
fs.copyFileSync(fixture, dbPath);
// Test-only credential, generated per run and never written to disk: the app reads it from the env.
const adminPassword = crypto.randomBytes(18).toString("base64url");

const manifest = {
  label: args.label || git("describe", "--tags", "--always") || "unknown",
  commit: git("rev-parse", "HEAD"),
  describe: git("describe", "--tags", "--always", "--dirty"),
  packageVersion: JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version,
  fixtureSha256: crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex"),
  capturedAt: new Date().toISOString(),
  port,
  tabs: {},
  missingTabs: [],
  consoleErrors: [],
  pageErrors: [],
  steps: [],
};
const step = (name, ok, detail) => {
  manifest.steps.push({ name, ok, ...(detail ? { detail } : {}) });
  console.log(`[capture] ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function getJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function waitForHealth(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await getJson(`${base}/api/health`);
      if (r.status === 200) return r.body;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`El server no respondió en ${base}/api/health en ${timeoutMs / 1000}s`);
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // motion/Tailwind transitions: let the finite entrance animations finish before reading or
  // shooting. Infinite ones (spinners, pulses) never resolve `finished`, hence the filter + cap.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter(a => a.effect?.getComputedTiming().endTime !== Infinity)
      .map(a => a.finished.catch(() => {}))),
    new Promise(r => setTimeout(r, 3000)),
  ])).catch(() => {});
  await sleep(600);
}

async function captureTab(page, mode, tab) {
  const button = page.locator("nav button", { hasText: tab }).first();
  if (!(await button.count())) {
    if (!manifest.missingTabs.includes(tab)) manifest.missingTabs.push(tab);
    step(`${mode}/${tab}`, false, "pestaña no encontrada en el <nav>");
    return;
  }
  await button.click();
  await settle(page);
  const name = slug(tab);
  const snap = async variant => {
    const key = variant ? `${name}--${variant}` : name;
    const text = await page.evaluate(() => document.body.innerText);
    fs.mkdirSync(path.join(out, "tabs", mode), { recursive: true });
    fs.mkdirSync(path.join(out, "screens", mode), { recursive: true });
    fs.writeFileSync(path.join(out, "tabs", mode, `${key}.txt`), text.replace(/\r\n/g, "\n").trim() + "\n");
    await page.screenshot({ path: path.join(out, "screens", mode, `${key}.png`), fullPage: true, animations: "disabled" });
    manifest.tabs[`${mode}/${key}`] = { chars: text.length };
  };
  await snap(null);
  // Second view with every collapsed disclosure inside <main> opened (Dashboard panels, etc.).
  const collapsed = page.locator('main [aria-expanded="false"]');
  const n = await collapsed.count();
  if (n > 0) {
    for (let i = 0; i < n; i++) await collapsed.nth(0).click().catch(() => {});
    await settle(page);
    await snap("expanded");
  }
  step(`${mode}/${tab}`, true, n > 0 ? `${n} paneles abiertos en la vista expanded` : undefined);
}

async function parseCorpus() {
  const login = await getJson(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  step("parser/login", login.status === 200 && Boolean(cookie), `HTTP ${login.status}`);
  const files = fs.readdirSync(corpusDir).filter(f => f.toLowerCase().endsWith(".csv")).sort();
  const results = { single: {}, batch: null };
  const post = async names => {
    const form = new FormData();
    for (const f of names) form.append("files", new Blob([fs.readFileSync(path.join(corpusDir, f))], { type: "text/csv" }), f);
    let r = await getJson(`${base}/api/parse-attendance-batch`, { method: "POST", headers: { cookie }, body: form });
    if (r.status === 404 && names.length === 1) {
      // Snapshots older than US-27 only had the single-file route.
      const single = new FormData();
      single.append("file", new Blob([fs.readFileSync(path.join(corpusDir, names[0]))], { type: "text/csv" }), names[0]);
      r = await getJson(`${base}/api/parse-attendance-file`, { method: "POST", headers: { cookie }, body: single });
      return { route: "parse-attendance-file", status: r.status, body: r.body };
    }
    return { route: "parse-attendance-batch", status: r.status, body: r.body };
  };
  for (const f of files) results.single[f] = await post([f]);
  results.batch = await post(files);
  writeJson(path.join(out, "api", "parser.json"), results);
  step("parser/corpus", true, `${files.length} archivos + 1 lote (HTTP ${results.batch.status})`);
}

async function visualDiff(page) {
  const report = {};
  for (const mode of ["readonly", "admin"]) {
    const dir = path.join(out, "screens", mode);
    const baseDir = path.join(baseline, "screens", mode);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".png"))) {
      const key = `${mode}/${file.replace(/\.png$/, "")}`;
      const basePng = path.join(baseDir, file);
      if (!fs.existsSync(basePng)) { report[key] = { status: "new" }; continue; }
      const a = fs.readFileSync(basePng);
      const b = fs.readFileSync(path.join(dir, file));
      if (a.equals(b)) { report[key] = { status: "identical", ratio: 0 }; continue; }
      // Decode and diff both PNGs with the renderer's own canvas — no image library needed.
      const result = await page.evaluate(async ({ a, b }) => {
        // No fetch(data:) here: the app's CSP connect-src would block it.
        const load = b64 => createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: "image/png" }));
        let ia, ib;
        try { ia = await load(a); ib = await load(b); } catch (e) { return { error: String(e) }; }
        const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
        const read = img => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const da = read(ia), db = read(ib);
        const out = new OffscreenCanvas(w, h); const ox = out.getContext("2d"); const diff = ox.createImageData(w, h);
        let changed = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
          const hit = d > 30; // anti-aliasing tolerance
          if (hit) changed++;
          const g = (da[i] + da[i + 1] + da[i + 2]) / 3;
          diff.data[i] = hit ? 255 : g * 0.3 + 178; diff.data[i + 1] = hit ? 0 : g * 0.3 + 178; diff.data[i + 2] = hit ? 0 : g * 0.3 + 178; diff.data[i + 3] = 255;
        }
        ox.putImageData(diff, 0, 0);
        const blob = await out.convertToBlob({ type: "image/png" });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { ratio: changed / (w * h), changedPixels: changed, size: [w, h], sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], png: btoa(bin) };
      }, { a: a.toString("base64"), b: b.toString("base64") });
      if (result.error) { report[key] = { status: "error", error: result.error }; continue; }
      const diffFile = path.join(out, "visual-diff", mode, file);
      fs.mkdirSync(path.dirname(diffFile), { recursive: true });
      fs.writeFileSync(diffFile, Buffer.from(result.png, "base64"));
      const { png, ...rest } = result;
      report[key] = { status: result.ratio === 0 ? "identical" : "changed", ...rest, diff: path.relative(out, diffFile) };
    }
  }
  writeJson(path.join(out, "visual-diff.json"), report);
  const changed = Object.values(report).filter(r => r.status === "changed").length;
  step("visual-diff", true, `${changed} capturas con píxeles distintos vs. ${baseline}`);
}

let app;
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [path.join(repo, "electron", "main.js")],
    cwd: repo,
    env: {
      ...process.env,
      PORT: port,
      HONEYCOMB_DB_PATH: dbPath,
      HONEYCOMB_CONFIG_PATH: path.join(tmpDir, "honeycomb-config.json"),
      HONEYCOMB_ADMIN_PASSWORD: adminPassword,
      HONEYCOMB_ALLOW_LAN: "",
    },
  });
  const page = await app.firstWindow();
  page.on("console", m => { if (m.type() === "error") manifest.consoleErrors.push(m.text()); });
  page.on("pageerror", e => manifest.pageErrors.push(String(e)));

  manifest.health = await waitForHealth();
  step("health", manifest.health?.status === "ok", JSON.stringify(manifest.health));
  await page.getByRole("heading", { name: "The Honeycomb" }).first().waitFor({ timeout: 30_000 });
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  await settle(page);

  writeJson(path.join(out, "api", "data.json"), (await getJson(`${base}/api/data`)).body);
  writeJson(path.join(out, "api", "auth-status.json"), (await getJson(`${base}/api/auth/status`)).body);

  for (const tab of TABS) await captureTab(page, "readonly", tab);

  const login = await page.evaluate(async pw => {
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    return r.status;
  }, adminPassword);
  step("admin/login", login === 200, `HTTP ${login}`);
  await page.reload();
  await page.getByRole("heading", { name: "The Honeycomb" }).first().waitFor({ timeout: 30_000 });
  await settle(page);
  for (const tab of TABS) await captureTab(page, "admin", tab);

  await parseCorpus();
  // The corpus is parse-only: the DB must come out exactly as the fixture went in.
  const after = (await getJson(`${base}/api/data`)).body;
  const before = JSON.parse(fs.readFileSync(path.join(out, "api", "data.json"), "utf8"));
  step("db-unchanged", JSON.stringify(after) === JSON.stringify(before), "parsear no debe persistir nada");

  if (baseline) await visualDiff(page);
} catch (e) {
  step("fatal", false, e?.stack || String(e));
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  writeJson(path.join(out, "manifest.json"), manifest);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
const failed = manifest.steps.filter(s => !s.ok);
console.log(`[capture] ${manifest.label} → ${out} (${manifest.steps.length - failed.length}/${manifest.steps.length} pasos ok)`);
if (failed.length) process.exitCode = 1;

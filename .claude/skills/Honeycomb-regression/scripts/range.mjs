#!/usr/bin/env node
// Honeycomb-regression — qué entró entre dos snapshots: PRs mergeados, US que mencionan, y
// archivos tocados agrupados por área funcional (para el análisis de impacto).
//
// Uso: node range.mjs --from <ref A> --to <ref B> [--repo .] [--out range.json]

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
if (!args.from || !args.to) {
  console.error("Uso: range.mjs --from <ref A> --to <ref B> [--repo .] [--out file]");
  process.exit(2);
}
const repo = path.resolve(args.repo || ".");
const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

// Areas mirror the tabs/modules in CLAUDE.md; first match wins.
const AREAS = [
  ["parser / Import Forage Logs", /^(parser\.ts|parser\.test\.ts|src\/components\/DocumentParser|src\/uploadLimits|src\/blacklist)/],
  ["persistencia (db.ts)", /^(db\.ts|db\.test\.ts)/],
  ["API / auth / validación", /^(server\.ts|validation\.ts)/],
  ["Dashboard", /^src\/(components\/Dashboard|dashboardMetrics)/],
  ["Manual Check-In", /^src\/(components\/AttendanceLogger|sameEvent)/],
  ["Caserits & Progress / Progress Report", /^src\/(components\/(AttendeeDirectory|ProgressReport)|progressReport)/],
  ["Overlap Cross-Referencer / Bee-havior Hub", /^src\/(components\/CrossReference|beehavior|activityEvents)/],
  ["Outcome Report", /^src\/(components\/OutcomeReport|outcomeReport)/],
  ["Settings / Admin Access", /^src\/components\/(SettingsPanel|ReadOnlyNotice)/],
  ["App shell / estado (App.tsx, types, utils)", /^src\/(App\.tsx|types\.ts|utils\.ts|mockData\.ts|main\.tsx|index\.css|uiCopy|a11y)/],
  ["Electron / CSP / build", /^(electron\/|index\.html|vite\.config|tsconfig|vitest\.config|playwright\.config|public\/)/],
  ["dependencias (npm audit)", /^(package\.json|package-lock\.json)$/],
  ["e2e", /^e2e\//],
  ["CI", /^\.github\//],
  ["tooling Claude (.claude/)", /^\.claude\//],
  ["docs", /^(docs\/|README|CLAUDE\.md)/],
];
const areaOf = file => (AREAS.find(([, re]) => re.test(file)) || ["otros"])[0];
const usIn = text => [...new Set((text.match(/us-\d+(?:-\d+)*/gi) || []).flatMap(m => m.match(/\d+/g).map(n => `US-${n.padStart(2, "0")}`)))];

const fromSha = git("rev-parse", args.from), toSha = git("rev-parse", args.to);
const isAncestor = (() => { try { git("merge-base", "--is-ancestor", fromSha, toSha); return true; } catch { return false; } })();

const merges = git("log", "--merges", "--first-parent", "--format=%H%x09%ad%x09%s", "--date=short", `${fromSha}..${toSha}`)
  .split("\n").filter(Boolean).map(line => {
    const [sha, date, subject] = line.split("\t");
    const pr = subject.match(/Merge pull request #(\d+) from [^/]+\/(\S+)/);
    return pr ? { sha: sha.slice(0, 7), date, pr: Number(pr[1]), branch: pr[2], us: usIn(pr[2]) } : null;
  }).filter(Boolean);
const commits = git("log", "--no-merges", "--format=%h%x09%s", `${fromSha}..${toSha}`).split("\n").filter(Boolean)
  .map(l => { const [sha, subject] = l.split("\t"); return { sha, subject, us: usIn(subject) }; });

const changed = git("diff", "--name-status", `${fromSha}..${toSha}`).split("\n").filter(Boolean).map(l => {
  const [status, ...rest] = l.split("\t");
  return { status: status[0], file: rest[rest.length - 1] };
});
const byArea = {};
for (const c of changed) (byArea[areaOf(c.file)] ||= []).push(`${c.status} ${c.file}`);

const us = [...new Set([...merges.flatMap(m => m.us), ...commits.flatMap(c => c.us)])].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
const result = {
  from: { ref: args.from, sha: fromSha }, to: { ref: args.to, sha: toSha }, isAncestor,
  us, merges, commitCount: commits.length,
  testFilesChanged: changed.filter(c => /\.(test|spec)\.tsx?$/.test(c.file)).map(c => `${c.status} ${c.file}`),
  byArea,
};
if (args.out) fs.writeFileSync(path.resolve(args.out), JSON.stringify(result, null, 2) + "\n");
console.log(`[range] ${args.from}..${args.to}: ${merges.length} PRs, ${commits.length} commits, US: ${us.join(", ") || "—"}`);
for (const [area, files] of Object.entries(byArea)) console.log(`  ${area}: ${files.length} archivo(s)`);
if (!isAncestor) console.log("  ⚠️ A no es ancestro de B: el rango no es lineal, revisar las refs.");

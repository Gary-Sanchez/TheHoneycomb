// US-53: style lint with a baseline. Runs inside `npm run lint` and in pre-commit (lint-staged).
//
//   node scripts/lint-styles.mjs
//
// No shebang on purpose (same reason as snapshot-code-counts.mjs: with core.autocrlf=true the
// `#!` line ends in \r\n and Vitest can't import the module).
//
// It reads the WORKING TREE (not a git ref): every `src/**/*.tsx` except `*.test.tsx`, plus
// `src/index.css` for the animation keyframes. The rules and their regexes are imported from
// snapshot-code-counts.mjs (US-51), so the counts are exactly those of docs/SNAPSHOT-4.0.md (TC-115).
//
// Each rule has a ceiling in scripts/style-lint-baseline.json:
//   - count > baseline  → fail, listing every occurrence of that rule (file:line, rule, match);
//   - count < baseline  → pass, and say the baseline can be lowered (an explicit change in the PR);
//   - the baseline never goes up: it's compared with its committed version (min of origin/main and
//     HEAD) and with the v4.0.0 values (V4_CEILING). Any value above either → fail.
// When every baseline value is 0 the check is absolute: any occurrence fails (US-67 closes it).
// See docs/STYLE-LINT.md.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STYLE_RULES, checkAnimations, countStyleRules, isStyleSource } from "./snapshot-code-counts.mjs";

/** Enforced rules, in report order. `hexOther` (informative in SNAPSHOT-4.0) is not enforced. */
export const RULE_IDS = ["hex", "textPx", "rounded", "rawColor", "animate"];

/** v4.0.0 values (docs/SNAPSHOT-4.0.md, section 1). The baseline can never be above them. */
export const V4_CEILING = Object.freeze({ hex: 132, textPx: 28, rounded: 39, rawColor: 39, animate: 0 });

export const BASELINE_PATH = "scripts/style-lint-baseline.json";

const RULE_LABELS = {
  ...Object.fromEntries(STYLE_RULES.map(r => [r.id, r.label])),
  animate: "`animate-*` sin keyframes (clase sin `--animate-*` en `@theme`, o `--animate-*` sin `@keyframes`)",
};

/** Same rule as US-53: .tsx under src/, no tests. */
export function isLintedFile(file) {
  return isStyleSource(file) && file.endsWith(".tsx");
}

function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Validates a parsed baseline object. Keys starting with `$` (e.g. `$comment`) are ignored.
 * Returns { baseline, errors }.
 */
export function parseBaseline(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { baseline: null, errors: ["la línea base no es un objeto JSON"] };
  const baseline = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("$")) continue;
    if (!RULE_IDS.includes(key)) {
      errors.push(`regla desconocida en la línea base: "${key}"`);
      continue;
    }
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`"${key}" debe ser un entero >= 0 (es ${JSON.stringify(value)})`);
      continue;
    }
    baseline[key] = value;
  }
  for (const id of RULE_IDS) if (!(id in baseline) && !errors.some(e => e.includes(`"${id}"`))) errors.push(`falta la regla "${id}" en la línea base`);
  return { baseline: errors.length ? null : baseline, errors };
}

/**
 * Pure core. `files` = { "src/…": content } (anything not a linted .tsx is ignored), `css` =
 * src/index.css, `baseline` = parsed JSON (raw object), `previousBaseline` = committed version
 * (raw object, or null when it doesn't exist yet), `ceiling` = V4_CEILING by default.
 */
export function lintStyles({ files, css = "", baseline, previousBaseline = null, ceiling = V4_CEILING }) {
  const linted = Object.fromEntries(
    Object.entries(files)
      .map(([f, c]) => [f.replace(/\\/g, "/"), c.replace(/\r\n/g, "\n")])
      .filter(([f]) => isLintedFile(f))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  css = css.replace(/\r\n/g, "\n");

  // Occurrences (file, line, match) per rule. Totals come from countStyleRules / checkAnimations.
  const violations = Object.fromEntries(RULE_IDS.map(id => [id, []]));
  for (const rule of STYLE_RULES) {
    if (!RULE_IDS.includes(rule.id)) continue;
    for (const [file, content] of Object.entries(linted)) {
      for (const m of content.matchAll(new RegExp(rule.regex.source, rule.regex.flags))) {
        violations[rule.id].push({ file, line: lineOf(content, m.index), rule: rule.id, match: m[0] });
      }
    }
  }
  const counts = countStyleRules(linted);
  const anim = checkAnimations(linted, css);
  // Same class regex as checkAnimations (snapshot-code-counts.mjs), to locate the undefined uses.
  for (const [file, content] of Object.entries(linted)) {
    for (const m of content.matchAll(/(?<![\w-])animate-([a-z0-9-]+)/g)) {
      if (anim.undefinedClasses.includes(m[1])) {
        violations.animate.push({ file, line: lineOf(content, m.index), rule: "animate", match: m[0] });
      }
    }
  }
  for (const { name, keyframes } of anim.missingKeyframes) {
    const idx = css.search(new RegExp(`--animate-${name}\\s*:`));
    violations.animate.push({
      file: "src/index.css",
      line: idx >= 0 ? lineOf(css, idx) : 0,
      rule: "animate",
      match: `--animate-${name} → @keyframes ${keyframes} no existe`,
    });
  }

  const totals = {
    hex: counts.hex.total,
    textPx: counts.textPx.total,
    rounded: counts.rounded.total,
    rawColor: counts.rawColor.total,
    animate: anim.undefinedUses + anim.missingKeyframes.length,
  };

  const errors = [];
  const { baseline: base, errors: baseErrors } = parseBaseline(baseline);
  for (const e of baseErrors) errors.push(`${BASELINE_PATH}: ${e}`);
  if (base) {
    for (const id of RULE_IDS) {
      if (base[id] > ceiling[id]) {
        errors.push(`${BASELINE_PATH}: "${id}" es ${base[id]}, por encima del valor de v4.0.0 (${ceiling[id]}). La línea base nunca sube.`);
      }
    }
    if (previousBaseline) {
      const { baseline: prev } = parseBaseline(previousBaseline);
      // A broken committed baseline is not this change's fault: compare only the valid keys.
      const prevValues = prev ?? Object.fromEntries(Object.entries(previousBaseline).filter(([k, v]) => RULE_IDS.includes(k) && Number.isInteger(v)));
      for (const id of RULE_IDS) {
        if (id in prevValues && base[id] > prevValues[id]) {
          errors.push(`${BASELINE_PATH}: "${id}" subió de ${prevValues[id]} (versión commiteada) a ${base[id]}. La línea base nunca sube.`);
        }
      }
    }
  }

  const rules = RULE_IDS.map(id => {
    const count = totals[id];
    const limit = base ? base[id] : null;
    const status = limit === null ? "unknown" : count > limit ? "fail" : count < limit ? "lower" : "ok";
    return { id, label: RULE_LABELS[id], count, baseline: limit, status, violations: violations[id] };
  });

  const ok = errors.length === 0 && rules.every(r => r.status === "ok" || r.status === "lower");
  const absolute = !!base && RULE_IDS.every(id => base[id] === 0);
  return { ok, absolute, files: Object.keys(linted).length, rules, errors, totals };
}

/** Human-readable report (Spanish, rule ids in English). */
export function formatReport(result) {
  const out = [];
  const mode = result.absolute ? " · modo absoluto (todas las reglas en 0, US-67)" : "";
  out.push(`Lint de estilos (US-53): ${result.files} archivos .tsx de src/ · línea base ${BASELINE_PATH}${mode}`);
  const width = Math.max(...result.rules.map(r => r.id.length));
  for (const r of result.rules) {
    const head = `  ${r.id.padEnd(width)}  ${r.count}/${r.baseline ?? "?"}`;
    if (r.status === "ok") out.push(`${head} ok`);
    else if (r.status === "lower") out.push(`${head} ok — se puede bajar la línea base de "${r.id}" a ${r.count}`);
    else if (r.status === "unknown") out.push(`${head} (sin línea base válida)`);
    else {
      out.push(`${head} FALLA: ${r.count - r.baseline} por encima de la línea base — ${r.label}`);
      for (const v of r.violations) out.push(`    ${v.file}:${v.line}  [${v.rule}]  ${v.match}`);
    }
  }
  for (const e of result.errors) out.push(`  ERROR ${e}`);
  if (result.ok) {
    const lower = result.rules.filter(r => r.status === "lower");
    if (lower.length) out.push(`OK. Para bajar la línea base, editá ${BASELINE_PATH} en este mismo PR: ${lower.map(r => `"${r.id}": ${r.count}`).join(", ")}.`);
    else out.push("OK.");
  } else {
    if (result.rules.some(r => r.status === "fail")) out.push("FALLA. Corregí las ocurrencias nuevas (no subas la línea base). Ver docs/STYLE-LINT.md.");
    if (result.errors.length) out.push(`FALLA. Revisá ${BASELINE_PATH}: solo puede bajar. Ver docs/STYLE-LINT.md.`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Working tree + git + CLI
// ---------------------------------------------------------------------------------------------

/** Reads src/**\/*.tsx (linted ones) and src/index.css from the working tree. */
export function readWorkingTree(repoDir) {
  const files = {};
  const walk = rel => {
    for (const entry of readdirSync(path.join(repoDir, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (isLintedFile(child)) files[child] = readFileSync(path.join(repoDir, child), "utf8").replace(/\r\n/g, "\n");
    }
  };
  walk("src");
  let css = "";
  try {
    css = readFileSync(path.join(repoDir, "src", "index.css"), "utf8").replace(/\r\n/g, "\n");
  } catch {
    css = "";
  }
  return { files, css };
}

/**
 * Committed baseline: per rule, the minimum between origin/main and HEAD (whichever exist).
 * null when neither has the file (first introduction) or git isn't available.
 */
export function readCommittedBaseline(repoDir, file = BASELINE_PATH) {
  const versions = [];
  for (const ref of ["origin/main", "HEAD"]) {
    try {
      const text = execFileSync("git", ["show", `${ref}:${file}`], { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      versions.push(JSON.parse(text));
    } catch {
      // ref or file missing, git missing, or unparsable JSON: ignore that version
    }
  }
  if (versions.length === 0) return null;
  const merged = {};
  for (const v of versions) {
    if (!v || typeof v !== "object") continue;
    for (const [k, n] of Object.entries(v)) {
      if (!RULE_IDS.includes(k) || !Number.isInteger(n)) continue;
      merged[k] = k in merged ? Math.min(merged[k], n) : n;
    }
  }
  return merged;
}

export function run(repoDir) {
  const { files, css } = readWorkingTree(repoDir);
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(path.join(repoDir, BASELINE_PATH), "utf8"));
  } catch (err) {
    const result = lintStyles({ files, css, baseline: null });
    result.errors.unshift(`${BASELINE_PATH}: no se pudo leer (${err.message})`);
    return result;
  }
  return lintStyles({ files, css, baseline, previousBaseline: readCommittedBaseline(repoDir) });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = run(repoDir);
  const report = formatReport(result);
  if (result.ok) process.stdout.write(report + "\n");
  else process.stderr.write(report + "\n");
  process.exitCode = result.ok ? 0 : 1;
}

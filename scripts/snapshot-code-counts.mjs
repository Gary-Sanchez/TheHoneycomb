#!/usr/bin/env node
// US-51: code counts of the audit baseline (docs/SNAPSHOT-4.0.md), measured on a git ref.
//
//   node scripts/snapshot-code-counts.mjs [ref]          # markdown (default ref: v4.0.0)
//   node scripts/snapshot-code-counts.mjs [ref] --json   # JSON
//
// It reads `src/` from the ref itself (`git ls-tree` + `git show`), not from the checkout, so the
// result is the same whatever branch is checked out. The style lint of US-53 must import
// `STYLE_RULES` / `countStyleRules` from here, so its baseline is the same as SNAPSHOT-4.0 (TC-115).
// No dependencies beyond Node itself.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------------------------
// Rules (counted per occurrence, in .ts/.tsx under src/, *.test.* excluded)
// ---------------------------------------------------------------------------------------------

/** Files the style rules look at. */
export function isStyleSource(file) {
  return /^src\/.*\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file);
}

export const STYLE_RULES = [
  {
    id: "hex",
    label: "Hex arbitrarios en clases (`bg-[#…]`, `text-[#…]`, `border-[#…]`)",
    // Also matches with variants (`hover:bg-[#…]`) and opacity (`bg-[#…]/45`): the match is the substring.
    regex: /(bg|text|border)-\[#[0-9A-Fa-f]{3,8}\]/g,
  },
  {
    id: "hexOther",
    label: "Hex arbitrarios con otro prefijo (`accent-[#…]`, `from-[#…]`, `to-[#…]`…) — informativo",
    // Any other utility with an arbitrary hex; excludes the three prefixes of `hex`.
    regex: /(?<![\w-])(?!(?:bg|text|border)-)[a-z]+(?:-[a-z]+)*-\[#[0-9A-Fa-f]{3,8}\]/g,
  },
  {
    id: "textPx",
    label: "Tamaños de texto sueltos (`text-[Npx]`)",
    regex: /text-\[[0-9.]+px\]/g,
  },
  {
    id: "rounded",
    label: "Radios sueltos (`rounded-[…]`, `rounded-t-[…]`, `rounded-tl-[…]`…)",
    regex: /rounded(-[trblse]{1,2})?-\[[^\]]+\]/g,
  },
  {
    id: "rawColor",
    label: "Colores Tailwind crudos (`amber-*`, `red-*`, `gray-*`)",
    regex: /\b(amber|red|gray)-[0-9]{2,3}\b/g,
  },
];

/** Built-in Tailwind v4 animations (no keyframes needed in our CSS). */
export const TAILWIND_BUILTIN_ANIMATIONS = ["spin", "ping", "pulse", "bounce", "none"];

/** Counts every rule in a { path: content } map. Returns { [ruleId]: { total, byFile, byMatch } }. */
export function countStyleRules(files) {
  const result = {};
  for (const rule of STYLE_RULES) {
    const byFile = {};
    const byMatch = {};
    let total = 0;
    for (const [file, content] of Object.entries(files)) {
      if (!isStyleSource(file)) continue;
      const matches = content.match(new RegExp(rule.regex.source, rule.regex.flags)) ?? [];
      if (matches.length === 0) continue;
      byFile[file] = matches.length;
      total += matches.length;
      for (const m of matches) byMatch[m] = (byMatch[m] ?? 0) + 1;
    }
    result[rule.id] = { total, byFile: sortObject(byFile), byMatch: sortObject(byMatch) };
  }
  return result;
}

/**
 * `animate-*` classes used in .tsx without a definition: not a Tailwind built-in and no
 * `--animate-<name>` in `@theme` (src/index.css), plus `--animate-*` whose keyframes don't exist.
 */
export function checkAnimations(files, css) {
  const uses = {};
  const usesByFile = {};
  for (const [file, content] of Object.entries(files)) {
    if (!isStyleSource(file) || !file.endsWith(".tsx")) continue;
    for (const m of content.matchAll(/(?<![\w-])animate-([a-z0-9-]+)/g)) {
      uses[m[1]] = (uses[m[1]] ?? 0) + 1;
      usesByFile[file] = (usesByFile[file] ?? 0) + 1;
    }
  }
  const defined = {};
  for (const m of css.matchAll(/--animate-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    defined[m[1]] = m[2].trim().split(/\s+/)[0]; // first token of the shorthand = keyframes name
  }
  const keyframes = new Set([...css.matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map(m => m[1]));

  const undefinedClasses = Object.keys(uses).filter(
    name => !TAILWIND_BUILTIN_ANIMATIONS.includes(name) && !(name in defined)
  );
  const missingKeyframes = Object.entries(defined)
    .filter(([, kf]) => !keyframes.has(kf))
    .map(([name, kf]) => ({ name, keyframes: kf }));
  return {
    classes: Object.keys(uses).length,
    uses: Object.values(uses).reduce((a, b) => a + b, 0),
    byName: sortObject(uses),
    byFile: sortObject(usesByFile),
    defined,
    keyframes: [...keyframes].sort(),
    undefinedClasses,
    undefinedUses: undefinedClasses.reduce((sum, name) => sum + uses[name], 0),
    missingKeyframes,
  };
}

// ---------------------------------------------------------------------------------------------
// Contrast (WCAG 2.x relative luminance)
// ---------------------------------------------------------------------------------------------

export function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map(c => c + c).join("");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

export function rgbToHex(rgb) {
  return "#" + rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(typeof a === "string" ? hexToRgb(a) : a);
  const lb = relativeLuminance(typeof b === "string" ? hexToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha blending (sRGB) of `fg` at `alpha` over `bg`. Tailwind mixes `/NN` in oklab: ±1 per channel. */
export function composite(fg, alpha, bg) {
  const f = typeof fg === "string" ? hexToRgb(fg) : fg;
  const b = typeof bg === "string" ? hexToRgb(bg) : bg;
  return f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
}

/** oklch(L% C H) → sRGB 0–255 (clipped to the gamut, as the browser does for a plain color). */
export function oklchToRgb(lPercent, c, hDeg) {
  const L = lPercent / 100;
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map(v => {
    const x = Math.min(1, Math.max(0, v));
    const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  });
}

/** `--color-natural-*` tokens of the `@theme` block → { forest: "#2D3E35", … } */
export function parseThemeColors(css) {
  const colors = {};
  for (const m of css.matchAll(/--color-natural-([a-z]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) colors[m[1]] = m[2].toUpperCase();
  return colors;
}

/** Hive tier colors from src/beehavior.ts → { "Busy Bee": { color, textColor, bgLight }, … } */
export function parseTierColors(ts) {
  const tiers = {};
  for (const m of ts.matchAll(/label:\s*"([^"]+)",\s*color:\s*"(#[0-9A-Fa-f]{6})"[^\n]*\n\s*bgLight:\s*"(#[0-9A-Fa-f]{6})"[^\n]*\n\s*textColor:\s*"(#[0-9A-Fa-f]{6})"/g)) {
    tiers[m[1]] = { color: m[2], bgLight: m[3], textColor: m[4] };
  }
  return tiers;
}

/** Tailwind default color (oklch in node_modules/tailwindcss/theme.css) → sRGB hex. */
export function parseTailwindColor(themeCss, name) {
  const m = themeCss.match(new RegExp(`--color-${name}:\\s*oklch\\(([0-9.]+)%\\s+([0-9.]+)\\s+([0-9.]+)\\)`));
  if (!m) throw new Error(`Tailwind color ${name} not found`);
  return { oklch: `oklch(${m[1]}% ${m[2]} ${m[3]})`, hex: rgbToHex(oklchToRgb(+m[1], +m[2], +m[3])) };
}

const AA_TEXT = 4.5;
const AA_UI = 3;

/**
 * Appendix A of the UX/UI audit (2026-10-07): pair, audit ratio as printed, audit verdict
 * (AA text 4.5 / AA UI 3.0), and how to build both colors from the code of the ref.
 */
export function appendixAPairs({ t, tiers, tw }) {
  const white = "#FFFFFF";
  const navBg = composite(t.wheat, 0.2, t.cream); // nav: bg-[#FAEDCD]/20 over the cream app root
  const sandError = composite(t.sand, 0.1, t.cream); // bg-natural-sand/10 over the cream app root
  const tier = name => tiers[name] ?? {};
  return [
    { pair: "forest / white", fg: t.forest, bg: white, audit: "11.34", auditVerdict: "P / P" },
    { pair: "forest / cream", fg: t.forest, bg: t.cream, audit: "10.97", auditVerdict: "P / P" },
    { pair: "sage / white", fg: t.sage, bg: white, audit: "3.06", auditVerdict: "F / límite" },
    { pair: "sage / cream", fg: t.sage, bg: t.cream, audit: "2.96", auditVerdict: "F / F" },
    { pair: "sage / wheat", fg: t.sage, bg: t.wheat, audit: "2.63", auditVerdict: "F / F" },
    { pair: "sand / white", fg: t.sand, bg: white, audit: "2.26", auditVerdict: "F / F" },
    { pair: "sand / cream", fg: t.sand, bg: t.cream, audit: "2.19", auditVerdict: "F / F" },
    { pair: "sand / wheat", fg: t.sand, bg: t.wheat, audit: "1.94", auditVerdict: "F / F" },
    { pair: "sand / sand 10 % (texto de error; fondo sobre cream)", fg: t.sand, bg: sandError, audit: "~2.0–2.1", auditVerdict: "F / F" },
    { pair: "moss / white", fg: t.moss, bg: white, audit: "1.53", auditVerdict: "F / F" },
    { pair: "white / sage (botón Present activo)", fg: white, bg: t.sage, audit: "3.06", auditVerdict: "F (12 px bold) / P" },
    { pair: "white / sand (botón Absent activo)", fg: white, bg: t.sand, audit: "2.26", auditVerdict: "F / F" },
    { pair: "natural-border / white (bordes de controles)", fg: t.border, bg: white, audit: "1.26", auditVerdict: "— / F" },
    { pair: "forest 60 % sobre la nav (wheat 20 % sobre cream)", fg: composite(t.forest, 0.6, navBg), bg: navBg, audit: "~3.4", auditVerdict: "F / P" },
    { pair: "forest 70 % / white", fg: composite(t.forest, 0.7, white), bg: white, audit: "~4.7", auditVerdict: "límite / P" },
    { pair: "tier Busy Bee `color` como texto / white", fg: tier("Busy Bee").color, bg: white, audit: "2.06", auditVerdict: "F / F" },
    { pair: "tier Forager `color` como texto / white", fg: tier("Forager").color, bg: white, audit: "2.46", auditVerdict: "F / F" },
    { pair: "tier Hatcher `color` como texto / white", fg: tier("Hatcher").color, bg: white, audit: "2.51", auditVerdict: "F / F" },
    { pair: "tier Dormant `color` como texto / white", fg: tier("Dormant").color, bg: white, audit: "7.47", auditVerdict: "P / P" },
    { pair: "tier Busy Bee `textColor` / bgLight", fg: tier("Busy Bee").textColor, bg: tier("Busy Bee").bgLight, audit: "6.0–7.5", auditVerdict: "P / P" },
    { pair: "tier Forager `textColor` / bgLight", fg: tier("Forager").textColor, bg: tier("Forager").bgLight, audit: "6.0–7.5", auditVerdict: "P / P" },
    { pair: "tier Hatcher `textColor` / bgLight", fg: tier("Hatcher").textColor, bg: tier("Hatcher").bgLight, audit: "6.0–7.5", auditVerdict: "P / P" },
    { pair: "\"--\" de la matriz (#FAEDCD) / white", fg: "#FAEDCD", bg: white, audit: "1.16", auditVerdict: "F / F" },
    { pair: "#6B7F60 / white (ticks del gráfico del modal)", fg: "#6B7F60", bg: white, audit: "4.35", auditVerdict: "F (por poco) / P" },
    { pair: "amber-700 / amber-50", fg: tw.amber700.hex, bg: tw.amber50.hex, audit: "~4.9", auditVerdict: "P / P" },
    { pair: "red-600 / white", fg: tw.red600.hex, bg: white, audit: "~4.8", auditVerdict: "P / P" },
  ].map(p => {
    const fg = typeof p.fg === "string" ? p.fg.toUpperCase() : rgbToHex(p.fg);
    const bg = typeof p.bg === "string" ? p.bg.toUpperCase() : rgbToHex(p.bg);
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    const verdict = `${ratio >= AA_TEXT ? "P" : "F"} / ${ratio >= AA_UI ? "P" : "F"}`;
    return { pair: p.pair, fg, bg, audit: p.audit, auditVerdict: p.auditVerdict, ratio, verdict };
  });
}

// ---------------------------------------------------------------------------------------------
// git + CLI
// ---------------------------------------------------------------------------------------------

function sortObject(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Reads every file under src/ of `ref` → { "src/App.tsx": "…", … } */
export function readRefSources(repoDir, ref) {
  const names = git(repoDir, ["ls-tree", "-r", "--name-only", ref, "--", "src"]).split("\n").filter(Boolean);
  const files = {};
  for (const name of names) {
    if (!/\.(ts|tsx|css)$/.test(name)) continue;
    files[name] = git(repoDir, ["show", `${ref}:${name}`]).replace(/\r\n/g, "\n");
  }
  return files;
}

export function measure(repoDir, ref) {
  const commit = git(repoDir, ["rev-parse", `${ref}^{commit}`]).trim();
  const commitDate = git(repoDir, ["show", "-s", "--format=%cI", commit]).trim();
  let tagDate = null;
  try {
    tagDate = git(repoDir, ["for-each-ref", `refs/tags/${ref}`, "--format=%(taggerdate:iso-strict)"]).trim() || null;
  } catch {
    tagDate = null;
  }
  const files = readRefSources(repoDir, ref);
  const css = files["src/index.css"] ?? "";
  const twTheme = readFileSync(path.join(repoDir, "node_modules", "tailwindcss", "theme.css"), "utf8");
  const tw = {
    amber700: parseTailwindColor(twTheme, "amber-700"),
    amber50: parseTailwindColor(twTheme, "amber-50"),
    red600: parseTailwindColor(twTheme, "red-600"),
  };
  const theme = parseThemeColors(css);
  const tiers = parseTierColors(files["src/beehavior.ts"] ?? "");
  return {
    ref,
    commit,
    commitDate,
    tagDate,
    measuredAt: new Date().toISOString(),
    files: Object.keys(files).filter(isStyleSource).length,
    counts: countStyleRules(files),
    animations: checkAnimations(files, css),
    theme,
    tiers,
    tailwind: tw,
    contrast: appendixAPairs({ t: theme, tiers, tw }),
  };
}

export function toMarkdown(r) {
  const out = [];
  out.push(`# Conteos de código — ${r.ref} (${r.commit.slice(0, 7)})`, "");
  out.push(`Commit ${r.commit} · ${r.commitDate}${r.tagDate ? ` · tag ${r.tagDate}` : ""} · ${r.files} archivos .ts/.tsx (sin tests)`, "");
  out.push("| Regla | Regex | Total |", "|---|---|---:|");
  for (const rule of STYLE_RULES) out.push(`| ${rule.label} | \`${rule.regex.source.replace(/\|/g, "\\|")}\` | ${r.counts[rule.id].total} |`);
  out.push(`| \`animate-*\` sin keyframes | clases no built-in sin \`--animate-*\` en \`@theme\` | ${r.animations.undefinedClasses.length} clases / ${r.animations.undefinedUses} usos (de ${r.animations.classes} clases / ${r.animations.uses} usos) |`, "");
  for (const rule of STYLE_RULES) {
    out.push(`## ${rule.id} — por archivo`, "");
    for (const [f, n] of Object.entries(r.counts[rule.id].byFile)) out.push(`- \`${f}\`: ${n}`);
    out.push("", `Por valor: ${Object.entries(r.counts[rule.id].byMatch).map(([m, n]) => `\`${m}\` ${n}`).join(" · ") || "—"}`, "");
  }
  out.push("## animate-*", "");
  out.push(`Usos: ${Object.entries(r.animations.byName).map(([m, n]) => `\`animate-${m}\` ${n}`).join(" · ")}`);
  out.push(`Sin definir: ${r.animations.undefinedClasses.join(", ") || "ninguna"} · \`--animate-*\` sin @keyframes: ${r.animations.missingKeyframes.map(m => m.name).join(", ") || "ninguno"}`, "");
  out.push("## Contraste (Apéndice A)", "");
  out.push("| Par | Texto | Fondo | Auditoría | Veredicto auditoría | Recalculado | Veredicto (AA texto / UI) |", "|---|---|---|---:|---|---:|---|");
  for (const c of r.contrast) out.push(`| ${c.pair} | \`${c.fg}\` | \`${c.bg}\` | ${c.audit} | ${c.auditVerdict} | ${c.ratio.toFixed(2)} | ${c.verdict} |`);
  out.push("", `Tailwind v4 (oklch → sRGB): amber-700 ${r.tailwind.amber700.hex}, amber-50 ${r.tailwind.amber50.hex}, red-600 ${r.tailwind.red600.hex}`);
  return out.join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const ref = args.find(a => !a.startsWith("--")) ?? "v4.0.0";
  const repoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = measure(repoDir, ref);
  process.stdout.write((args.includes("--json") ? JSON.stringify(result, null, 2) : toMarkdown(result)) + "\n");
}

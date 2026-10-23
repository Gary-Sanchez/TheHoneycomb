import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { getHiveTier, NO_DATA_TIER } from "./beehavior";

// US-54: design tokens of PRD 4.1 §2.1. The contrast check walks the declared token pairs and fails,
// naming the pair, when a text pair is below 4.5:1 or a border / focus pair below 3:1 (WCAG 1.4.3
// and 1.4.11). Catalog with the computed ratios: docs/DESIGN-TOKENS.md.

const css = readFileSync(join(__dirname, "index.css"), "utf8");

/** Every `--name: value;` declared in src/index.css (all @theme blocks and :root). */
const declared = new Map<string, string>();
// First declaration wins: the focus-ring-* utilities further down re-set --focus-ring-* for their subtree.
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!declared.has(m[1])) declared.set(m[1], m[2].trim());

/** Follows var(--x) chains down to a literal value. */
function resolve(name: string, seen: string[] = []): string {
  const value = declared.get(name);
  if (value === undefined) throw new Error(`${name} is not declared in src/index.css (via ${seen.join(" → ") || "test"})`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (!ref) return value;
  if (seen.includes(name)) throw new Error(`var() cycle: ${[...seen, name].join(" → ")}`);
  return resolve(ref[1], [...seen, name]);
}

function hex(name: string): string {
  const value = resolve(name);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} resolves to ${value}, expected a #RRGGBB color`);
  return value.toUpperCase();
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background] as token names without the `--color-` prefix.
const TEXT_PAIRS: [string, string][] = [
  ["forest", "surface"],
  ["forest", "cream"],
  ["forest", "wheat"],
  ["surface", "forest"],
  ["surface", "forest-hover"],
  ["cream", "forest"],
  ["wheat", "forest"],
  ["sage-text", "surface"],
  ["sage-text", "cream"],
  ["sage-text", "wheat"],
  ["sand-text", "surface"],
  ["sand-text", "cream"],
  ["sand-text", "wheat"],
  ["text-muted", "surface"],
  ["text-muted", "cream"],
  ["text-muted", "wheat"],
  ["danger", "danger-bg"],
  ["danger", "surface"],
  ["warning", "warning-bg"],
  ["warning", "surface"],
  ["success", "success-bg"],
  ["success", "surface"],
  ["info", "info-bg"],
  ["info", "surface"],
  ["tier-busy-bee", "tier-busy-bee-bg"],
  ["tier-forager", "tier-forager-bg"],
  ["tier-hatcher", "tier-hatcher-bg"],
  ["tier-dormant", "tier-dormant-bg"],
  ["tier-no-data", "tier-no-data-bg"],
  ["activity-speakeasy-text", "surface"],
  ["activity-reading-club-text", "surface"],
  ["activity-music-room-text", "surface"],
  ["activity-writing-hood-text", "surface"],
  ["activity-speakeasy-text", "cream"],
  ["activity-reading-club-text", "cream"],
  ["activity-music-room-text", "cream"],
  ["activity-writing-hood-text", "cream"],
  ["chart-axis", "surface"],
  ["chart-axis-muted", "surface"],
  ["chart-tooltip-text", "chart-tooltip-bg"],
  ["chart-tooltip-accent", "chart-tooltip-bg"],
];

const BORDER_PAIRS: [string, string][] = [
  ["input-border", "surface"],
  ["input-border", "cream"],
  ["danger-border", "danger-bg"],
  ["warning-border", "warning-bg"],
  ["success-border", "success-bg"],
  ["info-border", "info-bg"],
];

// The focus ring (--focus-ring-color) against the backgrounds it is drawn on, and the
// focus-ring-on-dark variant (cream) against forest.
const FOCUS_PAIRS: [string, string][] = [
  ["--focus-ring-color", "--color-surface"],
  ["--focus-ring-color", "--color-cream"],
  ["--focus-ring-color", "--color-wheat"],
  ["--color-cream", "--color-forest"],
];

const color = (token: string) => `--color-${token}`;

describe("US-54: token contrast (PRD 4.1 §2.3)", () => {
  it.each(TEXT_PAIRS.map(([fg, bg]) => [color(fg), color(bg)]))("text %s on %s is at least 4.5:1", (fg, bg) => {
    const ratio = contrast(hex(fg), hex(bg));
    expect(ratio, `text pair ${fg} (${hex(fg)}) on ${bg} (${hex(bg)}) is ${ratio.toFixed(2)}:1, needs 4.5:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BORDER_PAIRS.map(([fg, bg]) => [color(fg), color(bg)]))("border %s on %s is at least 3:1", (fg, bg) => {
    const ratio = contrast(hex(fg), hex(bg));
    expect(ratio, `border pair ${fg} (${hex(fg)}) on ${bg} (${hex(bg)}) is ${ratio.toFixed(2)}:1, needs 3:1`).toBeGreaterThanOrEqual(3);
  });

  it.each(FOCUS_PAIRS)("focus ring %s on %s is at least 3:1", (fg, bg) => {
    const ratio = contrast(hex(fg), hex(bg));
    expect(ratio, `focus pair ${fg} (${hex(fg)}) on ${bg} (${hex(bg)}) is ${ratio.toFixed(2)}:1, needs 3:1`).toBeGreaterThanOrEqual(3);
  });

  it("the contrast formula matches known WCAG values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });
});

// US-58: deuteranopia simulation — Machado, Oliveira & Fernandes (2009), severity 1.0, applied to
// linearized sRGB; the result is compared in CIE L*a*b* (D65) with CIE76 ΔE.
const DEUTERANOPIA = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];

function linearRgb(color: string): number[] {
  return [1, 3, 5].map(i => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}

function toLab([r, g, b]: number[]): number[] {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deuteranopeLab(color: string): number[] {
  const rgb = linearRgb(color);
  return toLab(DEUTERANOPIA.map(row => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))));
}

const deltaE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const ACTIVITY_FILLS = ["speakeasy", "reading-club", "music-room", "writing-hood"].map(a => `--color-activity-${a}`);

// ΔE 20 is well beyond "clearly different at a glance" (≈ 10 for adjacent chart swatches), so the
// four series stay apart for a deuteranope even on small legend dots. Today's minimum is ≈ 31.
const MIN_DEUTERANOPIA_DELTA_E = 20;

describe("US-58: activity palette (PRD 4.1 §2.8)", () => {
  it.each(ACTIVITY_FILLS)("fill %s is at least 3:1 on surface", fill => {
    const ratio = contrast(hex(fill), hex("--color-surface"));
    expect(ratio, `${fill} (${hex(fill)}) on surface is ${ratio.toFixed(2)}:1, needs 3:1`).toBeGreaterThanOrEqual(3);
  });

  it("the 4 fills stay distinguishable under deuteranopia", () => {
    for (let i = 0; i < ACTIVITY_FILLS.length; i++) {
      for (let j = i + 1; j < ACTIVITY_FILLS.length; j++) {
        const [a, b] = [ACTIVITY_FILLS[i], ACTIVITY_FILLS[j]];
        const d = deltaE(deuteranopeLab(hex(a)), deuteranopeLab(hex(b)));
        expect(d, `${a} vs ${b}: ΔE ${d.toFixed(1)} under deuteranopia`).toBeGreaterThanOrEqual(MIN_DEUTERANOPIA_DELTA_E);
      }
    }
  });

  it("the deuteranopia simulation behaves as expected", () => {
    // Pure red and pure green collapse onto the same yellowish hue; black and white are unchanged.
    expect(deltaE(deuteranopeLab("#FF0000"), deuteranopeLab("#00FF00"))).toBeLessThan(deltaE(toLab(linearRgb("#FF0000")), toLab(linearRgb("#00FF00"))) / 2);
    expect(deuteranopeLab("#000000")[0]).toBeCloseTo(0, 5);
    expect(deuteranopeLab("#FFFFFF")[0]).toBeCloseTo(100, 0);
  });

  it("chart-1..4 are the activity fills, in ACTIVITIES order", () => {
    ACTIVITY_FILLS.forEach((fill, i) => expect(hex(`--color-chart-${i + 1}`)).toBe(hex(fill)));
  });
});

describe("US-54: token catalog (PRD 4.1 §2.1)", () => {
  it("declares every token group of the PRD", () => {
    const required = [
      "--color-forest-hover", "--color-surface", "--color-sage-text", "--color-sand-text", "--color-text-muted",
      "--color-input-border",
      ...["danger", "warning", "success", "info"].flatMap(s => [`--color-${s}`, `--color-${s}-bg`, `--color-${s}-border`]),
      ...["busy-bee", "forager", "hatcher", "dormant", "no-data"].flatMap(t => [`--color-tier-${t}`, `--color-tier-${t}-bg`, `--color-tier-${t}-border`]),
      ...["speakeasy", "reading-club", "music-room", "writing-hood"].flatMap(a => [`--color-activity-${a}`, `--color-activity-${a}-text`]),
      "--color-chart-1", "--color-chart-2", "--color-chart-3", "--color-chart-4",
      "--text-micro", "--text-body", "--text-body-lg", "--text-h3", "--text-h2", "--text-h1", "--text-kpi",
      "--radius-control", "--radius-card", "--radius-panel", "--radius-chip",
      "--shadow-sm", "--shadow-md", "--shadow-2xl",
      "--z-nav", "--z-header", "--z-dropdown", "--z-dialog", "--z-toast",
    ];
    for (const name of required) expect(declared.has(name), `${name} missing from src/index.css`).toBe(true);
  });

  it("uses the PRD scale values", () => {
    expect(resolve("--text-micro")).toBe("0.75rem");
    expect(resolve("--text-body")).toBe("0.875rem");
    expect(resolve("--text-body-lg")).toBe("1rem");
    expect(resolve("--text-h3")).toBe("1.125rem");
    expect(resolve("--text-h2")).toBe("1.5rem");
    expect(resolve("--text-h1")).toBe("1.875rem");
    expect(resolve("--text-kpi")).toBe("2.25rem");
    expect(resolve("--radius-control")).toBe("0.75rem");
    expect(resolve("--radius-card")).toBe("1.5rem");
    expect(resolve("--radius-panel")).toBe("2rem");
    expect(["--z-nav", "--z-header", "--z-dropdown", "--z-dialog", "--z-toast"].map(z => resolve(z))).toEqual(["20", "30", "40", "50", "60"]);
    expect(resolve("--duration-fast")).toBe("150ms");
    expect(resolve("--duration-base")).toBe("250ms");
  });

  it("keeps the old --color-natural-* names as aliases with the v4.0.0 values", () => {
    const v400: Record<string, string> = {
      forest: "#2D3E35", sage: "#8A9A5B", sand: "#D4A373", moss: "#CCD5AE",
      wheat: "#FAEDCD", cream: "#FDFBF7", border: "#E9E5D9",
    };
    for (const [name, value] of Object.entries(v400)) {
      expect(declared.get(`--color-natural-${name}`)).toBe(`var(--color-${name})`);
      expect(hex(`--color-natural-${name}`)).toBe(value);
    }
  });

  it("tier tokens mirror src/beehavior.ts (fg = textColor, bg = bgLight, border = color)", () => {
    const tiers = { "busy-bee": getHiveTier(90), forager: getHiveTier(60), hatcher: getHiveTier(30), dormant: getHiveTier(0), "no-data": NO_DATA_TIER };
    for (const [name, tier] of Object.entries(tiers)) {
      expect(hex(`--color-tier-${name}`)).toBe(tier.textColor.toUpperCase());
      expect(hex(`--color-tier-${name}-bg`)).toBe(tier.bgLight.toUpperCase());
      expect(hex(`--color-tier-${name}-border`)).toBe(tier.color.toUpperCase());
    }
  });

  it("the Phase-0 250 ms animations use --duration-base", () => {
    for (const name of ["fade-in", "slide-up", "slide-down"]) {
      expect(declared.get(`--animate-${name}`)).toBe(`${name} var(--duration-base) ease-out both`);
    }
  });

  it("declares color-scheme: light", () => {
    expect(css).toMatch(/color-scheme:\s*light/);
  });
});

describe("US-54: one ink and a visible focus ring", () => {
  const tsx = (dir: string): string[] =>
    readdirSync(join(__dirname, dir), { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? tsx(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : []
    );
  const sources = tsx(".").map(file => [file, readFileSync(join(__dirname, file), "utf8")] as const);

  it("#1A1A1A is unified with forest (D-1)", () => {
    for (const [file, content] of sources) expect(content, file).not.toMatch(/1a1a1a/i);
    expect(css).not.toMatch(/1a1a1a/i);
  });

  it("every :focus-visible element gets a 2 px forest ring with a 2 px offset", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring-color\);\s*outline-offset:\s*var\(--focus-ring-offset\);/);
    expect(declared.get("--focus-ring-width")).toBe("2px");
    expect(declared.get("--focus-ring-offset")).toBe("2px");
    expect(declared.get("--focus-ring-color")).toBe("var(--color-forest)");
  });

  it("no component hides the focus ring or draws its own", () => {
    for (const [file, content] of sources) {
      expect(content, file).not.toMatch(/(?<![\w-])(focus|focus-visible):(outline-none|outline-hidden|ring-)/);
    }
  });

  it("the tab bar draws the ring inside its overflow container", () => {
    // US-59: the app's tab bar is the Tabs component; its scrolling tablist's tabs use focus-ring-inset
    expect(readFileSync(join(__dirname, "App.tsx"), "utf8")).toMatch(/<Tabs\b/);
    const tabs = readFileSync(join(__dirname, "components", "ui", "Tabs.tsx"), "utf8");
    expect(tabs).toMatch(/flex overflow-x-auto/);
    expect(tabs).toMatch(/focus-ring-inset/);
  });
});

import { describe, expect, it } from "vitest";
import {
  checkAnimations,
  composite,
  contrastRatio,
  countStyleRules,
  isStyleSource,
  oklchToRgb,
  parseThemeColors,
  parseTierColors,
  rgbToHex,
} from "./snapshot-code-counts.mjs";

// US-51: pure functions of the audit baseline script (docs/SNAPSHOT-4.0.md).

describe("style rules", () => {
  const sample = [
    `<div className="bg-[#2D3E35]/45 hover:text-[#1A1A1A] border-[#CCD5AE] accent-[#2D3E35] from-[#2D3E35]">`,
    `<p className="text-[10px] text-[11px] text-[9.5px] text-xs rounded-[32px] rounded-t-[24px] rounded-xl">`,
    `<span className="text-amber-700 bg-red-50 border-gray-200 hover:bg-red-600/80 text-natural-sand">`,
  ].join("\n");

  it("counts each rule per occurrence", () => {
    const counts = countStyleRules({ "src/components/Sample.tsx": sample });
    expect(counts.hex.total).toBe(3);
    expect(counts.hexOther.byMatch).toEqual({ "accent-[#2D3E35]": 1, "from-[#2D3E35]": 1 });
    expect(counts.textPx.total).toBe(3);
    expect(counts.rounded.byMatch).toEqual({ "rounded-[32px]": 1, "rounded-t-[24px]": 1 });
    expect(counts.rawColor.total).toBe(4);
  });

  it("only looks at .ts/.tsx under src/, without tests", () => {
    expect(isStyleSource("src/App.tsx")).toBe(true);
    expect(isStyleSource("src/utils.ts")).toBe(true);
    expect(isStyleSource("src/utils.test.ts")).toBe(false);
    expect(isStyleSource("src/components/DashboardPanels.test.tsx")).toBe(false);
    expect(isStyleSource("src/index.css")).toBe(false);
    expect(isStyleSource("server.ts")).toBe(false);
    const counts = countStyleRules({ "src/a.test.tsx": sample, "e2e/x.ts": sample });
    expect(counts.hex.total).toBe(0);
  });
});

describe("animations", () => {
  const css = `@theme {
    --animate-fade-in: fade-in 250ms ease-out both;
    --animate-pulse-slow: pulse-subtle 3s ease-in-out infinite;
    --animate-ghost: ghost 1s;
    @keyframes fade-in { from { opacity: 0; } }
    @keyframes pulse-subtle { 50% { opacity: .7; } }
  }`;

  it("flags animate-* classes without definition and --animate-* without keyframes", () => {
    const files = { "src/A.tsx": `"animate-fade-in animate-spin animate-wiggle animate-pulse-slow animate-fade-in"` };
    const result = checkAnimations(files, css);
    expect(result.uses).toBe(5);
    expect(result.undefinedClasses).toEqual(["wiggle"]);
    expect(result.undefinedUses).toBe(1);
    expect(result.missingKeyframes).toEqual([{ name: "ghost", keyframes: "ghost" }]);
  });
});

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1 grey
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });

  it("composites alpha over the background", () => {
    expect(rgbToHex(composite("#000000", 0.5, "#FFFFFF"))).toBe("#808080");
    expect(rgbToHex(composite("#2D3E35", 1, "#FFFFFF"))).toBe("#2D3E35");
  });

  it("converts Tailwind v4 oklch defaults to their sRGB hex", () => {
    expect(rgbToHex(oklchToRgb(55.5, 0.163, 48.998))).toBe("#BB4D00"); // amber-700
    expect(rgbToHex(oklchToRgb(98.7, 0.022, 95.277))).toBe("#FFFBEB"); // amber-50
    expect(rgbToHex(oklchToRgb(57.7, 0.245, 27.325))).toBe("#E7000B"); // red-600
  });

  it("parses theme tokens and tier colors", () => {
    expect(parseThemeColors("--color-natural-forest: #2D3E35;\n--color-natural-sage: #8a9a5b;")).toEqual({
      forest: "#2D3E35",
      sage: "#8A9A5B",
    });
    const ts = `label: "Busy Bee",\n      color: "#D4AF37", // x\n      bgLight: "#FFFDF0", // y\n      textColor: "#7A5E00",`;
    expect(parseTierColors(ts)).toEqual({ "Busy Bee": { color: "#D4AF37", bgLight: "#FFFDF0", textColor: "#7A5E00" } });
  });
});

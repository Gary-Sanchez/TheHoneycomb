import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BASELINE_PATH, RULE_IDS, V4_CEILING, formatReport, lintStyles, parseBaseline, readWorkingTree } from "./lint-styles.mjs";

// US-53: style lint with a baseline (docs/STYLE-LINT.md). QA-01..06 with in-memory trees, plus the
// real working tree against the versioned baseline and docs/SNAPSHOT-4.0.md (QA-08).

const CSS = [
  "@theme {",
  "  --animate-fade-in: fade-in 0.3s ease-out;",
  "}",
  "@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }",
].join("\n");

const COMPONENT = [
  `export function Card() {`,
  `  return (`,
  `    <div className="bg-[#FAEDCD] text-[#1A1A1A] rounded-[24px] animate-fade-in animate-spin">`,
  `      <p className="text-[10px] text-amber-700">hola</p>`,
  `    </div>`,
  `  );`,
  `}`,
].join("\n");

const BASE = { hex: 2, textPx: 1, rounded: 1, rawColor: 1, animate: 0 };
const files = (content = COMPONENT) => ({ "src/components/Card.tsx": content });
const rule = (result: ReturnType<typeof lintStyles>, id: string) => result.rules.find(r => r.id === id)!;

describe("lintStyles", () => {
  it("QA-01: passes when every count equals the baseline", () => {
    const result = lintStyles({ files: files(), css: CSS, baseline: BASE, previousBaseline: BASE });
    expect(result.ok).toBe(true);
    expect(result.totals).toEqual(BASE);
    expect(result.rules.every(r => r.status === "ok")).toBe(true);
    const report = formatReport(result);
    expect(report).toContain("hex       2/2 ok");
    expect(report).not.toContain("src/components/Card.tsx:"); // no details on a clean run
  });

  it("QA-02: a new bg-[#CCD5AE] fails with file, line and rule", () => {
    const content = COMPONENT.replace(`<p className="`, `<p className="bg-[#CCD5AE] `);
    const result = lintStyles({ files: files(content), css: CSS, baseline: BASE });
    expect(result.ok).toBe(false);
    expect(rule(result, "hex").status).toBe("fail");
    expect(rule(result, "hex").violations).toContainEqual({ file: "src/components/Card.tsx", line: 4, rule: "hex", match: "bg-[#CCD5AE]" });
    expect(formatReport(result)).toContain("src/components/Card.tsx:4  [hex]  bg-[#CCD5AE]");
    // only the failing rule gets details
    expect(formatReport(result)).not.toContain("[textPx]");
  });

  it("QA-03: animate-wiggle without keyframes fails under animate", () => {
    const content = COMPONENT.replace("animate-spin", "animate-spin animate-wiggle");
    const result = lintStyles({ files: files(content), css: CSS, baseline: BASE });
    expect(result.ok).toBe(false);
    expect(rule(result, "animate").count).toBe(1);
    expect(rule(result, "animate").violations).toEqual([{ file: "src/components/Card.tsx", line: 3, rule: "animate", match: "animate-wiggle" }]);
    expect(formatReport(result)).toContain("src/components/Card.tsx:3  [animate]  animate-wiggle");
  });

  it("QA-03: a --animate-* whose @keyframes doesn't exist also counts under animate", () => {
    const css = CSS.replace("@keyframes fade-in", "@keyframes fade-out");
    const result = lintStyles({ files: files(), css, baseline: BASE });
    expect(result.ok).toBe(false);
    expect(rule(result, "animate").violations).toEqual([
      { file: "src/index.css", line: 2, rule: "animate", match: "--animate-fade-in → @keyframes fade-in no existe" },
    ]);
  });

  it("QA-04: text-red-600 fails under rawColor", () => {
    const content = COMPONENT.replace("text-amber-700", "text-amber-700 text-red-600");
    const result = lintStyles({ files: files(content), css: CSS, baseline: BASE });
    expect(result.ok).toBe(false);
    expect(rule(result, "rawColor").status).toBe("fail");
    expect(rule(result, "rawColor").violations).toContainEqual({ file: "src/components/Card.tsx", line: 4, rule: "rawColor", match: "red-600" });
  });

  it("QA-05: text-[10px] → text-xs passes and says the baseline can be lowered", () => {
    const content = COMPONENT.replace("text-[10px]", "text-xs");
    const result = lintStyles({ files: files(content), css: CSS, baseline: BASE, previousBaseline: BASE });
    expect(result.ok).toBe(true);
    expect(rule(result, "textPx")).toMatchObject({ count: 0, baseline: 1, status: "lower" });
    expect(formatReport(result)).toContain(`se puede bajar la línea base de "textPx" a 0`);
  });

  it("QA-06: a baseline raised over its committed version fails", () => {
    const result = lintStyles({ files: files(), css: CSS, baseline: { ...BASE, hex: 3 }, previousBaseline: BASE });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/"hex" subió de 2 .* a 3/);
  });

  it("QA-06: a baseline above the v4.0.0 values fails even without a committed version", () => {
    const result = lintStyles({ files: {}, css: "", baseline: { ...V4_CEILING, rawColor: 40 }, previousBaseline: null });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(`"rawColor" es 40, por encima del valor de v4.0.0 (39)`);
  });

  it("lowering the baseline (below the committed one) is fine", () => {
    const lowered = { ...BASE, textPx: 0 };
    const content = COMPONENT.replace("text-[10px]", "text-xs");
    const result = lintStyles({ files: files(content), css: CSS, baseline: lowered, previousBaseline: BASE });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("ignores .ts files, *.test.tsx and anything outside src/", () => {
    const result = lintStyles({
      files: { "src/utils.ts": COMPONENT, "src/components/Card.test.tsx": COMPONENT, "e2e/x.tsx": COMPONENT, "server.tsx": COMPONENT },
      css: CSS,
      baseline: { hex: 0, textPx: 0, rounded: 0, rawColor: 0, animate: 0 },
    });
    expect(result.files).toBe(0);
    expect(result.ok).toBe(true);
  });

  it("normalizes CRLF and Windows paths", () => {
    const result = lintStyles({ files: { "src\\components\\Card.tsx": COMPONENT.replace(/\n/g, "\r\n") }, css: CSS, baseline: BASE });
    expect(result.ok).toBe(true);
    expect(rule(result, "hex").violations[0]).toMatchObject({ file: "src/components/Card.tsx", line: 3 });
  });

  it("all-zero baseline is absolute: any occurrence fails (US-67)", () => {
    const zero = { hex: 0, textPx: 0, rounded: 0, rawColor: 0, animate: 0 };
    const result = lintStyles({ files: { "src/A.tsx": `<p className="text-[11px]" />` }, css: "", baseline: zero });
    expect(result.absolute).toBe(true);
    expect(result.ok).toBe(false);
    expect(formatReport(result)).toContain("modo absoluto");
  });
});

describe("parseBaseline", () => {
  it("ignores $-keys and rejects unknown, missing or invalid rules", () => {
    expect(parseBaseline({ $comment: "x", ...BASE }).baseline).toEqual(BASE);
    expect(parseBaseline({ ...BASE, hexOther: 3 }).errors).toEqual([`regla desconocida en la línea base: "hexOther"`]);
    expect(parseBaseline({ hex: 1 }).errors).toHaveLength(4);
    expect(parseBaseline({ ...BASE, hex: -1 }).errors[0]).toContain(`"hex" debe ser un entero >= 0`);
    expect(parseBaseline({ ...BASE, hex: 1.5 }).baseline).toBeNull();
    expect(parseBaseline(null).baseline).toBeNull();
  });

  it("an invalid baseline makes the lint fail", () => {
    expect(lintStyles({ files: {}, css: "", baseline: { hex: "132" } }).ok).toBe(false);
  });
});

describe("working tree (QA-01 / QA-08)", () => {
  const repoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baseline = JSON.parse(readFileSync(path.join(repoDir, BASELINE_PATH), "utf8"));

  it("the v4.0.0 ceiling is what docs/SNAPSHOT-4.0.md section 1 records", () => {
    const snapshot = readFileSync(path.join(repoDir, "docs", "SNAPSHOT-4.0.md"), "utf8");
    const total = (label: RegExp) => Number(snapshot.split("\n").find(l => label.test(l))?.match(/\| \*\*(\d+)\*\*/)?.[1]);
    expect({
      hex: total(/^\| Hex arbitrarios en clases/),
      textPx: total(/^\| Tamaños de texto sueltos/),
      rounded: total(/^\| Radios sueltos/),
      rawColor: total(/^\| Colores Tailwind crudos/),
      animate: total(/^\| `animate-\*` sin keyframes/),
    }).toEqual({ ...V4_CEILING });
  });

  it("versioned baseline is valid and never above v4.0.0", () => {
    const { baseline: parsed, errors } = parseBaseline(baseline);
    expect(errors).toEqual([]);
    for (const id of RULE_IDS) expect(parsed![id]).toBeLessThanOrEqual(V4_CEILING[id as keyof typeof V4_CEILING]);
  });

  it("current src/ counts are within the baseline", () => {
    const { files: tree, css } = readWorkingTree(repoDir);
    const result = lintStyles({ files: tree, css, baseline });
    expect(result.ok, formatReport(result)).toBe(true);
    // Until a PR fixes violations, src/ is exactly v4.0.0: counts == baseline == SNAPSHOT-4.0.
    // Once the baseline is lowered, this only requires counts <= baseline.
    for (const r of result.rules) expect(r.count).toBeLessThanOrEqual(r.baseline!);
  });
});

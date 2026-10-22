import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

// US-55: Inter, Playfair Display and JetBrains Mono are self-hosted from the
// @fontsource-variable/* packages, so neither CSP allows Google's font origins and
// src/index.css loads nothing remote.
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const FONT_PACKAGES = [
  "@fontsource-variable/inter",
  "@fontsource-variable/playfair-display",
  "@fontsource-variable/jetbrains-mono",
];

describe("self-hosted fonts (US-55)", () => {
  it.each(["index.html", "vite.config.ts"])("the CSP in %s does not allow Google Fonts", (file) => {
    const csp = read(file).match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
    expect(csp).not.toBeNull();
    expect(csp![1]).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(csp![1]).toMatch(/font-src 'self' data:;/);
  });

  it("src/index.css has no remote @import or url()", () => {
    const css = read("src/index.css");
    expect(css).not.toMatch(/@import\s+url\(/);
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
  });

  it("every @font-face uses font-display: swap and a fontsource-variable woff2", () => {
    const faces = read("src/index.css").match(/@font-face\s*\{[^}]*\}/g) ?? [];
    const families = new Set(faces.map((f) => f.match(/font-family:\s*"([^"]+)"/)?.[1]));
    expect(families).toEqual(new Set(["Inter", "Playfair Display", "JetBrains Mono"]));
    for (const face of faces) {
      expect(face).toMatch(/font-display:\s*swap;/);
      expect(face).toMatch(/src:\s*url\("@fontsource-variable\/[a-z-]+\/files\/[a-z-]+\.woff2"\)/);
    }
  });

  it("the font packages are runtime dependencies, never devDependencies", () => {
    const pkg = JSON.parse(read("package.json"));
    for (const name of FONT_PACKAGES) {
      expect(pkg.dependencies).toHaveProperty(name);
      expect(pkg.devDependencies ?? {}).not.toHaveProperty(name);
    }
  });

  it("the font-display theme alias is gone", () => {
    expect(read("src/index.css")).not.toMatch(/--font-display\s*:/);
  });
});

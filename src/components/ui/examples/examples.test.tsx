// @vitest-environment jsdom
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ExamplesPage, { EXAMPLE_SECTIONS } from "./ExamplesPage";

// US-56: the examples page exists only in development.
const root = join(__dirname, "..", "..", "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const csp = (html: string) => html.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)?.[0];

afterEach(cleanup);

describe("US-56: examples page", () => {
  it("QA-06: vite.config.ts builds index.html only, so examples.html never reaches dist/", () => {
    const config = read("vite.config.ts");
    expect(config).not.toMatch(/examples/i);
    expect(config).not.toMatch(/rollupOptions|\binput\s*:/);
  });

  it("examples.html loads its own entry and carries the same CSP as index.html", () => {
    expect(existsSync(join(root, "examples.html"))).toBe(true);
    const html = read("examples.html");
    expect(html).toContain('src="/src/components/ui/examples/main.tsx"');
    expect(csp(html)).toBeTruthy();
    expect(csp(html)).toBe(csp(read("index.html")));
  });

  it("the app never imports the examples page", () => {
    expect(read("src/main.tsx")).not.toMatch(/examples/);
    expect(read("src/App.tsx")).not.toMatch(/components\/ui\/examples/);
  });

  it("renders one titled section per component, with every button variant", () => {
    render(<ExamplesPage />);
    for (const section of EXAMPLE_SECTIONS) {
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeTruthy();
    }
    for (const variant of ["primary", "secondary", "ghost", "danger", "link"]) {
      expect(screen.getByRole("button", { name: `${variant} md` })).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { name: "Disabled" })).toHaveLength(5);
  });
});

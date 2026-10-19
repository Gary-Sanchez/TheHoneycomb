// @vitest-environment jsdom
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SettingsPanel from "./components/SettingsPanel";

// US-49: version = PRD number, shown in Settings, release workflow on v* tags.
const root = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const pkg = JSON.parse(read("package.json"));

afterEach(cleanup);

describe("US-49: app version", () => {
  it("package.json version is MAJOR.MINOR.PATCH and matches PRD 4.0", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).toBe("4.0.0");
  });

  it("package-lock.json root carries the same version", () => {
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
  });

  it("__APP_VERSION__ is package.json's version", () => {
    expect(__APP_VERSION__).toBe(pkg.version);
  });

  it("Settings shows The Honeycomb v{version}, signed in or not", () => {
    for (const auth of [
      { authenticated: false, adminConfigured: true, setupAllowed: false },
      { authenticated: true, adminConfigured: true, setupAllowed: false },
      { authenticated: false, adminConfigured: false, setupAllowed: true },
    ]) {
      render(<SettingsPanel auth={auth} onAuthChange={() => {}} />);
      expect(screen.getByText(`The Honeycomb v${pkg.version}`)).toBeTruthy();
      cleanup();
    }
  });
});

describe("US-49: release workflow", () => {
  const release = read(".github", "workflows", "release.yml");

  it("runs only on pushed v* tags", () => {
    const on = release.slice(release.indexOf("\non:"), release.indexOf("\npermissions:"));
    expect(on).toMatch(/push:\s*\n\s*tags:\s*\n\s*- "v\*"/);
    expect(on).not.toMatch(/branches|pull_request|schedule|workflow_dispatch/);
  });

  it("lint, tests and build pass before the installer is built and published", () => {
    // the packaged app is smoke-tested from its own install folder before anything is published
    const steps = ["npm ci", "npm run lint", "npm test", "npm run build", "electron-builder --win nsis --publish never", "Smoke test packaged app", "-WorkingDirectory $dir", "gh release"];
    const positions = steps.map(step => release.indexOf(step));
    positions.forEach((pos, i) => expect(pos, steps[i]).toBeGreaterThan(-1));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // no step may swallow a failure and let the installer go out anyway
    expect(release).not.toContain("continue-on-error");
  });

  it("uses the tag's notes file and attaches the nsis installer", () => {
    expect(release).toContain('docs/releases/${TAG}.md');
    expect(release).toContain("release/*Setup*.exe");
    expect(release).toContain("--clobber");
    expect(release).toContain("--prerelease");
  });

  it("ci.yml still runs on push/PR to main, not on tags", () => {
    const ci = read(".github", "workflows", "ci.yml");
    expect(ci).toMatch(/push:\s*\n\s*branches: \[main\]/);
    expect(ci).toMatch(/pull_request:\s*\n\s*branches: \[main\]/);
    expect(ci).not.toContain("tags:");
  });

  it("every release note links its PRD from the same tag", () => {
    for (const [tag, prd] of [
      ["v2.0.0", "PRD%20-%20The%20Honeycomb%202.0.pdf"],
      ["v3.0.0", "PRD%20-%20The%20Honeycomb%203.0.md"],
      ["v4.0.0", "PRD%20-%20The%20Honeycomb%204.0.md"],
    ]) {
      expect(read("docs", "releases", `${tag}.md`)).toContain(`https://github.com/Gary-Sanchez/TheHoneycomb/blob/${tag}/docs/${prd}`);
    }
  });
});

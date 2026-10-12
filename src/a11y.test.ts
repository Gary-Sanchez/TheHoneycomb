import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// US-47: static guards so a merge conflict can't silently drop the Fase 0 accessibility attributes
// (PR #46 lost `Close progress report` and brought back a dead `.replace("English ", "")` that way).
const source = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8");

describe("US-47: accessible names and live regions", () => {
  it("icon-only buttons keep their accessible names", () => {
    expect(source("components", "ProgressReportModal.tsx")).toContain('aria-label="Close progress report"');
    expect(source("components", "AttendeeDirectory.tsx")).toContain("aria-label={`Delete ${att.name}`}");
    expect(source("components", "DocumentParser.tsx")).toContain("aria-label={`Remove ${rec.name}`}");
  });

  it("loading messages and the Manual Check-In success notice are announced (role=status)", () => {
    for (const file of [["App.tsx"], ["components", "AttendanceLogger.tsx"], ["components", "DocumentParser.tsx"]]) {
      expect(source(...file)).toContain('role="status"');
    }
  });

  it("the tab nav is labelled Main", () => {
    expect(source("App.tsx")).toContain('<nav aria-label="Main"');
  });
});

describe("US-47: animations and reduced motion", () => {
  const css = source("index.css");

  it("defines every animate-* class the components use", () => {
    for (const name of ["fade-in", "slide-up", "slide-down", "bounce-subtle", "pulse-subtle", "pulse-slow"]) {
      expect(css).toContain(`--animate-${name}:`);
    }
    for (const keyframes of ["fade-in", "slide-up", "slide-down", "bounce-subtle", "pulse-subtle"]) {
      expect(css).toContain(`@keyframes ${keyframes}`);
    }
  });

  it("turns animations off with prefers-reduced-motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("every confetti call is disabled for reduced motion", () => {
    for (const file of ["AttendanceLogger.tsx", "AttendeeDirectory.tsx", "DocumentParser.tsx"]) {
      const calls = source("components", file).split("confetti({").slice(1);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.slice(0, call.indexOf("})"))).toContain("disableForReducedMotion: true");
      }
    }
  });
});

describe("US-47: dead code stays removed", () => {
  it('no component strips "English " from activity names', () => {
    for (const file of ["App.tsx", "components/AttendeeDirectory.tsx", "components/CrossReferenceHub.tsx", "components/DashboardStats.tsx", "components/ProgressReportModal.tsx"]) {
      expect(source(...file.split("/"))).not.toContain('.replace("English ", "")');
    }
  });
});

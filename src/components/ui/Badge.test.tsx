// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import { ACTIVITIES } from "../../types";
import Badge, { ActivityBadge, StatusBadge } from "./Badge";

afterEach(cleanup);

// Lucide's class for each ACTIVITY_THEME icon (src/activityTheme.ts)
const ACTIVITY_ICON_CLASS = {
  Speakeasy: "lucide-messages-square",
  "Reading Club": "lucide-book-open",
  "Music Room": "lucide-music",
  "Writing Hood": "lucide-pen-line",
} as const;

// Text/background token pairs checked ≥ 4.5:1 by src/designTokens.test.ts (TEXT_PAIRS).
const verifiedPairs = readFileSync(join(__dirname, "..", "..", "designTokens.test.ts"), "utf8");
const isVerified = (fg: string, bg: string) => verifiedPairs.includes(`["${fg}", "${bg}"]`);

describe("US-56: badges", () => {
  it("Badge is a plain span whose text is its name; tone and size via props", () => {
    render(
      <Badge tone="info" size="md" data-testid="b">
        New
      </Badge>
    );
    const badge = screen.getByTestId("b");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.textContent).toBe("New");
    expect(badge.className).toContain("text-info");
    expect(badge.className).toContain("bg-info-bg");
    expect(badge.className).toContain("text-body");
    expect(badge.className).toContain("rounded-chip");
  });

  it.each(["danger", "warning", "success", "info"] as const)("StatusBadge %s: tone tokens, decorative icon, text ≥ 4.5:1", tone => {
    render(
      <StatusBadge tone={tone} data-testid="s">
        Status
      </StatusBadge>
    );
    const badge = screen.getByTestId("s");
    for (const cls of [`text-${tone}`, `bg-${tone}-bg`, `border-${tone}-border`]) expect(badge.className).toContain(cls);
    expect(badge.textContent).toBe("Status");
    expect(badge.querySelector("svg")?.closest("[aria-hidden='true']")).toBeTruthy();
    expect(isVerified(tone, `${tone}-bg`)).toBe(true);
  });

  it("neutral Badge: forest on cream (verified pair)", () => {
    render(<Badge data-testid="n">Neutral</Badge>);
    expect(screen.getByTestId("n").className).toContain("bg-cream text-forest");
    expect(isVerified("forest", "cream")).toBe(true);
  });

  it.each(ACTIVITIES)("ActivityBadge %s: named by the activity, -text token on surface (≥ 4.5:1)", activity => {
    render(<ActivityBadge activity={activity} data-testid="a" />);
    const badge = screen.getByTestId("a");
    expect(badge.textContent).toBe(activity);
    const slug = activity.toLowerCase().replace(/ /g, "-");
    expect(badge.className).toContain(`text-activity-${slug}-text`);
    expect(badge.className).toContain(`border-activity-${slug}`);
    expect(badge.className).toContain("bg-surface");
    expect(badge.querySelector(`.bg-activity-${slug}`)?.getAttribute("aria-hidden")).toBe("true");
    // US-66: the activity's US-58 icon goes with its color, decorative
    const icon = badge.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("class")).toContain(ACTIVITY_ICON_CLASS[activity]);
    expect(isVerified(`activity-${slug}-text`, "surface")).toBe(true);
  });
});

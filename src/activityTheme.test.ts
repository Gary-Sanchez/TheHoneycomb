import { readFileSync } from "fs";
import { join } from "path";
import { BookOpen, MessagesSquare, Music, PenLine } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ACTIVITY_THEME, activityColorVar, getActivityTheme, isActivity } from "./activityTheme";
import { ACTIVITIES } from "./types";

// US-58: one module defines each activity's color token and Lucide icon.
const css = readFileSync(join(__dirname, "index.css"), "utf8");
const declares = (token: string) => new RegExp(`${token}\\s*:`).test(css);

describe("US-58: activity theme", () => {
  it("covers exactly the 4 activities, in ACTIVITIES order", () => {
    expect(Object.keys(ACTIVITY_THEME)).toEqual([...ACTIVITIES]);
    for (const activity of ACTIVITIES) expect(ACTIVITY_THEME[activity].activity).toBe(activity);
  });

  it("each activity uses its own --color-activity-* fill and -text tokens, declared in index.css", () => {
    for (const activity of ACTIVITIES) {
      const slug = activity.toLowerCase().replace(/\s+/g, "-");
      const theme = ACTIVITY_THEME[activity];
      expect(theme.token).toBe(`--color-activity-${slug}`);
      expect(theme.textToken).toBe(`--color-activity-${slug}-text`);
      expect(theme.bgClass).toBe(`bg-activity-${slug}`);
      expect(theme.textClass).toBe(`text-activity-${slug}-text`);
      expect(declares(theme.token), theme.token).toBe(true);
      expect(declares(theme.textToken), theme.textToken).toBe(true);
    }
  });

  it("QA-03: every activity has its Lucide icon, and no two share one", () => {
    expect(ACTIVITIES.map(a => ACTIVITY_THEME[a].icon)).toEqual([MessagesSquare, BookOpen, Music, PenLine]);
    expect(new Set(ACTIVITIES.map(a => ACTIVITY_THEME[a].icon)).size).toBe(4);
  });

  it("chart-1..4 follow the same activity order", () => {
    ACTIVITIES.forEach((activity, i) => {
      expect(css).toMatch(new RegExp(`--color-chart-${i + 1}:\\s*var\\(${ACTIVITY_THEME[activity].token}\\);`));
    });
  });

  it("getActivityTheme: one of the 4 → its theme; anything else (e.g. not detected) → undefined", () => {
    expect(getActivityTheme("Music Room")).toBe(ACTIVITY_THEME["Music Room"]);
    expect(getActivityTheme("")).toBeUndefined();
    expect(getActivityTheme("music room")).toBeUndefined();
    expect(isActivity("Writing Hood")).toBe(true);
    expect(isActivity("Book Club")).toBe(false);
  });

  it("activityColorVar gives a CSS var() reference to the fill", () => {
    expect(activityColorVar("Speakeasy")).toBe("var(--color-activity-speakeasy)");
  });
});

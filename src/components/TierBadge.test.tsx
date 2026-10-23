// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getHiveStatus } from "../beehavior";
import HiveStatusBadge from "./HiveStatusBadge";
import TierBadge from "./TierBadge";

afterEach(cleanup);

// Any pictographic emoji (the old 🐝 🌸 🥚 💤) or variation selector.
const EMOJI = /[\p{Extended_Pictographic}\uFE0F]/u;

const CASES = [
  { rate: 90, label: "Busy Bee", key: "busy-bee", icon: "lucide-hexagon" },
  { rate: 60, label: "Forager", key: "forager", icon: "lucide-flower-2" },
  { rate: 30, label: "Hatcher", key: "hatcher", icon: "lucide-egg" },
  { rate: 0, label: "Dormant", key: "dormant", icon: "lucide-moon" },
] as const;

describe("US-58: TierBadge", () => {
  it.each(CASES)("$label: label, tier token classes and a decorative Lucide icon", ({ rate, label, key, icon }) => {
    render(<TierBadge rate={rate} />);
    const badge = screen.getByTestId("hive-status");
    expect(badge.textContent).toBe(label);
    expect(badge.getAttribute("data-tier")).toBe(key);
    expect(badge.getAttribute("title")).toBe(getHiveStatus(rate).meaning);
    for (const cls of [`text-tier-${key}`, `bg-tier-${key}-bg`, `border-tier-${key}-border`]) expect(badge.classList.contains(cls), cls).toBe(true);
    const svgs = badge.querySelectorAll("svg");
    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute("aria-hidden")).toBe("true");
    expect(svgs[0].classList.contains(icon), icon).toBe(true);
    expect(badge.innerHTML).not.toMatch(EMOJI);
  });

  it("No data: grey tokens, no icon, never Dormant", () => {
    render(<TierBadge rate={null} />);
    const badge = screen.getByTestId("hive-status");
    expect(badge.textContent).toBe("No data");
    expect(badge.classList.contains("text-tier-no-data")).toBe(true);
    expect(badge.classList.contains("shadow-sm")).toBe(false);
    expect(badge.querySelector("svg")).toBeNull();
    expect(badge.innerHTML).not.toMatch(EMOJI);
  });

  it("keeps no inline color style (the colors come from the tokens)", () => {
    render(<TierBadge rate={80} />);
    expect(screen.getByTestId("hive-status").getAttribute("style")).toBeNull();
  });

  it("size md is larger than the default sm", () => {
    render(<><TierBadge rate={80} size="md" /><TierBadge rate={80} /></>);
    const [md, sm] = screen.getAllByTestId("hive-status");
    expect(md.classList.contains("text-sm")).toBe(true);
    expect(sm.classList.contains("text-xs")).toBe(true);
  });

  it("HiveStatusBadge (used by the Hub, Caserits & Progress and the Progress Report) is TierBadge", () => {
    expect(HiveStatusBadge).toBe(TierBadge);
  });
});

describe("US-58 QA-06: no colleague changes Hive Status", () => {
  // The US-42 scale, pinned: 0–25 Dormant, 26–50 Hatcher, 51–75 Forager, 76–100 Busy Bee, null No data.
  const expected = (rate: number) => (rate >= 76 ? "Busy Bee" : rate >= 51 ? "Forager" : rate >= 26 ? "Hatcher" : "Dormant");

  it("every Overall from 0 to 100 keeps its label, in the data and on the badge", () => {
    for (let rate = 0; rate <= 100; rate++) {
      expect(getHiveStatus(rate).label, `${rate}%`).toBe(expected(rate));
      const { unmount } = render(<TierBadge rate={rate} />);
      expect(screen.getByTestId("hive-status").textContent, `${rate}%`).toBe(expected(rate));
      unmount();
    }
  });

  it("boundaries and null", () => {
    expect([25, 26, 50, 51, 75, 76].map(r => getHiveStatus(r).label)).toEqual(["Dormant", "Hatcher", "Hatcher", "Forager", "Forager", "Busy Bee"]);
    expect(getHiveStatus(null).label).toBe("No data");
  });

  it("tier colors are unchanged (US-42 values)", () => {
    expect([90, 60, 30, 0].map(r => getHiveStatus(r).textColor)).toEqual(["#7A5E00", "#804C00", "#6B5800", "#2F4F4F"]);
    expect([90, 60, 30, 0].map(r => getHiveStatus(r).bgLight)).toEqual(["#FFFDF0", "#FFF7E6", "#FEFBEA", "#E6ECEC"]);
    expect([90, 60, 30, 0].map(r => getHiveStatus(r).color)).toEqual(["#D4AF37", "#E68A00", "#B89F30", "#2F4F4F"]);
  });
});

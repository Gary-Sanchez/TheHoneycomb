// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Card, { Panel } from "./Card";

afterEach(cleanup);

describe("US-56: Card and Panel", () => {
  it("a titled Card is a region named by its h3, with the card radius", () => {
    render(<Card title="Weekly Overview">Body</Card>);
    const region = screen.getByRole("region", { name: "Weekly Overview" });
    expect(screen.getByRole("heading", { level: 3, name: "Weekly Overview" })).toBeTruthy();
    expect(region.className).toContain("rounded-card");
    expect(region.className).toContain("p-6");
  });

  it("a titled Panel is a region named by its h2, with the panel radius, and holds Cards", () => {
    render(
      <Panel title="Dashboard" actions={<button type="button">Export</button>}>
        <Card title="KPI">1</Card>
      </Panel>
    );
    const panel = screen.getByRole("region", { name: "Dashboard" });
    expect(screen.getByRole("heading", { level: 2, name: "Dashboard" })).toBeTruthy();
    expect(panel.className).toContain("rounded-panel");
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "KPI" }).className).toContain("rounded-card");
  });

  it("without a title it is a plain div (no landmark) that keeps its props", () => {
    const { container } = render(<Card data-testid="card" className="mt-4">Body</Card>);
    expect(screen.queryByRole("region")).toBeNull();
    const card = container.firstElementChild as HTMLElement;
    expect(card.tagName).toBe("DIV");
    expect(card.className).toContain("rounded-card");
    expect(card.className).toContain("mt-4");
  });
});

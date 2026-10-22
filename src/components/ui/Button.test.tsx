// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import Button from "./Button";
import { BUTTON_SIZES, BUTTON_VARIANTS, DISABLED } from "./styles";

afterEach(cleanup);

describe("US-56: Button", () => {
  it("is a type=button named by its text, primary md by default", () => {
    render(<Button>Save Records</Button>);
    const button = screen.getByRole("button", { name: "Save Records" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("bg-forest");
    expect(button.className).toContain("h-11");
  });

  it.each([
    ["sm", "h-9"],
    ["md", "h-11"],
    ["lg", "h-12"],
  ] as const)("size %s is %s", (size, height) => {
    render(<Button size={size}>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).className).toContain(height);
  });

  it.each(Object.keys(BUTTON_VARIANTS) as (keyof typeof BUTTON_VARIANTS)[])("variant %s shares the one disabled style", variant => {
    const onClick = vi.fn();
    render(
      <Button variant={variant} disabled onClick={onClick}>
        Delete
      </Button>
    );
    const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain(DISABLED);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("every variant's hover only applies while enabled", () => {
    for (const classes of Object.values(BUTTON_VARIANTS)) {
      expect(classes).not.toMatch(/(^|\s)hover:/);
    }
    expect(Object.values(BUTTON_SIZES)).toEqual(["h-9 px-3 text-body", "h-11 px-4 text-body", "h-12 px-6 text-body-lg"]);
  });

  it("loading keeps the name, sets aria-busy and blocks clicks", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick} icon={<Plus />}>
        Saving
      </Button>
    );
    const button = screen.getByRole("button", { name: "Saving" }) as HTMLButtonElement;
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(button.querySelector(".animate-spin")?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not busy when idle and its icon is decorative", () => {
    render(<Button icon={<Plus data-testid="icon" />}>Add</Button>);
    const button = screen.getByRole("button", { name: "Add" });
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(screen.getByTestId("icon").parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("the link variant has no fixed height", () => {
    render(<Button variant="link">View report</Button>);
    const button = screen.getByRole("button", { name: "View report" });
    expect(button.className).toContain("underline");
    expect(button.className).not.toMatch(/\bh-\d/);
  });

  it("can submit a form when asked to", () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("type")).toBe("submit");
  });
});

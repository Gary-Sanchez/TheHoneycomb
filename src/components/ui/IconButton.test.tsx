// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import IconButton from "./IconButton";
import { DISABLED } from "./styles";

afterEach(cleanup);

describe("US-56: IconButton", () => {
  it("is a 40 px button named by its aria-label, icon hidden", () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Close" icon={<X data-testid="icon" />} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("size-10");
    expect(screen.getByTestId("icon").parentElement?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled and loading use the shared disabled style; loading keeps the name", () => {
    render(
      <>
        <IconButton aria-label="Delete" icon={<X />} disabled />
        <IconButton aria-label="Saving" icon={<X />} loading />
      </>
    );
    const disabled = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    const loading = screen.getByRole("button", { name: "Saving" }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(disabled.className).toContain(DISABLED);
    expect(loading.disabled).toBe(true);
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("QA-02: the type requires aria-label (tsc fails if this stops being an error)", () => {
    const unlabelled = (
      // @ts-expect-error aria-label is required: an icon-only button needs an accessible name
      <IconButton icon={<X />} />
    );
    expect(unlabelled).toBeTruthy();
  });
});

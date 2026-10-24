// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Field, { DateInput, Input, Select, Textarea } from "./Field";

afterEach(cleanup);

/** Text of every element listed in the control's aria-describedby. */
const description = (el: HTMLElement) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map(id => document.getElementById(id)?.textContent)
    .join(" ");

describe("US-56: Field", () => {
  it.each([
    ["Input", () => <Input />, "textbox"],
    ["Textarea", () => <Textarea />, "textbox"],
    ["Select", () => <Select><option>Speakeasy</option></Select>, "combobox"],
  ] as const)("QA-04: the label names the %s and clicking it targets the control", (_, control, role) => {
    render(<Field label="Colleague">{control()}</Field>);
    const el = screen.getByRole(role, { name: "Colleague" });
    const label = screen.getByText("Colleague") as HTMLLabelElement;
    expect(label.getAttribute("for")).toBe(el.id);
    // jsdom does not move focus on a label click; label.control is the element a browser focuses.
    expect(label.control).toBe(el);
  });

  it("QA-04: DateInput is a date input labelled by the Field", () => {
    render(
      <Field label="Session date">
        <DateInput />
      </Field>
    );
    const el = screen.getByLabelText("Session date") as HTMLInputElement;
    expect(el.type).toBe("date");
    expect((screen.getByText("Session date") as HTMLLabelElement).control).toBe(el);
  });

  it("help text describes the control; no aria-invalid without an error", () => {
    render(
      <Field label="Name" help="As it appears in Teams.">
        <Input />
      </Field>
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(description(input)).toBe("As it appears in Teams.");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-required")).toBe(false);
  });

  it("QA-05: with an error the control is aria-invalid and its description includes the error", () => {
    render(
      <Field label="Name" help="As it appears in Teams." error="Enter a name.">
        <Input />
      </Field>
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(description(input)).toBe("As it appears in Teams. Enter a name.");
    expect(input.className).toContain("aria-invalid:border-danger");
  });

  it("required → aria-required, and the asterisk stays out of the name", () => {
    render(
      <Field label="Name" required>
        <Input />
      </Field>
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.getAttribute("aria-required")).toBe("true");
  });

  it("controls are h-11 with the input-border token (Textarea grows from min-h-24)", () => {
    render(
      <Field label="A">
        <Input />
      </Field>
    );
    const input = screen.getByRole("textbox", { name: "A" });
    expect(input.className).toContain("h-11");
    expect(input.className).toContain("border-input-border");
    cleanup();
    render(<Select aria-label="B"><option>x</option></Select>);
    const select = screen.getByRole("combobox", { name: "B" });
    expect(select.className).toContain("h-11");
    expect(select.className).toContain("border-input-border");
    cleanup();
    render(<Textarea aria-label="C" />);
    expect(screen.getByRole("textbox", { name: "C" }).className).toContain("border-input-border");
  });

  it("US-66: hideLabel keeps a real <label for> that names the control, visually hidden (sr-only)", () => {
    render(
      <Field label="Event date for Elena Rostova" hideLabel>
        <DateInput />
      </Field>
    );
    const input = screen.getByLabelText("Event date for Elena Rostova") as HTMLInputElement;
    const label = screen.getByText("Event date for Elena Rostova") as HTMLLabelElement;
    expect(label.tagName).toBe("LABEL");
    expect(label.className).toBe("sr-only");
    expect(label.control).toBe(input);
  });

  it("a Field id overrides the generated one; standalone controls keep their own aria-*", () => {
    render(
      <>
        <Field label="Email" id="email">
          <Input />
        </Field>
        <Input aria-label="Standalone" invalid aria-describedby="hint" />
        <span id="hint">Hint</span>
      </>
    );
    expect(screen.getByRole("textbox", { name: "Email" }).id).toBe("email");
    const standalone = screen.getByRole("textbox", { name: "Standalone" });
    expect(standalone.getAttribute("aria-invalid")).toBe("true");
    expect(description(standalone)).toBe("Hint");
  });
});

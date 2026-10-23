// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsPanel from "./SettingsPanel";

// US-65: Admin Access messages use Alert / Field / IconButton / Button / PageHeader.
const login = { authenticated: false, adminConfigured: true, setupAllowed: false };
const setup = { authenticated: false, adminConfigured: false, setupAllowed: true };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(ok: boolean, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("US-65: Admin Access", () => {
  it("has the tab's h2 via PageHeader, same copy", () => {
    render(<SettingsPanel auth={login} onAuthChange={() => {}} />);
    expect(screen.getByRole("heading", { level: 2, name: "Admin Access" })).toBeTruthy();
    expect(screen.getByText(/Anyone can view attendance data/)).toBeTruthy();
  });

  it("wrong password: danger Alert (role=alert) and the field is labelled, invalid and described by it", async () => {
    stubFetch(false, { error: "Incorrect password." });
    render(<SettingsPanel auth={login} onAuthChange={() => {}} />);
    const input = screen.getByLabelText("Admin Password");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Incorrect password.");
    expect(alert.className).toContain("text-danger");
    expect(alert.className).toContain("bg-danger-bg");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("first setup: mismatched passwords show the alert on both fields; Create Admin Password uses Inter", async () => {
    render(<SettingsPanel auth={setup} onAuthChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("New Admin Password"), { target: { value: "password-1" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "password-2" } });
    const create = screen.getByRole("button", { name: "Create Admin Password" });
    expect(create.className).not.toContain("font-serif");
    fireEvent.click(create);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Passwords don't match.");
    for (const label of ["New Admin Password", "Confirm Password"]) {
      const field = screen.getByLabelText(label);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.getAttribute("aria-describedby")).toBe(alert.id);
    }
  });

  it("successful setup posts to /api/auth/setup and refreshes auth", async () => {
    const fetchMock = stubFetch(true, {});
    const onAuthChange = vi.fn();
    render(<SettingsPanel auth={setup} onAuthChange={onAuthChange} />);
    fireEvent.change(screen.getByLabelText("New Admin Password"), { target: { value: "password-1" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Admin Password" }));
    await waitFor(() => expect(onAuthChange).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/setup");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("show/hide password is an IconButton (>= 24 px) that keeps its name and toggles the type", () => {
    render(<SettingsPanel auth={login} onAuthChange={() => {}} />);
    const input = screen.getByLabelText("Admin Password") as HTMLInputElement;
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.className).toContain("size-10");
    expect(input.type).toBe("password");
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
  });

  it("Sign In is disabled until there is a password", () => {
    render(<SettingsPanel auth={login} onAuthChange={() => {}} />);
    const signIn = screen.getByRole("button", { name: "Sign In" }) as HTMLButtonElement;
    expect(signIn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Admin Password"), { target: { value: "x" } });
    expect(signIn.disabled).toBe(false);
  });

  it("signed in: Sign Out is a Button and posts to /api/auth/logout", async () => {
    const fetchMock = stubFetch(true, {});
    const onAuthChange = vi.fn();
    render(<SettingsPanel auth={{ authenticated: true, adminConfigured: true, setupAllowed: false }} onAuthChange={onAuthChange} />);
    expect(screen.getByText("Signed in as admin. Editing is enabled.")).toBeTruthy();
    const out = screen.getByRole("button", { name: "Sign Out" });
    expect(out.className).toContain("h-9");
    fireEvent.click(out);
    await waitFor(() => expect(onAuthChange).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/logout");
  });

  it("setup not allowed from this machine: warning Alert with the same text", () => {
    render(<SettingsPanel auth={{ authenticated: false, adminConfigured: false, setupAllowed: false }} onAuthChange={() => {}} />);
    const note = screen.getByRole("status");
    expect(note.textContent).toContain("No admin password is configured yet.");
    expect(note.className).toContain("text-warning");
  });
});

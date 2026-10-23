// @vitest-environment jsdom
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { ToastProvider } from "./components/ui";

// US-59: the app shell (header, tab nav, skip link, global toasts, load error screen).

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const TAB_NAMES = ["Dashboard", "Manual Check-In", "Caserits & Progress", "Overlap Cross-Referencer", "Import Forage Logs", "Settings"];

const STATE = {
  attendees: [{ id: "att-1", name: "Ana Perez", enrolledActivities: ["Speakeasy"], joinedDate: "2026-01-10" }],
  records: [],
  notes: {},
};

type Route = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(route: Route = () => undefined, { authenticated = false } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const custom = await route(url, init);
    if (custom) return custom;
    if (url === "/api/data") return json(STATE);
    if (url === "/api/auth/status") return json({ authenticated, adminConfigured: true, setupAllowed: false });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderApp = () =>
  render(
    <ToastProvider>
      <App />
    </ToastProvider>
  );

const tab = (name: string) => within(screen.getByRole("navigation", { name: "Main" })).getByRole("tab", { name });

beforeEach(() => {
  document.title = "The Honeycomb";
  // jsdom doesn't implement it (App scrolls to the top on every tab change)
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-59: tab navigation", () => {
  it("the 6 tabs are a tablist inside the Main nav, with their names unchanged", async () => {
    mockFetch();
    renderApp();
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(nav.id).toBe("nav-tabs");
    expect(within(nav).getByRole("tablist")).toBeTruthy();
    expect(within(nav).getAllByRole("tab").map(t => t.textContent)).toEqual(TAB_NAMES);
    expect(tab("Dashboard").getAttribute("aria-selected")).toBe("true");
  });

  it("arrows, Home and End move between tabs and the window title follows", async () => {
    mockFetch();
    renderApp();
    await screen.findByRole("navigation", { name: "Main" });
    expect(document.title).toBe("Dashboard · The Honeycomb");

    tab("Dashboard").focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Manual Check-In"));
    expect(tab("Manual Check-In").getAttribute("aria-selected")).toBe("true");
    expect(document.title).toBe("Manual Check-In · The Honeycomb");

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(tab("Settings"));
    expect(document.title).toBe("Settings · The Honeycomb");

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(tab("Dashboard"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("Settings"));
  });

  it("one h1 (the brand) and an h2 inside the content of every tab", async () => {
    mockFetch();
    renderApp();
    await screen.findByRole("navigation", { name: "Main" });
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s.map(h => h.textContent)).toEqual(["The Honeycomb"]);

    const main = document.getElementById("main-content")!;
    expect(main.tagName).toBe("MAIN");
    for (const name of TAB_NAMES) {
      fireEvent.click(tab(name));
      expect(within(main).getAllByRole("heading", { level: 2 }).length, name).toBeGreaterThan(0);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    }
  });

  it("the tabs without an h2 of their own get a visually hidden one named after the tab", async () => {
    mockFetch();
    renderApp();
    await screen.findByRole("navigation", { name: "Main" });
    for (const name of ["Dashboard", "Caserits & Progress", "Overlap Cross-Referencer"]) {
      fireEvent.click(tab(name));
      const h2 = screen.getByRole("heading", { level: 2, name });
      expect(h2.className).toContain("sr-only");
    }
  });

  it("the logo is an image with an accessible name, outside the h1", async () => {
    mockFetch();
    renderApp();
    const logo = await screen.findByRole("img", { name: "The Honeycomb logo" });
    expect(logo.getAttribute("src")).toBe("/logo.svg");
    expect(screen.getByRole("heading", { level: 1 }).contains(logo)).toBe(false);
    expect(screen.getByRole("heading", { level: 1, name: "The Honeycomb" })).toBeTruthy();
  });
});

describe("US-59: skip link", () => {
  it("is the first focusable element and moves focus to the tab content", async () => {
    mockFetch();
    renderApp();
    await screen.findByRole("navigation", { name: "Main" });
    const focusable = document.body.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(focusable[0]).toBe(skip);
    fireEvent.click(skip);
    expect(document.activeElement).toBe(document.getElementById("main-content"));
  });
});

describe("US-59: sticky header and opaque nav (BUG-10)", () => {
  it("the nav sticks below the header's measured height, with an opaque background", async () => {
    mockFetch();
    renderApp();
    const nav = await screen.findByRole("navigation", { name: "Main" });
    const classes = nav.className.split(" ");
    expect(classes).toContain("top-[var(--header-height)]");
    expect(classes).toContain("bg-cream");
    expect(nav.className).not.toMatch(/top-\[73px\]|backdrop-blur|bg-[^ ]*\//);
    expect(document.documentElement.style.getPropertyValue("--header-height")).toMatch(/px$/);
  });
});

describe("US-59: a change the server didn't save shows an error toast (BUG-08)", () => {
  const addColleague = async () => {
    fireEvent.click(await screen.findByRole("tab", { name: "Caserits & Progress" }));
    await waitFor(() => expect(screen.queryByText("Read-only mode. Sign in as admin in Settings to make changes.")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Add Colleague" }));
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Elena Rostova" } });
    fireEvent.submit(screen.getByLabelText("Full Name").closest("form")!);
  };

  it("server error: says what wasn't saved and what to do, never the raw error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(url => (url === "/api/attendees" ? json({ error: "ENOSPC: no space left on device" }, 500) : undefined), { authenticated: true });
    renderApp();
    await addColleague();
    const alert = await screen.findByText("Couldn't add the colleague. Check the connection and try again.");
    expect(alert.closest("[role=alert]")).not.toBeNull();
    expect(screen.queryByText(/ENOSPC/)).toBeNull();
  });

  it("network failure: same toast", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(url => (url === "/api/attendees" ? Promise.reject(new TypeError("Failed to fetch")) : undefined), { authenticated: true });
    renderApp();
    await addColleague();
    expect(await screen.findByText("Couldn't add the colleague. Check the connection and try again.")).toBeTruthy();
  });

  it("401: drops to read-only as before, without an error toast", async () => {
    mockFetch(url => (url === "/api/attendees" ? json({ error: "Admin session required" }, 401) : undefined), { authenticated: true });
    renderApp();
    await addColleague();
    expect(await screen.findByText("Read-only mode. Sign in as admin in Settings to make changes.")).toBeTruthy();
    expect(screen.queryByText(/Couldn't add the colleague/)).toBeNull();
  });
});

describe("US-59: the initial load can fail (BUG-09)", () => {
  it("shows the cause and Retry requests the data again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    const fetchMock = mockFetch(url =>
      url === "/api/data" && fail ? json({ error: "The Honeycomb can't open its data file. Restart The Honeycomb." }, 503) : undefined
    );
    renderApp();
    expect(await screen.findByText("The Honeycomb can't open its data file. Restart The Honeycomb.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/data")).toHaveLength(2);
  });

  it("an unreachable server says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(url => (url === "/api/data" ? Promise.reject(new TypeError("Failed to fetch")) : undefined));
    renderApp();
    expect(await screen.findByText("Couldn't reach The Honeycomb server.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("US-59: static guards", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8");

  it("main.tsx mounts the global toast region around the app", () => {
    expect(read("main.tsx")).toMatch(/<ToastProvider>\s*<App \/>\s*<\/ToastProvider>/);
  });

  it("the logo asset exists", () => {
    expect(readFileSync(join(__dirname, "..", "public", "logo.svg"), "utf8")).toContain("<svg");
  });
});

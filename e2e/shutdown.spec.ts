import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, test, expect } from "@playwright/test";
import type { ElectronApplication } from "@playwright/test";

// Graceful shutdown (US-15): closing must be fast when nothing is pending, must never end by the
// 5s timeout just because a client left a connection open, and must not lose a write in flight.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TIMEOUT_WARNING = "[Shutdown] Timed out";
// Test-only admin password for the isolated temp data dir (never a real credential).
const TEST_ADMIN_PASSWORD = "e2e-shutdown-password";

const record = {
  id: "rec-us15-e2e",
  attendeeId: "att-us15-e2e",
  attendeeName: "Shutdown Tester",
  activity: "Speakeasy",
  date: "2026-06-24",
  status: "present" as const,
};

let tmpDir: string;

test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-e2e-shutdown-"));
});

test.afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function dataEnv(port: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORT: port,
    HONEYCOMB_DB_PATH: path.join(tmpDir, "honeycomb-data.json"),
    HONEYCOMB_CONFIG_PATH: path.join(tmpDir, "honeycomb-config.json"),
    HONEYCOMB_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
  };
}

function readRecords(): Array<{ id: string }> {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, "honeycomb-data.json"), "utf-8")).records;
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise(resolve => child.once("exit", code => resolve(code)));
}

test.describe("desktop app shutdown", () => {
  const PORT = "3101";
  let electronApp: ElectronApplication | undefined;
  let electronExited = true;

  test.afterEach(async () => {
    // Only needed if an assertion failed before the app exited on its own.
    if (electronApp && !electronExited) await electronApp.close();
    electronApp = undefined;
  });

  async function launch() {
    const app = await electron.launch({
      args: [path.join(ROOT, "electron", "main.js")],
      env: dataEnv(PORT),
    });
    electronExited = false;
    app.process().once("exit", () => (electronExited = true));
    let output = "";
    app.process().stdout?.on("data", chunk => (output += chunk));
    app.process().stderr?.on("data", chunk => (output += chunk));
    const window = await app.firstWindow();
    await expect(window.getByRole("heading", { name: "The Honeycomb" })).toBeVisible();
    return { app, window, output: () => output };
  }

  // Closes the main window the way a user does (last window → app.quit → before-quit hook)
  // and returns how long the process took to exit.
  async function closeWindowAndTime(app: ElectronApplication): Promise<number> {
    const exited = waitForExit(app.process());
    const start = Date.now();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
    await exited;
    return Date.now() - start;
  }

  test("closing without pending writes is immediate and logs no timeout", async () => {
    const launched = await launch();
    electronApp = launched.app;
    // Read-only use of the app, like browsing the dashboard: leaves Chromium's connection
    // pool (keep-alive and speculative preconnect sockets) open against the embedded server.
    await launched.window.reload();
    await expect(launched.window.getByRole("heading", { name: "The Honeycomb" })).toBeVisible();
    await launched.window.evaluate(async () => {
      await Promise.all([fetch("/api/data"), fetch("/api/auth/status"), fetch("/api/health")]);
    });
    // Chromium opens its speculative sockets shortly after the page settles (QA's D1 repro).
    await launched.window.waitForTimeout(1500);

    const elapsed = await closeWindowAndTime(launched.app);
    console.log(`[US-15] Electron close without writes: ${elapsed}ms`);

    expect(elapsed).toBeLessThan(1500);
    expect(launched.output()).not.toContain(TIMEOUT_WARNING);
  });

  test("a record saved before closing is still there after reopening", async () => {
    const first = await launch();
    electronApp = first.app;

    // Go through the renderer (same Chromium connection pool as the real UI).
    const status = await first.window.evaluate(async ({ password, rec }) => {
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!login.ok) return login.status;
      const save = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: [rec] }),
      });
      return save.status;
    }, { password: TEST_ADMIN_PASSWORD, rec: record });
    expect(status).toBe(200);

    const elapsed = await closeWindowAndTime(first.app);
    console.log(`[US-15] Electron close after a write: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(1500);
    expect(first.output()).not.toContain(TIMEOUT_WARNING);

    const second = await launch();
    electronApp = second.app;
    const records = await second.window.evaluate(async () => (await (await fetch("/api/data")).json()).records);
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ id: record.id })]));
    await closeWindowAndTime(second.app);
  });
});

// `npm start` runs the server on the system Node; Electron embeds it in its own Node — cover both.
const electronBin = createRequire(import.meta.url)("electron") as unknown as string;
const runtimes = [
  { name: "system Node", bin: process.execPath },
  { name: "Electron's Node", bin: electronBin },
];

for (const runtime of runtimes) {
  test.describe(`standalone server shutdown (${runtime.name})`, () => {
    const PORT = 3102;
    let server: ChildProcess | undefined;
    let output = "";

    test.afterEach(() => {
      if (server && server.exitCode === null) server.kill();
      server = undefined;
    });

    async function startServer(extraEnv: NodeJS.ProcessEnv = {}) {
      output = "";
      const child = spawn(runtime.bin, [path.join(__dirname, "fixtures", "server-harness.cjs")], {
        cwd: ROOT,
        env: { ...dataEnv(String(PORT)), NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1", ...extraEnv },
      });
      child.stdout?.on("data", chunk => (output += chunk));
      child.stderr?.on("data", chunk => (output += chunk));
      await expect.poll(() => output, { timeout: 15_000 }).toContain("Server running on");
      return child;
    }

    // See e2e/fixtures/server-harness.cjs: stdin stands in for a real signal on Windows.
    function signal(child: ChildProcess, name: "SIGINT" | "SIGTERM") {
      child.stdin?.write(`${name}\n`);
    }

    test("an open TCP connection that never sent a request doesn't delay exit", async () => {
      server = await startServer();
      const socket = net.connect(PORT, "127.0.0.1");
      socket.on("error", () => {});
      await new Promise<void>(resolve => socket.once("connect", () => resolve()));

      const exited = waitForExit(server);
      const start = Date.now();
      signal(server, "SIGINT");
      expect(await exited).toBe(0);
      const elapsed = Date.now() - start;
      console.log(`[US-15] ${runtime.name}: exit with a request-less TCP socket open: ${elapsed}ms`);

      expect(elapsed).toBeLessThan(500);
      expect(output).not.toContain(TIMEOUT_WARNING);
      socket.destroy();
    });

    test("a keep-alive request mid-write when shutdown starts is persisted and exit follows right after", async () => {
      // Each lowdb write takes 1s, so the save below is still writing when the signal arrives.
      server = await startServer({ US15_SLOW_WRITE_MS: "1000" });
      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

      const post = (urlPath: string, body: string, headers: http.OutgoingHttpHeaders = {}) =>
        new Promise<{ res: http.IncomingMessage; body: string }>((resolve, reject) => {
          const req = http.request({
            host: "127.0.0.1",
            port: PORT,
            method: "POST",
            path: urlPath,
            agent,
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers },
          });
          req.on("error", reject);
          req.on("response", res => {
            let text = "";
            res.on("data", chunk => (text += chunk));
            res.on("end", () => resolve({ res, body: text }));
          });
          req.end(body);
        });

      // Log in first, so the save reuses an already-established keep-alive socket.
      const login = await post("/api/auth/login", JSON.stringify({ password: TEST_ADMIN_PASSWORD }));
      expect(login.res.statusCode).toBe(200);
      const cookie = String(login.res.headers["set-cookie"]).split(";")[0];

      const saveDone = post("/api/records", JSON.stringify({ records: [record] }), { Cookie: cookie });
      await expect.poll(() => output, { timeout: 5_000 }).toContain("[harness] write started");
      const exited = waitForExit(server);
      signal(server, "SIGTERM");

      const save = await saveDone;
      const responded = Date.now();
      expect(save.res.statusCode).toBe(200);
      // Shutdown began mid-request, so the response must still drop the keep-alive connection.
      expect(save.res.headers.connection).toBe("close");

      expect(await exited).toBe(0);
      const afterResponse = Date.now() - responded;
      console.log(`[US-15] ${runtime.name}: exit after the in-flight keep-alive response: ${afterResponse}ms`);
      expect(afterResponse).toBeLessThan(500);
      expect(output).not.toContain(TIMEOUT_WARNING);
      expect(readRecords()).toEqual(expect.arrayContaining([expect.objectContaining({ id: record.id })]));
      agent.destroy();
    });
  });
}

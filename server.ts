import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import * as db from "./db";
import { extractTextFromFile, parseAttendance } from "./parser";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Path to the on-disk config file that stores the admin password hash
// (set by Electron's main process to a file under the OS user-data directory;
// falls back to the project root for `npm run dev`/`npm start`).
function getConfigPath(): string {
  return process.env.HONEYCOMB_CONFIG_PATH || path.join(process.cwd(), "honeycomb-config.json");
}

interface HoneycombConfig {
  // "scrypt:<saltHex>:<hashHex>" — set via the first-run setup in Settings (POST /api/auth/setup).
  adminPasswordHash?: string;
}

function readConfig(): HoneycombConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(config: HoneycombConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}

// Before US-12 the config file could hold a plaintext Gemini API key. Drop just that key on
// startup; adminPasswordHash lives in the same file and must survive. A missing or unparseable
// config reads as {} (no "geminiApiKey" in it), so nothing is rewritten in that case.
function scrubLegacyGeminiKey(): void {
  try {
    const config = readConfig() as HoneycombConfig & { geminiApiKey?: unknown };
    if (!("geminiApiKey" in config)) return;
    delete config.geminiApiKey;
    writeConfig(config);
    console.log("[Status] Removed the legacy Gemini API key from honeycomb-config.json.");
  } catch (err) {
    console.warn("[Warning] Could not remove the legacy Gemini API key from the config file:", err);
  }
}

// --- Admin authentication (US-11) ---------------------------------------------------------
// Single admin password. HONEYCOMB_ADMIN_PASSWORD (env) takes precedence over the scrypt hash
// stored in honeycomb-config.json. Never hardcode a password here.

const SESSION_COOKIE = "honeycomb_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const sessions = new Map<string, number>(); // token -> expiresAt

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyAdminPassword(password: string): boolean {
  const envPassword = process.env.HONEYCOMB_ADMIN_PASSWORD;
  if (envPassword) {
    // Hash both sides so the comparison is constant-time regardless of length.
    const digest = (s: string) => crypto.createHash("sha256").update(s).digest();
    return safeEqual(digest(password), digest(envPassword));
  }
  const stored = readConfig().adminPasswordHash;
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return safeEqual(actual, expected);
}

function isAdminConfigured(): boolean {
  return Boolean(process.env.HONEYCOMB_ADMIN_PASSWORD || readConfig().adminPasswordHash);
}

function isLoopbackRequest(req: express.Request): boolean {
  const addr = req.socket.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function getSessionToken(req: express.Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined; // malformed cookie → treat as no session (401), not a 500
      }
    }
  }
  return undefined;
}

function isAuthenticated(req: express.Request): boolean {
  const token = getSessionToken(req);
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function startSession(res: express.Response): void {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  // SameSite=Strict keeps other sites from riding this cookie into mutating requests (CSRF).
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
  );
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): any {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Authentication required. Sign in as admin in Settings." });
  }
  next();
}

// Use memory storage for uploaded files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

app.use(express.json({ limit: "5mb" }));

// Health check endpoints
app.get(["/api/health", "/api/healthz", "/api/health-check", "/health", "/healthz"], (req, res) => {
  res.json({ status: "ok" });
});

// Auth: session status, login/logout, and first-run admin password setup
app.get("/api/auth/status", (req, res) => {
  const adminConfigured = isAdminConfigured();
  res.json({
    authenticated: isAuthenticated(req),
    adminConfigured,
    setupAllowed: !adminConfigured && isLoopbackRequest(req),
  });
});

app.post("/api/auth/login", (req, res): any => {
  const { password } = req.body || {};
  if (!isAdminConfigured()) {
    return res.status(409).json({ error: "No admin password is configured yet. Create one first." });
  }
  if (typeof password !== "string" || !verifyAdminPassword(password)) {
    return res.status(401).json({ error: "Invalid admin password." });
  }
  startSession(res);
  res.json({ authenticated: true });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ authenticated: false });
});

// Only while no credential exists, and only from this machine — so a LAN device can't claim
// the admin account on an exposed server before the owner does.
app.post("/api/auth/setup", (req, res): any => {
  if (isAdminConfigured()) {
    return res.status(409).json({ error: "An admin password is already configured." });
  }
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ error: "Admin setup is only allowed from this machine (localhost)." });
  }
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  const config = readConfig();
  config.adminPasswordHash = hashPassword(password);
  writeConfig(config);
  startSession(res);
  res.json({ authenticated: true });
});

// Data layer: attendees, attendance records, and notes (persisted via db.ts / lowdb),
// replacing what used to be read/written directly to the browser's localStorage.
// Reads are public; every mutation requires an admin session (US-11).
app.get("/api/data", async (req, res) => {
  res.json(await db.getState());
});

app.post("/api/attendees", requireAdmin, async (req, res) => {
  res.json(await db.addAttendee(req.body));
});

app.put("/api/attendees/:id/enrollment", requireAdmin, async (req, res) => {
  res.json(await db.updateEnrollment(req.params.id, req.body.activities || []));
});

app.delete("/api/attendees/:id", requireAdmin, async (req, res) => {
  res.json(await db.removeAttendee(req.params.id));
});

app.post("/api/records", requireAdmin, async (req, res) => {
  res.json(await db.saveRecords(req.body.records || []));
});

app.post("/api/records/import", requireAdmin, async (req, res) => {
  res.json(await db.importParsedData(req.body.attendees || [], req.body.records || []));
});

app.put("/api/notes/:attendeeId", requireAdmin, async (req, res) => {
  res.json(await db.saveNote(req.params.attendeeId, req.body.text || ""));
});

app.post("/api/reset", requireAdmin, async (req, res) => {
  res.json(await db.resetToSeed());
});

// 4 standard English activities
const STANDARD_ACTIVITIES = [
  "Speakeasy",
  "Reading Club",
  "Music Room",
  "Writing Hood",
];

// API endpoint for parsing uploaded file
app.post("/api/parse-attendance-file", upload.single("file"), async (req, res): Promise<any> => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const filename = file.originalname;
    const extension = path.extname(filename).toLowerCase();
    const requestedActivity = req.body.activity || "";
    const supportedExtensions = [".txt", ".csv", ".docx", ".doc", ".xlsx", ".xls"];

    if (!supportedExtensions.includes(extension)) {
      return res.status(400).json({
        error: `Unsupported file type: ${extension}. Please upload .txt, .csv, .docx, .doc, .xlsx, or .xls files.`,
      });
    }

    const fileTextContent = await extractTextFromFile(file.buffer, extension);

    if (!fileTextContent.trim()) {
      return res.status(400).json({ error: "The uploaded file is empty or could not be read." });
    }

    const records = parseAttendance(fileTextContent, requestedActivity);

    return res.json({
      filename,
      recordsCount: records.length,
      records,
    });
  } catch (err: any) {
    console.error("Error parsing attendance file:", err);
    return res.status(500).json({
      error: "An error occurred while parsing the file. " + (err.message || ""),
    });
  }
});

// Serve Vite-generated assets and app
export async function startServer() {
  scrubLegacyGeminiKey();
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    console.log("[Status] Serving static assets in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log("[Status] Initializing Vite dev server...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[Status] Vite middleware mounted successfully.");
    } catch (viteError) {
      console.error("Failed to start Vite dev server:", viteError);
    }
  }

  // Catch-all for unmatched /api routes to ensure they return JSON instead of falling through to Vite HTML
  app.use(["/api", "/api/*"], (req: any, res: any) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.originalUrl}`
    });
  });

  // Global Express error handler to ensure we always return JSON instead of HTML on error
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Express error caught:", err);
    res.status(err.status || err.statusCode || 500).json({
      error: err.message || "An unexpected error occurred on the server."
    });
  });

  // Localhost-only by default; exposing the API to the LAN is an explicit opt-in (US-11).
  const allowLan = process.env.HONEYCOMB_ALLOW_LAN === "true";
  const host = allowLan ? "0.0.0.0" : "127.0.0.1";
  app.listen(PORT, host, () => {
    console.log(`Server running on http://${host}:${PORT}`);
    if (allowLan) {
      console.warn(
        "[WARNING] HONEYCOMB_ALLOW_LAN=true: the server is reachable from OTHER DEVICES on your network. " +
        "Traffic is plain HTTP — only use this behind a trusted VPN/proxy."
      );
    }
    if (!isAdminConfigured()) {
      console.log("[Status] No admin password configured yet — create one from Settings to enable editing.");
    }
  });
}

startServer();

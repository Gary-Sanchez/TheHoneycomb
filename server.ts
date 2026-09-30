import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import * as xlsx from "xlsx";
import mammoth from "mammoth";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import * as db from "./db";
import {
  attendeeSchema,
  enrollmentBodySchema,
  importBodySchema,
  manualCheckInBodySchema,
  noteBodySchema,
  recordsBodySchema,
  settingsBodySchema,
  validateBody,
} from "./validation";
import { INGESTION_BLACKLIST, isBlacklistedName } from "./src/blacklist";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Path to the on-disk config file that stores a user-supplied Gemini API key
// (set by Electron's main process to a file under the OS user-data directory;
// falls back to the project root for `npm run dev`/`npm start`).
function getConfigPath(): string {
  return process.env.HONEYCOMB_CONFIG_PATH || path.join(process.cwd(), "honeycomb-config.json");
}

interface HoneycombConfig {
  geminiApiKey?: string;
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

function getConfiguredGeminiKey(): string | undefined {
  return readConfig().geminiApiKey || process.env.GEMINI_API_KEY;
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

// Lazy initialization of Gemini client. Re-created whenever the configured key changes
// (see POST /api/settings), since a user can set/replace the key at runtime from the app.
let aiClient: GoogleGenAI | null = null;
let aiClientKey: string | undefined;
function getGeminiClient(): GoogleGenAI {
  const apiKey = getConfiguredGeminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please add your key in Settings.");
  }
  if (!aiClient || aiClientKey !== apiKey) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    aiClientKey = apiKey;
  }
  return aiClient;
}

// Settings: read/write the user-supplied Gemini API key (never echoed back to the client)
app.get("/api/settings", (req, res) => {
  res.json({ geminiApiKeyConfigured: Boolean(getConfiguredGeminiKey()) });
});

app.post("/api/settings", requireAdmin, validateBody(settingsBodySchema, "geminiApiKey is required."), (req, res) => {
  const config = readConfig();
  config.geminiApiKey = req.body.geminiApiKey; // already trimmed by the schema
  writeConfig(config);
  res.json({ geminiApiKeyConfigured: true });
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
// Reads are public; every mutation requires an admin session (US-11) and a body that passes its
// validation.ts schema (US-10) — an invalid payload gets a 400 before anything reaches db.ts.
app.get("/api/data", async (req, res) => {
  res.json(await db.getState());
});

app.post("/api/attendees", requireAdmin, validateBody(attendeeSchema), async (req, res) => {
  res.json(await db.addAttendee(req.body));
});

app.put("/api/attendees/:id/enrollment", requireAdmin, validateBody(enrollmentBodySchema), async (req, res) => {
  res.json(await db.updateEnrollment(req.params.id, req.body.activities));
});

app.delete("/api/attendees/:id", requireAdmin, async (req, res) => {
  res.json(await db.removeAttendee(req.params.id));
});

app.post("/api/records", requireAdmin, validateBody(recordsBodySchema), async (req, res) => {
  res.json(await db.saveRecords(req.body.records));
});

// US-20: add one colleague (new or existing) to the session for a date+activity
app.post("/api/records/manual", requireAdmin, validateBody(manualCheckInBodySchema), async (req, res) => {
  res.json(await db.manualCheckIn(req.body.attendee ?? null, req.body.record));
});

app.post("/api/records/import", requireAdmin, validateBody(importBodySchema), async (req, res) => {
  res.json(await db.importParsedData(req.body.attendees, req.body.records));
});

app.put("/api/notes/:attendeeId", requireAdmin, validateBody(noteBodySchema), async (req, res) => {
  res.json(await db.saveNote(req.params.attendeeId, req.body.text));
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

// Helper to filter binary/junk characters from old .doc files
function extractTextFromBinaryDoc(buffer: Buffer): string {
  // Extract readable ASCII blocks
  const content = buffer.toString("binary");
  const matches = content.match(/[\x20-\x7E\x0A\x0D]{4,}/g);
  if (!matches) return "";
  return matches
    .map(str => str.trim())
    .filter(str => str.length > 0)
    .join("\n");
}

// Helper to determine if a name is invalid, represents metadata, or is a host/facilitator to ignore
function isInvalidName(nameStr: string): boolean {
  if (!nameStr) return true;
  const normalizedLower = nameStr.toLowerCase().replace(/\s+/g, " ").trim();

  // 1. Check length & basic character validity
  if (normalizedLower.length <= 1) return true;
  
  // If it's just numbers, symbols, colons, times or durations (e.g. "12:30", "2026-06-12", "45", "100%", "30 min")
  if (/^[0-9:\-\/\s%apm\(\)]+$/i.test(normalizedLower)) {
    return true;
  }

  // 2. Filter out the US-19 ingestion blacklist (facilitators / coordination staff)
  if (isBlacklistedName(nameStr)) return true;

  // 3. Filter out metadata rows
  const METADATA_SUBSTRINGS = [
    "meeting title",
    "attended participants",
    "start time",
    "end time",
    "meeting duration",
    "average attendance time",
    "average attendance",
    "attendance rate",
    "duration",
    "participants",
    "attendance log",
    "attendance sheet",
    "log date",
    "activity name",
    "colleague name",
    "name (headers)",
    "name(headers)",
    "headers",
    "report",
    "details",
    "summary"
  ];

  for (const meta of METADATA_SUBSTRINGS) {
    if (normalizedLower === meta || normalizedLower.includes(meta)) {
      return true;
    }
  }

  // Handle headers containing "name" specifically
  if (
    normalizedLower === "name" || 
    normalizedLower === "name:" || 
    normalizedLower.startsWith("name ") || 
    normalizedLower.startsWith("name:") || 
    normalizedLower.includes("name (") || 
    normalizedLower.endsWith("(headers)") ||
    normalizedLower.includes("header")
  ) {
    return true;
  }

  return false;
}

// Helper to remove duplicates, exclude hosts, and delete metadata fields from final records
function cleanAndFilterRecords(rawRecords: { name: string; activity: string; date: string; status: string }[]): { name: string; activity: string; date: string; status: string }[] {
  const seenKeys = new Set<string>();
  const cleaned: { name: string; activity: string; date: string; status: string }[] = [];

  for (const rec of rawRecords) {
    if (!rec || !rec.name) continue;
    const nameStr = rec.name.trim();

    // Apply the robust validation helper
    if (isInvalidName(nameStr)) {
      continue;
    }

    // Format name nicely to Title Case (e.g. "John Smith")
    const formattedName = nameStr
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const key = `${formattedName.toLowerCase()}|${rec.activity.toLowerCase()}|${rec.date}`;
    
    // Deduplicate (keep "present" if there's any status discrepancy)
    if (seenKeys.has(key)) {
      const existingIdx = cleaned.findIndex(r => 
        r.name.toLowerCase() === formattedName.toLowerCase() && 
        r.activity.toLowerCase() === rec.activity.toLowerCase() && 
        r.date === rec.date
      );
      if (existingIdx !== -1 && rec.status === "present") {
        cleaned[existingIdx].status = "present";
      }
      continue;
    }

    seenKeys.add(key);
    cleaned.push({
      name: formattedName,
      activity: rec.activity,
      date: rec.date,
      status: rec.status === "absent" ? "absent" : "present",
    });
  }

  return cleaned;
}

// Helper to extract date from Start time line
function extractDateFromStartTimeLine(line: string): string | null {
  const lowerLine = line.toLowerCase();
  if (!lowerLine.includes("start time") && !lowerLine.includes("start_time") && !lowerLine.includes("hora de inicio") && !lowerLine.includes("hora inicio")) {
    return null;
  }
  const dateRegex = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/;
  const match = line.match(dateRegex);
  if (match) {
    const rawDate = match[0].replace(/\//g, "-");
    const segments = rawDate.split("-");
    if (segments.length === 3) {
      let year = "";
      let month = "";
      let day = "";
      if (segments[0].length === 4) {
        year = segments[0];
        month = segments[1].padStart(2, "0");
        day = segments[2].padStart(2, "0");
      } else {
        const last = segments[2];
        year = last.length === 2 ? `20${last}` : last;
        month = segments[0].padStart(2, "0");
        day = segments[1].padStart(2, "0");
      }
      return `${year}-${month}-${day}`;
    }
  }
  const separators = [",", "\t", ":"];
  for (const sep of separators) {
    if (line.includes(sep)) {
      const parts = line.split(sep);
      for (let i = 1; i < parts.length; i++) {
        const potentialDateStr = parts[i].trim();
        const d = new Date(potentialDateStr);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          if (year >= 2020 && year <= 2030) {
            return `${year}-${month}-${day}`;
          }
        }
      }
    }
  }
  return null;
}

// Robust fallback parser when Gemini API is unavailable or busy
function fallbackParseAttendance(text: string, requestedActivity: string = ""): { name: string; activity: string; date: string; status: string }[] {
  const records: { name: string; activity: string; date: string; status: string }[] = [];
  const lines = text.split(/\r?\n/);
  const defaultDate = "2026-06-24";

  // 1. Scan for a "Start time" row to set the document-wide date
  let documentWideDate = "";
  for (const line of lines) {
    const dateFromStart = extractDateFromStartTimeLine(line);
    if (dateFromStart) {
      documentWideDate = dateFromStart;
      break;
    }
  }

  const dateRegex = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#") || line.toLowerCase().includes("sheet name:") || line.toLowerCase().includes("colleague name") || line.toLowerCase().includes("attendance rate")) {
      continue;
    }

    // Try splitting by common delimiters: tabs, pipes, or commas
    let parts = line.split(/[,\t|]/).map(p => p.trim());
    if (parts.length < 2) {
      // Split by multiple spaces
      parts = line.split(/\s{2,}/).map(p => p.trim());
    }

    if (parts.length >= 2) {
      let name = parts[0].trim();
      let activity = requestedActivity || "Speakeasy";
      let date = documentWideDate || defaultDate;
      let status = "present";

      // Look for a date in the line
      const datePart = parts.find(p => dateRegex.test(p));
      if (datePart) {
        const match = datePart.match(dateRegex);
        if (match) {
          const rawDate = match[0].replace(/\//g, "-");
          const segments = rawDate.split("-");
          if (segments.length === 3) {
            if (segments[0].length === 4) {
              date = rawDate;
            } else {
              const year = segments[2].length === 2 ? `20${segments[2]}` : segments[2];
              const month = segments[0].padStart(2, "0");
              const day = segments[1].padStart(2, "0");
              date = `${year}-${month}-${day}`;
            }
          }
        }
      }

      // Look for status
      const statusPart = parts.find(p => {
        const lp = p.toLowerCase();
        return ["present", "absent", "p", "a", "1", "0", "here", "missing"].includes(lp);
      });
      if (statusPart) {
        const lp = statusPart.toLowerCase();
        if (["absent", "a", "0", "missing"].includes(lp)) {
          status = "absent";
        }
      }

      // If requestedActivity was NOT explicitly specified, try to map it from line
      if (!requestedActivity) {
        const activityPart = parts.find(p => {
          const lp = p.toLowerCase();
          return lp.includes("speak") || lp.includes("read") || lp.includes("music") || lp.includes("writ") ||
                 lp.includes("club") || lp.includes("hood") || lp.includes("room");
        });

        if (activityPart) {
          const lp = activityPart.toLowerCase();
          if (lp.includes("read") || lp.includes("book")) {
            activity = "Reading Club";
          } else if (lp.includes("music") || lp.includes("listen") || lp.includes("room")) {
            activity = "Music Room";
          } else if (lp.includes("writ") || lp.includes("hood")) {
            activity = "Writing Hood";
          } else {
            activity = "Speakeasy";
          }
        } else {
          const fullLineLower = line.toLowerCase();
          if (fullLineLower.includes("read") || fullLineLower.includes("book")) {
            activity = "Reading Club";
          } else if (fullLineLower.includes("music") || fullLineLower.includes("listen") || fullLineLower.includes("room")) {
            activity = "Music Room";
          } else if (fullLineLower.includes("writ") || fullLineLower.includes("hood")) {
            activity = "Writing Hood";
          }
        }
      }

      // Clean the name
      name = name.replace(/^["']|["']$/g, "").replace(/^(mr\.|ms\.|mrs\.|dr\.)\s+/i, "").trim();

      // Skip headers
      const lowerName = name.toLowerCase();
      if (
        lowerName === "name" ||
        lowerName === "student" ||
        lowerName === "colleague" ||
        lowerName === "status" ||
        lowerName === "activity" ||
        lowerName === "date" ||
        name === activity ||
        name === statusPart ||
        name === datePart ||
        lowerName.includes("attendance") ||
        lowerName.includes("report") ||
        lowerName.includes("sheet") ||
        lowerName.includes("start time") ||
        lowerName.includes("end time")
      ) {
        continue;
      }

      // Format name nicely to Title Case
      name = name.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");

      if (name.length > 2 && name.length < 50) {
        records.push({ name, activity, date, status });
      }
    }
  }

  // Fallback line-by-line name capture
  if (records.length === 0) {
    for (let line of lines) {
      line = line.trim();
      const lowerL = line.toLowerCase();
      if (lowerL.includes("start time") || lowerL.includes("end time") || lowerL.includes("duration") || lowerL.includes("participants")) {
        continue;
      }
      if (line.length > 2 && line.length < 40 && !line.includes(",") && !line.includes("|") && !line.includes("\t")) {
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 4) {
          const formattedName = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          records.push({
            name: formattedName,
            activity: requestedActivity || "Speakeasy",
            date: documentWideDate || defaultDate,
            status: "present",
          });
        }
      }
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// US-18: deterministic .csv parser (no AI involved, same file => same output)
// ---------------------------------------------------------------------------

type ParsedAttendance = { name: string; activity: string; date: string; status: string };

// Decode the raw upload honoring BOMs. Microsoft Teams exports attendance reports as
// UTF-16LE, so a plain utf-8 read would produce garbage with NUL bytes between chars.
function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf-8");
  }
  // BOM-less UTF-16LE: every other byte of ASCII text is NUL
  if (buffer.length >= 4 && buffer[1] === 0x00 && buffer[3] === 0x00) {
    return buffer.toString("utf16le");
  }
  return buffer.toString("utf-8");
}

// Pick the delimiter (tab, comma or semicolon) that appears most often outside quotes
function detectCsvDelimiter(text: string): string {
  const counts: Record<string, number> = { "\t": 0, ",": 0, ";": 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  // Ties resolve in this fixed order so the choice is always deterministic
  return ["\t", ",", ";"].reduce((best, d) => (counts[d] > counts[best] ? d : best), "\t");
}

// Minimal RFC 4180 reader: quoted fields, escaped quotes ("") and newlines inside quotes
function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map(r => r.map(c => c.replace(/\u0000/g, "").trim()));
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Parse a date out of a cell using only explicit formats (never `new Date(string)`,
// whose result depends on the host locale/timezone). Returns ISO YYYY-MM-DD or null.
// Numeric d/m ambiguity resolves as month/day (the Teams/US export format) unless the
// first number can only be a day (> 12).
function parseDeterministicDate(value: string): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();

  let m = v.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return toIsoDate(+m[1], +m[2], +m[3]);

  m = v.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return a > 12 ? toIsoDate(year, b, a) : toIsoDate(year, a, b);
  }

  // "June 12, 2026" / "Jun 12 2026"
  m = v.match(/\b([a-záéíóú]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && MONTH_NAMES[m[1]]) return toIsoDate(+m[3], MONTH_NAMES[m[1]], +m[2]);

  // "12 June 2026" / "12 de junio de 2026"
  m = v.match(/\b(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3,10})\.?,?\s+(?:de\s+)?(\d{4})\b/);
  if (m && MONTH_NAMES[m[2]]) return toIsoDate(+m[3], MONTH_NAMES[m[2]], +m[1]);

  return null;
}

// Metadata labels that carry the session date (Teams summary block, generic logs)
const CSV_DATE_LABELS = [
  "start time", "start_time", "meeting start time", "start date", "hora de inicio", "hora inicio",
  "date", "session date", "meeting date", "event date", "log date", "fecha", "fecha de la sesion",
];

// Header cells that identify the attendee-name column
const CSV_NAME_HEADERS = [
  "name", "full name", "participant", "participant name", "attendee", "attendee name",
  "colleague", "colleague name", "student", "student name", "nombre", "nombre completo",
];

// Header cells (substring match) of columns whose values are per-attendee dates
const CSV_DATE_COLUMN_HINTS = ["date", "fecha", "first join", "join time", "joined", "start time"];

function normalizeLabel(cell: string): string {
  return cell.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[:*]+$/, "").replace(/\s+/g, " ").trim();
}

// Strip quotes, honorifics and Teams tags like "(Guest)" / "(External)" / "(Unverified)"
function cleanCsvName(raw: string): string {
  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/\s*\((guest|external|unverified|invitado|externo)\)\s*$/i, "")
    .replace(/^(mr\.|ms\.|mrs\.|dr\.)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(name: string): string {
  return name
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function parseCsvStatus(cell: string | undefined): string | null {
  if (!cell) return null;
  const lc = cell.toLowerCase().trim();
  if (["present", "presente", "p", "1", "yes", "si", "sí", "x", "attended"].includes(lc)) return "present";
  if (["absent", "ausente", "a", "0", "no", "missing"].includes(lc)) return "absent";
  return null;
}

function parseCsvAttendance(
  buffer: Buffer,
  requestedActivity: string
): { records: ParsedAttendance[]; dateDetected: boolean } {
  const text = decodeCsvBuffer(buffer);
  const rows = parseCsvRows(text, detectCsvDelimiter(text));
  const activity = requestedActivity || "Speakeasy";

  // 1. Session date from metadata: a row whose first cell is a date label ("Start time", "Date", ...).
  //    The first valid match wins, so the same file always yields the same date.
  let sessionDate: string | null = null;
  for (const row of rows) {
    if (row.length < 2 || !CSV_DATE_LABELS.includes(normalizeLabel(row[0]))) continue;
    for (const cell of row.slice(1)) {
      sessionDate = parseDeterministicDate(cell);
      if (sessionDate) break;
    }
    if (sessionDate) break;
  }

  // 2. Attendee rows: every block that starts with a header row containing a name column
  const records: ParsedAttendance[] = [];
  let contentDate: string | null = null;
  let nameCol = -1;
  let statusCol = -1;
  let dateCol = -1;
  let headerFound = false;

  for (const row of rows) {
    const nonEmpty = row.filter(Boolean);
    if (nonEmpty.length === 0) {
      nameCol = -1; // a blank line closes the current table section
      continue;
    }

    // Headers are only looked for at the start of a section: inside a table, a cell value like
    // "Attendee" (Teams "Role" column) must not be mistaken for a new header row.
    const labels = row.map(normalizeLabel);
    const headerNameIdx = nameCol === -1 ? labels.findIndex(l => CSV_NAME_HEADERS.includes(l)) : -1;
    if (headerNameIdx !== -1) {
      headerFound = true;
      nameCol = headerNameIdx;
      statusCol = labels.findIndex(l => l === "status" || l === "attendance" || l === "estado" || l === "asistencia");
      dateCol = labels.findIndex(l => CSV_DATE_COLUMN_HINTS.some(h => l.includes(h)));
      continue;
    }
    if (nameCol === -1) continue;

    const name = cleanCsvName(row[nameCol] || "");
    if (!name) continue;
    if (!contentDate && dateCol !== -1) contentDate = parseDeterministicDate(row[dateCol] || "");
    records.push({
      name: toTitleCase(name),
      activity,
      date: "",
      status: parseCsvStatus(statusCol !== -1 ? row[statusCol] : undefined) || "present",
    });
  }

  // 3. No header row at all: a plain roster, one attendee per row in the first column.
  //    Metadata rows ("Meeting title", "Start time", ...) are dropped later by isInvalidName.
  if (!headerFound) {
    for (const row of rows) {
      const first = cleanCsvName(row[0] || "");
      if (!first || CSV_DATE_LABELS.includes(normalizeLabel(first)) || /^\d+\.\s/.test(first)) continue;
      if (parseDeterministicDate(first)) continue;
      records.push({
        name: toTitleCase(first),
        activity,
        date: "",
        status: parseCsvStatus(row[1]) || "present",
      });
    }
  }

  // Metadata date wins; otherwise the first date found in the attendee table's date column.
  // No valid date => leave it empty so the UI asks for one via "Batch Edit Session Date".
  const finalDate = sessionDate || contentDate || "";
  return {
    records: records.map(r => ({ ...r, date: finalDate })),
    dateDetected: Boolean(finalDate),
  };
}

// Exponential backoff retry handler for Gemini API calls with per-attempt timeout and model fallback
async function generateContentWithRetry(ai: GoogleGenAI, options: any, maxRetries = 2): Promise<any> {
  const primaryModel = options.model || "gemini-3.6-flash";
  // Secondary model fallback list if primary model is unavailable or rate-limited
  const modelsToTry = [primaryModel];
  if (primaryModel !== "gemini-flash-latest") {
    modelsToTry.push("gemini-flash-latest");
  }

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    let delay = 500;
    const currentOptions = { ...options, model: modelName };
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const apiCallPromise = ai.models.generateContent(currentOptions);
        let timerId: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = setTimeout(() => {
            reject(new Error(`Gemini API (${modelName}) request timed out`));
          }, 7000);
        });

        const response = await Promise.race([apiCallPromise, timeoutPromise]);
        clearTimeout(timerId);
        return response;
      } catch (err: any) {
        lastError = err;
        const status = err.status || (err.error?.code) || 0;
        const message = err.message || JSON.stringify(err);
        
        const isTransient = 
          status === 429 || 
          status === 503 || 
          message.includes("503") || 
          message.includes("429") ||
          message.includes("UNAVAILABLE") ||
          message.includes("resource exhausted") ||
          message.includes("timed out");

        if (isTransient && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 1.5;
        } else {
          break; // Switch to next candidate model
        }
      }
    }
  }

  throw lastError || new Error("Gemini API call failed after retries.");
}

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
    let fileTextContent = "";

    // US-18: .csv never goes through Gemini — a deterministic parser extracts date and attendees
    if (extension === ".csv") {
      const { records, dateDetected } = parseCsvAttendance(file.buffer, requestedActivity);
      const cleanedRecords = cleanAndFilterRecords(records);
      if (cleanedRecords.length === 0 && !decodeCsvBuffer(file.buffer).trim()) {
        return res.status(400).json({ error: "The uploaded file is empty or could not be read." });
      }
      return res.json({
        filename,
        recordsCount: cleanedRecords.length,
        records: cleanedRecords,
        fallbackUsed: false,
        dateDetected,
      });
    }

    if (extension === ".txt") {
      fileTextContent = file.buffer.toString("utf-8");
    } else if (extension === ".docx") {
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      fileTextContent = parsed.value;
    } else if (extension === ".doc") {
      // Fallback for old .doc files by stripping binary headers/junk
      fileTextContent = extractTextFromBinaryDoc(file.buffer);
    } else if (extension === ".xlsx" || extension === ".xls") {
      // US-13: xlsx comes from the SheetJS CDN (0.20.3 fixes GHSA-4r6h-8v6p-xvw6 /
      // GHSA-5pgg-2g8v-p4x9; npm's 0.18.5 has no fix). Only cell values are needed
      // for sheet_to_csv, so skip formulas, styles, HTML, VBA and doc props to
      // keep the parse surface of an untrusted upload minimal.
      const workbook = xlsx.read(file.buffer, {
        type: "buffer",
        cellFormula: false,
        cellHTML: false,
        cellStyles: false,
        bookVBA: false,
        bookProps: false,
      });
      let excelData = "";
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet);
        excelData += `Sheet Name: ${sheetName}\n${csv}\n\n`;
      }
      fileTextContent = excelData;
    } else {
      return res.status(400).json({
        error: `Unsupported file type: ${extension}. Please upload .txt, .csv, .docx, .doc, .xlsx, or .xls files.`,
      });
    }

    if (!fileTextContent.trim()) {
      return res.status(400).json({ error: "The uploaded file is empty or could not be read." });
    }

    let activityForceInstruction = "";
    if (requestedActivity) {
      activityForceInstruction = `\nIMPORTANT ACTIVITY REQUIREMENT:\nThis is the upload log for the activity "${requestedActivity}". Therefore, you MUST set the "activity" of EVERY parsed entry to exactly "${requestedActivity}". Overwrite and replace any auto-detected activity with "${requestedActivity}".\n`;
    }

    const prompt = `
You are an expert administrative assistant for an English Language school.
Your task is to parse an uploaded attendance record document and extract a structured list of attendance entries.

We track attendance for exactly 4 different English activities:
1. "Speakeasy"
2. "Reading Club"
3. "Music Room"
4. "Writing Hood"

Document Content:
"""
${fileTextContent}
"""

Instructions:
1. Extract all attendance records where students are marked present or absent.
2. For each record, extract:
   - "name": Cleaned student name in Title Case (e.g. "John Smith"). Remove titles like Mr. or Ms. if present.
   - "activity": Map the detected activity to one of our 4 standard activities:
     * "Speakeasy" (matches: Speakeasy, Speaking, Club, Conversation, Debate, speaking, speaking club)
     * "Reading Club" (matches: Reading, Book club, Reading Club, literature, reading, story)
     * "Music Room" (matches: Music, Room, Music Room, songs, lyrics, grammar, clinic, listening)
     * "Writing Hood" (matches: Writing, Hood, Writing Hood, Business, Writing, Emails, letters, story, writing, poetry)
     If you cannot map it, map it to the closest or use "Speakeasy" as a safe fallback. ${activityForceInstruction}
   - "date": Standard ISO-8601 format (YYYY-MM-DD). 
     CRITICAL: If the document contains a "Start time" (or "Start Time", "Hora de inicio") row/cell/line, you MUST read the date displayed in that row (e.g., from "6/12/26, 12:30:00 PM", extract "2026-06-12") and register that EXACT date for all extracted attendance entries in this file.
     Only if no such "Start time" row or date is found, look for individual dates in other columns, and fallback to the current date "2026-06-24" if no date is found. If the year is missing, assume 2026.
   - "status": Must be exactly "present" or "absent". If the document implies presence (e.g., checked, tick, mark, "X", "P", 1) format as "present". If it implies absence (e.g., "A", "absent", 0, "O"), format as "absent".

3. **HOSTS EXCLUSION**: The following names are activity HOSTS/COACHES and MUST NEVER be listed as attendees. Filter them out entirely:
${INGESTION_BLACKLIST.map(e => `   - ${e.name}`).join("\n")}
   Exclude them regardless of letter case, accents, or whether their full surname(s) are included.

4. **METADATA EXCLUSION**: The following fields/rows are metadata or header elements and are NOT attendees. Delete them and never include them:
   - Meeting title
   - Attended participants
   - Start time
   - End time
   - Meeting duration
   - Average attendance time
   - Name

5. **DEDUPLICATION**: The same colleague must not have duplicate attendance entries for the same activity and date in this document. Deduplicate by unique combination of name, activity, and date. Prefer 'present' status if multiple logs exist for the same colleague with conflicting statuses.

Return the parsed entries in a strictly structured JSON format matching the schema provided.
`;

    let records: any[] = [];
    let fallbackUsed = false;

    try {
      const ai = getGeminiClient();
      
      const geminiBlockPromise = generateContentWithRetry(ai, {
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              records: {
                type: Type.ARRAY,
                description: "List of parsed attendance entries.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: "Full name of the attendee in Title Case.",
                    },
                    activity: {
                      type: Type.STRING,
                      description: "The mapped standard activity.",
                    },
                    date: {
                      type: Type.STRING,
                      description: "ISO formatted date of attendance (YYYY-MM-DD).",
                    },
                    status: {
                      type: Type.STRING,
                      description: "Attendance status, either 'present' or 'absent'.",
                    },
                  },
                  required: ["name", "activity", "date", "status"],
                },
              },
            },
            required: ["records"],
          },
        },
      });

      // Total global timeout of 10 seconds for the entire Gemini block to prevent any reverse-proxy gateway timeout
      let globalTimerId: any;
      const globalTimeoutPromise = new Promise<never>((_, reject) => {
        globalTimerId = setTimeout(() => {
          reject(new Error("Global Gemini document parsing timeout exceeded"));
        }, 10000);
      });

      const response = await Promise.race([geminiBlockPromise, globalTimeoutPromise]);
      clearTimeout(globalTimerId);

      const responseText = response.text || "{}";
      const parsedJson = JSON.parse(responseText.trim());
      records = parsedJson.records || [];
    } catch (err: any) {
      // Log simple notice instead of full exception trace to indicate smooth fallback transition
      console.log("[Status] Activating offline deterministic fallback parser for document processing. Reason:", err.message || err);
      records = fallbackParseAttendance(fileTextContent, requestedActivity);
      fallbackUsed = true;
    }

    // Apply the robust post-parse filtering and deduplication
    const cleanedRecords = cleanAndFilterRecords(records);

    return res.json({
      filename,
      recordsCount: cleanedRecords.length,
      records: cleanedRecords,
      fallbackUsed,
    });
  } catch (err: any) {
    console.error("Error parsing file via Gemini:", err);
    return res.status(500).json({
      error: "An error occurred while parsing the file. " + (err.message || ""),
    });
  }
});

// Serve Vite-generated assets and app
export async function startServer() {
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

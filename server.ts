import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import * as xlsx from "xlsx";
import mammoth from "mammoth";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import * as db from "./db";

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

app.post("/api/settings", (req, res): any => {
  const { geminiApiKey } = req.body || {};
  if (typeof geminiApiKey !== "string" || !geminiApiKey.trim()) {
    return res.status(400).json({ error: "geminiApiKey is required." });
  }
  const config = readConfig();
  config.geminiApiKey = geminiApiKey.trim();
  writeConfig(config);
  res.json({ geminiApiKeyConfigured: true });
});

// Data layer: attendees, attendance records, and notes (persisted via db.ts / lowdb),
// replacing what used to be read/written directly to the browser's localStorage.
app.get("/api/data", async (req, res) => {
  res.json(await db.getState());
});

app.post("/api/attendees", async (req, res) => {
  res.json(await db.addAttendee(req.body));
});

app.put("/api/attendees/:id/enrollment", async (req, res) => {
  res.json(await db.updateEnrollment(req.params.id, req.body.activities || []));
});

app.delete("/api/attendees/:id", async (req, res) => {
  res.json(await db.removeAttendee(req.params.id));
});

app.post("/api/records", async (req, res) => {
  res.json(await db.saveRecords(req.body.records || []));
});

app.post("/api/records/import", async (req, res) => {
  res.json(await db.importParsedData(req.body.attendees || [], req.body.records || []));
});

app.put("/api/notes/:attendeeId", async (req, res) => {
  res.json(await db.saveNote(req.params.attendeeId, req.body.text || ""));
});

app.post("/api/reset", async (req, res) => {
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

  // 2. Filter out hosts (systematically ignore Gustavo Ramos Soria and others)
  const HOST_SUBSTRINGS = [
    "gustavo ramos soria",
    "gustavo ramos",
    "ramos soria",
    "nicolas rios lopez",
    "nicolas rios",
    "rios lopez",
    "nadine hinojosa ramos",
    "nadine hinojosa",
    "hinojosa ramos",
    "wara hermosa fernandez",
    "wara hermosa",
    "hermosa fernandez",
    "angela guzman rusinque",
    "angela guzman",
    "guzman rusinque",
    "alejandra barrientos garrido",
    "alejandra barrientos",
    "barrientos garrido",
    "gary ronald sanchez suarez",
    "gary ronald",
    "sanchez suarez",
    "gary sanchez",
    "rodrigo rivero rocha",
    "rodrigo rivero",
    "rivero rocha",
    "eric revollo ayala",
    "eric revollo",
    "revollo ayala",
    "alejandra rivero crespo",
    "alejandra rivero",
    "rivero crespo",
    "stephanie mariscal rodriguez",
    "stephanie mariscal",
    "mariscal rodriguez",
    "fabiola arias navia",
    "fabiola arias",
    "arias navia",
    "pablo rico schmidt",
    "pablo rico",
    "rico schmidt"
  ];

  for (const host of HOST_SUBSTRINGS) {
    if (normalizedLower === host || normalizedLower.includes(host)) {
      return true;
    }
  }

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

    if (extension === ".txt" || extension === ".csv") {
      fileTextContent = file.buffer.toString("utf-8");
    } else if (extension === ".docx") {
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      fileTextContent = parsed.value;
    } else if (extension === ".doc") {
      // Fallback for old .doc files by stripping binary headers/junk
      fileTextContent = extractTextFromBinaryDoc(file.buffer);
    } else if (extension === ".xlsx" || extension === ".xls") {
      const workbook = xlsx.read(file.buffer, { type: "buffer" });
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
   - Gustavo Ramos Soria
   - Nicolas Rios Lopez
   - Nadine Hinojosa Ramos
   - Wara Hermosa Fernandez
   - Angela Guzman Rusinque
   - Alejandra Barrientos Garrido
   - Gary Ronald Sanchez Suarez
   - Rodrigo Rivero Rocha
   - Eric Revollo Ayala
   - Alejandra Rivero Crespo
   - Stephanie Mariscal Rodriguez
   - Fabiola Arias Navia
   - Pablo Rico Schmidt

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

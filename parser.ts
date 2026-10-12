import crypto from "crypto";
import * as xlsx from "xlsx";
import mammoth from "mammoth";
import { isInvalidName, REFERENCE_DATE } from "./src/utils";
import { isBlacklistedName } from "./src/blacklist";
import type { DurationExclusion } from "./src/types";

// Deterministic offline attendance-log parser. Replaces the old Gemini-backed extraction path:
// no external AI/LLM call, no API key, just heuristics over the extracted document text.
//
// Entry points used by server.ts:
//   - extractTextFromFile: turns an uploaded file's Buffer into plain text, per extension.
//   - parseAttendance: turns that text into { name, activity, date, status } records.
//   - parseCsvAttendance (US-18): .csv only, straight from the Buffer; also reports whether a
//     session date was found (dateDetected) instead of falling back to the reference date,
//     drops attendees under 10 minutes (US-25) and reports what the file declares (US-27).

export interface ParsedAttendanceRecord {
  name: string;
  activity: string;
  date: string;
  status: "present" | "absent";
  // US-25: the duration couldn't be read, so the attendee was kept and flagged for review
  needsReview?: boolean;
  reviewReason?: string;
}

const DEFAULT_ACTIVITY = "Speakeasy";

// ---------------------------------------------------------------------------
// Text extraction per file extension
// ---------------------------------------------------------------------------

function extractTextFromTxtOrCsv(buffer: Buffer): string {
  // Strip a UTF-8 BOM if present, then decode. If UTF-8 decoding produced replacement
  // characters, the file was actually latin1/Windows-1252 (typical of Excel "CSV" exports
  // on Spanish-locale Windows) — re-decode as latin1 so accented names survive.
  const hasUtf8Bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const body = hasUtf8Bom ? buffer.subarray(3) : buffer;
  const utf8Text = body.toString("utf-8");
  if (utf8Text.includes("�")) {
    return body.toString("latin1");
  }
  return utf8Text;
}

function extractTextFromSpreadsheet(buffer: Buffer): string {
  // US-13: xlsx comes from the SheetJS CDN (0.20.3 fixes GHSA-4r6h-8v6p-xvw6 /
  // GHSA-5pgg-2g8v-p4x9; npm's 0.18.5 has no fix). Only cell values are needed
  // for sheet_to_csv, so skip formulas, styles, HTML, VBA and doc props to
  // keep the parse surface of an untrusted upload minimal.
  const workbook = xlsx.read(buffer, {
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
  return excelData;
}

// Known Word/OLE binary boilerplate strings that show up as "readable" runs when scanning a
// raw .doc byte stream, but are never actual attendee names.
const DOC_BOILERPLATE = [
  "root entry", "worddocument", "summaryinformation", "documentsummaryinformation", "compobj",
  "1table", "0table", "data", "normal", "normal.dotm", "default paragraph font", "table normal",
  "no list", "title", "times new roman", "calibri", "cambria", "arial", "symbol", "courier new",
  "microsoft office word", "microsoft word 97-2003 document", "mswordoc", "word.document.8", "office theme",
  "heading 1", "heading 2", "heading 3", "heading 4", "heading 5",
  "heading 6", "heading 7", "heading 8", "heading 9",
];

// Checked per line (not per run): Word keeps the whole document body as one contiguous run, so a
// substring match over the run would throw away every attendee whenever the body mentions e.g.
// "Meeting title". Per line, allow a couple of stray junk characters glued to the token (an
// adjacent binary byte that happened to look "printable", e.g. "ÊRoot Entry").
function isDocBoilerplate(line: string): boolean {
  const norm = line.trim().toLowerCase();
  if (!norm) return true;
  return DOC_BOILERPLATE.some(b => norm.includes(b) && norm.length <= b.length + 2);
}

// 0x07 is Word's table cell/row mark and 0x09 a tab: both are kept (as tabs) so a table row like
// "Carlos Gomez<cell>A<cell>" stays one delimited line instead of losing the 1-char status cell.
function isPrintableByte(c: number): boolean {
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xc0 && c <= 0xff) || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x07;
}

// Old .doc files store plain text as 8-bit (cp1252/latin1) runs interleaved with OLE binary
// structure. Scan for runs of printable/accented bytes (>= 4 chars).
function extractCp1252Runs(buffer: Buffer): string[] {
  const runs: string[] = [];
  let start = -1;
  for (let i = 0; i <= buffer.length; i++) {
    const c = i < buffer.length ? buffer[i] : -1;
    if (c !== -1 && isPrintableByte(c)) {
      if (start === -1) start = i;
    } else {
      if (start !== -1 && i - start >= 4) {
        runs.push(buffer.toString("latin1", start, i));
      }
      start = -1;
    }
  }
  return runs;
}

function isPrintableCodeUnit(u: number): boolean {
  return (u >= 0x20 && u <= 0x7e) || (u >= 0xc0 && u <= 0xff) || u === 0x0a || u === 0x0d || u === 0x09 || u === 0x07;
}

// Word can also store text as UTF-16LE (each char = 2 bytes, high byte usually 0x00 for
// Latin text). Scan both byte alignments since we don't know where a text run starts.
function extractUtf16LeRuns(buffer: Buffer, byteOffset: number): string[] {
  const runs: string[] = [];
  let current: number[] = [];
  const maxLen = buffer.length - 1;
  for (let i = byteOffset; i <= maxLen; i += 2) {
    const low = buffer[i];
    const high = buffer[i + 1];
    if (high === 0 && isPrintableCodeUnit(low)) {
      current.push(low);
    } else {
      if (current.length >= 4) runs.push(String.fromCharCode(...current));
      current = [];
    }
  }
  if (current.length >= 4) runs.push(String.fromCharCode(...current));
  return runs;
}

// A real .doc is an OLE container whose body text lives in the "WordDocument" stream. Scanning the
// whole file also picks up style names ("Table Grid", "Balloon Text"), the author/company from
// SummaryInformation and other metadata streams, which then show up as fake attendees. If the
// buffer isn't a readable OLE file (or has no such stream), the caller falls back to the full scan.
function readWordDocumentStream(buffer: Buffer): Buffer | null {
  try {
    const cfb = xlsx.CFB.read(buffer, { type: "buffer" });
    const entry = xlsx.CFB.find(cfb, "/WordDocument");
    return entry?.content ? Buffer.from(entry.content) : null;
  } catch {
    return null;
  }
}

function extractTextFromBinaryDoc(fileBuffer: Buffer): string {
  const buffer = readWordDocumentStream(fileBuffer) ?? fileBuffer;
  const cp1252Runs = extractCp1252Runs(buffer);
  const utf16Runs = [...extractUtf16LeRuns(buffer, 0), ...extractUtf16LeRuns(buffer, 1)];
  const lines = [...cp1252Runs, ...utf16Runs]
    .map(r => r.replace(/\x07+\s*$/gm, "").replace(/\x07/g, "\t"))
    .flatMap(r => r.split(/[\r\n]+/))
    .map(l => l.trim())
    .filter(l => l.length > 0 && !isDocBoilerplate(l));
  return lines.join("\n");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

// Flattens mammoth's HTML into the line-oriented text parseAttendance expects. mammoth's raw text
// output puts every table cell on its own line, which detaches a row's Status from its Name; here
// each <tr> becomes ONE line with cells separated by tabs, so tables take the same delimiter/header
// path as spreadsheets. Paragraphs outside tables are one line each.
export function htmlToText(html: string): string {
  const withTables = html.replace(/<table[\s\S]*?<\/table>/gi, table => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(row =>
      [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(cell => stripTags(cell[1].replace(/<\/(p|li|h[1-6])>|<br\s*\/?>/gi, " ")).replace(/\s+/g, " ").trim())
        .join("\t")
    );
    return `\n${rows.join("\n")}\n`;
  });
  const text = stripTags(withTables.replace(/<\/(p|li|h[1-6]|div)>|<br\s*\/?>/gi, "\n"));
  return decodeHtmlEntities(text)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join("\n");
}

export async function extractTextFromFile(buffer: Buffer, extension: string): Promise<string> {
  const ext = extension.toLowerCase();
  if (ext === ".txt" || ext === ".csv") {
    return extractTextFromTxtOrCsv(buffer);
  }
  if (ext === ".docx") {
    // Images are irrelevant here; skip mammoth's default base64 inlining so a photo-heavy
    // document doesn't balloon the intermediate HTML.
    const parsed = await mammoth.convertToHtml(
      { buffer },
      { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })) }
    );
    return htmlToText(parsed.value);
  }
  if (ext === ".doc") {
    return extractTextFromBinaryDoc(buffer);
  }
  if (ext === ".xlsx" || ext === ".xls") {
    return extractTextFromSpreadsheet(buffer);
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

// ---------------------------------------------------------------------------
// Shared string helpers
// ---------------------------------------------------------------------------

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeForMatch(s: string): string {
  return stripAccents(s.toLowerCase()).replace(/\s+/g, " ").trim();
}

function capSubword(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function titleCaseWord(word: string): string {
  return word
    .split(/(-|')/)
    .map(part => (part === "-" || part === "'" ? part : capSubword(part)))
    .join("");
}

function titleCaseName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map(titleCaseWord).join(" ");
}

// ---------------------------------------------------------------------------
// Name cleanup
// ---------------------------------------------------------------------------

const TITLE_PREFIX_RE = /^(mr|ms|mrs|miss|dr|sr|sra|srta)\.?\s+/i;

// Whole words that mark a heading/label line ("Speakeasy Attendance", "Lista de asistencia")
// rather than a colleague's name.
const NON_NAME_WORDS = new Set([
  "attendance", "asistencia", "session", "sesion", "meeting", "reunion", "list", "lista", "log", "logs",
  "class", "clase", "club", "room", "hood", "speakeasy", "activity", "actividad", "total", "sheet", "hoja",
  "participants", "participantes", "roster", "week", "weekly", "semana", "semanal",
]);

function cleanNameCandidate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^["'`]+|["'`]+$/g, "");
  s = s.replace(/^[-*•·]\s*/, "").replace(/^\d+[.)]\s*/, "");
  s = s.replace(/\s*\([^)]*\)\s*$/, "");
  s = s.replace(TITLE_PREFIX_RE, "");
  s = s.trim();
  if (!s) return null;
  if (/\d/.test(s)) return null;
  if (/@/.test(s)) return null;
  if (/https?:\/\/|www\./i.test(s)) return null;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return null;
  if (words.some(w => NON_NAME_WORDS.has(normalizeForMatch(w)))) return null;

  const letterCount = (s.match(/\p{L}/gu) || []).length;
  if (letterCount < 2) return null;

  return titleCaseName(s);
}

// ---------------------------------------------------------------------------
// Status tokens
// ---------------------------------------------------------------------------

const PRESENT_TOKENS = new Set([
  "present", "presente", "p", "1", "yes", "y", "si", "x", "✓", "✔", "attended", "asistio", "here", "true",
]);
const ABSENT_TOKENS = new Set([
  "absent", "ausente", "a", "0", "no", "n", "o", "missing", "falta", "falto", "false",
]);

function matchStatusToken(raw: string | undefined | null): "present" | "absent" | null {
  if (!raw) return null;
  const norm = normalizeForMatch(raw);
  if (PRESENT_TOKENS.has(norm)) return "present";
  if (ABSENT_TOKENS.has(norm)) return "absent";
  return null;
}

// ---------------------------------------------------------------------------
// Activity detection
// ---------------------------------------------------------------------------

const ACTIVITY_KEYWORDS: [string, string][] = [
  ["speak", "Speakeasy"], ["conversation", "Speakeasy"], ["debate", "Speakeasy"],
  ["read", "Reading Club"], ["book", "Reading Club"], ["literature", "Reading Club"],
  ["music", "Music Room"], ["listen", "Music Room"], ["song", "Music Room"],
  ["writ", "Writing Hood"], ["hood", "Writing Hood"], ["email", "Writing Hood"], ["letter", "Writing Hood"], ["poetry", "Writing Hood"],
];

function detectActivityFromText(text: string | undefined | null): string | null {
  if (!text) return null;
  const norm = stripAccents(text.toLowerCase());
  for (const [kw, activity] of ACTIVITY_KEYWORDS) {
    if (norm.includes(kw)) return activity;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, enero: 1, ene: 1,
  february: 2, feb: 2, febrero: 2,
  march: 3, mar: 3, marzo: 3,
  april: 4, apr: 4, abril: 4, abr: 4,
  may: 5, mayo: 5,
  june: 6, jun: 6, junio: 6,
  july: 7, jul: 7, julio: 7,
  august: 8, aug: 8, agosto: 8, ago: 8,
  september: 9, sept: 9, sep: 9, septiembre: 9, setiembre: 9,
  october: 10, oct: 10, octubre: 10,
  november: 11, nov: 11, noviembre: 11,
  december: 12, dec: 12, diciembre: 12,
};

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const ISO_RE = /\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/;
const MONTH_DAY_YEAR_RE = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i");
const DAY_MONTH_YEAR_RE = new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_NAMES})\\.?\\s+(?:de\\s+)?(\\d{4})\\b`, "i");
const NUMERIC_RE = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/;
const MONTH_DAY_RE = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");
const DAY_MONTH_RE = new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_NAMES})\\.?\\b`, "i");

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(y: number, mo: number, d: number): string {
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

function isValidYMD(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function monthFromMatch(raw: string): number | undefined {
  return MONTHS[stripAccents(raw.toLowerCase())];
}

// Ambiguous numeric dates (both parts <= 12) are read month-first, as in a US-locale export,
// unless `dayFirst` is set (see hasSpanishMarkers). A part > 12 always decides on its own.
function findDateInText(text: string | undefined | null, dayFirst = false): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;

  let m = t.match(ISO_RE);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (isValidYMD(y, mo, d)) return formatDate(y, mo, d);
  }

  m = t.match(MONTH_DAY_YEAR_RE);
  if (m) {
    const mo = monthFromMatch(m[1]);
    const d = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (mo && isValidYMD(y, mo, d)) return formatDate(y, mo, d);
  }

  m = t.match(DAY_MONTH_YEAR_RE);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = monthFromMatch(m[2]);
    const y = parseInt(m[3], 10);
    if (mo && isValidYMD(y, mo, d)) return formatDate(y, mo, d);
  }

  m = t.match(NUMERIC_RE);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (m[3].length <= 2) y += 2000;
    const swap = a > 12 || (dayFirst && b <= 12);
    const mo = swap ? b : a;
    const d = swap ? a : b;
    if (isValidYMD(y, mo, d)) return formatDate(y, mo, d);
  }

  m = t.match(MONTH_DAY_RE);
  if (m) {
    const mo = monthFromMatch(m[1]);
    const d = parseInt(m[2], 10);
    if (mo && isValidYMD(2026, mo, d)) return formatDate(2026, mo, d);
  }

  m = t.match(DAY_MONTH_RE);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = monthFromMatch(m[2]);
    if (mo && isValidYMD(2026, mo, d)) return formatDate(2026, mo, d);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Metadata / header exclusion (parser-local — in addition to isInvalidName)
// ---------------------------------------------------------------------------

const METADATA_TERMS = new Set([
  // English (Teams-style exports)
  "meeting title", "attended participants", "start time", "end time", "meeting duration",
  "average attendance time", "name", "full name", "date", "activity", "status", "sheet name",
  "join time", "leave time", "email", "role", "summary",
  // Spanish equivalents (accent-stripped, see normalizeForMatch)
  "titulo de la reunion", "participantes", "participantes que asistieron", "hora de inicio",
  "hora de finalizacion", "duracion de la reunion", "tiempo medio de asistencia", "nombre",
  "nombre completo", "fecha", "actividad", "estado", "hora de union", "hora de salida",
  "correo electronico", "rol",
]);

function isMetadataLine(line: string): boolean {
  return METADATA_TERMS.has(normalizeForMatch(line));
}

interface KeyValueLine {
  rawKey: string;
  key: string;
  value: string;
}

function parseKeyValueLine(line: string): KeyValueLine | null {
  const m = line.match(/^([^:]{1,40}):\s*(.+)$/);
  if (!m) return null;
  return { rawKey: m[1].trim(), key: normalizeForMatch(m[1]), value: m[2].trim() };
}

// ---------------------------------------------------------------------------
// Header-row column mapping
// ---------------------------------------------------------------------------

const HEADER_NAME_KW = ["name", "full name", "nombre", "nombre completo", "participant", "participante", "colleague", "student"];
const HEADER_DATE_KW = ["date", "fecha"];
const HEADER_STATUS_KW = ["status", "estado", "attendance", "asistencia"];
const HEADER_ACTIVITY_KW = ["activity", "actividad"];

interface ColumnMap {
  nameIdx: number;
  dateIdx: number | null;
  statusIdx: number | null;
  activityIdx: number | null;
}

function detectHeaderRow(cells: string[]): ColumnMap | null {
  let nameIdx: number | null = null;
  let dateIdx: number | null = null;
  let statusIdx: number | null = null;
  let activityIdx: number | null = null;

  cells.forEach((cell, idx) => {
    const norm = normalizeForMatch(cell);
    if (nameIdx === null && HEADER_NAME_KW.includes(norm)) nameIdx = idx;
    else if (dateIdx === null && HEADER_DATE_KW.includes(norm)) dateIdx = idx;
    else if (statusIdx === null && HEADER_STATUS_KW.includes(norm)) statusIdx = idx;
    else if (activityIdx === null && HEADER_ACTIVITY_KW.includes(norm)) activityIdx = idx;
  });

  if (nameIdx === null) return null;
  return { nameIdx, dateIdx, statusIdx, activityIdx };
}

// ---------------------------------------------------------------------------
// Line-shape splitting
// ---------------------------------------------------------------------------

function stripCellQuotes(cell: string): string {
  const trimmed = cell.trim();
  const m = trimmed.match(/^"(.*)"$/);
  if (!m) return trimmed;
  return m[1].replace(/""/g, '"');
}

function detectDelimiter(line: string): string | null {
  for (const c of ["\t", "|", ";", ","]) {
    if (line.includes(c)) return c;
  }
  if (/\s{2,}/.test(line)) return "  ";
  return null;
}

function splitByDelimiter(line: string, delim: string): string[] {
  const parts = delim === "  " ? line.split(/\s{2,}/) : line.split(delim);
  return parts.map(p => stripCellQuotes(p.trim()));
}

// Dashes with spaces on both sides only, so hyphenated names ("María-José") are never split.
function splitByDash(line: string): string[] | null {
  if (!/\s[-–—]\s/.test(line)) return null;
  const parts = line.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

// ---------------------------------------------------------------------------
// Row -> record
// ---------------------------------------------------------------------------

interface RawRecord {
  name: string;
  activity: string;
  rawDate: string | null;
  status: "present" | "absent";
}

function parseCells(
  cells: string[],
  columnMap: ColumnMap | null,
  requestedActivity: string,
  documentWideActivity: string | null,
  dayFirst: boolean
): RawRecord | null {
  let nameRaw: string | undefined;
  let dateRaw: string | undefined;
  let statusRaw: string | undefined;
  let activityRaw: string | undefined;

  if (columnMap) {
    nameRaw = cells[columnMap.nameIdx];
    dateRaw = columnMap.dateIdx !== null ? cells[columnMap.dateIdx] : undefined;
    statusRaw = columnMap.statusIdx !== null ? cells[columnMap.statusIdx] : undefined;
    activityRaw = columnMap.activityIdx !== null ? cells[columnMap.activityIdx] : undefined;
  } else {
    nameRaw = cells[0];
  }

  const name = cleanNameCandidate(nameRaw);
  if (!name) return null;

  const nameCellIdx = columnMap ? columnMap.nameIdx : 0;
  const otherCells = cells.filter((_, idx) => idx !== nameCellIdx);

  let rawDate: string | null = dateRaw ? findDateInText(dateRaw, dayFirst) : null;
  if (rawDate === null) {
    for (const c of otherCells) {
      const d = findDateInText(c, dayFirst);
      if (d) { rawDate = d; break; }
    }
  }

  let status: "present" | "absent" | null = statusRaw ? matchStatusToken(statusRaw) : null;
  if (status === null) {
    for (const c of otherCells) {
      const s = matchStatusToken(c);
      if (s) { status = s; break; }
    }
  }

  let activity: string | null = activityRaw ? detectActivityFromText(activityRaw) : null;
  if (!requestedActivity && !activity) {
    for (const c of otherCells) {
      const a = detectActivityFromText(c);
      if (a) { activity = a; break; }
    }
  }

  return {
    name,
    activity: requestedActivity || activity || documentWideActivity || DEFAULT_ACTIVITY,
    rawDate,
    status: status || "present",
  };
}

// ---------------------------------------------------------------------------
// Document-wide date / activity precedence
// ---------------------------------------------------------------------------

// Spanish-locale exports (Teams "Hora de inicio", Excel "Fecha | Nombre | Estado") write numeric
// dates day-first. Any of these accent-stripped labels appearing in the document switches the
// ambiguous-date reading to D/M; English documents keep M/D.
const SPANISH_MARKER_RE =
  /\b(hora de inicio|hora de finalizacion|titulo de la reunion|participantes que asistieron|duracion de la reunion|fecha|nombre|nombre completo|estado|actividad)\b/;

function hasSpanishMarkers(lines: string[]): boolean {
  return lines.some(l => SPANISH_MARKER_RE.test(normalizeForMatch(l)));
}

function findDocumentWideDate(lines: string[], dayFirst: boolean): string | null {
  let startTimeDate: string | null = null;
  let keyValueDate: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (startTimeDate === null) {
      const norm = normalizeForMatch(line);
      if (
        norm.includes("start time") || norm.includes("start_time") ||
        norm.includes("hora de inicio") || norm.includes("hora inicio")
      ) {
        const d = findDateInText(line, dayFirst);
        if (d) startTimeDate = d;
      }
    }

    if (keyValueDate === null) {
      const kv = parseKeyValueLine(line);
      if (kv && (kv.key === "date" || kv.key === "fecha")) {
        const d = findDateInText(kv.value, dayFirst);
        if (d) keyValueDate = d;
      }
    }

    if (startTimeDate) break; // Start time always wins; no need to keep scanning.
  }

  return startTimeDate || keyValueDate;
}

function findDocumentWideActivity(lines: string[]): string | null {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const kv = parseKeyValueLine(line);
    if (kv && (kv.key === "activity" || kv.key === "actividad")) {
      const activity = detectActivityFromText(kv.value);
      if (activity) return activity;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Final dedupe / cleanup pass (mirrors the old cleanAndFilterRecords)
// ---------------------------------------------------------------------------

function cleanAndFilterRecords(rawRecords: ParsedAttendanceRecord[]): ParsedAttendanceRecord[] {
  const seenKeys = new Set<string>();
  const cleaned: ParsedAttendanceRecord[] = [];

  for (const rec of rawRecords) {
    if (!rec || !rec.name) continue;
    const nameStr = rec.name.trim();
    if (isInvalidName(nameStr)) continue;

    const formattedName = titleCaseName(nameStr);
    const key = `${formattedName.toLowerCase()}|${rec.activity.toLowerCase()}|${rec.date}`;

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

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function parseAttendance(text: string, requestedActivity: string = ""): ParsedAttendanceRecord[] {
  const lines = text.split(/\r?\n/);
  const dayFirst = hasSpanishMarkers(lines);
  const documentWideDate = findDocumentWideDate(lines, dayFirst);
  const documentWideActivity = requestedActivity ? null : findDocumentWideActivity(lines);

  const rawRecords: RawRecord[] = [];
  let columnMap: ColumnMap | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isMetadataLine(line)) continue;

    const kv = parseKeyValueLine(line);
    if (kv && METADATA_TERMS.has(kv.key)) {
      if (kv.key === "sheet name") columnMap = null;
      continue;
    }

    // A strong "Name - Activity - Date - Status" dash shape (3+ segments) takes priority over
    // delimiter-based splitting: a date like "June 12, 2026" contains a comma that would
    // otherwise be mistaken for a CSV delimiter and corrupt the split.
    const dashParts = splitByDash(line);
    if (dashParts && dashParts.length >= 3) {
      const rec = parseCells(dashParts, null, requestedActivity, documentWideActivity, dayFirst);
      if (rec) rawRecords.push(rec);
      continue;
    }

    const delim = detectDelimiter(line);
    if (delim) {
      const cells = splitByDelimiter(line, delim);
      // Header detection goes first: a header can legitimately start with a metadata term
      // ("Date,Name,Status"), and the metadata cut below would otherwise swallow it and leave
      // columnMap unset. "Start time<TAB>6/12/26…" pairs have no name column, so they still
      // fall through to the metadata branch.
      const headerMap = detectHeaderRow(cells);
      if (headerMap && cells.length > 1) {
        columnMap = headerMap;
        continue;
      }
      if (cells.length > 0 && METADATA_TERMS.has(normalizeForMatch(cells[0]))) {
        if (normalizeForMatch(cells[0]) === "sheet name") columnMap = null;
        continue;
      }
      const rec = parseCells(cells, columnMap, requestedActivity, documentWideActivity, dayFirst);
      if (rec) rawRecords.push(rec);
      continue;
    }

    if (dashParts) {
      const rec = parseCells(dashParts, null, requestedActivity, documentWideActivity, dayFirst);
      if (rec) rawRecords.push(rec);
      continue;
    }

    const parenMatch = line.match(/^(.*?)\s*\(([^)]{1,20})\)\s*$/);
    if (parenMatch) {
      const name = cleanNameCandidate(parenMatch[1]);
      if (name) {
        rawRecords.push({
          name,
          activity: requestedActivity || documentWideActivity || detectActivityFromText(line) || DEFAULT_ACTIVITY,
          rawDate: findDateInText(line, dayFirst),
          status: matchStatusToken(parenMatch[2]) ?? "present",
        });
      }
      continue;
    }

    if (kv) {
      const statusTok = matchStatusToken(kv.value);
      if (statusTok) {
        const name = cleanNameCandidate(kv.rawKey);
        if (name) {
          rawRecords.push({
            name,
            activity: requestedActivity || documentWideActivity || DEFAULT_ACTIVITY,
            rawDate: null,
            status: statusTok,
          });
        }
        continue;
      }
    }

    // Roster fallback: a bare line with just a name (one colleague per line).
    const name = cleanNameCandidate(line);
    if (name && name.split(" ").length >= 2) {
      // Some extractors put each table cell on its own line ("Carlos Gomez", "", "Absent"). If the
      // next non-empty line is nothing but a status token, it belongs to this name: use it (and
      // consume it) instead of defaulting to "present".
      let status: "present" | "absent" = "present";
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const nextStatus = j < lines.length ? matchStatusToken(lines[j].trim()) : null;
      if (nextStatus) {
        status = nextStatus;
        i = j;
      }
      rawRecords.push({
        name,
        activity: requestedActivity || documentWideActivity || DEFAULT_ACTIVITY,
        rawDate: null,
        status,
      });
    }
  }

  const finalized: ParsedAttendanceRecord[] = rawRecords.map(r => ({
    name: r.name,
    activity: r.activity,
    date: documentWideDate || r.rawDate || REFERENCE_DATE,
    status: r.status,
  }));

  return cleanAndFilterRecords(finalized);
}

// ---------------------------------------------------------------------------
// US-18: deterministic .csv parser (same file => same output, no invented date)
// ---------------------------------------------------------------------------
// .csv uploads skip extractTextFromFile/parseAttendance: this reader understands RFC 4180
// quoting and UTF-16 Teams exports, and returns dateDetected=false (with empty dates) when the
// file has no valid session date, so the UI makes the user pick one instead of defaulting to
// the reference date.

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
  // Not valid UTF-8 => latin1/Windows-1252 (Excel "CSV" on Spanish-locale Windows), so accented
  // names survive — same rule as extractTextFromTxtOrCsv.
  const utf8Text = buffer.toString("utf-8");
  return utf8Text.includes("�") ? buffer.toString("latin1") : utf8Text;
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

const CSV_MONTH_NUMBERS: Record<string, number> = {
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
  if (m && CSV_MONTH_NUMBERS[m[1]]) return toIsoDate(+m[3], CSV_MONTH_NUMBERS[m[1]], +m[2]);

  // "12 June 2026" / "12 de junio de 2026"
  m = v.match(/\b(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3,10})\.?,?\s+(?:de\s+)?(\d{4})\b/);
  if (m && CSV_MONTH_NUMBERS[m[2]]) return toIsoDate(+m[3], CSV_MONTH_NUMBERS[m[2]], +m[1]);

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

function parseCsvStatus(cell: string | undefined): "present" | "absent" | null {
  if (!cell) return null;
  const lc = cell.toLowerCase().trim();
  if (["present", "presente", "p", "1", "yes", "si", "sí", "x", "attended"].includes(lc)) return "present";
  if (["absent", "ausente", "a", "0", "no", "missing"].includes(lc)) return "absent";
  return null;
}

// ---------------------------------------------------------------------------
// US-25: per-attendee duration (.csv only)
// ---------------------------------------------------------------------------

export const MIN_ATTENDANCE_SECONDS = 10 * 60;

// Header cells (exact match after normalizeLabel: case/accent-insensitive) of the duration column
const CSV_DURATION_HEADERS = [
  "in-meeting duration", "in meeting duration", "duration", "duracion en la reunion", "tiempo en la reunion",
];

const DURATION_UNIT_SECONDS: Record<string, number> = {
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, hora: 3600, horas: 3600,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60, minuto: 60, minutos: 60,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1, seg: 1, segs: 1, segundo: 1, segundos: 1,
};

// Seconds for "1h 5m 30s", "45m 12s", "9m", "1 h 5 min", "00:45:12" (h:m:s) or "45:12" (m:s).
// Anything else (including a bare number, whose unit is unknown) returns null.
export function parseDurationSeconds(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const v = stripAccents(raw.toLowerCase()).trim();
  if (!v) return null;

  let m = v.match(/^(\d{1,3}):(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const [h, min, s] = [+m[1], +m[2], +m[3]];
    return min < 60 && s < 60 ? h * 3600 + min * 60 + s : null;
  }
  m = v.match(/^(\d{1,4}):(\d{1,2})$/);
  if (m) {
    const [min, s] = [+m[1], +m[2]];
    return s < 60 ? min * 60 + s : null;
  }

  const tokenRe = /(\d+(?:[.,]\d+)?)\s*([a-z]+)\.?/g;
  let total = 0;
  let tokens = 0;
  for (const t of v.matchAll(tokenRe)) {
    const unit = DURATION_UNIT_SECONDS[t[2]];
    if (unit === undefined) return null;
    total += parseFloat(t[1].replace(",", ".")) * unit;
    tokens++;
  }
  // Every character must belong to a "<number><unit>" token (separators aside)
  if (tokens === 0 || v.replace(tokenRe, "").replace(/[\s,]+/g, "") !== "") return null;
  return Math.round(total);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// US-27: activity a file declares for itself (Activity column / label, or the meeting title)
// ---------------------------------------------------------------------------

const CSV_ACTIVITY_LABELS = ["activity", "actividad"];
const CSV_TITLE_LABELS = ["meeting title", "title", "meeting name", "titulo de la reunion", "titulo", "nombre de la reunion"];
const ACTIVITY_NAMES = ["Speakeasy", "Reading Club", "Music Room", "Writing Hood"];

// A meeting title only declares an activity when it names one of the 4 activities verbatim
// (case/accent-insensitive): the loose keyword heuristics ("email", "book"...) would otherwise
// reject a valid batch over an incidental word in the title.
function activityNamedInTitle(title: string): string | null {
  const norm = normalizeForMatch(title);
  return ACTIVITY_NAMES.find(a => norm.includes(a.toLowerCase())) ?? null;
}

export interface CsvParseResult {
  records: ParsedAttendanceRecord[];
  dateDetected: boolean;
  isEmpty: boolean;
  // US-25: false when the file has no duration column (nobody excluded by time)
  durationFilterApplied: boolean;
  excludedByDuration: DurationExclusion[];
  // US-19 blacklist hits (distinct people), reported per file in the batch preview (US-27)
  excludedByBlacklist: number;
  // US-27: every activity the file itself names, so a batch can be checked for a single activity
  declaredActivities: string[];
  // US-27: content hash (line endings/outer whitespace normalized) to spot identical files in a batch
  fingerprint: string;
}

export function parseCsvAttendance(buffer: Buffer, requestedActivity: string = ""): CsvParseResult {
  const text = decodeCsvBuffer(buffer);
  const rows = parseCsvRows(text, detectCsvDelimiter(text));
  const activity = requestedActivity || DEFAULT_ACTIVITY;
  const declared = new Set<string>();

  for (const row of rows) {
    if (row.length < 2) continue;
    const label = normalizeLabel(row[0]);
    const value = row.slice(1).find(Boolean) || "";
    const found = CSV_ACTIVITY_LABELS.includes(label)
      ? detectActivityFromText(value)
      : CSV_TITLE_LABELS.includes(label)
      ? activityNamedInTitle(value)
      : null;
    if (found) declared.add(found);
  }

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
  const records: ParsedAttendanceRecord[] = [];
  let contentDate: string | null = null;
  let nameCol = -1;
  let statusCol = -1;
  let dateCol = -1;
  let activityCol = -1;
  let durationCol = -1;
  let headerFound = false;
  let durationFilterApplied = false;
  // US-25: name key -> table section index -> summed seconds of that person's rows in the section
  const durations = new Map<string, Map<number, number>>();
  const unreadableDuration = new Map<string, string>(); // name key -> first raw value we couldn't read
  let section = -1;

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
      section++;
      nameCol = headerNameIdx;
      statusCol = labels.findIndex(l => l === "status" || l === "attendance" || l === "estado" || l === "asistencia");
      dateCol = labels.findIndex(l => CSV_DATE_COLUMN_HINTS.some(h => l.includes(h)));
      activityCol = labels.findIndex(l => l === "activity" || l === "actividad");
      durationCol = labels.findIndex(l => CSV_DURATION_HEADERS.includes(l));
      if (durationCol !== -1) durationFilterApplied = true;
      continue;
    }
    if (nameCol === -1) continue;

    const name = cleanCsvName(row[nameCol] || "");
    if (!name) continue;
    if (!contentDate && dateCol !== -1) contentDate = parseDeterministicDate(row[dateCol] || "");
    if (activityCol !== -1) {
      const declaredActivity = detectActivityFromText(row[activityCol]);
      if (declaredActivity) declared.add(declaredActivity);
    }
    if (durationCol !== -1) {
      const key = toTitleCase(name).toLowerCase();
      const raw = row[durationCol] || "";
      const seconds = parseDurationSeconds(raw);
      if (seconds === null) {
        if (!unreadableDuration.has(key)) unreadableDuration.set(key, raw);
      } else {
        const bySection = durations.get(key) ?? new Map<number, number>();
        bySection.set(section, (bySection.get(section) ?? 0) + seconds);
        durations.set(key, bySection);
      }
    }
    // An Activity column is honored unless the user picked an activity for the upload
    const rowActivity = requestedActivity ? null : activityCol !== -1 ? detectActivityFromText(row[activityCol]) : null;
    records.push({
      name: toTitleCase(name),
      activity: rowActivity || activity,
      date: "",
      status: parseCsvStatus(statusCol !== -1 ? row[statusCol] : undefined) || "present",
    });
  }

  // 3. No header row at all: a plain roster, one attendee per row in the first column.
  //    Metadata rows ("Meeting title", "Start time", ...) are dropped by cleanAndFilterRecords (isInvalidName).
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

  // US-19 blacklist goes first, so a facilitator is never also counted as excluded by time (US-25)
  const blacklisted = new Set(records.filter(r => isBlacklistedName(r.name)).map(r => r.name.toLowerCase()));

  // US-25: someone who left and rejoined has several rows in a section, and those are summed.
  // Teams exports repeat people across sections (the "Participants" total and the per-join
  // "In-Meeting Activities" rows), so sections are not added together: the largest section
  // total is the person's time. An unreadable duration keeps the person, flagged for review.
  const excludedByDuration: DurationExclusion[] = [];
  const excludedKeys = new Set<string>();
  const reviewReasons = new Map<string, string>();
  if (durationFilterApplied) {
    const seen = new Set<string>();
    for (const rec of records) {
      const key = rec.name.toLowerCase();
      if (seen.has(key) || blacklisted.has(key) || isInvalidName(rec.name)) continue;
      seen.add(key);
      const bySection = durations.get(key);
      if (unreadableDuration.has(key) || !bySection) {
        const raw = unreadableDuration.get(key);
        reviewReasons.set(key, raw ? `Duration could not be read: "${raw}"` : "No duration found for this colleague");
        continue;
      }
      const seconds = Math.max(...bySection.values());
      if (seconds < MIN_ATTENDANCE_SECONDS) {
        excludedKeys.add(key);
        excludedByDuration.push({ name: rec.name, seconds, duration: formatDuration(seconds) });
      }
    }
  }

  // Same final pass as every other format: blacklist/host/metadata filtering, Title Case, dedupe
  const cleaned = cleanAndFilterRecords(
    records.filter(r => !excludedKeys.has(r.name.toLowerCase())).map(r => ({ ...r, date: finalDate }))
  ).map(r => {
    const reviewReason = reviewReasons.get(r.name.toLowerCase());
    return reviewReason ? { ...r, needsReview: true, reviewReason } : r;
  });

  return {
    records: cleaned,
    dateDetected: Boolean(finalDate),
    isEmpty: !text.trim(),
    durationFilterApplied,
    excludedByDuration,
    excludedByBlacklist: blacklisted.size,
    declaredActivities: [...declared],
    fingerprint: crypto.createHash("sha256").update(text.replace(/\r\n?/g, "\n").trim()).digest("hex"),
  };
}

import { isBlacklistedName } from "./blacklist";

export function isInvalidName(nameStr: string): boolean {
  if (!nameStr) return true;
  const normalizedLower = nameStr.toLowerCase().replace(/\s+/g, " ").trim();

  // 1. Length & basic validation
  if (normalizedLower.length <= 1) return true;
  
  // If it consists only of digits, punctuation, or times/durations (e.g. "12:30", "2026-06-12", "45", "100%", "30 min")
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

  // Headers containing "name" specifically
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

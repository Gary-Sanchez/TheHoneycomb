// US-19: Fixed anti-noise blacklist applied during attendance ingestion.
// Facilitators and coordination staff that must never appear as attendees in
// the import preview or in consolidated data. The list is intentionally fixed
// (no admin UI) — edit it here; server.ts, src/utils.ts, parser.ts and
// db.ts all read from this single source.
//
// US-30: entries are full registered names (first name + both surnames). A
// parsed name is excluded only when it contains every word of one entry
// (order-, case- and accent-insensitive, whole words), so "Guzman Rusinque,
// Angela" matches but "Nicolas Rios" or "Nicolas Rios Cardozo" do not.
export const INGESTION_BLACKLIST: string[] = [
  "Nadine Hinojosa Ramos",
  "Fabiola Arias Navia",
  "Alejandra Barrientos Garrido",
  "Rodrigo Rivero Rocha",
  "Gary Ronald Sanchez Suarez",
  "Nicolas Rios Lopez",
  "Wara Hermosa Fernandez",
  "Angela Guzman Rusinque",
  "Gustavo Ramos Soria",
  "Alejandra Rivera Crespo",
  "Pablo Rico Schmidt",
  "Eric Revollo Ayala",
  "Stephanie Mariscal Rodriguez",
];

/** Lowercase, strip accents/punctuation, and split into words. */
function toWords(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const BLACKLIST_WORDS: string[][] = INGESTION_BLACKLIST.map(toWords);

/** True when the name contains the full registered name of someone on the ingestion blacklist. */
export function isBlacklistedName(nameStr: string): boolean {
  if (!nameStr) return false;
  const words = new Set(toWords(nameStr));
  return BLACKLIST_WORDS.some(entry => entry.every(word => words.has(word)));
}

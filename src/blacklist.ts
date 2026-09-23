// US-19: Fixed anti-noise blacklist applied during attendance ingestion.
// Facilitators and coordination staff that must never appear as attendees in
// the import preview or in consolidated data. The list is intentionally fixed
// (no admin UI) — edit it here; server.ts, src/utils.ts, the Gemini prompt and
// db.ts all read from this single source.

export interface BlacklistEntry {
  /** Canonical display name, as listed in US-19. */
  name: string;
  /**
   * Name variants that identify this person. A parsed name is excluded when it
   * contains every word of any alias (order-insensitive, whole words), so
   * "Fabiola Arias", "Fabiola Arias Navia" and "Arias, Fabiola" all match.
   */
  aliases: string[];
}

export const INGESTION_BLACKLIST: BlacklistEntry[] = [
  { name: "Rodrigo Rivero", aliases: ["rodrigo rivero", "rivero rocha"] },
  { name: "Nicolas Rios", aliases: ["nicolas rios", "rios lopez"] },
  { name: "Wara Hermosa", aliases: ["wara hermosa", "hermosa fernandez"] },
  { name: "Nadine Hinojosa", aliases: ["nadine hinojosa", "hinojosa ramos"] },
  { name: "Eric Revollo", aliases: ["eric revollo", "revollo ayala"] },
  { name: "Pablo Rico", aliases: ["pablo rico", "rico schmidt"] },
  { name: "Gary Ronald Sanchez", aliases: ["gary ronald", "gary sanchez", "sanchez suarez"] },
  { name: "Fabiola Arias", aliases: ["fabiola arias", "arias navia"] },
  { name: "Alejandra Barrientos", aliases: ["alejandra barrientos", "barrientos garrido"] },
  // "Rivero" spelling kept from the previous host list for backward compatibility.
  { name: "Alejandra Rivera", aliases: ["alejandra rivera", "alejandra rivero", "rivero crespo", "rivera crespo"] },
  { name: "Angela Guzman", aliases: ["angela guzman", "guzman rusinque"] },
  { name: "Gustavo Ramos", aliases: ["gustavo ramos", "ramos soria"] },
  { name: "Stephanie Mariscal", aliases: ["stephanie mariscal", "mariscal rodriguez"] },
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

const ALIAS_WORDS: string[][] = INGESTION_BLACKLIST.flatMap(entry =>
  entry.aliases.map(toWords)
);

/** True when the name belongs to someone on the US-19 ingestion blacklist. */
export function isBlacklistedName(nameStr: string): boolean {
  if (!nameStr) return false;
  const words = new Set(toWords(nameStr));
  return ALIAS_WORDS.some(alias => alias.every(word => words.has(word)));
}

import { describe, expect, it } from "vitest";
import { INGESTION_BLACKLIST, isBlacklistedName } from "./blacklist";

describe("isBlacklistedName — full registered names (US-30)", () => {
  it("holds exactly the 13 full names from the ticket", () => {
    expect(INGESTION_BLACKLIST).toHaveLength(13);
    for (const name of INGESTION_BLACKLIST) expect(isBlacklistedName(name)).toBe(true);
  });

  it("does not exclude a colleague who only shares first name + first surname", () => {
    expect(isBlacklistedName("Nicolas Rios Lopez")).toBe(true);
    expect(isBlacklistedName("Nicolas Rios Cardozo")).toBe(false);
    expect(isBlacklistedName("Pablo Rico Vargas")).toBe(false);
  });

  it("does not exclude incomplete names or the removed partial aliases", () => {
    for (const name of [
      "Nicolas Rios", "Fabiola Arias", "Rios Lopez", "Gary Sanchez", "Gary Ronald",
      "Alejandra Rivero", "Alejandra Rivero Crespo", "Angela Guzman",
    ]) {
      expect(isBlacklistedName(name)).toBe(false);
    }
  });

  it("ignores word order, case, accents and punctuation", () => {
    expect(isBlacklistedName("Guzman Rusinque, Angela")).toBe(true);
    expect(isBlacklistedName("ANGELA GUZMÁN RUSINQUE")).toBe(true);
    expect(isBlacklistedName("  sánchez suárez, gary ronald ")).toBe(true);
  });

  it("does not match initials", () => {
    expect(isBlacklistedName("Angela G. Rusinque")).toBe(false);
  });
});

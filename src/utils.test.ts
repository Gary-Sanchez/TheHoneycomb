import { describe, expect, it } from "vitest";
import { compareNames, sortByName } from "./utils";

const people = (...names: string[]) => names.map((name, i) => ({ id: `a${i}`, name }));
const names = (rows: { name: string }[]) => rows.map(r => r.name);

describe("sortByName (US-28)", () => {
  it("QA-01: zoe, Álvaro, beatriz, Carlos → Álvaro, beatriz, Carlos, zoe", () => {
    expect(names(sortByName(people("zoe", "Álvaro", "beatriz", "Carlos")))).toEqual([
      "Álvaro",
      "beatriz",
      "Carlos",
      "zoe",
    ]);
  });

  it("QA-04: a newly added Daniela lands between Carlos and zoe", () => {
    const sorted = sortByName(people("zoe", "Álvaro", "beatriz", "Carlos", "Daniela"));
    expect(names(sorted)).toEqual(["Álvaro", "beatriz", "Carlos", "Daniela", "zoe"]);
  });

  it("ignores case and accents: Álvaro and alvaro sort as Alvaro, before Beatriz", () => {
    expect(compareNames("Álvaro", "Beatriz")).toBeLessThan(0);
    expect(compareNames("alvaro", "Beatriz")).toBeLessThan(0);
    expect(compareNames("Émile", "eva")).toBeLessThan(0);
    expect(compareNames("ZOE", "beatriz")).toBeGreaterThan(0);
  });

  it("is deterministic for names equal at base level, regardless of input order", () => {
    const a = names(sortByName(people("alvaro", "Álvaro", "Alvaro")));
    const b = names(sortByName(people("Álvaro", "Alvaro", "alvaro")));
    expect(a).toEqual(b);
  });

  it("returns a copy and leaves the input order untouched", () => {
    const input = people("zoe", "Álvaro");
    const sorted = sortByName(input);
    expect(names(input)).toEqual(["zoe", "Álvaro"]);
    expect(sorted).not.toBe(input);
  });
});

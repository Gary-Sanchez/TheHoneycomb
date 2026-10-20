// US-50: builds the fixed regression database e2e/fixtures/v{MAJOR}.{MINOR}.0.json that
// e2e/visual.spec.ts loads for the reference screenshots. Deterministic (no clock, no randomness):
// the demo seed from src/mockData.ts (demo names only) plus one demo coaching note and one demo
// .csv import fingerprint, stamped with the data schema version and the given app version.
//
//   npx tsx e2e/fixtures/build-fixture.ts          → version from package.json (X.Y.0)
//   npx tsx e2e/fixtures/build-fixture.ts 4.0.0    → e2e/fixtures/v4.0.0.json
//
// A frozen vX.Y.0.json is never regenerated once its PRD is closed (see docs/PRD-CLOSING.md).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENT_SCHEMA_VERSION, seedData, type HoneycombData } from "../../db";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgVersion: string = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "package.json"), "utf-8")).version;
const [major, minor] = (process.argv[2] ?? pkgVersion).split(".");
const version = `${major}.${minor}.0`;
if (!/^\d+\.\d+\.0$/.test(version)) throw new Error(`Invalid version: ${process.argv[2] ?? pkgVersion}`);

function buildFixture(appVersion: string): HoneycombData {
  const seed = seedData();
  const elena = seed.attendees.find(att => att.name === "Elena Rostova");
  if (!elena) throw new Error("Demo attendee Elena Rostova is missing from src/mockData.ts");

  // The fingerprint vouches for a Speakeasy event that is already in the seed records
  const activity = "Speakeasy";
  const date = "2026-06-17";
  const attendeeNames = seed.records
    .filter(rec => rec.activity === activity && rec.date === date && rec.status === "present")
    .map(rec => rec.attendeeName);
  const filename = "speakeasy-2026-06-17.csv";

  return {
    ...seed,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion,
    notes: {
      [elena.id]: "Demo note: great pronunciation in Speakeasy; next goal is leading a Writing Hood prompt.",
    },
    imports: [
      {
        hash: crypto.createHash("sha256").update(`honeycomb-fixture:${filename}`).digest("hex"),
        filename,
        activity,
        date,
        attendeeCount: attendeeNames.length,
        attendeeNames,
        importedAt: "2026-06-17T18:00:00.000Z",
      },
    ],
  };
}

const out = path.join(here, `v${version}.json`);
// Same formatting lowdb writes (JSON.stringify with 2 spaces)
fs.writeFileSync(out, JSON.stringify(buildFixture(version), null, 2));
console.log(`Wrote ${path.relative(process.cwd(), out)}`);

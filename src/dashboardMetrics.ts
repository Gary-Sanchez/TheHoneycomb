import { BeehaviorRow } from "./beehavior";

// US-45: Dashboard metrics built on the Bee-havior Hub's event-based maths (beehavior.ts),
// so every rate here matches the Hub for the same period. Pure on purpose, like beehavior.ts.

const mean = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

// Colleagues with an Overall — the No data ones (US-44: no events to rate them on) are left out
const ratedRows = (rows: BeehaviorRow[]) => rows.filter(r => r.overallRate !== null);

export interface OverallAverage {
  // null → nobody has an Overall in the period → the KPI shows "—"
  rate: number | null;
  colleagues: number;
}

// US-45: Avg. Attendance Rate = plain average of the Hub's Overall column (not weighted by events)
export function averageOverall(rows: BeehaviorRow[]): OverallAverage {
  const rated = ratedRows(rows);
  return { rate: mean(rated.map(r => r.overallRate as number)), colleagues: rated.length };
}

// "Average of 24 colleagues" / "Average of 1 colleague"
export const formatAverageBase = (colleagues: number) =>
  `Average of ${colleagues} ${colleagues === 1 ? "colleague" : "colleagues"}`;

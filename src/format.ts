// US-58: the one date & percent formatter for on-screen text. Pure (no React, no DOM) so the server,
// the screens and the tests all share it. Native date inputs and generated files keep ISO.

export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// US-46: "Jun 24, 2026". Takes an ISO date (YYYY-MM-DD, extra time part ignored) and parses it by
// hand so the user's timezone can't shift the day. Anything unparseable is returned as is.
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  const month = MONTH_ABBR[Number(m) - 1];
  return month ? `${month} ${Number(d)}, ${y}` : iso;
}

// A 0–1 fraction as a whole percentage with the sign attached: 0.756 → "76%" (Math.round, no
// decimals). Only formats: screens keep computing their percentages as they do today. A missing
// value (null / NaN / ±Infinity) gives "—", the placeholder the tables already use for "no rate".
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  // + 0 turns -0 (e.g. -0.001 rounded) into 0
  return `${Math.round(fraction * 100) + 0}%`;
}

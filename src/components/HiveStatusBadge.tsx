import { getHiveTier } from "../beehavior";

// US-42: the one Hive Status badge (Dormant / Hatcher / Forager / Busy Bee), shared by the
// Bee-havior Hub, Caserits & Progress and the Progress Report so a colleague gets the same label
// and colors everywhere. Text uses the tier's textColor (≥ 4.5:1 on its background).
// `rate` is the colleague's Overall; null (nothing to rate them on) shows "No data", never Dormant (US-44).

export const NO_DATA_BADGE = { label: "No data", textColor: "#4B5563", bgLight: "#F3F4F6", border: "#D1D5DB" };

export default function HiveStatusBadge({ rate, size = "sm" }: { rate: number | null; size?: "sm" | "md" }) {
  const sizing = size === "md" ? "px-3.5 py-1.5 text-sm" : "px-3 py-1 text-xs";
  if (rate === null) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-bold ${sizing}`}
        style={{ backgroundColor: NO_DATA_BADGE.bgLight, color: NO_DATA_BADGE.textColor, border: `1px solid ${NO_DATA_BADGE.border}` }}
        title="No events to rate this colleague on yet."
        data-testid="hive-status"
      >
        {NO_DATA_BADGE.label}
      </span>
    );
  }
  const tier = getHiveTier(rate);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold shadow-sm ${sizing}`}
      style={{ backgroundColor: tier.bgLight, color: tier.textColor, border: `1px solid ${tier.color}` }}
      title={tier.meaning}
      data-testid="hive-status"
    >
      <span aria-hidden="true">{tier.icon}</span>
      <span>{tier.label}</span>
    </span>
  );
}

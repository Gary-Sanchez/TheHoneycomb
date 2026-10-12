import { getHiveStatus } from "../beehavior";

// US-42: the one Hive Status badge (Dormant / Hatcher / Forager / Busy Bee), shared by the
// Bee-havior Hub, Caserits & Progress and the Progress Report so a colleague gets the same label
// and colors everywhere. Text uses the tier's textColor (≥ 4.5:1 on its background).
// `rate` is the colleague's Overall; null (nothing to rate them on) shows "No data", never Dormant (US-44).

export default function HiveStatusBadge({ rate, size = "sm" }: { rate: number | null; size?: "sm" | "md" }) {
  const sizing = size === "md" ? "px-3.5 py-1.5 text-sm" : "px-3 py-1 text-xs";
  const tier = getHiveStatus(rate);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${rate === null ? "" : "shadow-sm"} ${sizing}`}
      style={{ backgroundColor: tier.bgLight, color: tier.textColor, border: `1px solid ${tier.color}` }}
      title={tier.meaning}
      data-testid="hive-status"
    >
      {tier.icon && <span aria-hidden="true">{tier.icon}</span>}
      <span>{tier.label}</span>
    </span>
  );
}

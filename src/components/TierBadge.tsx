import { Egg, Flower2, Hexagon, Moon, type LucideIcon } from "lucide-react";
import { getHiveStatus, type HiveTierKey } from "../beehavior";

// US-58: the Hive Status badge (evolved from US-42's HiveStatusBadge). Colors come from the
// --color-tier-* tokens (same values as the tier's textColor / bgLight / color, checked in
// designTokens.test.ts) and the emoji became a decorative Lucide icon; labels and thresholds are
// those of getHiveStatus. `rate` is the colleague's Overall; null shows "No data", never Dormant (US-44).

const TIER_STYLE: Record<HiveTierKey, { classes: string; icon: LucideIcon | null }> = {
  "busy-bee": { classes: "text-tier-busy-bee bg-tier-busy-bee-bg border-tier-busy-bee-border shadow-sm", icon: Hexagon },
  forager: { classes: "text-tier-forager bg-tier-forager-bg border-tier-forager-border shadow-sm", icon: Flower2 },
  hatcher: { classes: "text-tier-hatcher bg-tier-hatcher-bg border-tier-hatcher-border shadow-sm", icon: Egg },
  dormant: { classes: "text-tier-dormant bg-tier-dormant-bg border-tier-dormant-border shadow-sm", icon: Moon },
  "no-data": { classes: "text-tier-no-data bg-tier-no-data-bg border-tier-no-data-border", icon: null },
};

export default function TierBadge({ rate, size = "sm" }: { rate: number | null; size?: "sm" | "md" }) {
  const sizing = size === "md" ? "px-3.5 py-1.5 text-sm" : "px-3 py-1 text-xs";
  const tier = getHiveStatus(rate);
  const { classes, icon: Icon } = TIER_STYLE[tier.key];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip border font-bold ${classes} ${sizing}`}
      title={tier.meaning}
      data-testid="hive-status"
      data-tier={tier.key}
    >
      {Icon && <Icon aria-hidden="true" className="w-4 h-4" strokeWidth={2.25} />}
      <span>{tier.label}</span>
    </span>
  );
}

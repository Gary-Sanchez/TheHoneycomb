import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ActivityType } from "../../types";
import { cx, type NativeAttributes } from "./styles";

// US-56: Badge, StatusBadge and ActivityBadge. Non-interactive <span>s whose text is the label;
// icons and dots are decorative (aria-hidden). Every text/background pair used here is checked
// ≥ 4.5:1 by src/designTokens.test.ts (TEXT_PAIRS). Hive Status keeps its own HiveStatusBadge.

export type StatusTone = "danger" | "warning" | "success" | "info";
export type BadgeTone = "neutral" | StatusTone;
export type BadgeSize = "sm" | "md";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-cream text-forest border-border",
  danger: "bg-danger-bg text-danger border-danger-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  success: "bg-success-bg text-success border-success-border",
  info: "bg-info-bg text-info border-info-border",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "px-2.5 py-0.5 text-micro",
  md: "px-3 py-1 text-body",
};

export interface BadgeProps extends NativeAttributes {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Decorative leading icon. */
  icon?: ReactNode;
}

export default function Badge({ tone = "neutral", size = "sm", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={cx("inline-flex items-center gap-1.5 rounded-chip border font-semibold whitespace-nowrap", TONES[tone], SIZES[size], className)}>
      {icon && <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

const STATUS_ICONS: Record<StatusTone, typeof Info> = {
  danger: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
};

export interface StatusBadgeProps extends NativeAttributes {
  tone: StatusTone;
  size?: BadgeSize;
}

/** A status badge: tone color plus its icon, so the state never depends on color alone. */
export function StatusBadge({ tone, size = "sm", ...rest }: StatusBadgeProps) {
  const Icon = STATUS_ICONS[tone];
  return <Badge {...rest} tone={tone} size={size} icon={<Icon className={size === "md" ? "size-4" : "size-3"} />} />;
}

// Literal class names per activity (Tailwind can't see interpolated ones). Text = the -text token
// on surface (≥ 4.5:1); border and dot = the fill color (decorative: the name identifies it).
const ACTIVITY_CLASSES: Record<ActivityType, { badge: string; dot: string }> = {
  Speakeasy: { badge: "border-activity-speakeasy text-activity-speakeasy-text", dot: "bg-activity-speakeasy" },
  "Reading Club": { badge: "border-activity-reading-club text-activity-reading-club-text", dot: "bg-activity-reading-club" },
  "Music Room": { badge: "border-activity-music-room text-activity-music-room-text", dot: "bg-activity-music-room" },
  "Writing Hood": { badge: "border-activity-writing-hood text-activity-writing-hood-text", dot: "bg-activity-writing-hood" },
};

export interface ActivityBadgeProps extends NativeAttributes {
  children?: never;
  activity: ActivityType;
  size?: BadgeSize;
}

/** The activity's name in its color. No icon yet (US-58 brings the activity icons). */
export function ActivityBadge({ activity, size = "sm", className, ...rest }: ActivityBadgeProps) {
  const classes = ACTIVITY_CLASSES[activity];
  return (
    <span
      {...rest}
      className={cx("inline-flex items-center gap-1.5 rounded-chip border bg-surface font-semibold whitespace-nowrap", classes.badge, SIZES[size], className)}
    >
      <span className={cx("size-2 shrink-0 rounded-chip", classes.dot)} aria-hidden="true" />
      {activity}
    </span>
  );
}

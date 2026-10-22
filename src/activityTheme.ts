import { BookOpen, MessagesSquare, Music, PenLine, type LucideIcon } from "lucide-react";
import { ACTIVITIES, type ActivityType } from "./types";

// US-58: the one place that says what each activity looks like — its color token (src/index.css,
// ≥ 3:1 on white and distinguishable under deuteranopia) and its Lucide icon. The color never goes
// alone: wherever an activity is shown by color, its icon (or name) goes with it.

export interface ActivityTheme {
  activity: ActivityType;
  /** Fill color (chart series, dots, chips): `--color-activity-*`. */
  token: string;
  /** Variant readable as text (≥ 4.5:1 on surface and cream): `--color-activity-*-text`. */
  textToken: string;
  /** Tailwind classes for the same tokens (literal so Tailwind generates them). */
  bgClass: string;
  textClass: string;
  icon: LucideIcon;
}

export const ACTIVITY_THEME: Readonly<Record<ActivityType, ActivityTheme>> = {
  Speakeasy: {
    activity: "Speakeasy",
    token: "--color-activity-speakeasy",
    textToken: "--color-activity-speakeasy-text",
    bgClass: "bg-activity-speakeasy",
    textClass: "text-activity-speakeasy-text",
    icon: MessagesSquare,
  },
  "Reading Club": {
    activity: "Reading Club",
    token: "--color-activity-reading-club",
    textToken: "--color-activity-reading-club-text",
    bgClass: "bg-activity-reading-club",
    textClass: "text-activity-reading-club-text",
    icon: BookOpen,
  },
  "Music Room": {
    activity: "Music Room",
    token: "--color-activity-music-room",
    textToken: "--color-activity-music-room-text",
    bgClass: "bg-activity-music-room",
    textClass: "text-activity-music-room-text",
    icon: Music,
  },
  "Writing Hood": {
    activity: "Writing Hood",
    token: "--color-activity-writing-hood",
    textToken: "--color-activity-writing-hood-text",
    bgClass: "bg-activity-writing-hood",
    textClass: "text-activity-writing-hood-text",
    icon: PenLine,
  },
};

export const isActivity = (value: string): value is ActivityType => (ACTIVITIES as readonly string[]).includes(value);

/** Theme of an activity; undefined for anything that isn't one of the 4 (e.g. "" = not detected). */
export function getActivityTheme(activity: string): ActivityTheme | undefined {
  return isActivity(activity) ? ACTIVITY_THEME[activity] : undefined;
}

/** `var(--color-activity-*)`, usable in inline styles and SVG attributes. */
export const activityColorVar = (activity: ActivityType) => `var(${ACTIVITY_THEME[activity].token})`;

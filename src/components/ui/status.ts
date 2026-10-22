import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { StatusTone } from "./Badge";

// US-57: status tones shared by Alert and Toast. Text/background pairs are in TEXT_PAIRS
// (src/designTokens.test.ts, >= 4.5:1); the icon keeps the state from depending on color alone.

export const STATUS_SURFACE: Record<StatusTone, string> = {
  danger: "border-danger-border bg-danger-bg text-danger",
  warning: "border-warning-border bg-warning-bg text-warning",
  success: "border-success-border bg-success-bg text-success",
  info: "border-info-border bg-info-bg text-info",
};

export const STATUS_ICON: Record<StatusTone, typeof Info> = {
  danger: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
};

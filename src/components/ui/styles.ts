import type { ReactNode } from "react";

// US-56: class fragments shared by the base components. Only design tokens (src/index.css,
// docs/DESIGN-TOKENS.md); Tailwind needs literal class names, so every variant is spelled out.

/**
 * Native attributes passed through to the underlying element (onClick, aria-*, data-*, ref…). The
 * project has no @types/react, so React's own prop types resolve to `any`; this index signature
 * keeps each component's declared props (and required ones like IconButton's aria-label) checked.
 */
export interface NativeAttributes {
  id?: string;
  className?: string;
  children?: ReactNode;
  [attribute: string]: unknown;
}

/** Joins class names, skipping falsy ones. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * The one disabled look, shared by every button variant and every field control. Hover styles use
 * `enabled:` so a disabled control never reacts to the pointer. Focus is the global
 * `:focus-visible` ring (src/index.css): components never draw their own.
 */
export const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-colors duration-[var(--duration-fast)]";

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded-control border border-transparent bg-forest text-surface enabled:hover:bg-forest-hover",
  secondary: "rounded-control border border-input-border bg-surface text-forest enabled:hover:bg-cream",
  ghost: "rounded-control border border-transparent bg-transparent text-forest enabled:hover:bg-wheat",
  danger: "rounded-control border border-transparent bg-danger text-surface enabled:hover:bg-danger/90",
  link: "rounded-control text-forest underline underline-offset-4 enabled:hover:text-forest-hover enabled:hover:decoration-2",
};

/** Height + padding + text per size. `link` keeps the text size only (it sits inline in copy). */
export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-body",
  md: "h-11 px-4 text-body",
  lg: "h-12 px-6 text-body-lg",
};

export const LINK_SIZES: Record<ButtonSize, string> = {
  sm: "text-body",
  md: "text-body",
  lg: "text-body-lg",
};

/** Field controls: h-11, input-border (3.42:1 on surface), danger border when invalid. */
export const CONTROL =
  "w-full rounded-control border border-input-border bg-surface px-3 text-body text-forest placeholder:text-text-muted aria-invalid:border-danger";

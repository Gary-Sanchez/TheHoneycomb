import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { BUTTON_BASE, BUTTON_VARIANTS, DISABLED, cx, type ButtonVariant, type NativeAttributes } from "./styles";

export interface IconButtonProps extends NativeAttributes {
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  children?: never;
  /** Required: an icon-only button has no visible text, so this is its accessible name. */
  "aria-label": string;
  /** The icon (rendered aria-hidden). */
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, "link">;
  loading?: boolean;
}

// US-56: 40 px square icon button. `aria-label` is required by the type, so tsc rejects an
// unlabelled one (pinned by the @ts-expect-error in IconButton.test.tsx).
export default function IconButton({
  icon,
  variant = "ghost",
  loading = false,
  disabled,
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], "size-10 shrink-0 p-0", DISABLED, className)}
    >
      <span className="inline-flex" aria-hidden="true">
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      </span>
    </button>
  );
}

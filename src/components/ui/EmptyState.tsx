import type { ReactNode } from "react";
import { cx, type NativeAttributes } from "./styles";

// US-57: what a list, table or chart shows when there's nothing to show yet: a decorative icon, a
// short title (a heading, h3 by default, to sit under the tab's h2), an explanation and an optional
// action (e.g. a Button that leads to Import Forage Logs).

export interface EmptyStateProps extends NativeAttributes {
  title: ReactNode;
  description?: ReactNode;
  /** Decorative icon (aria-hidden). */
  icon?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}

export default function EmptyState({ title, description, icon, action, headingLevel = 3, className, ...rest }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div
      {...rest}
      className={cx("flex flex-col items-center gap-3 rounded-card border border-dashed border-input-border bg-surface px-6 py-10 text-center", className)}
    >
      {icon && (
        <span className="inline-flex rounded-chip bg-wheat p-3 text-forest" aria-hidden="true">
          {icon}
        </span>
      )}
      <Heading className="text-h3 font-semibold text-forest">{title}</Heading>
      {description && <p className="max-w-prose text-body text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

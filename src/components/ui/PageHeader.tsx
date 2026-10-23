import type { ReactNode } from "react";
import { cx, type NativeAttributes } from "./styles";

// US-57: the top of a tab. Renders the tab's one h2 (the app's h1 is the header), an optional
// description and actions on the right that wrap below it on narrow screens.

export interface PageHeaderProps extends NativeAttributes {
  title: ReactNode;
  description?: ReactNode;
  /** e.g. the tab's primary Button. */
  actions?: ReactNode;
  /** id of the h2, so a tabpanel or section can point aria-labelledby at it. */
  headingId?: string;
}

export default function PageHeader({ title, description, actions, headingId, className, ...rest }: PageHeaderProps) {
  return (
    <div {...rest} className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 id={headingId} className="font-serif text-h2 font-semibold text-forest">
          {title}
        </h2>
        {description && <p className="mt-1 text-body text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

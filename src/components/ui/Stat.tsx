import type { ReactNode } from "react";
import { cx, type NativeAttributes } from "./styles";

// US-57: a KPI ("Total Caserits: 42"). A description list (<dl><dt>label</dt><dd>value</dd></dl>),
// not a heading: the label describes the value, it doesn't open a section. Optional hint in a
// second <dd> and a decorative icon (inside the <dt>, aria-hidden).

export interface StatProps extends NativeAttributes {
  label: ReactNode;
  value: ReactNode;
  /** Secondary line, e.g. "+3 since May" or "No data". */
  hint?: ReactNode;
  /** Decorative icon (aria-hidden). */
  icon?: ReactNode;
}

export default function Stat({ label, value, hint, icon, className, ...rest }: StatProps) {
  return (
    <dl {...rest} className={cx("flex flex-col gap-1 rounded-card border border-border bg-surface p-6 text-forest shadow-sm", className)}>
      <dt className="flex items-center justify-between gap-3 text-micro font-semibold tracking-wider text-text-muted uppercase">
        <span>{label}</span>
        {icon && (
          <span className="inline-flex text-sage-text" aria-hidden="true">
            {icon}
          </span>
        )}
      </dt>
      <dd className="font-serif text-kpi font-semibold">{value}</dd>
      {hint && <dd className="text-body text-text-muted">{hint}</dd>}
    </dl>
  );
}

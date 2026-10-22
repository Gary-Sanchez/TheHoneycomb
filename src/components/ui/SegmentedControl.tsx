import { useRef, useState, type ReactNode } from "react";
import { rovingIndex } from "./roving";
import { DISABLED, cx, type NativeAttributes } from "./styles";

// US-57: a single choice among a few options (e.g. "Group trends by: Month / Week"), as a radio
// group: role="radiogroup" with role="radio" + aria-checked buttons, roving tabindex, and arrows
// (Left/Right/Up/Down, wrapping) plus Home / End that move and select. Every segment keeps a 1 px
// border and the same font weight in both states, so selecting never shifts the layout.

export interface SegmentedOption {
  value: string;
  label: ReactNode;
}

export interface SegmentedControlProps extends NativeAttributes {
  /** Accessible name of the group (or pass aria-labelledby). */
  label?: string;
  options: SegmentedOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

export default function SegmentedControl({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  className,
  ...rest
}: SegmentedControlProps) {
  const [internal, setInternal] = useState<string | undefined>(defaultValue);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = value !== undefined ? value : internal;
  const selectedIndex = options.findIndex(o => o.value === selected);

  const select = (next: string) => {
    if (value === undefined) setInternal(next);
    if (next !== selected) onValueChange?.(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const next = rovingIndex(e.key, selectedIndex, options.length, { vertical: true });
    if (next === null) return;
    e.preventDefault();
    select(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      {...rest}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={disabled ? undefined : onKeyDown}
      className={cx("inline-flex gap-1 rounded-control border border-input-border bg-surface p-1", className)}
    >
      {options.map((option, i) => {
        const checked = option.value === selected;
        // With nothing selected, the first option is the group's Tab stop
        const tabbable = checked || (selectedIndex === -1 && i === 0);
        return (
          <button
            key={option.value}
            ref={(el: HTMLButtonElement | null) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => select(option.value)}
            className={cx(
              "h-9 rounded-control border px-3 text-body font-semibold whitespace-nowrap transition-colors duration-[var(--duration-fast)]",
              DISABLED,
              checked ? "border-forest bg-forest text-surface" : "border-transparent bg-transparent text-forest enabled:hover:bg-cream"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

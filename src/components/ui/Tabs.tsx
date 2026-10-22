import { useId, useRef, useState, type ReactNode } from "react";
import { rovingIndex } from "./roving";
import { cx, type NativeAttributes } from "./styles";

// US-57: WAI-ARIA tabs with automatic activation (selection follows focus). Only the selected tab is
// in the Tab order (roving tabindex); Left / Right move and wrap, Home / End jump to the ends. Every
// tab controls its own tabpanel (always in the DOM, so aria-controls never dangles); only the
// selected panel renders its content. Controlled (`value` + `onValueChange`) or uncontrolled.

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps extends NativeAttributes {
  /** Accessible name of the tablist. */
  label: string;
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
}

export default function Tabs({ label, tabs, value, defaultValue, onValueChange, className, ...rest }: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState<string | undefined>(defaultValue);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const requested = value !== undefined ? value : internal;
  const selected = tabs.some(t => t.id === requested) ? requested : tabs[0]?.id;
  const selectedIndex = tabs.findIndex(t => t.id === selected);

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    if (id !== selected) onValueChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const next = rovingIndex(e.key, selectedIndex, tabs.length);
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  return (
    <div {...rest} className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex overflow-x-auto border-b border-border">
        {tabs.map((tab, i) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el: HTMLButtonElement | null) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={isSelected}
              aria-controls={panelId(tab.id)}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={cx(
                // Border always present (only its color changes) and one font weight: no 1 px jump on selection
                "-mb-px shrink-0 border-b-2 px-4 py-3 text-body font-semibold whitespace-nowrap transition-colors duration-[var(--duration-fast)] focus-ring-inset",
                isSelected ? "border-forest text-forest" : "border-transparent text-text-muted hover:border-input-border hover:text-forest"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map(tab => {
        const isSelected = tab.id === selected;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelId(tab.id)}
            aria-labelledby={tabId(tab.id)}
            tabIndex={0}
            hidden={!isSelected}
            className="pt-4"
          >
            {isSelected && tab.content}
          </div>
        );
      })}
    </div>
  );
}

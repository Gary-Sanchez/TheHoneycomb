import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { rovingIndex } from "./roving";
import { cx, type NativeAttributes } from "./styles";

// US-57: WAI-ARIA tabs with automatic activation (selection follows focus). Only the selected tab is
// in the Tab order (roving tabindex); Left / Right move and wrap, Home / End jump to the ends. Every
// tab controls its own tabpanel (always in the DOM, so aria-controls never dangles); only the
// selected panel renders its content. Controlled (`value` + `onValueChange`) or uncontrolled.
// US-59: when the tabs don't fit, the tablist scrolls sideways with no native scrollbar, a faded
// edge + chevron (decorative) shows there is more on that side, and the selected tab is scrolled to
// the center. `renderList` / `renderPanels` wrap the list and the panels separately, so the app
// shell can put the list in a sticky <nav> and the panels in <main>.

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
  /** Wraps the tablist (e.g. in a sticky <nav>). Default: rendered as is. */
  renderList?: (list: ReactNode) => ReactNode;
  /** Wraps the tabpanels (e.g. in <main>). Default: rendered as is. */
  renderPanels?: (panels: ReactNode) => ReactNode;
  /** Classes of every tabpanel. Default `pt-4`. */
  panelClassName?: string;
}

const identity = (node: ReactNode) => node;

export default function Tabs({
  label,
  tabs,
  value,
  defaultValue,
  onValueChange,
  renderList = identity,
  renderPanels = identity,
  panelClassName = "pt-4",
  className,
  ...rest
}: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState<string | undefined>(defaultValue);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });
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

  // Which edges have hidden tabs behind them (1 px tolerance for fractional scroll positions)
  const measureOverflow = () => {
    const list = listRef.current;
    if (!list) return;
    const start = list.scrollLeft > 1;
    const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setOverflow(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
  };

  useLayoutEffect(() => {
    measureOverflow();
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(list);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  // Center the selected tab in the list when the list scrolls. Only the list scrolls (not
  // scrollIntoView, which would also scroll the page to a tablist that is out of view). The list is
  // `relative`, so a tab's offsetLeft is its position in the list's content.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[selectedIndex];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo?.({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2 });
  }, [selectedIndex]);

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  const list = (
    <div className="relative" data-overflow-start={overflow.start || undefined} data-overflow-end={overflow.end || undefined}>
      {/* The baseline is an inset shadow, not a border: a scrolling tablist clips anything outside its
          padding box, so the selected tab's 2 px indicator has to sit inside it, over the baseline */}
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        onScroll={measureOverflow}
        className={cx(
          "relative flex overflow-x-auto overflow-y-hidden scrollbar-none scroll-fade-x shadow-[inset_0_-1px_0_var(--color-border)]",
          overflow.start && "[--fade-start:3rem]",
          overflow.end && "[--fade-end:3rem]"
        )}
      >
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
                "shrink-0 border-b-2 px-4 py-3 font-sans text-body font-semibold whitespace-nowrap transition-colors duration-[var(--duration-fast)] focus-ring-inset",
                isSelected ? "border-forest text-forest" : "border-transparent text-text-muted hover:border-input-border hover:text-forest"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {/* "More tabs this way": decorative, the tabs themselves stay reachable by arrows / Home / End */}
      {overflow.start && (
        <ChevronLeft className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-forest" aria-hidden="true" />
      )}
      {overflow.end && (
        <ChevronRight className="pointer-events-none absolute top-1/2 right-0 size-4 -translate-y-1/2 text-forest" aria-hidden="true" />
      )}
    </div>
  );

  const panels = tabs.map(tab => {
    const isSelected = tab.id === selected;
    return (
      <div
        key={tab.id}
        role="tabpanel"
        id={panelId(tab.id)}
        aria-labelledby={tabId(tab.id)}
        tabIndex={0}
        hidden={!isSelected}
        className={panelClassName}
      >
        {isSelected && tab.content}
      </div>
    );
  });

  return (
    <div {...rest} className={className}>
      {renderList(list)}
      {renderPanels(panels)}
    </div>
  );
}

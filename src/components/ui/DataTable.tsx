import type { ReactNode } from "react";
import { cx } from "./styles";

// US-57: a semantic data table. The wrapper scrolls horizontally on its own (the page never does at
// 375 px) and is a focusable, named region so keyboard users can scroll it with the arrows. Headers
// are scope="col", the first column is a scope="row" header by default, the header row is sticky
// and opaque, rows highlight on hover, and the first column can stay pinned while scrolling sideways.
// To keep the header visible on vertical scroll, give the table a max height (className="max-h-96").
// Out of scope: sorting, filters, pagination.

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  /** Cell content; defaults to `row[key]`. */
  cell?: (row: Row) => ReactNode;
  align?: "left" | "right";
}

export interface DataTableProps<Row> {
  /** The table's <caption>; also names the scroll region. */
  caption: string;
  /** Keeps the caption for assistive tech only (sr-only) when a visible heading already says it. */
  hideCaption?: boolean;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row, index: number) => string;
  /** First column as <th scope="row"> (default true). */
  rowHeader?: boolean;
  /** Pins the first column while scrolling horizontally. */
  stickyFirstColumn?: boolean;
  /** Shown in a single row when there are no rows. */
  emptyMessage?: ReactNode;
  /** Classes for the scroll wrapper (e.g. a max height). */
  className?: string;
}

const CELL = "px-4 py-3 text-body whitespace-nowrap";

export default function DataTable<Row>({
  caption,
  hideCaption = false,
  columns,
  rows,
  getRowKey,
  rowHeader = true,
  stickyFirstColumn = false,
  emptyMessage = "No data",
  className,
}: DataTableProps<Row>) {
  const align = (column: DataTableColumn<Row>) => (column.align === "right" ? "text-right" : "text-left");
  const content = (column: DataTableColumn<Row>, row: Row) =>
    column.cell ? column.cell(row) : ((row as Record<string, unknown>)[column.key] as ReactNode);
  // Pinned cells need an opaque background (and the row's hover color) so scrolled cells don't show through
  const pinned = (i: number) => stickyFirstColumn && i === 0;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {/* The visible title sits outside the scroll region so it never scrolls away (or gets cut at
          375 px); the real <caption> stays in the table for assistive tech */}
      {!hideCaption && (
        <p aria-hidden="true" className="px-4 py-3 text-h3 font-semibold text-forest">
          {caption}
        </p>
      )}
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        // isolate: the sticky cells' z-index stays local to this table (pinned header > header > pinned column)
        className={cx("isolate overflow-x-auto focus-ring-inset", className)}
      >
        <table className="w-full border-separate border-spacing-0 text-forest">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column, i) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cx(
                    CELL,
                    "sticky top-0 border-b border-border bg-cream font-semibold",
                    pinned(i) ? "left-0 z-[var(--z-dropdown)]" : "z-[var(--z-header)]",
                    align(column)
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={cx(CELL, "text-center text-text-muted")}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, r) => (
                <tr key={getRowKey(row, r)} className="group">
                  {columns.map((column, i) => {
                    // The last row's border is dropped here rather than with group-last:, whose generated
                    // `:is(:where(.group):last-child *)` selector shifted the existing modals' text
                    // rendering in the 1440 px visual snapshots.
                    const cellClass = cx(
                      CELL,
                      "bg-surface transition-colors duration-[var(--duration-fast)] group-hover:bg-wheat",
                      r < rows.length - 1 && "border-b border-border",
                      pinned(i) && "sticky left-0 z-[var(--z-nav)]",
                      align(column)
                    );
                    return rowHeader && i === 0 ? (
                      <th key={column.key} scope="row" className={cx(cellClass, "font-semibold")}>
                        {content(column, row)}
                      </th>
                    ) : (
                      <td key={column.key} className={cellClass}>
                        {content(column, row)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

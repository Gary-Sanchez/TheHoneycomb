import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import DataTable, { type DataTableColumn } from "./DataTable";
import { cx } from "./styles";

// US-57: frame for a percentage chart, following the Dashboard panels (US-36). Y axis 0–100 with
// "%", tooltip with the unit, a legend of the real series, missing values (null) as gaps that read
// "No data" (never drawn as 0 %), a role="img" wrapper whose aria-label lists every point, and the
// same data as a table (DataTable) for anyone who can't read the chart. Neutral/brand colors from
// the chart tokens (CSS variables); per-activity colors are US-58.

export const NO_DATA = "No data";
export const PERCENT_TICKS = [0, 25, 50, 75, 100];

/** One point of the X axis: its label plus one value per series key (null = no data). */
export interface ChartDatum {
  label: string;
  [seriesKey: string]: string | number | null;
}

export interface ChartSeries {
  key: string;
  /** Shown in the legend, the tooltip, the aria-label and the table header. */
  name: string;
  /** CSS color, ideally a token variable; defaults to SERIES_COLORS by position. */
  color?: string;
}

export interface ChartFrameProps {
  /** Visible title (figcaption), also the start of the aria-label and the table caption. */
  title: string;
  data: ChartDatum[];
  series: ChartSeries[];
  kind?: "line" | "bar";
  /** Header of the label column in the table (e.g. "Month"). */
  labelHeader?: string;
  /** Height of the plot area (a Tailwind height class). */
  heightClass?: string;
  /** Hides the alternative table (only when the same data is already in a table on screen). */
  hideTable?: boolean;
  /** Extra content under the title (e.g. a SegmentedControl). */
  controls?: ReactNode;
  className?: string;
}

// Neutral/brand tokens only (contrast >= 3:1 on surface for the first two).
export const SERIES_COLORS = [
  "var(--color-chart-primary)",
  "var(--color-chart-axis-muted)",
  "var(--color-sand-text)",
  "var(--color-info-border)",
];

// Type scale token for chart text; SVG geometry (line width, bar corners) takes plain numbers, so it
// lives in these named constants instead of inline literals.
const CHART_TEXT_SIZE = "var(--text-micro)";
export const LINE_WIDTH = 3;
export const BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0];
const AXIS_TICK = { fill: "var(--color-chart-axis)", fontSize: CHART_TEXT_SIZE };
const TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: "var(--color-chart-tooltip-bg)",
    borderRadius: "var(--radius-control)",
    border: "none",
    color: "var(--color-chart-tooltip-text)",
  },
  itemStyle: { color: "var(--color-chart-tooltip-accent)" },
  labelStyle: { fontWeight: "bold" },
};

const isMissing = (v: unknown): v is null | undefined => v === null || v === undefined;
export const formatChartValue = (v: unknown) => (isMissing(v) ? NO_DATA : `${typeof v === "number" ? Math.round(v) : v}%`);

/**
 * Bar mode: an empty slot would look like 0 %, so a missing value is labeled "No data", written
 * upwards from the baseline to fit the bar's width. Recharts drops null bars entirely (no shape, no
 * label), so bar mode plots a missing value at 0 and this shape, told it's missing, draws the label
 * instead of the (zero-height) Rectangle.
 */
function BarOrNoData({ missing, ...props }: BarShapeProps & { missing: boolean }) {
  const { x, y, width } = props;
  if (!missing) return <Rectangle {...props} />;
  const centerX = Number(x) + Number(width) / 2;
  const baseY = Number(y);
  if (!Number.isFinite(centerX) || !Number.isFinite(baseY)) return null;
  return (
    <text
      x={centerX}
      y={baseY}
      dx={6}
      dominantBaseline="central"
      transform={`rotate(-90 ${centerX} ${baseY})`}
      fill="var(--color-chart-axis)"
      fontSize={CHART_TEXT_SIZE}
      className="chart-no-data"
    >
      {NO_DATA}
    </text>
  );
}

/** Tooltip value: read from the datum itself (bar mode plots a missing value at 0), so a gap says "No data". */
export const tooltipFormatter =
  (series: ChartSeries[]) =>
  (value: unknown, name: unknown, item?: { payload?: ChartDatum }) => {
    const key = series.find(s => s.name === name)?.key;
    return formatChartValue(key && item?.payload ? item.payload[key] : value);
  };

/** "Title. Series: Jan 80%, Feb No data. Other: …" — what the role="img" wrapper announces. */
export function chartAriaLabel(title: string, data: ChartDatum[], series: ChartSeries[]): string {
  if (data.length === 0) return `${title}. ${NO_DATA}.`;
  const parts = series.map(s => `${s.name}: ${data.map(d => `${d.label} ${formatChartValue(d[s.key])}`).join(", ")}`);
  return `${title}. ${parts.join(". ")}.`;
}

export default function ChartFrame({
  title,
  data,
  series,
  kind = "line",
  labelHeader = "Period",
  heightClass = "h-72",
  hideTable = false,
  controls,
  className,
}: ChartFrameProps) {
  const color = (s: ChartSeries, i: number) => s.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
  const columns: DataTableColumn<ChartDatum>[] = [
    { key: "label", header: labelHeader },
    ...series.map(s => ({ key: s.key, header: s.name, align: "right" as const, cell: (d: ChartDatum) => formatChartValue(d[s.key]) })),
  ];
  const margin = { top: 10, right: 16, left: 0, bottom: 0 };
  const shared = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-chart-grid)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
      <YAxis domain={[0, 100]} ticks={PERCENT_TICKS} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tick={AXIS_TICK} />
      {/* filterNull={false}: Recharts drops null entries from the tooltip by default, so the formatter
          would never get to say "No data" for a missing month. The value is read from the datum
          itself, since bar mode plots missing values at 0. */}
      <Tooltip {...TOOLTIP_PROPS} filterNull={false} formatter={tooltipFormatter(series)} />
      <Legend wrapperStyle={{ fontSize: CHART_TEXT_SIZE, color: "var(--color-chart-axis)" }} />
    </>
  );

  return (
    <figure className={cx("flex flex-col gap-4", className)}>
      <figcaption className="text-h3 font-semibold text-forest">{title}</figcaption>
      {controls}
      {/* accessibilityLayer={false}: Recharts 3 would otherwise make its <svg> a nameless tabindex=0
          role="application" inside this role="img", which already describes the data */}
      <div className={heightClass} role="img" aria-label={chartAriaLabel(title, data, series)}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart accessibilityLayer={false} data={data} margin={margin}>
              {shared}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={(d: ChartDatum) => d[s.key] ?? 0}
                  name={s.name}
                  fill={color(s, i)}
                  radius={BAR_RADIUS}
                  shape={(p: BarShapeProps) => <BarOrNoData {...p} missing={isMissing((p.payload as ChartDatum | undefined)?.[s.key])} />}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart accessibilityLayer={false} data={data} margin={margin}>
              {shared}
              {/* null leaves a gap ("No data"), never drawn as 0% */}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={color(s, i)}
                  strokeWidth={LINE_WIDTH}
                  dot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {!hideTable && (
        <DataTable<ChartDatum> caption={`${title} (data table)`} columns={columns} rows={data} getRowKey={d => d.label} emptyMessage={NO_DATA} />
      )}
    </figure>
  );
}

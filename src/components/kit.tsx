/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : kit.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import type {ReactNode} from "react";
import Plot from "./Plot";

// Shared layout / table / chart primitives reused by every ported page.
// All visuals use the classes defined in styles/app.css plus inline SVG so
// the frontend carries no charting dependency.

export function PageHeader(props: {
  icon?: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="page-title">
          {props.icon && <span className="icon">{props.icon}</span>} {props.title}
        </div>
        <div className="page-subtitle">{props.subtitle}</div>
      </div>
      {props.actions && <div className="toolbar">{props.actions}</div>}
    </div>
  );
}

export function Card(props: {
  title?: ReactNode;
  actions?: ReactNode;
  noPadding?: boolean;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="card" style={props.style}>
      {props.title && (
        <div className="card-header">
          <span className="card-title">{props.title}</span>
          {props.actions && <div className="toolbar">{props.actions}</div>}
        </div>
      )}
      <div className={props.noPadding ? "card-body no-padding" : "card-body"}>
        {props.children}
      </div>
    </div>
  );
}

// color is one of the accent modifiers in app.css: cyan green red amber
// purple blue. Renders the same .metric-card markup the Blazor pages use.
export function StatCard(props: {label: string; value: ReactNode; color?: string}) {
  const c = props.color ?? "";
  return (
    <div className={`metric-card ${c}`}>
      <div className="metric-label">{props.label}</div>
      <div className={`metric-value ${c}`}>{props.value}</div>
    </div>
  );
}

// Grid wrapper for a row of StatCards (auto-fit, matches .metrics-grid).
export function MetricsGrid({children}: {children: ReactNode}) {
  return <div className="metrics-grid">{children}</div>;
}

export function Loading() {
  return (
    <div className="empty-state">
      <div className="loading-spinner" style={{margin: "0 auto"}} />
    </div>
  );
}

export function Empty({message}: {message: string}) {
  return (
    <div className="empty-state">
      <div className="message">{message}</div>
    </div>
  );
}

export function Badge({text, kind}: {text: string; kind: string}) {
  return <span className={`badge ${kind}`}>{text}</span>;
}

// On/off filter pill — use instead of native checkboxes in toolbars.
export function ToggleChip({label, on, onToggle}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" aria-pressed={on}
      className={on ? "toggle-chip on" : "toggle-chip"}
      onClick={onToggle}>
      <span className="toggle-chip-dot" />
      {label}
    </button>
  );
}

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  // Tooltip shown on the column header (e.g. to explain what the number means).
  title?: string;
  // Provide a comparable value to make this column sortable by clicking it.
  sortValue?: (row: T) => number | string;
}

export function DataTable<T>(props: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  rowKey: (row: T, i: number) => string | number;
  onRowClick?: (row: T) => void;
  // Highlights the currently-selected row (e.g. the drilled transaction).
  isRowActive?: (row: T) => boolean;
  // Extra per-row class (e.g. to dim rows marked "not important").
  rowClassName?: (row: T) => string | undefined;
  // Column index sorted by default (its sortValue must be set).
  defaultSort?: {col: number; dir: "asc" | "desc"};
}) {
  const [sort, setSort] = useState<{col: number; dir: "asc" | "desc"} | null>(
    props.defaultSort ?? null);

  if (props.rows.length === 0) {
    return <Empty message={props.empty ?? "Мэдээлэл алга"} />;
  }

  let rows = props.rows;
  const sortCol = sort != null ? props.columns[sort.col] : undefined;
  if (sort && sortCol?.sortValue) {
    const val = sortCol.sortValue;
    const mul = sort.dir === "asc" ? 1 : -1;
    rows = [...props.rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return 0;
    });
  }

  function onHeaderClick(i: number) {
    if (!props.columns[i].sortValue) return;
    setSort((s) => s && s.col === i
      ? {col: i, dir: s.dir === "asc" ? "desc" : "asc"}
      // numbers usually want biggest-first on first click
      : {col: i, dir: "desc"});
  }

  return (
    <table className="data-grid" style={{width: "100%"}}>
      <thead>
        <tr>
          {props.columns.map((c, i) => {
            const sortable = !!c.sortValue;
            const active = sort?.col === i;
            return (
              <th key={i} style={{textAlign: c.align ?? "left",
                cursor: sortable ? "pointer" : undefined,
                userSelect: "none",
                color: active ? "var(--accent-cyan)" : undefined}}
                title={c.title ?? (sortable ? "Эрэмбэлэх" : undefined)}
                onClick={sortable ? () => onHeaderClick(i) : undefined}>
                {c.header}
                {sortable && (
                  <span style={{marginLeft: 4, opacity: active ? 1 : 0.35}}>
                    {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={props.rowKey(row, i)}
            className={[
              props.isRowActive?.(row) ? "case-row-active" : "",
              props.rowClassName?.(row) ?? "",
            ].filter(Boolean).join(" ") || undefined}
            onClick={props.onRowClick ? () => props.onRowClick!(row) : undefined}
            style={props.onRowClick ? {cursor: "pointer"} : undefined}>
            {props.columns.map((c, j) => (
              <td key={j} style={{textAlign: c.align ?? "left"}}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// === charts (Plotly — matches the original Blazor charts.js) =============
const CYAN = "#00E5FF";

export function BarChart(props: {
  data: {label: string; value: number}[];
  height?: number;
  color?: string;
}) {
  return (
    <Plot
      height={props.height ?? 240}
      data={[{
        type: "bar",
        x: props.data.map((d) => d.label),
        y: props.data.map((d) => d.value),
        marker: {color: props.color ?? CYAN},
      }]}
    />
  );
}

export function LineChart(props: {
  values: {label: string; value: number}[];
  height?: number;
  color?: string;
}) {
  return (
    <Plot
      height={props.height ?? 240}
      data={[{
        type: "scatter",
        mode: "lines",
        x: props.values.map((d) => d.label),
        y: props.values.map((d) => d.value),
        line: {color: props.color ?? CYAN, width: 1.6},
      }]}
    />
  );
}

// Day(7) x Hour(24) heatmap. data[day][hour] = count.
// Numeric y + labeled ticks, NOT category labels: plotly's raster draw hits
// c2p(category) before categories register on the first (strict-mode) mount
// and spams "<image> attribute height: NaN" console errors.
export function Heatmap(props: {data: number[][]; rowLabels: string[]}) {
  const zmax = Math.max(1, ...props.data.map((row) => Math.max(0, ...row)));
  return (
    <Plot
      height={props.rowLabels.length * 26 + 60}
      layout={{yaxis: {
        gridcolor: "#1A1A3E",
        zerolinecolor: "#252550",
        tickvals: props.rowLabels.map((_v, i) => i),
        ticktext: props.rowLabels,
      }}}
      data={[{
        type: "heatmap",
        z: props.data,
        y: props.rowLabels.map((_v, i) => i),
        x: Array.from({length: props.data[0]?.length ?? 24}, (_v, i) => i),
        colorscale: "Jet",
        showscale: true,
        zmin: 0,
        zmax,
      }]}
    />
  );
}

// Benford: observed (bars) vs expected (line) for digits 1-9.
export function BenfordChart(props: {observed: number[]}) {
  const expected = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <Plot
      height={240}
      data={[
        {type: "bar", name: "Ажиглагдсан", x: digits, y: props.observed,
          marker: {color: CYAN}},
        {type: "scatter", mode: "lines+markers", name: "Хүлээгдэж буй",
          x: digits, y: expected, line: {color: "#FF6D00", width: 2}},
      ]}
    />
  );
}

// Sankey diagram for network money-flow (ported from the Blazor sankey).
export function SankeyChart(props: {
  labels: string[];
  source: number[];
  target: number[];
  value: number[];
  nodeColors?: string[];
  linkColors?: string[];
  height?: number;
}) {
  return (
    <Plot
      height={props.height ?? 420}
      data={[{
        type: "sankey",
        orientation: "h",
        node: {
          label: props.labels, pad: 14, thickness: 16,
          color: props.nodeColors ?? CYAN,
          line: {color: "#252550", width: 0.5},
        },
        link: {
          source: props.source, target: props.target, value: props.value,
          color: props.linkColors,
        },
      }]}
    />
  );
}

// Radar (scatterpolar) for the multi-dimensional risk profile.
export function RadarChart(props: {
  axes: string[];
  values: number[];
  height?: number;
}) {
  return (
    <Plot
      height={props.height ?? 220}
      layout={{
        polar: {
          radialaxis: {visible: true, range: [0, 100], gridcolor: "#1A1A3E"},
          angularaxis: {gridcolor: "#1A1A3E"},
          bgcolor: "#0A0A1F",
        },
        showlegend: false,
      }}
      data={[{
        type: "scatterpolar",
        r: [...props.values, props.values[0]],
        theta: [...props.axes, props.axes[0]],
        fill: "toself",
        fillcolor: "rgba(0,229,255,0.25)",
        line: {color: "#00E5FF"},
      }]}
    />
  );
}

// Doughnut (pie with a hole) for risk distribution / channel breakdown.
export function DonutChart(props: {
  labels: string[];
  values: number[];
  colors?: string[];
  height?: number;
}) {
  return (
    <Plot
      height={props.height ?? 240}
      layout={{showlegend: true}}
      data={[{
        type: "pie",
        hole: 0.55,
        labels: props.labels,
        values: props.values,
        marker: {colors: props.colors},
        textinfo: "label+percent",
        textfont: {size: 10},
      }]}
    />
  );
}

// Treemap for category breakdown. Pass a synthetic root with value 0 first
// (parent total = sum of children under Plotly's default branchvalues).
export function TreemapChart(props: {
  labels: string[];
  parents: string[];
  values: number[];
  colors?: string[];
  height?: number;
}) {
  return (
    <Plot
      height={props.height ?? 300}
      data={[{
        type: "treemap",
        labels: props.labels,
        parents: props.parents,
        values: props.values,
        marker: {colors: props.colors},
        textinfo: "label+value",
      }]}
    />
  );
}

// Multi-series area-line (e.g. monthly credit vs debit volume).
export function MultiLineChart(props: {
  x: string[];
  series: {name: string; y: number[]; color: string}[];
  height?: number;
}) {
  return (
    <Plot
      height={props.height ?? 240}
      data={props.series.map((s) => ({
        type: "scatter",
        mode: "lines",
        name: s.name,
        x: props.x,
        y: s.y,
        fill: "tozeroy",
        line: {color: s.color, width: 1.6},
      }))}
    />
  );
}

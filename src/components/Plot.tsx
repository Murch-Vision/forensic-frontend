/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : Plot.tsx
 * Created at  : 2026-06-24
 * Updated at  : 2026-06-24
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
// @ts-ignore — factory subpath has no bundled types
import createPlotlyComponent from "react-plotly.js/factory";
// @ts-ignore — dist-min has no bundled types
import Plotly from "plotly.js-dist-min";

// Plotly bound to the dist-min build (matches the original Blazor plotly-2.x).
// A dark-theme layout base is merged into every chart so all plots share the
// app's palette without each call repeating it.
const PlotlyComponent = createPlotlyComponent(Plotly);

export const DARK_LAYOUT = {
  paper_bgcolor: "#0F1125",
  plot_bgcolor: "#0A0A1F",
  font: {color: "#8888AA", size: 10},
  margin: {l: 50, r: 16, t: 16, b: 40},
  xaxis: {gridcolor: "#1A1A3E", zerolinecolor: "#252550"},
  yaxis: {gridcolor: "#1A1A3E", zerolinecolor: "#252550"},
  legend: {orientation: "h", y: -0.2},
};

export interface PlotClickEvent {
  points: Array<{curveNumber: number; pointNumber: number; pointIndex?: number}>;
}

export interface PlotProps {
  data: unknown[];
  layout?: Record<string, unknown>;
  height?: number;
  // Fired when a data point is clicked (e.g. to drill into a transaction).
  onClick?: (e: PlotClickEvent) => void;
}

export default function Plot({data, layout, height, onClick}: PlotProps) {
  return (
    <PlotlyComponent
      data={data}
      layout={{...DARK_LAYOUT, ...layout, autosize: true}}
      config={{displayModeBar: false, responsive: true}}
      style={{width: "100%", height: height ?? 240}}
      onClick={onClick}
      useResizeHandler
    />
  );
}

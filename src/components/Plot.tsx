/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : Plot.tsx
 * Created at  : 2026-06-24
 * Updated at  : 2026-06-24
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useEffect} from "react";
// @ts-ignore — factory subpath has no bundled types
import createPlotlyComponent from "react-plotly.js/factory";
// @ts-ignore — dist-min has no bundled types
import Plotly from "plotly.js-dist-min";

// Plotly bound to the dist-min build (matches the original Blazor plotly-2.x).
// A dark-theme layout base is merged into every chart so all plots share the
// app's palette without each call repeating it.
const PlotlyComponent = createPlotlyComponent(Plotly);

// ⚠️ Plotly MUTATES the layout object it is handed: it writes the axis type and
// range it resolved back into layout.xaxis / layout.yaxis. A module-level layout
// constant is therefore shared mutable state, and a shallow {...BASE} copy still
// hands every chart the SAME nested axis objects.
//
// That leaked across charts. The dashboard's monthly chart plots "2025-08"
// strings, which plotly types as a date axis and stamps into the shared xaxis;
// the calls heatmap only overrides yaxis, so it inherited type:"date" and drew
// its 0–23 hour columns as milliseconds after the epoch — a wall of empty blue
// from 1970 with the real cells crushed against one edge. Nothing is shared now:
// every chart gets its own layout, built fresh on each render.
const AXIS = {gridcolor: "#1A1A3E", zerolinecolor: "#252550"};

function baseLayout(): Record<string, unknown> {
  return {
    paper_bgcolor: "#0F1125",
    plot_bgcolor: "#0A0A1F",
    font: {color: "#8888AA", size: 10},
    margin: {l: 50, r: 16, t: 16, b: 40},
    xaxis: {...AXIS},
    yaxis: {...AXIS},
    legend: {orientation: "h", y: -0.2},
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// One level of nesting is all the layouts use (xaxis.gridcolor, margin.l …), so
// a per-key merge is enough — and it keeps a caller's `xaxis: {type: "date"}`
// from throwing away the shared grid colours.
function mergeLayout(
  override?: Record<string, unknown>
): Record<string, unknown> {
  const out = baseLayout();
  for (const [k, v] of Object.entries(override ?? {})) {
    const base = out[k];
    out[k] = isPlainObject(v) && isPlainObject(base) ? {...base, ...v} : v;
  }
  return out;
}

export interface PlotClickEvent {
  points: Array<{curveNumber: number; pointNumber: number; pointIndex?: number;
    x?: string | number; y?: string | number;
    customdata?: Array<string | number>}>;
}

export interface PlotProps {
  data: unknown[];
  layout?: Record<string, unknown>;
  height?: number;
  // Fired when a data point is clicked (e.g. to drill into a transaction).
  onClick?: (e: PlotClickEvent) => void;
}

// Render a fresh, complete chart for a document, independent of screen paging,
// scrolling and hover state. The temporary DOM node never stores evidence.
export async function exportPlotPng(data: unknown[], height: number, layout?: Record<string, unknown>) {
  const element = document.createElement("div");
  element.style.cssText = "position:fixed;left:-10000px;top:0;width:1600px;pointer-events:none";
  document.body.appendChild(element);
  try {
    await document.fonts.ready;
    await Plotly.newPlot(element, data, {...mergeLayout(layout), width: 1600, height},
      {staticPlot: true, displayModeBar: false});
    const url: string = await Plotly.toImage(element, {format: "png", width: 1600, height, scale: 1.25});
    const canvas = document.createElement("canvas");
    canvas.width = 2000; canvas.height = height * 1.25;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Мөнгөн урсгалын зургийг үүсгэж чадсангүй.");
    const image = new Image(); image.src = url; await image.decode();
    context.drawImage(image, 0, 0);
    // Small colour differences in Plotly's antialiasing make dense ribbons
    // disproportionately large. Quantise those shades at print resolution
    // so complete cases fit the existing bounded PNG transport.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        pixels.data[i + channel] = Math.min(255, Math.round(pixels.data[i + channel] / 16) * 16);
      }
    }
    context.putImageData(pixels, 0, 0);
    return {imageBase64: canvas.toDataURL("image/png").split(",")[1], width: canvas.width, height: canvas.height};
  } finally {
    Plotly.purge(element);
    element.remove();
  }
}

export default function Plot({data, layout, height, onClick}: PlotProps) {
  // Plotly's responsive config already owns the resize listener. The React
  // wrapper's duplicate useResizeHandler can outlive its DOM ref during fast
  // filter changes and try to resize a null element.
  // react-plotly measures its container on mount; inside a flex/grid card the
  // width often isn't settled yet, so the chart paints blank at width 0 and no
  // window-resize ever fires to correct it. Nudge a resize on the next frames
  // so every chart re-measures and draws reliably.
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event("resize"));
    const a = requestAnimationFrame(fire);
    const t = setTimeout(fire, 120);
    return () => { cancelAnimationFrame(a); clearTimeout(t); };
  }, []);
  return (
    <PlotlyComponent
      data={data}
      layout={{...mergeLayout(layout), autosize: true}}
      config={{displayModeBar: false, responsive: true}}
      style={{width: "100%", height: height ?? 240}}
      onClick={onClick}
    />
  );
}

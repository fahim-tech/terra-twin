import { useEffect, useRef, useState } from "react";

type PlotlyLike = {
  react: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, config: Record<string, unknown>) => Promise<unknown>;
  purge: (el: HTMLElement) => void;
};
let plotly: Promise<PlotlyLike> | null = null;
const load = () => (plotly ??= import("plotly.js-cartesian-dist-min").then((m) => (m.default ?? m) as PlotlyLike));

const BASE_LAYOUT = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "Inter, system-ui, sans-serif", size: 11, color: "#94A3B5" },
  margin: { l: 56, r: 16, t: 8, b: 40 },
  xaxis: { gridcolor: "#1d2833", zerolinecolor: "#263240", linecolor: "#263240", tickcolor: "#263240", ticks: "outside", ticklen: 3 },
  yaxis: { gridcolor: "#1d2833", zerolinecolor: "#263240", linecolor: "#263240", tickcolor: "#263240", automargin: true },
  hoverlabel: { bgcolor: "#17212D", bordercolor: "#263240", font: { color: "#F2F5F8", family: "Inter" } },
  showlegend: false,
};

function merge(a: Record<string, any>, b: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] ? merge(a[k], v) : v;
  return o;
}

/** Thin lazy Plotly wrapper with the TerraTwin scientific chart style (thin axes, no chartjunk). */
export function Plot({ data, layout = {}, height = 260, label }: { data: unknown[]; layout?: Record<string, unknown>; height?: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const node = el.current;
    load().then((P) => {
      if (!alive || !node) return;
      return P.react(node, data, merge(BASE_LAYOUT, { ...layout, height }), { displayModeBar: false, responsive: true });
    }).catch((e) => setErr(String(e)));
    return () => { alive = false; };
  }, [data, layout, height]);
  useEffect(() => () => { const n = el.current; if (n) load().then((P) => P.purge(n)); }, []);
  if (err) return <p className="text-[12px] text-bad">Chart failed to load: {err}</p>;
  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />;
}

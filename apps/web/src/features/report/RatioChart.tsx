import { Measure } from "../../components/primitives";
import { cx } from "../../components/ui";
import type { TerrainRow } from "./model";

/** Log axis 0.5×–2× for ratio descriptors; linear Δ ±0.3 for the Hurst exponent (spec §10). */
const LOG_MIN = -1, LOG_MAX = 1;
const LIN = 0.3;

function position(r: TerrainRow): { at: number; clipped: -1 | 0 | 1 } | null {
  if (r.mars === null || r.earth === null) return null;
  let t: number;
  if (r.transform === "linear") t = (r.earth - r.mars + LIN) / (2 * LIN);
  else {
    if (r.mars <= 0 || r.earth <= 0) return null;
    t = (Math.log2(r.earth / r.mars) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  }
  return { at: Math.min(1, Math.max(0, t)), clipped: t < 0 ? -1 : t > 1 ? 1 : 0 };
}

function band(r: TerrainRow): [number, number] {
  if (r.transform === "linear") return [(-r.tol + LIN) / (2 * LIN), (r.tol + LIN) / (2 * LIN)];
  const lo = Math.log2(1 / (1 + r.tol)), hi = Math.log2(1 + r.tol);
  return [(lo - LOG_MIN) / (LOG_MAX - LOG_MIN), (hi - LOG_MIN) / (LOG_MAX - LOG_MIN)];
}

function relation(r: TerrainRow): string {
  if (r.mars === null || r.earth === null) return "not comparable";
  if (r.transform === "linear") { const d = r.earth - r.mars; return `Δ ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`; }
  const q = r.earth / r.mars;
  return `${q.toFixed(2)}×`;
}

const digitsFor = (r: TerrainRow) => (r.transform === "linear" ? 2 : r.unit === "deg" ? 1 : 0);

/** Phones: label and values on one line, the plot full width beneath. From `sm`: one line per descriptor. */
const GRID = "grid-cols-[1fr_64px_64px] sm:grid-cols-[minmax(150px,1fr)_minmax(200px,2fr)_76px_76px]";

/** Axis positions shared by the header scale and every row's guides: 0.5×, √½×, 1×, √2×, 2× on the log axis. */
const GUIDES = [0, 0.25, 0.5, 0.75, 1];

function AxisScale() {
  return (
    <div className="relative h-7">
      <span className="num absolute left-0 top-0 text-num-sm text-faint">0.5×</span>
      <span className="num absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-num-sm text-mars">1× · Mars</span>
      <span className="num absolute right-0 top-0 text-num-sm text-faint">2×</span>
      {GUIDES.map((g) => (
        <span key={g} className={cx("absolute bottom-0 w-px", g === 0.5 ? "h-2 bg-mars" : g === 0 || g === 1 ? "h-2 bg-line-strong" : "h-1 bg-line-strong")}
          style={{ left: `calc(${g * 100}% - ${g}px)` }} />
      ))}
    </div>
  );
}

export function RatioChart({ rows }: { rows: TerrainRow[] }) {
  const groups: { title: string; rows: TerrainRow[] }[] = [
    { title: "Similar", rows: rows.filter((r) => r.kind === "match") },
    { title: "Different", rows: rows.filter((r) => r.kind === "mismatch") },
    { title: "Not comparable", rows: rows.filter((r) => r.kind === "unknown") },
  ].filter((g) => g.rows.length);

  return (
    <div className="[print-color-adjust:exact]">
      {/* Axis header, aligned with the plot column (phones: columns first, then the full-width scale). */}
      <div className={cx("grid items-end gap-x-4 gap-y-2 border-b border-line-strong pb-2", GRID)} aria-hidden>
        <div className="kicker">Descriptor · Earth / Mars</div>
        <div className="order-last col-span-3 sm:order-none sm:col-span-1"><AxisScale /></div>
        <div className="kicker text-right !text-mars">Mars</div>
        <div className="kicker text-right !text-earth">Earth</div>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="mt-5 first:mt-4">
          <div className="kicker pb-2">{g.title} <span className="num font-normal normal-case tracking-normal">· {g.rows.length}</span></div>
          <ul>
            {g.rows.map((r) => {
              const p = position(r);
              const [b0, b1] = band(r);
              return (
                <li key={r.key} className={cx("grid items-center gap-x-4 gap-y-2 border-t border-line py-3", GRID)}>
                  <div className="min-w-0">
                    <div className="text-label text-ink">{r.label}</div>
                    <div className="mt-0.5 text-caption text-faint">
                      <span className="num text-muted">{relation(r)}</span> · {r.kind === "match" ? "within tolerance" : r.kind === "mismatch" ? "outside tolerance" : "missing value"}
                    </div>
                  </div>
                  <div className="relative order-last col-span-3 h-7 sm:order-none sm:col-span-1" role="img"
                    aria-label={`${r.label}: Earth ${relation(r)} relative to Mars; tolerance band ${r.transform === "linear" ? `±${r.tol}` : `${(1 / (1 + r.tol)).toFixed(2)}× to ${(1 + r.tol).toFixed(2)}×`}.`}>
                    {/* Axis line and quarter guides. */}
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
                    {r.transform === "log" && GUIDES.filter((x) => x !== 0.5).map((x) => (
                      <div key={x} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong" style={{ left: `calc(${x * 100}% - ${x}px)` }} />
                    ))}
                    {/* Research tolerance band. */}
                    <div className="absolute inset-y-1.5 border-x border-ink/30 bg-ink/[0.07] print:bg-black/[0.06]" style={{ left: `${b0 * 100}%`, width: `${(b1 - b0) * 100}%` }} />
                    {/* Mars reference (1×, or Δ 0). */}
                    <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-mars" />
                    {p && (
                      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.at * 100}%` }}>
                        {p.clipped === 0
                          ? <div className="h-2.5 w-2.5 rounded-full bg-earth ring-2 ring-space print:ring-white" />
                          : <ClipMark side={p.clipped} />}
                        {p.clipped !== 0 && <span className="num absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-num-sm text-earth" style={p.clipped < 0 ? { left: 12 } : { right: 12 }}>{p.clipped < 0 ? "beyond 0.5×" : "beyond 2×"}</span>}
                      </div>
                    )}
                    {r.transform === "linear" && <span className="num absolute -bottom-3 right-0 text-[10.5px] text-faint">Δ ±0.3 axis</span>}
                  </div>
                  <Measure value={r.mars} unit={r.unit} digits={digitsFor(r)} className="text-right text-num text-ink" />
                  <Measure value={r.earth} unit={r.unit} digits={digitsFor(r)} className="text-right text-num text-ink" />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3 text-caption text-faint">
        <span className="inline-flex items-center gap-2"><span aria-hidden className="h-3 w-px bg-mars" /> Mars (reference)</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-earth" /> Earth / Mars</span>
        <span className="inline-flex items-center gap-2"><ClipMark side={1} /> beyond the axis</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="h-3 w-5 border-x border-ink/30 bg-ink/[0.07]" /> research tolerance</span>
        <span>Log axis <span className="num">0.5×</span>–<span className="num">2×</span>; Hurst exponent on a linear difference axis.</span>
      </div>
    </div>
  );
}

/** A value off the drawn axis: a triangle pinned to the axis end, pointing the way it went. */
function ClipMark({ side }: { side: -1 | 1 }) {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden className="block text-earth">
      <path d={side > 0 ? "M0 0 9 5 0 10Z" : "M9 0 0 5 9 10Z"} fill="currentColor" />
    </svg>
  );
}

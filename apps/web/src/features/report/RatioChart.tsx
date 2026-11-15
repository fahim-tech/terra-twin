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

export function RatioChart({ rows }: { rows: TerrainRow[] }) {
  const groups: { title: string; rows: TerrainRow[] }[] = [
    { title: "Similar", rows: rows.filter((r) => r.kind === "match") },
    { title: "Different", rows: rows.filter((r) => r.kind === "mismatch") },
    { title: "Not comparable", rows: rows.filter((r) => r.kind === "unknown") },
  ].filter((g) => g.rows.length);

  return (
    <div className="[print-color-adjust:exact]">
      {/* Axis header, aligned with the plot column. */}
      <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(200px,2fr)_76px_76px] items-end gap-4 pb-2 sm:grid" aria-hidden>
        <div />
        <div className="relative h-4 text-num-sm">
          <span className="num absolute left-0 text-faint">0.5×</span>
          <span className="num absolute left-1/2 -translate-x-1/2 text-mars">Mars = 1</span>
          <span className="num absolute right-0 text-faint">2×</span>
        </div>
        <div className="text-right text-caption text-mars">Mars</div>
        <div className="text-right text-caption text-earth">Earth</div>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="mt-3 first:mt-0">
          <div className="kicker pb-1.5">{g.title} <span className="num font-normal normal-case tracking-normal">· {g.rows.length}</span></div>
          <ul>
            {g.rows.map((r) => {
              const p = position(r);
              const [b0, b1] = band(r);
              return (
                <li key={r.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5 border-t border-line py-2.5 sm:grid-cols-[minmax(150px,1fr)_minmax(200px,2fr)_76px_76px]">
                  <div className="min-w-0">
                    <div className="text-label text-ink">{r.label}</div>
                    <div className="text-caption text-faint">
                      <span className="num">{relation(r)}</span> · {r.kind === "match" ? "within" : r.kind === "mismatch" ? "outside" : "no"} research tolerance
                    </div>
                  </div>
                  <div className="relative order-last col-span-3 h-6 sm:order-none sm:col-span-1" role="img"
                    aria-label={`${r.label}: Earth ${relation(r)} relative to Mars; tolerance band ${r.transform === "linear" ? `±${r.tol}` : `${(1 / (1 + r.tol)).toFixed(2)}× to ${(1 + r.tol).toFixed(2)}×`}.`}>
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
                    <div className="absolute inset-y-1 rounded-[3px] bg-ink/[0.08] print:bg-black/[0.08]" style={{ left: `${b0 * 100}%`, width: `${(b1 - b0) * 100}%` }} />
                    <div className="absolute inset-y-0.5 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-mars" />
                    {p && (
                      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.at * 100}%` }}>
                        <div className={cx("h-2.5 w-2.5 rounded-full bg-earth ring-2 ring-space print:ring-white", p.clipped !== 0 && "rounded-[2px]")} />
                        {p.clipped !== 0 && <span className="num absolute top-1/2 -translate-y-1/2 text-num-sm text-earth" style={p.clipped < 0 ? { left: 14 } : { right: 14 }}>{p.clipped < 0 ? "‹ beyond" : "beyond ›"}</span>}
                      </div>
                    )}
                    {r.transform === "linear" && <span className="num absolute -bottom-3 right-0 text-[10.5px] text-faint sm:-bottom-3.5">Δ ±0.3 axis</span>}
                  </div>
                  <Measure value={r.mars} unit={r.unit} digits={digitsFor(r)} className="text-right text-num text-ink" />
                  <Measure value={r.earth} unit={r.unit} digits={digitsFor(r)} className="text-right text-num text-ink" />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-faint">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-[2px] rounded-full bg-mars" /> Mars (reference)</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-earth" /> Earth / Mars</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-5 rounded-[3px] bg-ink/[0.08] ring-1 ring-inset ring-line-strong" /> research tolerance</span>
        <span>Log axis 0.5×–2×; Hurst exponent on a linear difference axis.</span>
      </p>
    </div>
  );
}

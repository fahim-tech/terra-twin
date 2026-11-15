import { useState, type ReactNode } from "react";
import { cx } from "../../components/ui";
import { Gloss } from "./Gloss";
import { jumpTo } from "./jump";
import { fmtNum, fmtPct, type EvidenceModel } from "./model";

/**
 * Four-stage schematic of the observation operator. It is a drawing, not data: the pictures only
 * show what each stage does; the constants under each stage are read from the evidence payload.
 */

const COLS = 10, ROWS = 7, C = 16, X0 = 30, Y0 = 16;
const gx = (c: number) => X0 + c * C;
const gy = (r: number) => Y0 + r * C;

// Three near-N–S ground tracks (slight drift, as orbits cross the grid), shots at ~one per bin row with gaps.
const TRACKS = [1.3, 4.7, 8.1].map((x0, t) => {
  const shots: { x: number; y: number }[] = [];
  for (let k = 0; k < ROWS; k++) {
    if ((k + 2 * t) % 5 === 3) continue; // gaps between shots
    const y = k + 0.5;
    shots.push({ x: x0 + 0.17 * y, y });
  }
  return { x0, shots };
});
const OBSERVED = new Set(TRACKS.flatMap((t) => t.shots.map((s) => `${Math.floor(s.x)},${Math.floor(s.y)}`)));

function BinGrid({ observedClass = "fill-mars/45", emptyClass = "fill-transparent" }: { observedClass?: string; emptyClass?: string }) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const on = OBSERVED.has(`${c},${r}`);
      cells.push(<rect key={`${c}-${r}`} x={gx(c) + 0.5} y={gy(r) + 0.5} width={C - 1} height={C - 1} rx={1.5} className={on ? observedClass : emptyClass} />);
    }
  return (
    <g>
      {cells}
      <rect x={gx(0)} y={gy(0)} width={COLS * C} height={ROWS * C} className="fill-none stroke-line-strong" strokeWidth={1} />
    </g>
  );
}

function NorthMark() {
  return (
    <g className="fill-faint">
      <path d={`M ${gx(COLS) + 14} ${gy(0) + 2} l 4 9 h -8 z`} />
      <line x1={gx(COLS) + 14} x2={gx(COLS) + 14} y1={gy(0) + 10} y2={gy(0) + 26} className="stroke-faint" strokeWidth={1.2} />
    </g>
  );
}

function Sampling() {
  return (
    <svg viewBox="0 0 220 140" className="block w-full" aria-hidden>
      <BinGrid />
      {TRACKS.map((t, i) => (
        <g key={i}>
          <line x1={gx(t.x0)} y1={gy(0) - 6} x2={gx(t.x0 + 0.17 * (ROWS + 0.4))} y2={gy(ROWS) + 6} className="stroke-muted" strokeWidth={1} strokeDasharray="2 3" />
          {t.shots.map((s, j) => <circle key={j} cx={gx(s.x)} cy={gy(s.y)} r={2.1} className="fill-ink" />)}
        </g>
      ))}
      <NorthMark />
    </svg>
  );
}

function zipper(a: { x: number; y: number }[], b: { x: number; y: number }[]) {
  const tris: [number, number][][] = [];
  let i = 0, j = 0;
  while (i < a.length - 1 || j < b.length - 1) {
    if (j >= b.length - 1 || (i < a.length - 1 && a[i + 1].y <= b[j + 1].y)) {
      tris.push([[a[i].x, a[i].y], [a[i + 1].x, a[i + 1].y], [b[j].x, b[j].y]]); i++;
    } else {
      tris.push([[a[i].x, a[i].y], [b[j].x, b[j].y], [b[j + 1].x, b[j + 1].y]]); j++;
    }
  }
  return tris;
}

function Interpolation() {
  const tris = [...zipper(TRACKS[0].shots, TRACKS[1].shots), ...zipper(TRACKS[1].shots, TRACKS[2].shots)];
  return (
    <svg viewBox="0 0 220 140" className="block w-full" aria-hidden>
      <BinGrid observedClass="fill-mars/45" emptyClass="fill-ink/[0.07]" />
      {tris.map((t, i) => (
        <polygon key={i} points={t.map(([x, y]) => `${gx(x)},${gy(y)}`).join(" ")} className="fill-none stroke-muted" strokeWidth={0.8} strokeLinejoin="round" />
      ))}
      {TRACKS.flatMap((t) => t.shots).map((s, j) => <circle key={j} cx={gx(s.x)} cy={gy(s.y)} r={2.1} className="fill-ink" />)}
    </svg>
  );
}

const H = [5, 7, 4, 8, 9, 6, 3, 5, 7];
function Blend() {
  const w = 18, x0 = 28, base1 = 58, base2 = 124, k = 4.2;
  const blended = H.slice(0, -1).map((h, i) => (h + H[i + 1]) / 2);
  return (
    <svg viewBox="0 0 220 140" className="block w-full" aria-hidden>
      {/* Gridded columns and the same columns shifted half a pixel */}
      {H.slice(0, -1).map((h, i) => (
        <rect key={`a${i}`} x={x0 + i * w + 1} y={base1 - h * k} width={w - 2} height={h * k} rx={1.5} className="fill-ink/15 stroke-muted" strokeWidth={0.8} />
      ))}
      {H.slice(1).map((h, i) => (
        <rect key={`b${i}`} x={x0 + i * w + w / 2 + 1} y={base1 - h * k} width={w - 2} height={h * k} rx={1.5} className="fill-none stroke-ink" strokeWidth={0.9} strokeDasharray="2.5 2" />
      ))}
      <line x1={x0} x2={x0 + 8 * w + w / 2} y1={base1 + 0.5} y2={base1 + 0.5} className="stroke-line-strong" />
      {/* half-pixel offset marker */}
      <g className="stroke-faint" strokeWidth={1}>
        <line x1={x0 + 1} x2={x0 + 1} y1={base1 + 4} y2={base1 + 10} />
        <line x1={x0 + w / 2 + 1} x2={x0 + w / 2 + 1} y1={base1 + 4} y2={base1 + 10} />
        <line x1={x0 + 1} x2={x0 + w / 2 + 1} y1={base1 + 7} y2={base1 + 7} />
      </g>
      <path d={`M 110 ${base1 + 14} v 12 m -4 -5 l 4 5 l 4 -5`} className="fill-none stroke-faint" strokeWidth={1.2} />
      {/* Blended columns */}
      {blended.map((h, i) => (
        <rect key={`c${i}`} x={x0 + i * w + w / 4 + 1} y={base2 - h * k * 0.9} width={w - 2} height={h * k * 0.9} rx={1.5} className="fill-mars/45" />
      ))}
      <line x1={x0} x2={x0 + 8 * w + w / 2} y1={base2 + 0.5} y2={base2 + 0.5} className="stroke-line-strong" />
    </svg>
  );
}

function Warp() {
  // Source bins: a lat/lon grid that is sheared and slightly converging relative to the local projection.
  const src = { tl: [14, 26], tr: [98, 16], bl: [24, 118], br: [110, 110] };
  const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const at = (u: number, v: number) => lerp(lerp(src.tl, src.tr, u), lerp(src.bl, src.br, u), v);
  const n = 6;
  const lines: string[] = [];
  for (let i = 0; i <= n; i++) {
    const a = at(i / n, 0), b = at(i / n, 1), c = at(0, i / n), d = at(1, i / n);
    lines.push(`M${a[0]},${a[1]} L${b[0]},${b[1]}`, `M${c[0]},${c[1]} L${d[0]},${d[1]}`);
  }
  const W = { x: 138, y: 30, s: 72 };
  const grid: string[] = [];
  for (let i = 1; i < 8; i++) {
    const p = W.s * (i / 8);
    grid.push(`M${W.x + p},${W.y} V${W.y + W.s}`, `M${W.x},${W.y + p} H${W.x + W.s}`);
  }
  return (
    <svg viewBox="0 0 220 140" className="block w-full" aria-hidden>
      <path d={lines.join(" ")} className="fill-none stroke-mars/70" strokeWidth={0.9} />
      <path d="M 116 66 h 14 m -4 -4 l 4 4 l -4 4" className="fill-none stroke-faint" strokeWidth={1.2} />
      <path d={grid.join(" ")} className="fill-none stroke-line-strong" strokeWidth={0.7} />
      <rect x={W.x} y={W.y} width={W.s} height={W.s} className="fill-ink/[0.06] stroke-ink" strokeWidth={1.2} />
    </svg>
  );
}


interface Stage { n: string; title: string; chain: string | null; constant: ReactNode; art: ReactNode; caption: ReactNode; evidence: { id: string; label: string } }

export function ProcessFigure({ m }: { m: EvidenceModel }) {
  const st = m.method.stages;
  const sel = m.interp.rows.find((r) => r.selected);
  const linShift = m.interp.rows.find((r) => r.interpolator === "linear" && r.halfshift);
  const linNo = m.interp.rows.find((r) => r.interpolator === "linear" && !r.halfshift);
  const gridM = st[3]?.detail.match(/(\d+(?:\.\d+)?)\s*m\b/)?.[1] ?? null;
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? active;

  const stages: Stage[] = [
    {
      n: "1", title: st[0]?.title ?? "Sampling", chain: st[0]?.raw ?? null, art: <Sampling />,
      caption: <>Laser shots fall along north–south ground tracks. Only <Gloss k="megdr" /> bins hit by at least one shot hold a measurement.</>,
      constant: <><span className="num text-ink">{fmtPct(m.support.median)}</span> of bins observed <span className="text-faint">(median of {m.support.rows.length} zones)</span></>,
      evidence: { id: "ev-support", label: "Observation support" },
    },
    {
      n: "2", title: st[1]?.title ?? "Interpolation", chain: st[1]?.raw ?? null, art: <Interpolation />,
      caption: "Empty bins are filled from triangles drawn between the observed shots.",
      constant: sel ? <>{sel.label} chosen · paired error <span className="num text-ink">{fmtNum(sel.error)}</span> <span className="text-faint">(lowest of {m.interp.rows.length})</span></> : <span className="text-faint">Selection not in payload</span>,
      evidence: { id: "ev-selection", label: "Operator choice" },
    },
    {
      n: "3", title: st[2]?.title ?? "Half-pixel blend", chain: st[2]?.raw ?? null, art: <Blend />,
      caption: "Adjacent columns are blended, moving the grid half a pixel — a registration offset measured in the Mars data, not yet confirmed by USGS metadata.",
      constant: linShift && linNo ? <>With ½ px <span className="num text-ink">{fmtNum(linShift.error)}</span> vs without <span className="num text-ink">{fmtNum(linNo.error)}</span> <span className="text-faint">paired error</span></> : <span className="text-faint">Measurement not in payload</span>,
      evidence: { id: "ev-selection", label: "Operator choice" },
    },
    {
      n: "4", title: st[3]?.title ?? "Warp", chain: st[3]?.raw ?? null, art: <Warp />,
      caption: <>The result is resampled onto a square, equidistant (<Gloss k="aeqd" />) window centred on the site, so Mars and Earth share one grid.</>,
      constant: <><span className="num text-ink">{gridM ?? "—"}</span> m grid · <span className="num text-ink">{m.coverage.tier2Km ?? "—"}</span> km window</>,
      evidence: { id: "ev-coverage", label: "Coverage" },
    },
  ];

  const step = (d: 1 | -1) => setActive((a) => (a === null ? (d === 1 ? 0 : stages.length - 1) : (a + d + stages.length) % stages.length));
  const current = active !== null ? stages[active] : null;

  return (
    <figure className="m-0" aria-labelledby="ev-process-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div id="ev-process-title" className="text-title text-ink">How Earth is re-observed the way MOLA saw Mars</div>
        <span className="rounded-full border border-dashed border-line-strong px-2.5 py-[3px] text-caption text-muted">Schematic — not data</span>
      </div>
      <p className="mt-1 max-w-[62ch] text-caption text-muted">
        Every Earth window passes through the selected Mars site's own four-stage observation chain before it is compared. The drawings show what each stage does;
        under each is a measured value from the research package and, in mono, the documented chain step.
      </p>

      {/* All four stages are visible side by side from lg up, so the stepper is only for narrower layouts. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 lg:hidden" role="group" aria-label="Step through the stages">
        <button type="button" onClick={() => step(-1)} aria-label="Previous stage"
          className="hit inline-grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-elevated hover:text-ink">←</button>
        <button type="button" onClick={() => step(1)} aria-label="Next stage"
          className="hit inline-grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-elevated hover:text-ink">→</button>
        <span className="text-caption text-muted" aria-live="polite">
          {current ? <>Stage <span className="num text-ink">{current.n}</span> of {stages.length} · <span className="text-ink">{current.title}</span></> : "Step through the four stages"}
        </span>
        {current && (
          <button type="button" onClick={() => setActive(null)} className="hit rounded-control px-2 py-1 text-caption text-faint hover:bg-elevated hover:text-ink">Show all</button>
        )}
      </div>

      <ol className="mt-5 grid list-none grid-cols-1 gap-x-6 gap-y-8 p-0 min-[520px]:grid-cols-2 lg:grid-cols-4">
        {stages.map((s, i) => {
          const on = lit === i;
          const dim = lit !== null && !on;
          return (
            <li key={s.n} aria-current={active === i ? "step" : undefined}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className="relative min-w-0 rounded-control">
              <div className="flex h-6 items-center gap-2">
                <span className={cx("num text-num-sm", on ? "text-ink" : "text-faint")}>{s.n.padStart(2, "0")}</span>
                <span className="text-label text-ink">{s.title}</span>
                {i < stages.length - 1 && <span aria-hidden className="ml-auto hidden text-faint lg:inline">→</span>}
              </div>
              {/* Only the drawing dims when another stage is in focus; text keeps full contrast. */}
              <div className={cx("mt-3 rounded-control px-1 py-2 transition-[box-shadow,background,opacity] duration-200 motion-reduce:transition-none", on ? "bg-ink/[0.05] shadow-[inset_0_0_0_1px_rgb(255_255_255/.14)]" : "bg-ink/[0.025]", dim && "opacity-35")}>
                <div className="mx-auto max-w-[260px]">{s.art}</div>
              </div>
              <p className="mt-3 text-caption text-muted">{s.caption}</p>
              <p className="mt-2 text-caption text-muted">{s.constant}</p>
              <p className="mt-1 font-mono text-[11px] leading-snug text-faint">{s.chain ?? "Chain step not in payload"}</p>
              <button type="button" onClick={() => jumpTo(s.evidence.id)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                aria-label={`Go to the evidence for ${s.title.toLowerCase()}: ${s.evidence.label}`}
                className="hit -mx-1 mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-control px-1 py-1 text-caption text-muted hover:text-ink">
                <span aria-hidden>↓</span><span className="underline decoration-line-strong underline-offset-[3px]">{s.evidence.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

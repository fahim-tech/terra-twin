import { useState, type ReactNode } from "react";
import { Tag } from "../../components/primitives";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import { FigTitle } from "./chartKit";
import { Gloss } from "./Gloss";
import { jumpTo } from "./jump";
import { fmtNum, fmtPct, type EvidenceModel } from "./model";
import { BINS, binCentres, binKey, blend, delaunay, observedBins, TRACKS, type Pt } from "./schematic";
import { sectionLabel, sectionNo, type SectionId } from "./sections";

/**
 * Four-stage schematic of the observation operator, drawn like a technical plate: plan and section
 * views, hairlines, square nodes, mono annotations. It is a drawing, not data: the pictures only show
 * what each stage does; the values under each stage are read from the evidence payload.
 */

/* ---- plate geometry (viewBox units) ------------------------------------------------------------ */

const VB_W = 200, VB_H = 136;
const B = 14;                       // one MEGDR bin in the plan views
const OX = 12, OY = 24;             // plan-view grid origin
const GW = BINS.cols * B, GH = BINS.rows * B;
const px = (x: number) => OX + x * B;
const py = (y: number) => OY + y * B;
const LX = 134;                     // legend column

const OBS = observedBins();
const CENTRES = binCentres(OBS);
const TIN_EDGES = (() => {
  const seen = new Set<string>();
  const out: [Pt, Pt][] = [];
  for (const t of delaunay(CENTRES))
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(k)) { seen.add(k); out.push([CENTRES[a], CENTRES[b]]); }
    }
  return out;
})();

const hair = { vectorEffect: "non-scaling-stroke" as const, strokeWidth: 1 };
const label = { className: "fill-faint font-mono", fontSize: 7.6, style: { letterSpacing: "0.04em" } };

function Plate({ view, children }: { view: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-auto w-full" aria-hidden>
      <text x={OX} y={13} {...label}>{view}</text>
      {children}
    </svg>
  );
}

/** Plan-view bin grid: cell fills, hairline bin edges, stronger outline. */
function BinGrid({ fill }: { fill: (c: number, r: number) => string | null }) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < BINS.rows; r++)
    for (let c = 0; c < BINS.cols; c++) {
      const f = fill(c, r);
      if (f) cells.push(<rect key={binKey(c, r)} x={px(c)} y={py(r)} width={B} height={B} className={f} />);
    }
  const lines: string[] = [];
  for (let c = 1; c < BINS.cols; c++) lines.push(`M${px(c)} ${OY}V${OY + GH}`);
  for (let r = 1; r < BINS.rows; r++) lines.push(`M${OX} ${py(r)}H${OX + GW}`);
  return (
    <g>
      {cells}
      <path d={lines.join("")} className="fill-none stroke-line-strong" {...hair} shapeRendering="crispEdges" />
      <rect x={OX} y={OY} width={GW} height={GH} className="fill-none stroke-muted/70" {...hair} shapeRendering="crispEdges" />
    </g>
  );
}

/** North arrow (plan views): a hairline with a filled head and "N". */
function North({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} x2={x} y1={y + 16} y2={y + 5} className="stroke-muted" {...hair} />
      <path d={`M${x} ${y} l3 6 h-6 z`} className="fill-muted" />
      <text x={x} y={y + 25} textAnchor="middle" {...label} className="fill-muted font-mono">N</text>
    </g>
  );
}

/** Legend in the plate's right column: square swatch (or glyph) + mono caps. */
function Legend({ items, y = 44 }: { items: { swatch: ReactNode; text: string }[]; y?: number }) {
  return (
    <g>
      {items.map((it, i) => (
        <g key={it.text} transform={`translate(${LX} ${y + i * 13})`}>
          {it.swatch}
          <text x={11} y={0} dominantBaseline="middle" {...label}>{it.text}</text>
        </g>
      ))}
    </g>
  );
}
const sw = {
  observed: <rect x={0} y={-3.5} width={7} height={7} className="fill-mars/30 stroke-mars/80" {...hair} />,
  empty: <rect x={0} y={-3.5} width={7} height={7} className="fill-none stroke-line-strong" {...hair} />,
  filled: <rect x={0} y={-3.5} width={7} height={7} className="fill-ink/[0.09] stroke-line-strong" {...hair} />,
  shot: <rect x={2.4} y={-1.1} width={2.2} height={2.2} className="fill-ink" />,
  node: <rect x={2.2} y={-1.3} width={2.6} height={2.6} className="fill-ink" />,
  track: <line x1={3.5} x2={3.5} y1={-4} y2={4} className="stroke-muted" {...hair} strokeDasharray="2 2" />,
  edge: <path d="M0 3.5 L3.5 -3.5 L7 3.5 Z" className="fill-none stroke-muted" {...hair} />,
};

/** "1 BIN · 463 m" survey scale under the plan grids (the metre value is read from the payload). */
function BinScale({ binM }: { binM: string | null }) {
  const y = OY + GH + 12;
  return (
    <g>
      <path d={`M${OX} ${y - 3}V${y + 1}H${OX + B}V${y - 3}`} className="fill-none stroke-muted" {...hair} />
      <text x={OX + B + 5} y={y + 1} {...label}>{binM ? `1 BIN · ${binM} m` : "1 BIN"}</text>
    </g>
  );
}

function Sampling({ binM }: { binM: string | null }) {
  return (
    <Plate view="PLAN">
      <BinGrid fill={(c, r) => (OBS.has(binKey(c, r)) ? "fill-mars/30" : null)} />
      {TRACKS.map((t, i) => (
        <g key={i}>
          <line x1={px(t.start.x)} y1={py(t.start.y)} x2={px(t.end.x)} y2={py(t.end.y)} className="stroke-muted/80" {...hair} strokeDasharray="2.5 2" />
          {t.shots.map((s, j) => <rect key={j} x={px(s.x) - 1.1} y={py(s.y) - 1.1} width={2.2} height={2.2} className="fill-ink" />)}
        </g>
      ))}
      <North x={190} y={18} />
      <Legend items={[{ swatch: sw.observed, text: "≥1 SHOT" }, { swatch: sw.empty, text: "NO SHOT" }, { swatch: sw.shot, text: "LASER SHOT" }, { swatch: sw.track, text: "TRACK" }]} y={58} />
      <BinScale binM={binM} />
    </Plate>
  );
}

function Interpolation({ binM }: { binM: string | null }) {
  return (
    <Plate view="PLAN">
      <BinGrid fill={(c, r) => (OBS.has(binKey(c, r)) ? "fill-mars/30" : "fill-ink/[0.07]")} />
      <path d={TIN_EDGES.map(([a, b]) => `M${px(a.x)} ${py(a.y)}L${px(b.x)} ${py(b.y)}`).join("")} className="fill-none stroke-muted/90" {...hair} strokeLinejoin="round" />
      {CENTRES.map((c, i) => <rect key={i} x={px(c.x) - 1.3} y={py(c.y) - 1.3} width={2.6} height={2.6} className="fill-ink" />)}
      <North x={190} y={18} />
      <Legend items={[{ swatch: sw.observed, text: "OBSERVED" }, { swatch: sw.filled, text: "FILLED" }, { swatch: sw.node, text: "BIN CENTRE" }, { swatch: sw.edge, text: "DELAUNAY" }]} y={58} />
      <BinScale binM={binM} />
    </Plate>
  );
}

/* Stage 3 is an east–west section through one row of bins: native columns above, blended below. */
const Z = [20, 31, 17, 34, 40, 26, 14, 24];
const BL = blend(Z);
const W3 = 14, X3 = 12, YA = 62, YB = 116, K = 4; // column width, origin, baselines, worked example

function Blend() {
  const nx = (i: number) => X3 + i * W3;          // native column i left edge
  const bxl = (i: number) => X3 + i * W3 + W3 / 2; // blended column i left edge: half a bin east
  const edges = Array.from({ length: Z.length + 1 }, (_, i) => nx(i));
  const vx = bxl(K) + W3 / 2;
  return (
    <Plate view="SECTION E–W">
      {/* Extension lines from the native bin edges: the blended grid sits half a bin east of them. */}
      <path d={edges.map((x) => `M${x} ${YA}V${YB + 3}`).join("")} className="fill-none stroke-line-strong" {...hair} strokeDasharray="1.5 2" />
      {Z.map((z, i) => (
        <rect key={`n${i}`} x={nx(i)} y={YA - z} width={W3} height={z}
          className={cx(i === K || i === K + 1 ? "fill-ink/[0.10] stroke-ink" : "fill-ink/[0.04] stroke-muted/70")} {...hair} shapeRendering="crispEdges" />
      ))}
      <line x1={X3 - 3} x2={nx(Z.length) + 3} y1={YA} y2={YA} className="stroke-muted" {...hair} shapeRendering="crispEdges" />
      {BL.map((b, i) => (
        <rect key={`b${i}`} x={bxl(i)} y={YB - b} width={W3} height={b}
          className={i === K ? "fill-mars/75 stroke-mars" : "fill-mars/25 stroke-mars/70"} {...hair} shapeRendering="crispEdges" />
      ))}
      <line x1={X3 - 3} x2={nx(Z.length) + 3} y1={YB} y2={YB} className="stroke-muted" {...hair} shapeRendering="crispEdges" />
      {/* Worked example: two neighbouring native columns feed one blended column. */}
      <path d={`M${nx(K) + W3 / 2} ${YA}L${vx} ${YB - BL[K]}L${nx(K + 1) + W3 / 2} ${YA}`} className="fill-none stroke-ink" {...hair} />
      <rect x={vx - 1.4} y={YB - BL[K] - 1.4} width={2.8} height={2.8} className="fill-ink" />
      <text x={nx(K + 1) + W3 + 4} y={YA + 14} {...label} className="fill-muted font-mono">MEAN</text>
      {/* Half-bin offset, dimensioned at the west edge. */}
      <path d={`M${nx(0)} ${YB + 10}H${bxl(0)}M${nx(0)} ${YB + 7}v6M${bxl(0)} ${YB + 7}v6`} className="fill-none stroke-ink" {...hair} />
      <text x={bxl(0) + 4} y={YB + 13} {...label} className="fill-muted font-mono">½ BIN EAST</text>
      {/* East arrow */}
      <g>
        <line x1={170} x2={184} y1={18} y2={18} className="stroke-muted" {...hair} />
        <path d="M190 18 l-6 -3 v6 z" className="fill-muted" />
        <text x={168} y={20.5} textAnchor="end" {...label} className="fill-muted font-mono">E</text>
      </g>
      <Legend items={[{ swatch: <rect x={0} y={-3.5} width={7} height={7} className="fill-ink/[0.06] stroke-muted" {...hair} />, text: "NATIVE" }, { swatch: <rect x={0} y={-3.5} width={7} height={7} className="fill-mars/40 stroke-mars" {...hair} />, text: "BLENDED" }]} y={34} />
    </Plate>
  );
}

/* Stage 4: native bins (a lat/lon grid, sheared and converging in the local plane) → square AEQD window. */
const SRC = { tl: [12, 34], tr: [78, 26], bl: [20, 104], br: [88, 98] } as const;
const DST = { x: 118, y: 32, s: 66 };
const NW = 5; // cells per side in both drawings
const bil = (u: number, v: number): [number, number] => {
  const top = [SRC.tl[0] + (SRC.tr[0] - SRC.tl[0]) * u, SRC.tl[1] + (SRC.tr[1] - SRC.tl[1]) * u];
  const bot = [SRC.bl[0] + (SRC.br[0] - SRC.bl[0]) * u, SRC.bl[1] + (SRC.br[1] - SRC.bl[1]) * u];
  return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
};

function Warp() {
  const src: string[] = [];
  for (let i = 0; i <= NW; i++) {
    const [ax, ay] = bil(i / NW, 0), [bx2, by2] = bil(i / NW, 1), [cx2, cy2] = bil(0, i / NW), [dx, dy] = bil(1, i / NW);
    src.push(`M${ax} ${ay}L${bx2} ${by2}`, `M${cx2} ${cy2}L${dx} ${dy}`);
  }
  const cell = DST.s / NW;
  const dst: string[] = [];
  for (let i = 1; i < NW; i++) dst.push(`M${DST.x + i * cell} ${DST.y}V${DST.y + DST.s}`, `M${DST.x} ${DST.y + i * cell}H${DST.x + DST.s}`);
  // One window cell and the point it reads from in the native bins.
  const tc = 3, tr = 1;
  const t: [number, number] = [DST.x + (tc + 0.5) * cell, DST.y + (tr + 0.5) * cell];
  const s = bil((tc + 0.5) / NW, (tr + 0.5) / NW);
  const quad = [bil(tc / NW, tr / NW), bil((tc + 1) / NW, tr / NW), bil((tc + 1) / NW, (tr + 1) / NW), bil(tc / NW, (tr + 1) / NW)];
  const mid = DST.x + DST.s / 2, midY = DST.y + DST.s / 2;
  return (
    <Plate view="PLAN">
      <polygon points={quad.map((p) => p.join(",")).join(" ")} className="fill-mars/25" />
      <path d={src.join("")} className="fill-none stroke-mars/75" {...hair} />
      <rect x={DST.x + tc * cell} y={DST.y + tr * cell} width={cell} height={cell} className="fill-ink/[0.12]" />
      <path d={dst.join("")} className="fill-none stroke-line-strong" {...hair} shapeRendering="crispEdges" />
      <rect x={DST.x} y={DST.y} width={DST.s} height={DST.s} className="fill-none stroke-ink/85" {...hair} shapeRendering="crispEdges" />
      <line x1={t[0]} y1={t[1]} x2={s[0]} y2={s[1]} className="stroke-muted" {...hair} strokeDasharray="2 2" />
      <rect x={s[0] - 1.4} y={s[1] - 1.4} width={2.8} height={2.8} className="fill-ink" />
      <rect x={t[0] - 1.4} y={t[1] - 1.4} width={2.8} height={2.8} className="fill-ink" />
      {/* Site centre */}
      <path d={`M${mid - 4} ${midY}H${mid + 4}M${mid} ${midY - 4}V${midY + 4}`} className="stroke-ink" {...hair} />
      <text x={mid + 6} y={midY + 12} {...label}>SITE</text>
      <North x={192} y={18} />
      <text x={SRC.bl[0] - 8} y={VB_H - 10} {...label}>NATIVE BINS</text>
      <text x={DST.x} y={VB_H - 10} {...label}>AEQD WINDOW</text>
      <text x={DST.x} y={VB_H - 2} {...label}>BILINEAR READ</text>
    </Plate>
  );
}

/* ---- figure ------------------------------------------------------------------------------------ */

interface Stage { letter: string; title: string; chain: string | null; value: ReactNode; art: ReactNode; caption: ReactNode; evidence: SectionId }

export function ProcessFigure({ m, fig }: { m: EvidenceModel; fig?: string }) {
  const st = m.method.stages;
  const sel = m.interp.rows.find((r) => r.selected);
  const linShift = m.interp.rows.find((r) => r.interpolator === "linear" && r.halfshift);
  const linNo = m.interp.rows.find((r) => r.interpolator === "linear" && !r.halfshift);
  const gridM = st[3]?.detail.match(/(\d+(?:\.\d+)?)\s*m\b/)?.[1] ?? null;
  const [lit, setLit] = useState<number | null>(null);
  const missing = (what: string) => <span className="text-faint">{what} not in payload</span>;

  const stages: Stage[] = [
    {
      letter: st[0]?.letter || "S", title: st[0]?.title ?? "Sampling", chain: st[0]?.raw ?? null, art: <Sampling binM={gridM} />,
      caption: <>Laser shots fall along near north–south ground tracks. Only <Gloss k="megdr" /> bins hit by at least one shot hold a measurement.</>,
      value: m.support.rows.length
        ? <><span className="num text-ink">{fmtPct(m.support.median)}</span> of bins observed · median of <span className="num">{m.support.rows.length}</span> zones</>
        : missing("Observation support"),
      evidence: "ev-support",
    },
    {
      letter: st[1]?.letter || "I", title: st[1]?.title ?? "Interpolation", chain: st[1]?.raw ?? null, art: <Interpolation binM={gridM} />,
      caption: "Empty bins are filled by linear interpolation across a Delaunay triangulation of the observed bins.",
      value: sel
        ? <>{sel.label} · paired error <span className="num text-ink">{fmtNum(sel.error)}</span> · lowest of <span className="num">{m.interp.rows.length}</span></>
        : missing("Selection"),
      evidence: "ev-selection",
    },
    {
      letter: st[2]?.letter || "B", title: st[2]?.title ?? "Half-pixel blend", chain: st[2]?.raw ?? null, art: <Blend />,
      caption: "Each column becomes the mean of itself and its eastern neighbour, so the grid moves half a bin east — a registration offset measured in the Mars data, not yet confirmed by USGS metadata.",
      value: linShift && linNo
        ? <>Paired error <span className="num text-ink">{fmtNum(linShift.error)}</span> with ½ px · <span className="num text-ink">{fmtNum(linNo.error)}</span> without</>
        : missing("Measurement"),
      evidence: "ev-selection",
    },
    {
      letter: st[3]?.letter || "W", title: st[3]?.title ?? "Warp", chain: st[3]?.raw ?? null, art: <Warp />,
      caption: <>The result is resampled bilinearly onto a square, equidistant (<Gloss k="aeqd" />) window centred on the site, so Mars and Earth share one grid.</>,
      value: <><span className="num text-ink">{gridM ?? "—"}</span> m grid · <span className="num text-ink">{m.coverage.tier2Km ?? "—"}</span> km window</>,
      evidence: "ev-coverage",
    },
  ];

  return (
    <figure className="m-0" aria-labelledby="ev-process-title">
      <figcaption>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <FigTitle id="ev-process-title" fig={fig}>How Earth is re-observed the way MOLA saw Mars</FigTitle>
          <Tag>Schematic — not data</Tag>
        </div>
        <p className="mt-2.5 max-w-[72ch] text-caption text-muted">
          Every Earth window passes through the selected Mars site's own four-stage observation chain before it is compared. The drawings show what each stage does;
          under each is a value read from the research package and the documented chain step.
        </p>
        <div className="mt-5 grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 border-y border-line py-3 text-caption sm:grid-cols-[auto_auto_minmax(32px,1fr)_auto_minmax(0,auto)] sm:items-center">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">In</span>
          <span className="text-muted">Earth terrain: {G5.toggleMeasured}</span>
          <span aria-hidden className="relative hidden h-px bg-line-strong sm:block">
            <span className="absolute -right-px -top-[3px] h-0 w-0 border-y-[3.5px] border-l-[5px] border-y-transparent border-l-line-strong" />
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">Out</span>
          <span className="text-ink">{G5.toggleOom}</span>
        </div>
      </figcaption>

      <ol className="mt-8 grid list-none grid-cols-1 gap-x-6 gap-y-12 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map((s, i) => {
          const on = lit === i;
          const dim = lit !== null && !on;
          const last = i === stages.length - 1;
          return (
            <li key={i} onMouseEnter={() => setLit(i)} onMouseLeave={() => setLit(null)} className="relative min-w-0">
              {/* Signal path: square node per stage; from xl the hairlines join the four into one chain. */}
              <div className="flex items-center" aria-hidden>
                <span className={cx("grid h-[22px] w-[22px] shrink-0 place-items-center border font-mono text-[11px] leading-none transition-colors duration-150",
                  on ? "border-ink bg-ink text-space" : "border-line-strong text-muted")}>{s.letter}</span>
                <span className={cx("relative h-px flex-1 bg-line-strong", !last && "xl:-mr-6")}>
                  {!last && <span className="absolute -right-px -top-[3px] hidden h-0 w-0 border-y-[3.5px] border-l-[5px] border-y-transparent border-l-line-strong xl:block" />}
                </span>
              </div>
              <div className="mt-3.5 flex items-baseline gap-2.5">
                <span className="num text-[11px] leading-none text-faint">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="m-0 text-[12px] font-semibold uppercase leading-none tracking-[0.12em] text-ink">{s.title}</h3>
              </div>
              {/* Only the drawing dims when another stage is in focus; text keeps full contrast. */}
              <div className={cx("frame mt-3.5 bg-white/[0.015] px-2.5 py-2 transition-opacity duration-200 [--frame-l:7px] motion-reduce:transition-none",
                on ? "[--frame-c:rgb(242_244_245/0.85)]" : "[--frame-c:rgb(242_244_245/0.32)]", dim && "opacity-40")}>
                <div className="mx-auto max-w-[360px]">{s.art}</div>
              </div>
              <p className="mt-4 text-caption text-muted">{s.caption}</p>
              <dl className="mt-3 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-line pt-3">
                <dt className="pt-[3px] text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-faint">Value</dt>
                <dd className="m-0 text-caption text-muted">{s.value}</dd>
                <dt className="pt-[3px] text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-faint">Chain</dt>
                <dd className="m-0 font-mono text-[11px] leading-snug text-faint">{s.chain ?? "Chain step not in payload"}</dd>
              </dl>
              <button type="button" onClick={() => jumpTo(s.evidence)} onFocus={() => setLit(i)} onBlur={() => setLit(null)}
                aria-label={`Go to the evidence for ${s.title.toLowerCase()}: ${sectionLabel(s.evidence)}`}
                className="hit -mx-1 mt-2 inline-flex items-center gap-2 whitespace-nowrap rounded-control px-1 py-1 text-caption text-muted hover:text-ink">
                <span aria-hidden>↓</span>
                <span className="num text-[11px] text-faint">{sectionNo(s.evidence)}</span>
                <span className="underline decoration-line-strong underline-offset-[3px]">{sectionLabel(s.evidence)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

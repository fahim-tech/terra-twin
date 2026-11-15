import { Disclosure } from "../../components/primitives";
import { cx } from "../../components/ui";
import { zoneName } from "../../lib/glossary";
import { Fragment, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Axis, Chart, FigTitle, Grid, IntervalSwatch, Key, Mark, RingSwatch, Row, ROW_GRID, RuleSwatch, scale, Seg, SolidSwatch, StruckSwatch, Ticks, useWidth } from "./chartKit";
import { Gloss } from "./Gloss";
import { CHAIN_NAMES, fmtInt, fmtNum, fmtPct, niceTicks, zoomedTicks, type EvidenceModel } from "./model";

const mrrAxis = scale(0, 1, [0, 0.2, 0.4, 0.6, 0.8, 1]);
/** Greek symbols inside mono lines are set in the text face, which draws them in their standard form. */
const Greek = ({ children }: { children: ReactNode }) => <span className="font-sans text-[1.08em]">{children}</span>;
const fmtAxis = (v: number) => (v === 0 || v === 1 ? String(v) : v.toFixed(1));
/** Gap between a row label and its status tag: a breakable en space, so the tag moves to the next line whole. */
const EN_SPACE = "\u2002";

/** Ranked square markers with 95 % bootstrap intervals for the five methods. */
export function MethodChart({ m, fig }: { m: EvidenceModel; fig?: string }) {
  const n = m.synthetic.nTwins;
  return (
    <Chart fig={fig}
      title="Twin recovery by method"
      basis={<>Mean reciprocal rank (<Gloss k="mrr" />) of the true twin among {fmtInt(n)} synthetic twins, with 95 % bootstrap intervals. 1 = the twin is always ranked first.</>}
      legend={<>
        <Key swatch={<SolidSwatch />}>Deployed method</Key>
        <Key swatch={<SolidSwatch className="bg-muted" />}>Alternative</Key>
        <Key swatch={<RingSwatch />}>Direct comparison</Key>
        <Key swatch={<StruckSwatch />}>Retired</Key>
        <Key swatch={<IntervalSwatch />}>95 % interval</Key>
      </>}
    >
      <ol className="list-none p-0">
        {m.methods.map((r) => {
          const deployed = r.code === "M2_OOM";
          const retired = r.code === "M1_qweights";
          // Direct comparison is the hollow square here as in the key figures and FIG 03.
          const direct = r.code === "M0_baseline";
          return (
            <Row key={r.code} emphasis={deployed}
              label={<>{r.name}{r.note && <>{EN_SPACE}<span className={cx("whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.06em]", deployed ? "text-ink" : "text-faint")}>{r.note}</span></>}</>}
              value={<>
                MRR {fmtNum(r.mrr)}
                {r.lo !== null && r.hi !== null && <span className="hidden sm:inline"> [{fmtNum(r.lo)}–{fmtNum(r.hi)}]</span>}
                {r.top1 !== null && <> · top-1 {fmtPct(r.top1)}</>}
                {r.lo !== null && r.hi !== null && <span className="block sm:hidden">95% CI{" "}{fmtNum(r.lo)}–{fmtNum(r.hi)}</span>}
              </>}
              srText={r.lo !== null && r.hi !== null ? `95% interval ${fmtNum(r.lo)} to ${fmtNum(r.hi)}.` : undefined}
            >
              <Grid s={mrrAxis} />
              {r.lo !== null && r.hi !== null && <Seg a={mrrAxis.at(r.lo)} b={mrrAxis.at(r.hi)} caps className={deployed ? "bg-ink/80" : "bg-muted/80"} />}
              <Mark x={mrrAxis.at(r.mrr)} size={deployed ? 10 : retired || direct ? 9 : 8} kind={retired ? "retired" : deployed ? "solid" : direct ? "hollow" : "alt"} />
            </Row>
          );
        })}
      </ol>
      <Axis s={mrrAxis} format={fmtAxis} title="Mean reciprocal rank · synthetic twins" />
    </Chart>
  );
}

/** Dumbbells per true chain: direct comparison vs the deployed operator (linear + ½ px). */
export function FalsificationChart({ m, fig }: { m: EvidenceModel; fig?: string }) {
  return (
    <Chart fig={fig}
      title="What happens when the assumed operator is wrong"
      basis={<>Each row makes synthetic twins with a different “true” observation chain, then ranks them with no correction and with the deployed operator (linear + ½ px). The <Gloss k="megdr" /> gridding algorithm is undocumented, so any row could be the real one.</>}
      legend={<>
        <Key swatch={<RingSwatch />}>Direct comparison</Key>
        <Key swatch={<SolidSwatch />}>Deployed operator</Key>
        <Key swatch={<SolidSwatch className="bg-warn" />}><span className="text-warn">⚠</span> Deployed operator worse than no correction</Key>
      </>}
      footer={<FullMatrix m={m} />}
    >
      <div aria-hidden className={cx(ROW_GRID, "border-b border-line pb-2")}>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">True chain <span className="hidden sm:inline">· direct → deployed</span></span>
        <span />
      </div>
      <ol className="list-none p-0">
        {m.chains.map((c) => {
          const ok = c.direct !== null && c.deployed !== null;
          return (
            <Row key={c.chain} emphasis={c.adverse}
              // The amber band bleeds into the left margin only, so its right edge stays on the axis end.
              className={cx(c.adverse && "-ml-3 bg-warn/[0.06] pl-3 shadow-[inset_2px_0_0_var(--color-warn)]")}
              label={<>{c.adverse && <span aria-hidden className="mr-1.5 text-warn">⚠</span>}<span className="sr-only">True chain: </span>{c.name}</>}
              value={<><span className="sr-only">direct </span>{fmtNum(c.direct)} → {fmtNum(c.deployed)}{c.adverse && <span className="text-warn"> · worse</span>}</>}
              srText={c.adverse ? "Adverse result: the deployed operator ranks twins worse than no correction." : undefined}
            >
              <Grid s={mrrAxis} />
              {ok && <Seg a={mrrAxis.at(c.direct!)} b={mrrAxis.at(c.deployed!)} className={c.adverse ? "bg-warn" : "bg-muted/70"} thick={c.adverse ? 2 : 1} />}
              {c.direct !== null && <Mark x={mrrAxis.at(c.direct)} kind="hollow" ring={c.adverse ? "ring-transparent" : undefined} />}
              {c.deployed !== null && <Mark x={mrrAxis.at(c.deployed)} size={10} kind={c.adverse ? "warn" : "solid"} ring={c.adverse ? "ring-transparent" : undefined} />}
            </Row>
          );
        })}
      </ol>
      <Axis s={mrrAxis} format={fmtAxis} title="Mean reciprocal rank · synthetic twins" />
    </Chart>
  );
}

function FullMatrix({ m }: { m: EvidenceModel }) {
  if (!m.chains.length) return null;
  return (
    <Disclosure summary="Every chain × every assumed operator">
      {m.falsificationLabel && <p className="mb-3 text-caption text-faint">{m.falsificationLabel}.</p>}
      <div className="scroll-thin -mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label="Misspecification matrix, mean reciprocal rank">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">True chain ↓ · assumed →</th>
              {m.chainColumns.map((c) => <th key={c} scope="col" className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">{CHAIN_NAMES[c] ?? c}</th>)}
            </tr>
          </thead>
          <tbody>
            {m.chains.map((r) => (
              <tr key={r.chain} className="border-t border-line">
                <th scope="row" className="py-2 pr-3 text-label font-normal text-muted">{r.name}</th>
                {m.chainColumns.map((c) => {
                  const v = r.cells[c];
                  const diag = c === r.chain;
                  const worse = c === "primary" && r.adverse;
                  return (
                    <td key={c} className={cx("num px-2 py-2 text-right text-num", diag ? "bg-ink/[0.07] text-ink shadow-[inset_0_0_0_1px_rgb(242_244_245/.18)]" : worse ? "text-warn" : "text-muted")}>
                      {worse && <span aria-hidden className="mr-1">⚠</span>}{fmtNum(v)}
                      {diag && <span className="sr-only"> (operator matches the true chain)</span>}
                      {worse && <span className="sr-only"> (deployed operator worse than no correction)</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-caption text-faint">Boxed: the assumed operator equals the true chain. <span className="text-warn">⚠</span> the deployed operator does worse than no correction.</p>
    </Disclosure>
  );
}

/** Paired fidelity error for each interpolator variant (lower is better). */
export function InterpolatorChart({ m, fig }: { m: EvidenceModel; fig?: string }) {
  // The caveat is the research record's own limitation text, so nothing is stated that the payload does not carry.
  const surrogate = m.limitations.find((l) => l.code === "operator_is_surrogate") ?? null;
  const max = Math.max(...m.interp.rows.map((r) => r.error), 0.1);
  const ticks = niceTicks(0, max, 4);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : max;
  while (ticks[ticks.length - 1] < max - 1e-9) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  const s = scale(0, ticks[ticks.length - 1], ticks);
  return (
    <Chart fig={fig}
      title="Choosing the interpolator from Mars itself"
      basis={<>
        Paired fidelity error of each interpolator variant against Mars-observable statistics — lower is closer to Mars.
        Each row also lists its along-track <Gloss k="rho">ρ</Gloss> and cross-track <Gloss k="kappa">κ</Gloss>; for reference only, the Mars
        medians are ρ <span className="num">{fmtNum(m.interp.marsRho)}</span>, κ <span className="num">{fmtNum(m.interp.marsKappa)}</span>.
        {m.interp.label && <> {m.interp.label}.</>}
      </>}
      legend={<>
        <Key swatch={<SolidSwatch />}>Selected</Key>
        <Key swatch={<SolidSwatch className="bg-muted" />}>Rejected</Key>
      </>}
    >
      <ol className="list-none p-0">
        {m.interp.rows.map((r) => (
          <Row key={r.label} emphasis={r.selected}
            label={<>{r.label}{r.selected && <>{EN_SPACE}<span className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink">selected</span></>}</>}
            value={<>error {fmtNum(r.error)}<span className="block sm:inline"><span className="hidden sm:inline"> · </span><Greek>ρ</Greek> {fmtNum(r.rho)} · <Greek>κ</Greek> {fmtNum(r.kappa)}</span></>}
          >
            <Grid s={s} />
            <Seg a={s.at(0)} b={s.at(r.error)} className={r.selected ? "bg-ink/60" : "bg-line-strong"} />
            <Mark x={s.at(r.error)} size={r.selected ? 10 : 8} kind={r.selected ? "solid" : "alt"} />
          </Row>
        ))}
      </ol>
      <Axis s={s} format={(v) => (v === 0 ? "0" : v.toFixed(step < 0.1 ? 2 : 1))} title="Paired fidelity error · lower = closer to Mars" />
      {surrogate && (
        <p className="mt-6 max-w-[72ch] text-caption text-muted">
          <span aria-hidden className="mr-1.5 text-warn">⚠</span>{surrogate.text}
        </p>
      )}
    </Chart>
  );
}

/** Observed fraction per research zone as a strip of square markers. The search target (never the live selection) is marked. */
export function SupportStrip({ m, targetSite, fig }: { m: EvidenceModel; targetSite: string | null; fig?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const rows = m.support.rows;
  if (!rows.length) return <p className="text-caption text-faint">Observation support is not in the evidence payload.</p>;
  const lo = Math.floor(((m.support.min ?? 0) - 0.005) * 100) / 100;
  const hi = Math.ceil(((m.support.max ?? 1) + 0.005) * 100) / 100;
  const s = scale(lo, hi, zoomedTicks(lo, hi));
  // Dodge: stack markers that would overlap (closer than one marker width on screen) upward.
  const MARK = 8;
  const gap = width > 0 ? ((MARK + 2) / width) * 100 : 2.2;
  const levels: number[] = [];
  const lastAt: number[] = [];
  for (const r of rows) {
    const x = s.at(r.fraction);
    let lvl = 0;
    while (lastAt[lvl] !== undefined && x - lastAt[lvl] < gap) lvl++;
    lastAt[lvl] = x;
    levels.push(lvl);
  }
  const maxLvl = Math.max(...levels);
  const step = MARK + 2;
  const h = (maxLvl + 1) * step + 14;
  const target = targetSite ? rows.find((r) => r.site === targetSite) ?? null : null;
  const activeIdx = active ? rows.findIndex((r) => r.site === active) : -1;
  const activeRow = activeIdx >= 0 ? rows[activeIdx] : null;
  // rows are sorted by observed fraction (ascending), so arrow keys walk the strip left to right.
  const move = (i: number) => setActive(rows[Math.max(0, Math.min(rows.length - 1, i))].site);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = activeIdx >= 0 ? activeIdx : -1;
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(from + 1), ArrowUp: () => move(from + 1),
      ArrowLeft: () => move(from < 0 ? rows.length - 1 : from - 1), ArrowDown: () => move(from < 0 ? rows.length - 1 : from - 1),
      Home: () => move(0), End: () => move(rows.length - 1),
      Escape: () => setActive(null),
    };
    const fn = keys[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };
  // Pointer (mouse or touch): pick the zone whose marker is nearest horizontally to the pointer.
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const x = ((e.clientX - box.left) / box.width) * 100;
    let best = 0;
    rows.forEach((r, i) => { if (Math.abs(s.at(r.fraction) - x) < Math.abs(s.at(rows[best].fraction) - x)) best = i; });
    setActive(rows[best].site);
  };
  return (
    <Chart fig={fig}
      title="How much of each zone MOLA actually observed"
      basis={<>{m.support.label ?? "Fraction of native MEGDR bins with ≥1 laser shot"}. One marker per research zone ({rows.length}). The rest of each grid is interpolated.</>}
      legend={<>
        <Key swatch={<SolidSwatch className="bg-muted" />}>Research zone</Key>
        {target && <Key swatch={<SolidSwatch className="bg-mars" />}>Your search target · {zoneName(target.site)}</Key>}
        <Key swatch={<RuleSwatch />}>Median <span className="num">{fmtPct(m.support.median, 1)}</span></Key>
      </>}
      footer={
        <Disclosure summary={`All ${rows.length} zones`}>
          <ul className="grid list-none grid-cols-1 gap-x-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {[...rows].sort((a, b) => a.site.localeCompare(b.site)).map((r) => (
              <li key={r.site} onMouseEnter={() => setActive(r.site)} onMouseLeave={() => setActive(null)}
                className={cx("-mx-1.5 flex justify-between gap-3 border-b border-line px-1.5 py-1.5 text-label", r.site === targetSite ? "text-mars" : "text-muted", r.site === active && "bg-elevated text-ink")}>
                <span>{zoneName(r.site)}</span><span className="num text-num">{fmtPct(r.fraction, 1)}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      }
    >
      <div ref={ref} className="relative cursor-crosshair touch-pan-y" style={{ height: h }} role="group" tabIndex={0}
        aria-roledescription="marker strip"
        aria-label={`Observed fraction per zone. Ranges from ${fmtPct(m.support.min, 1)} to ${fmtPct(m.support.max, 1)} across ${rows.length} zones, median ${fmtPct(m.support.median, 1)}${target ? `; your search target ${zoneName(target.site)} ${fmtPct(target.fraction, 1)}` : ""}. Use the arrow keys to read each zone.`}
        aria-describedby="ev-support-readout"
        onKeyDown={onKey} onPointerMove={(e) => { if (e.pointerType === "mouse") pick(e); }} onPointerDown={pick}
        onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
        <Grid s={s} guide={false} />
        {m.support.median !== null && <span aria-hidden className="absolute bottom-0 top-0 w-px bg-ink/80" style={{ left: `${s.at(m.support.median)}%` }} />}
        {activeRow && <span aria-hidden className="absolute bottom-0 top-0 w-px bg-ink/40" style={{ left: `${s.at(activeRow.fraction)}%` }} />}
        {rows.map((r, i) => {
          const isT = r.site === targetSite;
          const isA = r.site === active;
          return (
            <span key={r.site} aria-hidden
              className={cx("absolute -translate-x-1/2",
                // The search target keeps its Mars colour when read; other zones brighten to ink.
                isT ? "h-[10px] w-[10px] bg-mars" : cx("h-2 w-2", isA ? "bg-ink" : "bg-muted"),
                isA ? "z-20 ring-2 ring-ink/50" : cx("ring-1 ring-space", isT && "z-10"))}
              style={{ left: `${s.at(r.fraction)}%`, bottom: 5 + levels[i] * step }} />
          );
        })}
      </div>
      <div className="relative h-6 border-t border-line-strong" aria-hidden>
        <Ticks s={s} format={(t) => fmtPct(t)} />
      </div>
      <div className="mt-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint" aria-hidden>Bins with ≥ 1 laser shot · axis {fmtPct(lo)}–{fmtPct(hi)}</div>
      <p id="ev-support-readout" aria-live="polite" className="mt-4 min-h-[1.5em] border-t border-line pt-3 text-caption text-muted">
        {activeRow
          ? <><span className="label-caps mr-2 text-[10.5px] text-faint">Readout</span><span className="text-ink">{zoneName(activeRow.site)}</span> · <span className="num text-ink">{fmtPct(activeRow.fraction, 1)}</span> of bins observed · <span className="num">{activeIdx + 1}</span> of {rows.length} from the lowest</>
          : <span className="text-faint">Hover, tap or focus the strip and use ← → to read each zone.</span>}
      </p>
      {target && <p className="mt-2 text-caption text-muted">Your search target, <span className="text-mars">{zoneName(target.site)}</span>, has <span className="num text-ink">{fmtPct(target.fraction, 1)}</span> of bins observed.</p>}
    </Chart>
  );
}

/** Unit squares, one per real zone: filled = stable leader, outlined = tie (inner square = tie of three or more). */
function ZoneSquares({ named, ties, label }: { named: number | null; ties: { size: number; count: number }[]; label: string }) {
  if (named === null) return <p className="text-caption text-faint">Not in the evidence payload.</p>;
  const cells: ("named" | number)[] = [...Array(named).fill("named"), ...ties.flatMap((t) => Array(t.count).fill(t.size))];
  const parts = [`${named} stable leader${named === 1 ? "" : "s"}`, ...ties.map((t) => `${t.count} tie${t.count === 1 ? "" : "s"} of ${t.size}`)];
  return (
    <div>
      <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div role="img" aria-label={`${parts.join("; ")}.`}
        className="grid max-w-[260px] grid-cols-[repeat(13,minmax(0,1fr))] gap-[3px]">
        {cells.map((c, i) => (
          <span key={i} className={cx("relative aspect-square", c === "named" ? "bg-ink" : "border border-muted")}>
            {c !== "named" && c >= 3 && <span className="absolute inset-[30%] bg-muted" />}
          </span>
        ))}
      </div>
      {/* Each count stays on one line; the line breaks only at a separator. */}
      <div className="num mt-2.5 text-num-sm text-muted">
        {parts.map((p, i) => <Fragment key={p}>{i > 0 && " · "}<span className="whitespace-nowrap">{p}</span></Fragment>)}
      </div>
    </div>
  );
}

function PanelHead({ fig, title, aside }: { fig?: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 border-b border-line pb-3">
      <h3 className="m-0"><FigTitle fig={fig}>{title}</FigTitle></h3>
      {aside}
    </div>
  );
}

/** Abstention split: synthetic twins (ground truth exists) vs real MOLA targets (it does not). */
export function AbstentionSplit({ m, fig }: { m: EvidenceModel; fig?: string }) {
  const a = m.abstention.synthetic;
  const r = m.abstention.real;
  const namedShare = a.named !== null && a.total ? a.named / a.total : null;
  return (
    <div className="grid gap-x-12 gap-y-14 lg:grid-cols-2">
      <div>
        <PanelHead fig={fig && `${fig}A`} title="Synthetic twins" aside={<span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-warn">⚠ synthetic · ground truth known</span>} />
        <p className="mt-3 text-caption text-muted">A leader is named only if it is the same under all four 90° orientations of the Earth window; otherwise the result is a tie.</p>
        {namedShare !== null && (
          <div className="mt-5" role="img" aria-label={`${a.named} of ${a.total} twins got a stable leader; ${a.abstained} were ties.`}>
            <div className="flex h-3 gap-px">
              <span className="h-full bg-ink" style={{ width: `${namedShare * 100}%` }} />
              <span className="h-full flex-1 border border-muted bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(166_174_182/.5)_3px_4px)]" />
            </div>
            <div className="mt-2 flex justify-between gap-3 text-caption text-muted">
              <span><span className="num text-ink">{fmtInt(a.named)}</span> stable leaders</span>
              <span><span className="num text-ink">{fmtInt(a.abstained)}</span> ties</span>
            </div>
          </div>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-px border border-line bg-line">
          <Stat cell label="Correct when a leader is named" value={fmtPct(a.accNamed, 1)} />
          <Stat cell label="Ties that contain the twin" value={`${fmtInt(a.twinInTie)}/${fmtInt(a.abstained)}`} />
          <Stat cell label="Median tie size" value={fmtInt(a.tieMedian)} sub={a.tieMax !== null ? `largest ${a.tieMax}` : undefined} />
          <Stat cell label="Twins" value={fmtInt(a.total)} />
        </dl>
      </div>
      <div>
        <PanelHead fig={fig && `${fig}B`} title="Real MOLA targets — no ground truth" />
        <p className="mt-3 text-caption text-muted">{r.label ?? "Real MOLA targets × fixed Earth pool."} Accuracy cannot be measured here; only how often the method names a leader.</p>
        <div className="mt-5 grid gap-7 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <ZoneSquares named={r.report.named} ties={r.report.ties} label="Terrain only (report mode)" />
          <ZoneSquares named={r.gated.named} ties={r.gated.ties} label="Land-cover filter, then rank" />
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-caption text-muted">
          <Key swatch={<span aria-hidden className="inline-block h-2.5 w-2.5 bg-ink" />}>Stable leader</Key>
          <Key swatch={<span aria-hidden className="inline-block h-2.5 w-2.5 border border-muted" />}>Tie of 2</Key>
          <Key swatch={<span aria-hidden className="relative inline-block h-2.5 w-2.5 border border-muted"><span className="absolute inset-[30%] bg-muted" /></span>}>Tie of 3</Key>
        </div>
        {r.gated.pass !== null && r.gated.pool !== null && (
          <p className="mt-4 text-caption text-faint">With the filter, <span className="num">{r.gated.pass}</span> of <span className="num">{r.gated.pool}</span> pool windows remain eligible. Tie members are equivalent at this resolution — none is a winner.</p>
        )}
      </div>
    </div>
  );
}

/** Instrument readout: caps label, mono value, basis line. `cell` fills a hairline-divided grid cell. */
export function Stat({ label, value, sub, cell }: { label: string; value: string; sub?: string; cell?: boolean }) {
  return (
    <div className={cx("min-w-0", cell && "bg-space px-4 py-3.5")}>
      <dt className="text-[10.5px] font-semibold uppercase leading-snug tracking-[0.12em] text-muted">{label}</dt>
      <dd className="num m-0 mt-2.5 text-[22px] leading-none text-ink">{value}</dd>
      {sub && <dd className="m-0 mt-2 text-caption text-faint">{sub}</dd>}
    </div>
  );
}

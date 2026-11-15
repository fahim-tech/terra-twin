import { Disclosure } from "../../components/primitives";
import { cx } from "../../components/ui";
import { zoneName } from "../../lib/glossary";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { Axis, Chart, Dot, Grid, Key, RingSwatch, Row, ROW_GRID, scale, Seg, SolidSwatch, Ticks, useWidth } from "./chartKit";
import { Gloss } from "./Gloss";
import { CHAIN_NAMES, fmtInt, fmtNum, fmtPct, niceTicks, type EvidenceModel } from "./model";

const mrrAxis = scale(0, 1, [0, 0.2, 0.4, 0.6, 0.8, 1]);
const fmtAxis = (v: number) => (v === 0 || v === 1 ? String(v) : v.toFixed(1));

/** Ranked dots with 95 % bootstrap intervals for the five methods. */
export function MethodChart({ m }: { m: EvidenceModel }) {
  const n = m.synthetic.nTwins;
  return (
    <Chart
      title="Twin recovery by method"
      basis={<>Mean reciprocal rank (<Gloss k="mrr" />) of the true twin among {fmtInt(n)} synthetic twins, with 95 % bootstrap intervals. 1 = the twin is always ranked first.</>}
      legend={<>
        <Key swatch={<SolidSwatch />}>Deployed method</Key>
        <Key swatch={<SolidSwatch className="bg-muted" />}>Alternative</Key>
        <Key swatch={<RingSwatch className="border-faint" />}>Retired</Key>
        <Key swatch={<span aria-hidden className="inline-block h-[2px] w-4 rounded-full bg-muted" />}>95 % interval</Key>
      </>}
    >
      <ol className="list-none p-0">
        {m.methods.map((r) => {
          const deployed = r.code === "M2_OOM";
          const retired = r.code === "M1_qweights";
          return (
            <Row key={r.code} emphasis={deployed}
              label={<>{r.name}{r.note && <span className="ml-1.5 text-caption text-faint">· {r.note}</span>}</>}
              value={<>
                MRR {fmtNum(r.mrr)}
                {r.lo !== null && r.hi !== null && <span className="hidden sm:inline"> [{fmtNum(r.lo)}–{fmtNum(r.hi)}]</span>}
                {r.top1 !== null && <> · top-1 {fmtPct(r.top1)}</>}
                {r.lo !== null && r.hi !== null && <span className="block sm:hidden">95% CI{" "}{fmtNum(r.lo)}–{fmtNum(r.hi)}</span>}
              </>}
              srText={r.lo !== null && r.hi !== null ? `95% interval ${fmtNum(r.lo)} to ${fmtNum(r.hi)}.` : undefined}
            >
              <Grid s={mrrAxis} />
              {r.lo !== null && r.hi !== null && <Seg a={mrrAxis.at(r.lo)} b={mrrAxis.at(r.hi)} caps className={deployed ? "bg-ink/70" : "bg-muted/70"} />}
              <Dot x={mrrAxis.at(r.mrr)} size={deployed ? 12 : 10}
                className={retired ? "border-2 border-faint bg-space" : deployed ? "bg-ink ring-2 ring-space" : "bg-muted ring-2 ring-space"} />
            </Row>
          );
        })}
      </ol>
      <Axis s={mrrAxis} format={fmtAxis} title="Mean reciprocal rank (synthetic twins)" />
    </Chart>
  );
}

/** Dumbbells per true chain: direct comparison vs the deployed operator (linear + ½ px). */
export function FalsificationChart({ m }: { m: EvidenceModel }) {
  return (
    <Chart
      title="What happens when the assumed operator is wrong"
      basis={<>Each row makes synthetic twins with a different “true” observation chain, then ranks them with no correction and with the deployed operator (linear + ½ px). The <Gloss k="megdr" /> gridding algorithm is undocumented, so any row could be the real one.</>}
      legend={<>
        <Key swatch={<RingSwatch />}>Direct comparison</Key>
        <Key swatch={<SolidSwatch />}>Deployed operator</Key>
        <Key swatch={<span aria-hidden className="text-warn">⚠</span>}>Deployed operator worse than no correction</Key>
      </>}
      footer={<FullMatrix m={m} />}
    >
      <div aria-hidden className={cx(ROW_GRID, "pb-1 text-caption text-faint")}><span>True chain <span className="hidden sm:inline">· direct → deployed</span></span><span /></div>
      <ol className="list-none p-0">
        {m.chains.map((c) => {
          const ok = c.direct !== null && c.deployed !== null;
          return (
            <Row key={c.chain} emphasis={c.adverse}
              className={cx(c.adverse && "-mx-3 rounded-control bg-warn/[0.07] px-3")}
              label={<>{c.adverse && <span aria-hidden className="mr-1 text-warn">⚠</span>}<span className="sr-only">True chain: </span>{c.name}</>}
              value={<><span className="sr-only">direct </span>{fmtNum(c.direct)} → {fmtNum(c.deployed)}{c.adverse && <span className="text-warn"> · worse</span>}</>}
              srText={c.adverse ? "Adverse result: the deployed operator ranks twins worse than no correction." : undefined}
            >
              <Grid s={mrrAxis} />
              {ok && <Seg a={mrrAxis.at(c.direct!)} b={mrrAxis.at(c.deployed!)} className={c.adverse ? "bg-warn/80" : "bg-muted/60"} thick={c.adverse ? 3 : 2} />}
              {c.direct !== null && <Dot x={mrrAxis.at(c.direct)} className="border-2 border-muted bg-space" />}
              {c.deployed !== null && <Dot x={mrrAxis.at(c.deployed)} size={11} className={c.adverse ? "bg-warn ring-2 ring-space" : "bg-ink ring-2 ring-space"} />}
            </Row>
          );
        })}
      </ol>
      <Axis s={mrrAxis} format={fmtAxis} title="Mean reciprocal rank (synthetic twins)" />
    </Chart>
  );
}

function FullMatrix({ m }: { m: EvidenceModel }) {
  if (!m.chains.length) return null;
  return (
    <Disclosure summary="Every chain × every assumed operator">
      {m.falsificationLabel && <p className="mb-2 text-caption text-faint">{m.falsificationLabel}.</p>}
      <div className="scroll-thin -mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label="Misspecification matrix, mean reciprocal rank">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="text-caption text-faint">
              <th scope="col" className="py-1.5 pr-3 font-normal">True chain ↓ · assumed →</th>
              {m.chainColumns.map((c) => <th key={c} scope="col" className="px-2 py-1.5 text-right font-normal">{CHAIN_NAMES[c] ?? c}</th>)}
            </tr>
          </thead>
          <tbody>
            {m.chains.map((r) => (
              <tr key={r.chain} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-3 text-label font-normal text-muted">{r.name}</th>
                {m.chainColumns.map((c) => {
                  const v = r.cells[c];
                  const diag = c === r.chain;
                  const worse = c === "primary" && r.adverse;
                  return (
                    <td key={c} className={cx("num px-2 py-1.5 text-right text-num", diag ? "bg-ink/[0.07] text-ink" : worse ? "text-warn" : "text-muted")}>
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
      <p className="mt-2 text-caption text-faint">Shaded: the assumed operator equals the true chain. <span className="text-warn">⚠</span> the deployed operator does worse than no correction.</p>
    </Disclosure>
  );
}

/** Paired fidelity error for each interpolator variant (lower is better). */
export function InterpolatorChart({ m }: { m: EvidenceModel }) {
  // The caveat is the research record's own limitation text, so nothing is stated that the payload does not carry.
  const surrogate = m.limitations.find((l) => l.code === "operator_is_surrogate") ?? null;
  const max = Math.max(...m.interp.rows.map((r) => r.error), 0.1);
  const ticks = niceTicks(0, max, 4);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : max;
  while (ticks[ticks.length - 1] < max - 1e-9) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  const s = scale(0, ticks[ticks.length - 1], ticks);
  return (
    <Chart
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
            label={<>{r.label}{r.selected && <span className="ml-1.5 text-caption text-ink">✓ selected</span>}</>}
            value={<>error {fmtNum(r.error)}<span className="block sm:inline"><span className="hidden sm:inline"> · </span>ρ {fmtNum(r.rho)} · κ {fmtNum(r.kappa)}</span></>}
          >
            <Grid s={s} />
            <Seg a={s.at(0)} b={s.at(r.error)} className={r.selected ? "bg-ink/40" : "bg-line-strong"} thick={1} />
            <Dot x={s.at(r.error)} size={r.selected ? 12 : 10} className={r.selected ? "bg-ink ring-2 ring-space" : "bg-muted ring-2 ring-space"} />
          </Row>
        ))}
      </ol>
      <Axis s={s} format={(v) => (v === 0 ? "0" : v.toFixed(step < 0.1 ? 2 : 1))} title="Paired fidelity error (lower = closer to Mars)" />
      {surrogate && (
        <p className="mt-6 max-w-[70ch] text-caption text-muted">
          <span aria-hidden className="mr-1 text-warn">⚠</span>{surrogate.text}
        </p>
      )}
    </Chart>
  );
}

/** Observed fraction per research zone as a dot strip. The search target (never the live selection) is marked. */
export function SupportStrip({ m, targetSite }: { m: EvidenceModel; targetSite: string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const rows = m.support.rows;
  if (!rows.length) return <p className="text-caption text-faint">Observation support is not in the evidence payload.</p>;
  const lo = Math.floor(((m.support.min ?? 0) - 0.005) * 100) / 100;
  const hi = Math.ceil(((m.support.max ?? 1) + 0.005) * 100) / 100;
  const s = scale(lo, hi, niceTicks(lo, hi, 5));
  // Dodge: stack dots that would overlap (closer than one dot width on screen) upward.
  const DOT = 9;
  const gap = width > 0 ? ((DOT + 1.5) / width) * 100 : 2.2;
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
  const step = DOT + 1;
  const h = (maxLvl + 1) * step + 10;
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
  // Pointer (mouse or touch): pick the zone whose dot is nearest horizontally to the pointer.
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const x = ((e.clientX - box.left) / box.width) * 100;
    let best = 0;
    rows.forEach((r, i) => { if (Math.abs(s.at(r.fraction) - x) < Math.abs(s.at(rows[best].fraction) - x)) best = i; });
    setActive(rows[best].site);
  };
  return (
    <Chart
      title="How much of each zone MOLA actually observed"
      basis={<>{m.support.label ?? "Fraction of native MEGDR bins with ≥1 laser shot"}. One dot per research zone ({rows.length}). The rest of each grid is interpolated.</>}
      legend={<>
        <Key swatch={<SolidSwatch className="bg-muted" />}>Research zone</Key>
        {target && <Key swatch={<SolidSwatch className="bg-mars" />}>Your search target · {zoneName(target.site)}</Key>}
        <Key swatch={<span aria-hidden className="inline-block h-3 w-px bg-ink" />}>Median {fmtPct(m.support.median, 1)}</Key>
      </>}
      footer={
        <Disclosure summary={`All ${rows.length} zones`}>
          <ul className="grid list-none grid-cols-1 gap-x-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {[...rows].sort((a, b) => a.site.localeCompare(b.site)).map((r) => (
              <li key={r.site} onMouseEnter={() => setActive(r.site)} onMouseLeave={() => setActive(null)}
                className={cx("-mx-1.5 flex justify-between gap-3 rounded-[4px] border-b border-line px-1.5 py-1.5 text-label", r.site === targetSite ? "text-mars" : "text-muted", r.site === active && "bg-elevated text-ink")}>
                <span>{zoneName(r.site)}</span><span className="num text-num">{fmtPct(r.fraction, 1)}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      }
    >
      <div ref={ref} className="relative cursor-crosshair touch-pan-y rounded-[4px]" style={{ height: h }} role="group" tabIndex={0}
        aria-roledescription="dot strip"
        aria-label={`Observed fraction per zone. Ranges from ${fmtPct(m.support.min, 1)} to ${fmtPct(m.support.max, 1)} across ${rows.length} zones, median ${fmtPct(m.support.median, 1)}${target ? `; your search target ${zoneName(target.site)} ${fmtPct(target.fraction, 1)}` : ""}. Use the arrow keys to read each zone.`}
        aria-describedby="ev-support-readout"
        onKeyDown={onKey} onPointerMove={(e) => { if (e.pointerType === "mouse") pick(e); }} onPointerDown={pick}
        onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
        <Grid s={s} />
        {m.support.median !== null && <span aria-hidden className="absolute bottom-0 top-0 w-px bg-ink/70" style={{ left: `${s.at(m.support.median)}%` }} />}
        {activeRow && <span aria-hidden className="absolute bottom-0 top-0 w-px bg-ink/40" style={{ left: `${s.at(activeRow.fraction)}%` }} />}
        {rows.map((r, i) => {
          const isT = r.site === targetSite;
          const isA = r.site === active;
          return (
            <span key={r.site} aria-hidden
              className={cx("absolute -translate-x-1/2 rounded-full", isT ? "z-10 h-[11px] w-[11px] bg-mars" : "h-[9px] w-[9px] bg-muted", isA ? "z-20 ring-2 ring-ink" : "ring-1 ring-space")}
              style={{ left: `${s.at(r.fraction)}%`, bottom: 4 + levels[i] * step }} />
          );
        })}
      </div>
      <div className="relative h-5 border-t border-line-strong" aria-hidden>
        <Ticks s={s} format={(t) => fmtPct(t)} />
      </div>
      <div className="mt-3 text-center text-caption text-muted" aria-hidden>Bins with ≥ 1 laser shot (axis zoomed to {fmtPct(lo)}–{fmtPct(hi)})</div>
      <p id="ev-support-readout" aria-live="polite" className="mt-3 min-h-[1.5em] text-caption text-muted">
        {activeRow
          ? <><span className="text-ink">{zoneName(activeRow.site)}</span> · <span className="num text-ink">{fmtPct(activeRow.fraction, 1)}</span> of bins observed · <span className="num">{activeIdx + 1}</span> of {rows.length} from the lowest</>
          : <span className="text-faint">Hover, tap or focus the strip and use ← → to read each zone.</span>}
      </p>
      {target && <p className="mt-3 text-caption text-muted">Your search target, <span className="text-mars">{zoneName(target.site)}</span>, has <span className="num text-ink">{fmtPct(target.fraction, 1)}</span> of bins observed.</p>}
    </Chart>
  );
}

/** Unit squares for 39 real zones: filled = stable leader, outlined = tie (members listed by size). */
function ZoneSquares({ named, ties, label }: { named: number | null; ties: { size: number; count: number }[]; label: string }) {
  if (named === null) return <p className="text-caption text-faint">Not in the evidence payload.</p>;
  const cells: ("named" | number)[] = [...Array(named).fill("named"), ...ties.flatMap((t) => Array(t.count).fill(t.size))];
  return (
    <div>
      <div className="mb-2 text-label text-ink">{label}</div>
      <div role="img" aria-label={`${named} stable leaders; ${ties.map((t) => `${t.count} ties of ${t.size}`).join(", ")}.`}
        className="grid max-w-[260px] grid-cols-[repeat(13,minmax(0,1fr))] gap-[3px]">
        {cells.map((c, i) => (
          <span key={i} className={cx("relative aspect-square rounded-[2px]", c === "named" ? "bg-ink" : "border border-muted")}>
            {c !== "named" && c >= 3 && <span className="absolute inset-[30%] rounded-full bg-muted" />}
          </span>
        ))}
      </div>
      <div className="num mt-2 text-num-sm text-muted">
        {named} stable leader{named === 1 ? "" : "s"}{ties.map((t) => ` · ${t.count} tie${t.count === 1 ? "" : "s"} of ${t.size}`).join("")}
      </div>
    </div>
  );
}

/** Abstention split: synthetic twins (ground truth exists) vs real MOLA targets (it does not). */
export function AbstentionSplit({ m }: { m: EvidenceModel }) {
  const a = m.abstention.synthetic;
  const r = m.abstention.real;
  const namedShare = a.named !== null && a.total ? a.named / a.total : null;
  return (
    <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-title text-ink">Synthetic twins</h3>
          <span className="text-caption text-warn">⚠ synthetic · ground truth known</span>
        </div>
        <p className="mt-1 text-caption text-muted">A leader is named only if it is the same under all four 90° orientations of the Earth window; otherwise the result is a tie.</p>
        {namedShare !== null && (
          <div className="mt-4" role="img" aria-label={`${a.named} of ${a.total} twins got a stable leader; ${a.abstained} were ties.`}>
            <div className="flex h-3 overflow-hidden rounded-full">
              <span className="h-full bg-ink" style={{ width: `${namedShare * 100}%` }} />
              <span className="h-full flex-1 border border-muted bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(169_177_186/.45)_3px_4px)]" />
            </div>
            <div className="mt-2 flex justify-between gap-3 text-caption text-muted">
              <span><span className="num text-ink">{fmtInt(a.named)}</span> stable leaders</span>
              <span><span className="num text-ink">{fmtInt(a.abstained)}</span> ties</span>
            </div>
          </div>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
          <Stat label="Correct when a leader is named" value={fmtPct(a.accNamed, 1)} />
          <Stat label="Ties that contain the twin" value={`${fmtInt(a.twinInTie)}/${fmtInt(a.abstained)}`} />
          <Stat label="Median tie size" value={fmtInt(a.tieMedian)} sub={a.tieMax !== null ? `largest ${a.tieMax}` : undefined} />
          <Stat label="Twins" value={fmtInt(a.total)} />
        </dl>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-title text-ink">Real MOLA targets — no ground truth</h3>
        </div>
        <p className="mt-1 text-caption text-muted">{r.label ?? "Real MOLA targets × fixed Earth pool."} Accuracy cannot be measured here; only how often the method names a leader.</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
          <ZoneSquares named={r.report.named} ties={r.report.ties} label="Terrain only (report mode)" />
          <ZoneSquares named={r.gated.named} ties={r.gated.ties} label="Land-cover filter, then rank" />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-caption text-muted">
          <Key swatch={<span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px] bg-ink" />}>Stable leader</Key>
          <Key swatch={<span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px] border border-muted" />}>Tie of 2</Key>
          <Key swatch={<span aria-hidden className="relative inline-block h-2.5 w-2.5 rounded-[2px] border border-muted"><span className="absolute inset-[30%] rounded-full bg-muted" /></span>}>Tie of 3</Key>
        </div>
        {r.gated.pass !== null && r.gated.pool !== null && (
          <p className="mt-3 text-caption text-faint">With the filter, <span className="num">{r.gated.pass}</span> of <span className="num">{r.gated.pool}</span> pool windows remain eligible. Tie members are equivalent at this resolution — none is a winner.</p>
        )}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="num m-0 mt-1 text-[20px] leading-none text-ink">{value}</dd>
      {sub && <dd className="m-0 mt-1 text-caption text-faint">{sub}</dd>}
    </div>
  );
}

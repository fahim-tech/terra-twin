import type { ReactNode } from "react";
import { Measure } from "../../components/primitives";
import { cx } from "../../components/ui";
import { PlanetMark } from "./marks";
import { DELTA_TICKS, groupRows, LOG_TICKS, type RatioRow, relationParts } from "./science";

const digitsFor = (key: string, v: number | null) => (key.startsWith("hurst") ? 2 : key.includes("slope") ? 1 : v !== null && Math.abs(v) < 100 ? 1 : 0);
const pct = (x: number) => `${x * 100}%`;

/**
 * Earth/Mars ratio chart, drawn as an instrument: one row per descriptor; x = Earth ÷ Mars on a log axis
 * from 0.5 to 2.0 with hairline gridlines and mono ticks; the Mars reference is the line at 1.00 (Earth =
 * Mars); Earth is a square marker on a stem from the reference; the neutral band is the registry
 * tolerance. Hurst is a difference on its own linear ±0.30 axis. Rows are grouped by whether they fall
 * inside the band. Wide strips (container ≥ 640 px) show columns; narrow ones stack each row.
 */
export function RatioChart({ rows, compact }: { rows: RatioRow[]; compact?: boolean }) {
  const g = groupRows(rows);
  const hasLinear = rows.some((r) => r.transform === "linear");
  return (
    <div className="text-caption">
      <AxisHeader />
      <PhoneAxis />
      <Group title="Similar" hint="inside research tolerance" rows={g.similar} compact={compact} />
      <Group title="Different" hint="outside research tolerance" rows={g.different} compact={compact} />
      {g.missing.length > 0 && <Group title="Not comparable" hint="a value is missing" rows={g.missing} compact={compact} />}
      <AxisFooter />
      <Legend linear={hasLinear} />
    </div>
  );
}

const GRID = "grid grid-cols-[minmax(0,1fr)] @min-[640px]:grid-cols-[minmax(140px,1.15fr)_72px_72px_minmax(220px,2.6fr)_minmax(150px,1fr)] @min-[640px]:gap-x-4";

function TickLabels({ className, faint = false }: { className?: string; faint?: boolean }) {
  return (
    <div className={cx("relative h-3.5", className)}>
      {LOG_TICKS.map((t, i) => (
        <span key={t.v} className={cx("num absolute top-0 text-[10.5px] leading-none",
          i === 0 ? "" : i === LOG_TICKS.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
          t.v === 1 ? "text-mars" : faint ? "text-faint" : "text-muted")} style={{ left: pct(t.pos) }}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

/** Axis ruler: a hairline with a short tick at each labelled value. */
function Ruler({ up = false }: { up?: boolean }) {
  return (
    <div className={cx("relative h-1.5", up ? "border-t" : "border-b", "border-line-strong")}>
      {LOG_TICKS.map((t) => (
        <span key={t.v} className={cx("absolute h-1.5 w-px", up ? "top-0" : "bottom-0", t.v === 1 ? "bg-mars" : "bg-line-strong")} style={{ left: pct(t.pos) }} />
      ))}
    </div>
  );
}

function AxisHeader() {
  return (
    <div aria-hidden className={cx(GRID, "hidden items-end pb-0", "@min-[640px]:grid")}>
      <span className="kicker pb-1.5">Descriptor</span>
      <span className="kicker flex items-center justify-end gap-1.5 pb-1.5"><PlanetMark planet="mars" />Mars</span>
      <span className="kicker flex items-center justify-end gap-1.5 pb-1.5"><PlanetMark planet="earth" />Earth</span>
      <div>
        <div className="kicker mb-1.5 flex justify-between"><span>Earth ÷ Mars</span><span className="text-faint">log</span></div>
        <TickLabels />
        <Ruler />
      </div>
      <span className="kicker pb-1.5">Relation</span>
    </div>
  );
}

/** Narrow strips drop the columns; keep the ticks so the log axis can still be read. */
function PhoneAxis() {
  return (
    <div aria-hidden className={cx("mt-1", "@min-[640px]:hidden")}>
      <div className="kicker mb-1.5 flex justify-between"><span>Earth ÷ Mars</span><span>log</span></div>
      <TickLabels />
      <Ruler />
    </div>
  );
}

function AxisFooter() {
  return (
    <div aria-hidden className={cx(GRID, "hidden", "@min-[640px]:grid")}>
      <span className="col-span-3" />
      <div>
        <Ruler up />
        <TickLabels className="mt-1" faint />
      </div>
      <span />
    </div>
  );
}

function Group({ title, hint, rows, compact }: { title: string; hint: string; rows: RatioRow[]; compact?: boolean }) {
  if (!rows.length) return null;
  return (
    <section aria-label={`${title}: ${hint}`}>
      <div className={cx(GRID, "items-stretch")}>
        <h4 className={cx("flex items-baseline gap-2 pb-1.5 pt-3", "@min-[640px]:col-span-3")}>
          <span className="label-caps text-ink">{title}</span>
          <span className="text-caption text-faint">{hint}</span>
          <span className="num ml-auto text-[11px] text-muted">{String(rows.length).padStart(2, "0")}</span>
        </h4>
        <Track className={cx("hidden", "@min-[640px]:block")} />
        <span aria-hidden className={cx("hidden", "@min-[640px]:block")} />
      </div>
      <ul>
        {rows.map((r) => <Row key={r.key} r={r} compact={compact} />)}
      </ul>
    </section>
  );
}

function Relation({ r, className }: { r: RatioRow; className?: string }) {
  const p = relationParts(r);
  return (
    <span aria-hidden className={cx("whitespace-nowrap", className)}>
      {p.figure && <span className={cx("num mr-1.5 text-num", r.within === false ? "text-ink" : "text-ink/85")}>{p.figure}</span>}
      <span className={r.within === false ? "text-ink/85" : "text-muted"}>{p.text}</span>
    </span>
  );
}

function Row({ r, compact }: { r: RatioRow; compact?: boolean }) {
  const linear = r.transform === "linear";
  const bandText = linear ? `band ±${r.tol}` : `band ${(1 / (1 + r.tol)).toFixed(2)}×–${(1 + r.tol).toFixed(2)}×`;
  const sr = r.value === null
    ? `${r.label}: not comparable, a value is missing.`
    : `${r.label}: Mars ${r.mars?.toFixed(2)}, Earth ${r.earth?.toFixed(2)}; ${r.relation}; ${r.within ? "inside" : "outside"} the research tolerance (${bandText}).`;
  return (
    <li className={cx(GRID, "items-center border-t border-line")}>
      <span className="sr-only">{sr}</span>
      <span aria-hidden className={cx("flex items-baseline justify-between gap-3 pt-2 text-label text-ink", "@min-[640px]:block @min-[640px]:pt-0")}>
        {r.label}
        <Relation r={r} className={cx("text-caption", "@min-[640px]:hidden")} />
      </span>
      <Measure value={r.mars} unit={r.unit} digits={digitsFor(r.key, r.mars)} className={cx("hidden text-right text-num", "@min-[640px]:block")} />
      <Measure value={r.earth} unit={r.unit} digits={digitsFor(r.key, r.earth)} className={cx("hidden text-right text-num", "@min-[640px]:block")} />
      <Track r={r} compact={compact} />
      <span aria-hidden className={cx("flex items-center gap-4 pb-2 text-caption text-muted", "@min-[640px]:hidden")}>
        <span className="inline-flex items-center gap-1.5"><PlanetMark planet="mars" />Mars <Measure value={r.mars} unit={r.unit} digits={digitsFor(r.key, r.mars)} className="text-num text-ink" /></span>
        <span className="inline-flex items-center gap-1.5"><PlanetMark planet="earth" />Earth <Measure value={r.earth} unit={r.unit} digits={digitsFor(r.key, r.earth)} className="text-num text-ink" /></span>
      </span>
      <Relation r={r} className={cx("hidden text-caption", "@min-[640px]:block")} />
    </li>
  );
}

/**
 * One row's plot: the log gridlines (shared by every row, so they read as one instrument), the tolerance
 * band, the Mars reference at 1.00 (Δ 0 for Hurst) and the Earth marker on its stem. Without a row it
 * draws the grid only (group header rows), so the gridlines and the reference run unbroken.
 */
function Track({ r, compact, className }: { r?: RatioRow; compact?: boolean; className?: string }) {
  const linear = r?.transform === "linear";
  const pos = r?.pos ?? null;
  return (
    <div aria-hidden className={cx("relative self-stretch", r ? (linear ? "min-h-10" : compact ? "min-h-8" : "min-h-9") : "", className)}>
      {/* The Hurst row has its own linear axis, so the log grid's interior lines break across it. */}
      {LOG_TICKS.filter((t) => t.v !== 1 && (!linear || t.pos === 0 || t.pos === 1)).map((t) => (
        <span key={t.v} className={cx("absolute inset-y-0 w-px", t.pos === 0 || t.pos === 1 ? "bg-line-strong" : "bg-line")} style={{ left: pct(t.pos) }} />
      ))}
      {r && (
        <div className={cx("absolute inset-x-0", linear ? "top-0 h-7" : "inset-y-0")}>
          <span className="absolute top-1/2 h-4 -translate-y-1/2 border-x border-ink/35 bg-ink/[0.07]" style={{ left: pct(r.band[0]), width: pct(r.band[1] - r.band[0]) }} />
          {linear && DELTA_TICKS.filter((t) => t.v !== 0 && Math.abs(t.v) < 0.3).map((t) => (
            <span key={t.v} className="absolute bottom-0 h-1.5 w-px bg-line-strong" style={{ left: pct(t.pos) }} />
          ))}
          {pos !== null && (
            <span className="absolute top-1/2 h-px bg-earth/60" style={{ left: pct(Math.min(0.5, pos)), width: pct(Math.abs(pos - 0.5)) }} />
          )}
          {pos !== null && (r.clipped
            ? <span className={cx("absolute top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-y-transparent", pos >= 1 ? "right-0 border-l-[7px] border-l-earth" : "left-0 border-r-[7px] border-r-earth")} />
            : <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 bg-earth shadow-[0_0_0_1px_var(--color-space)]" style={{ left: pct(pos) }} />)}
        </div>
      )}
      {/* Mars reference: Earth = Mars (1.00 on the log axis, Δ 0 on the Hurst axis). */}
      <span className="absolute inset-y-0 left-1/2 w-px bg-mars/90" />
      {linear && (
        <>
          <span className="num absolute bottom-1 left-1 text-[10px] leading-none text-muted">{DELTA_TICKS[0].label}</span>
          <span className="num absolute bottom-1 left-1/2 ml-1.5 text-[10px] leading-none text-muted">Δ 0</span>
          <span className="num absolute bottom-1 right-1 text-[10px] leading-none text-muted">{DELTA_TICKS[DELTA_TICKS.length - 1].label}</span>
        </>
      )}
    </div>
  );
}

function Key({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2">{mark}{children}</span>;
}

function Legend({ linear }: { linear: boolean }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-2.5 text-caption text-muted">
      <Key mark={<span aria-hidden className="inline-block h-3.5 w-px bg-mars" />}>Mars reference (Earth = Mars, 1.00)</Key>
      <Key mark={<span aria-hidden className="inline-block h-2 w-2 bg-earth" />}>Earth ÷ Mars, log scale</Key>
      <Key mark={<span aria-hidden className="inline-block h-3 w-5 border-x border-ink/35 bg-ink/[0.07]" />}>Research tolerance band</Key>
      {linear && <Key mark={<span aria-hidden className="num text-[10.5px] text-ink">Δ</span>}>Hurst: Earth − Mars, linear axis</Key>}
      <Key mark={<span aria-hidden className="inline-block h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-earth" />}>Value beyond the axis</Key>
    </p>
  );
}

import { Measure } from "../../components/primitives";
import { cx } from "../../components/ui";
import { groupRows, ratioPos, type RatioRow } from "./science";

const TICKS = [0.5, 0.67, 1, 1.5, 2];
const tickLabel = (t: number) => (t === 1 ? "1×" : t < 1 ? `${t}×` : `${t}×`);
const digitsFor = (key: string, v: number | null) => (key.startsWith("hurst") ? 2 : key.includes("slope") ? 1 : v !== null && Math.abs(v) < 100 ? 1 : 0);

/**
 * Earth/Mars ratio chart. One row per descriptor; x = Earth ÷ Mars on a log axis from 0.5× to 2×,
 * Mars is the reference tick at 1×, the neutral band is the registry tolerance. Hurst is a difference
 * on a linear ±0.3 axis. Rows are grouped by whether they fall inside the band.
 */
export function RatioChart({ rows, compact }: { rows: RatioRow[]; compact?: boolean }) {
  const g = groupRows(rows);
  return (
    <div className="text-caption">
      <AxisHeader />
      <PhoneAxis />
      <Group title="Similar" hint="inside research tolerance" rows={g.similar} compact={compact} />
      <Group title="Different" hint="outside research tolerance" rows={g.different} compact={compact} />
      {g.missing.length > 0 && <Group title="Not comparable" hint="a value is missing" rows={g.missing} compact={compact} />}
      <Legend />
    </div>
  );
}

const GRID = "grid grid-cols-[minmax(0,1fr)] gap-x-4 sm:grid-cols-[minmax(150px,1.1fr)_64px_64px_minmax(180px,2.4fr)_minmax(120px,1fr)]";

function AxisHeader() {
  return (
    <div aria-hidden className={cx(GRID, "hidden pb-1 sm:grid")}>
      <span className="text-faint">Descriptor</span>
      <span className="text-right"><span className="text-mars">●</span> <span className="text-faint">Mars</span></span>
      <span className="text-right"><span className="text-earth">●</span> <span className="text-faint">Earth</span></span>
      <div className="relative h-4">
        {TICKS.map((t) => (
          <span key={t} className={cx("num absolute top-0 text-num-sm text-faint", t === TICKS[0] ? "" : t === TICKS[TICKS.length - 1] ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${ratioPos(t) * 100}%` }}>{tickLabel(t)}</span>
        ))}
      </div>
      <span className="text-faint">Earth vs Mars</span>
    </div>
  );
}

/** Phones drop the header grid; keep the tick labels so the log axis can be read. */
function PhoneAxis() {
  return (
    <div aria-hidden className="relative mt-1 h-4 sm:hidden">
      {TICKS.map((t) => (
        <span key={t} className={cx("num absolute top-0 text-num-sm text-faint", t === TICKS[0] ? "" : t === TICKS[TICKS.length - 1] ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${ratioPos(t) * 100}%` }}>{tickLabel(t)}</span>
      ))}
    </div>
  );
}

function Group({ title, hint, rows, compact }: { title: string; hint: string; rows: RatioRow[]; compact?: boolean }) {
  if (!rows.length) return null;
  return (
    <section className="mt-2.5" aria-label={`${title}: ${hint}`}>
      <h4 className="mb-0.5 flex items-baseline gap-2 text-label text-ink">
        {title} <span className="text-caption font-normal text-faint">{hint} · {rows.length}</span>
      </h4>
      <ul>
        {rows.map((r) => <Row key={r.key} r={r} compact={compact} />)}
      </ul>
    </section>
  );
}

function Row({ r, compact }: { r: RatioRow; compact?: boolean }) {
  const linear = r.transform === "linear";
  const bandText = linear ? `band ±${r.tol}` : `band ${(1 / (1 + r.tol)).toFixed(2)}×–${(1 + r.tol).toFixed(2)}×`;
  const sr = r.value === null
    ? `${r.label}: not comparable, a value is missing.`
    : `${r.label}: Mars ${r.mars?.toFixed(2)}, Earth ${r.earth?.toFixed(2)}; ${r.relation}; ${r.within ? "inside" : "outside"} the research tolerance (${bandText}).`;
  return (
    <li className={cx(GRID, "items-center border-t border-line/60 first:border-t-0", compact ? "py-1" : "py-1.5")}>
      <span className="sr-only">{sr}</span>
      <span aria-hidden className="flex items-baseline justify-between gap-3 text-label text-ink sm:block">
        {r.label}
        <span className="whitespace-nowrap text-caption text-muted sm:hidden">
          Mars <Measure value={r.mars} unit={r.unit} digits={digitsFor(r.key, r.mars)} className="text-ink" /> · Earth <Measure value={r.earth} unit={r.unit} digits={digitsFor(r.key, r.earth)} className="text-ink" />
        </span>
      </span>
      <Measure value={r.mars} unit={r.unit} digits={digitsFor(r.key, r.mars)} className="hidden text-right text-num sm:block" />
      <Measure value={r.earth} unit={r.unit} digits={digitsFor(r.key, r.earth)} className="hidden text-right text-num sm:block" />
      <Track r={r} />
      <span aria-hidden className={cx("-mt-0.5 mb-0.5 text-caption sm:hidden", r.within === false ? "text-ink" : "text-muted")}>{r.relation}</span>
      <span aria-hidden className={cx("hidden text-caption sm:block", r.within === false ? "text-ink" : "text-muted")}>
        {r.relation}
      </span>
    </li>
  );
}

/** One row's axis: tolerance band, Mars reference tick at 1× (or Δ 0) and the Earth dot. */
function Track({ r }: { r: RatioRow }) {
  const linear = r.transform === "linear";
  const pct = (x: number) => `${x * 100}%`;
  return (
    <div aria-hidden className="relative my-1 h-6">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line x1="0" x2="100%" y1="50%" y2="50%" stroke="var(--color-line-strong)" strokeWidth="1" />
        <rect x={pct(r.band[0])} width={pct(r.band[1] - r.band[0])} y="3" height="18" rx="3" fill="var(--color-ink)" fillOpacity="0.08" />
        <line x1={pct(r.band[0])} x2={pct(r.band[0])} y1="3" y2="21" stroke="var(--color-ink)" strokeOpacity="0.22" />
        <line x1={pct(r.band[1])} x2={pct(r.band[1])} y1="3" y2="21" stroke="var(--color-ink)" strokeOpacity="0.22" />
        {/* Mars reference: Earth = Mars */}
        <line x1="50%" x2="50%" y1="1" y2="23" stroke="var(--color-mars)" strokeWidth="2" />
        {r.pos !== null && <line x1="50%" x2={pct(r.pos)} y1="50%" y2="50%" stroke="var(--color-earth)" strokeOpacity="0.55" strokeWidth="1.5" />}
      </svg>
      {r.pos !== null && (r.clipped
        ? <span className={cx("absolute top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-y-transparent", r.pos >= 1 ? "right-0 border-l-[8px] border-l-earth" : "left-0 border-r-[8px] border-r-earth")} />
        : <span className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-earth ring-[1.5px] ring-space" style={{ left: pct(r.pos) }} />)}
      {linear && (
        <>
          <span className="num absolute -bottom-2 left-0 text-[11px] leading-none text-muted">−0.3</span>
          <span className="num absolute -bottom-2 left-1/2 -translate-x-1/2 text-[11px] leading-none text-muted">Δ 0</span>
          <span className="num absolute -bottom-2 right-0 text-[11px] leading-none text-muted">+0.3</span>
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
      <span className="inline-flex items-center gap-1.5"><svg width="10" height="14" aria-hidden><line x1="5" x2="5" y1="0" y2="14" stroke="var(--color-mars)" strokeWidth="2" /></svg>Mars (reference, 1×)</span>
      <span className="inline-flex items-center gap-1.5"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4.5" fill="var(--color-earth)" /></svg>Earth ÷ Mars, log scale</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-5 rounded-[3px] bg-ink/10 ring-1 ring-inset ring-ink/20" />Research tolerance band</span>
      <span>Hurst: Earth − Mars on a linear axis</span>
      <span>▸ value beyond the axis</span>
    </p>
  );
}

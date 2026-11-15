import { motion } from "motion/react";
import { StatusMark } from "../../components/marks";
import { Disclosure, Measure, Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import type { FeatureValue, QualityFlag } from "../../types/contracts";
import { InfoPopover } from "./InfoPopover";
import { baselineFromExplanation, gridMetres } from "./readouts";

/** The four headline measures (global-screen descriptors) and their short caps labels. */
const KEY: { key: string; label: string }[] = [
  { key: "mean_slope_deg", label: "Mean slope" },
  { key: "slope_p90_deg", label: "90th-pct slope" },
  { key: "relative_relief_m", label: "Relief" },
  // Height change between points a short baseline apart (N-S, directional; the baseline is quoted from the
  // API's explanation) — not the spread of elevations, which is the separate "Elevation std. dev." measure.
  { key: "rmsdev_short", label: "RMS deviation" },
];

/** Fixed precision per descriptor: slopes 1 dp, lengths 0 dp, unitless (Hurst) 2 dp. */
function digitsFor(f: Pick<FeatureValue, "unit">): number {
  return f.unit === "deg" ? 1 : f.unit === "m" ? 0 : 2;
}

const STATE_WORD: Record<FeatureValue["state"], string> = {
  measured: "Measured", derived: "Derived", modelled: "Modelled", proxy: "Proxy", unavailable: "Unavailable", insufficient_resolution: "Insufficient resolution",
};

function gridLabel(m: number | null | undefined) {
  return m ? `${Math.round(m).toLocaleString("en-US")} m` : null;
}

/** Definition card for one measure: what it is, where it comes from, on what grid, in what state. */
function MeasureCard({ f }: { f: FeatureValue }) {
  const grid = gridLabel(f.native_resolution_m);
  const base = gridLabel(f.baseline_m);
  return (
    <>
      <span className="label-caps mb-1.5 block text-ink">{f.label}</span>
      {f.explanation && <span className="block">{f.explanation}</span>}
      <span className="mt-2.5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 border-t border-line pt-2.5">
        <span className="kicker">State</span><span className="text-ink">{STATE_WORD[f.state]}</span>
        {grid && <><span className="kicker">Grid</span><span className="num text-num-sm text-ink">{grid}</span></>}
        {base && <><span className="kicker">Baseline</span><span className="num text-num-sm text-ink">{base}</span></>}
        {f.footprint && <><span className="kicker">Support</span><span>{f.footprint}</span></>}
        {f.source_id && <><span className="kicker">Source</span><span className="break-all font-mono text-[11px] text-muted">{f.source_id}</span></>}
      </span>
      {f.reason && <span className="mt-2 flex items-baseline gap-2 text-ink"><StatusMark state="caution" className="translate-y-[-1px]" />{f.reason}</span>}
    </>
  );
}

/**
 * A data-quality flag from the record, with the shared marks (never typed glyphs): amber triangle = warning,
 * red crossed square = critical; an informational note carries no mark. The words say the severity too.
 */
function FlagLine({ f }: { f: QualityFlag }) {
  const state = f.severity === "critical" ? "fault" : f.severity === "warning" ? "caution" : null;
  return (
    <p className={cx("mt-2 flex items-baseline gap-2 text-caption", state ? "text-ink" : "text-muted")}>
      {state ? <StatusMark state={state} className="translate-y-[-1px]" /> : <span aria-hidden className="w-[7px] shrink-0" />}
      <span>{state && <span className="sr-only">{state === "fault" ? "Critical: " : "Warning: "}</span>}{f.message}</span>
    </p>
  );
}

/** One measure row for the disclosures: label left, value right, definition on demand. */
function MeasureRow({ f }: { f: FeatureValue }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:py-0">
      <InfoPopover label={`${f.label}: definition and source`} trigger={<span className={cx("text-label underline decoration-faint/50 decoration-dotted underline-offset-[3px] hover:text-ink", f.value === null ? "text-faint" : "text-muted")}>{f.label}</span>}>
        <MeasureCard f={f} />
      </InfoPopover>
      <Measure value={f.value} unit={f.unit} digits={digitsFor(f)} missing="Unavailable" className={cx("text-num", f.value === null ? "text-faint" : "text-ink")} />
    </li>
  );
}

/** Telemetry cell geometry: a 2 × 2 grid divided by hairlines. */
function cell(i: number) {
  return cx("min-w-0 py-3.5", i % 2 === 0 ? "pr-4" : "border-l border-line pl-4", i >= 2 && "border-t border-line");
}

export function TerrainSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 border-y border-line">
      {KEY.map((k, i) => (
        <div key={k.key} className={cell(i)}>
          <div className="kicker">{k.label}</div>
          <div className="mt-2.5 h-[26px] w-20 animate-pulse rounded-control bg-elevated motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * Terrain: four key figures (global-screen descriptors, median of the zone's screening cells) as a
 * telemetry grid, their basis and grid, then the full set and the whole-zone research measures on
 * demand. Every value has its definition one tap away; missing values read as missing, never as zero.
 */
export function Terrain({ tier1, zone, flags, cellKm }: { tier1: FeatureValue[]; zone: FeatureValue[]; flags: QualityFlag[]; cellKm: number | null }) {
  const byKey = Object.fromEntries(tier1.map((f) => [f.key, f]));
  const keys = KEY.map((k) => ({ ...k, f: byKey[k.key] as FeatureValue | undefined })).filter((k): k is typeof k & { f: FeatureValue } => !!k.f);
  const gridFlag = flags.find((f) => f.code === "mola_grid_not_resolution");
  const otherFlags = flags.filter((f) => f !== gridFlag);
  const grid = gridMetres(tier1);
  const gridText = grid !== null ? `MOLA ${grid.toLocaleString("en-US")} m grid` : "MOLA grid";
  return (
    <div>
      <dl className="grid grid-cols-2 border-y border-line">
        {keys.map(({ key, label, f }, i) => {
          const base = key === "rmsdev_short" ? baselineFromExplanation(f.explanation) : null;
          return (
            // Values sit on the cell's foot, so a two-line label never knocks a row out of alignment.
            <div key={key} className={cx(cell(i), "flex flex-col justify-between")}>
              <dt>
                <InfoPopover label={`${f.label}: definition and source`}
                  trigger={
                    <span className="kicker whitespace-nowrap !text-muted underline decoration-faint/40 decoration-dotted underline-offset-[4px] transition-colors hover:!text-ink">
                      {label}
                    </span>
                  }>
                  <MeasureCard f={f} />
                </InfoPopover>
                {base && <span className="num mt-1 block text-[10.5px] leading-none text-faint">{base} baseline</span>}
              </dt>
              {/* Values arrive with a short cross-fade (opacity only, so it holds under reduced motion too). */}
              <motion.dd initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, delay: 0.05 * i }} className="mt-2.5">
                {f.value === null
                  ? <span className="text-label text-faint">Unavailable</span>
                  : <Measure value={f.value} unit={f.unit} digits={digitsFor(f)} className="block text-[26px] leading-none text-ink" />}
              </motion.dd>
            </div>
          );
        })}
      </dl>

      {/* Two glossary triggers on separate rows with a gap, so a thumb lands on the one it means. */}
      <dl className="mt-3 grid grid-cols-[44px_1fr] items-baseline gap-x-3 gap-y-2.5 text-caption">
        <dt className="kicker">Basis</dt>
        <dd className="text-faint">
          <Term k="globalScreen">Global screen</Term> · median of the zone's {cellKm !== null ? <><span className="num">{cellKm}</span> km cells</> : "screening cells"}
        </dd>
        <dt className="kicker">Grid</dt>
        <dd className="text-faint">
          {gridFlag ? (
            <InfoPopover label={`${gridText}: what the grid spacing means`} trigger={<span className="underline decoration-faint/50 decoration-dotted underline-offset-[3px] hover:text-ink">{gridText}</span>}>
              <span className="label-caps mb-1.5 block text-ink">Grid spacing, not resolution</span>
              {gridFlag.message}
            </InfoPopover>
          ) : gridText}
        </dd>
      </dl>
      {otherFlags.map((f) => <FlagLine key={f.code} f={f} />)}

      <div className="mt-3 space-y-0.5">
        {tier1.length > 0 && (
          <Disclosure summary={`All ${tier1.length} measures`}>
            <ul className="pb-1">{tier1.map((f) => <MeasureRow key={f.key} f={f} />)}</ul>
          </Disclosure>
        )}
        {zone.length > 0 && (
          <Disclosure summary={`Whole zone · ${zone.length} measures`}>
            <p className="text-caption text-faint">{zone[0].footprint ?? "Whole research zone"} · multiscale research descriptors</p>
            <ul className="pb-1">{zone.map((f) => <MeasureRow key={f.key} f={f} />)}</ul>
          </Disclosure>
        )}
      </div>
    </div>
  );
}

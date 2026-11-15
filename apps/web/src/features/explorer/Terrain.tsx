import { Disclosure, Measure, Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import type { FeatureValue, QualityFlag } from "../../types/contracts";
import { InfoPopover } from "./InfoPopover";

/** The four headline measures (global-screen descriptors) and their short labels. */
const KEY: { key: string; label: string }[] = [
  { key: "mean_slope_deg", label: "Mean slope" },
  { key: "slope_p90_deg", label: "90th-pct slope" },
  { key: "relative_relief_m", label: "Relief" },
  { key: "rmsdev_short", label: "RMS height · 1.85 km" },
];

/** Fixed precision per descriptor: slope 1 dp, relief/RMS 0 dp, Hurst 2 dp. */
export function digitsFor(f: Pick<FeatureValue, "key" | "unit">): number {
  if (f.unit === "deg") return 1;
  if (f.unit === "m") return 0;
  if (f.key.startsWith("hurst")) return 2;
  return 2;
}

const STATE_WORD: Record<FeatureValue["state"], string> = {
  measured: "Measured", derived: "Derived", modelled: "Modelled", proxy: "Proxy", unavailable: "Unavailable", insufficient_resolution: "Insufficient resolution",
};

function gridLabel(m: number | null | undefined) {
  return m ? `${Math.round(m).toLocaleString("en-US")} m` : null;
}

/** Definition card for one measure: what it is, where it comes from, on what grid, in what state. */
export function MeasureCard({ f }: { f: FeatureValue }) {
  const grid = gridLabel(f.native_resolution_m);
  const base = gridLabel(f.baseline_m);
  return (
    <>
      <span className="mb-1 block text-label text-ink">{f.label}</span>
      {f.explanation && <span className="block">{f.explanation}</span>}
      <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-faint">State</span><span className="text-ink">{STATE_WORD[f.state]}</span>
        {grid && <><span className="text-faint">Grid</span><span className="num text-num-sm text-ink">{grid}</span></>}
        {base && <><span className="text-faint">Baseline</span><span className="num text-num-sm text-ink">{base}</span></>}
        {f.footprint && <><span className="text-faint">Support</span><span>{f.footprint}</span></>}
        {f.source_id && <><span className="text-faint">Source</span><span className="break-all font-mono text-[11px]">{f.source_id}</span></>}
      </span>
      {f.reason && <span className="mt-2 block text-warn">⚠ {f.reason}</span>}
    </>
  );
}

/** One measure row for the disclosures: label left, value right, definition on demand. */
function MeasureRow({ f }: { f: FeatureValue }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <InfoPopover label={`${f.label}: definition and source`} trigger={<span className={cx("text-label underline decoration-faint/50 decoration-dotted underline-offset-[3px]", f.value === null ? "text-faint" : "text-ink")}>{f.label}</span>}>
        <MeasureCard f={f} />
      </InfoPopover>
      <Measure value={f.value} unit={f.unit} digits={digitsFor(f)} missing="Unavailable" className={cx("text-num", f.value === null ? "text-faint" : "text-ink")} />
    </li>
  );
}

export function TerrainSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-x-4 gap-y-4">
      {KEY.map((k) => (
        <div key={k.key}>
          <div className="text-caption text-faint">{k.label}</div>
          <div className="mt-1.5 h-[26px] w-20 animate-pulse rounded-control bg-elevated motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * Terrain: four key figures (global-screen descriptors, median of the zone's 25 km cells), then
 * the full set and the whole-zone research measures on demand. Every value has its definition one
 * tap away; missing values read as missing, never as zero.
 */
export function Terrain({ tier1, zone, flags }: { tier1: FeatureValue[]; zone: FeatureValue[]; flags: QualityFlag[] }) {
  const byKey = Object.fromEntries(tier1.map((f) => [f.key, f]));
  const keys = KEY.map((k) => ({ ...k, f: byKey[k.key] as FeatureValue | undefined })).filter((k) => k.f);
  const gridFlag = flags.find((f) => f.code === "mola_grid_not_resolution");
  const otherFlags = flags.filter((f) => f !== gridFlag);
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        {keys.map(({ key, label, f }) => (
          <div key={key} className="min-w-0">
            <dt>
              <InfoPopover label={`${f!.label}: definition and source`}
                trigger={<span className="text-caption text-muted underline decoration-faint/50 decoration-dotted underline-offset-[3px] hover:text-ink">{label}</span>}>
                <MeasureCard f={f!} />
              </InfoPopover>
            </dt>
            <dd className="mt-0.5">
              <Measure value={f!.value} unit={f!.unit} digits={digitsFor(f!)} missing="Unavailable" className={cx("text-figure", f!.value === null ? "text-faint" : "text-ink")} />
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-caption text-faint">
        <Term k="globalScreen">Global-screen measures</Term> · median of 25 km cells in the zone ·{" "}
        {gridFlag ? (
          <InfoPopover label="MOLA grid: what 463 m means" trigger={<span className="underline decoration-faint/50 decoration-dotted underline-offset-[3px] hover:text-ink">MOLA 463 m grid</span>}>
            <span className="mb-1 block text-label text-ink">Grid spacing, not resolution</span>
            {gridFlag.message}
          </InfoPopover>
        ) : "MOLA 463 m grid"}
      </p>
      {otherFlags.map((f) => (
        <p key={f.code} className={cx("mt-1.5 text-caption", f.severity === "info" ? "text-muted" : f.severity === "warning" ? "text-warn" : "text-bad")}>
          {f.severity === "info" ? "ⓘ" : f.severity === "warning" ? "⚠" : "⊘"} {f.message}
        </p>
      ))}

      <div className="mt-2 space-y-0.5">
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

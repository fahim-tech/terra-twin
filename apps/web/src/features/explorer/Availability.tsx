import { Disclosure, Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import type { MarsAnalysis } from "../../types/contracts";
import { InfoPopover } from "./InfoPopover";

/** Short dot labels for the API's unavailable factors (unknown keys fall back to the API label). */
const SHORT: Record<string, string> = {
  thermal_inertia: "Thermal", geologic_unit: "Geology", water_ice: "Ice", surface_temperature: "Climate",
  rock_abundance: "Rocks", solar_energy: "Solar",
};
const ORDER = ["thermal_inertia", "geologic_unit", "water_ice", "surface_temperature", "rock_abundance", "solar_energy"];

function Dot({ on }: { on: boolean }) {
  return <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", on ? "bg-ink" : "ring-1 ring-inset ring-faint")} />;
}

/**
 * Evidence availability: one row of labelled dots (filled = connected, hollow = not connected), with
 * observation support as metadata (never a confidence) and the missing datasets on demand.
 */
export function Availability({ a }: { a: MarsAnalysis }) {
  const terrain = a.tier1_features.some((f) => f.value !== null) || a.ez_features.some((f) => f.value !== null);
  const os = a.observation_support;
  const factors = a.unavailable_factors.slice().sort((x, y) => (ORDER.indexOf(x.key) + 99) % 99 - (ORDER.indexOf(y.key) + 99) % 99);
  const missing = factors.filter((f) => f.value === null);
  return (
    <div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2.5" aria-label="Evidence availability">
        <li className="flex items-center gap-1.5 text-caption">
          <Dot on={terrain} /><span className={terrain ? "text-ink" : "text-faint"}>Terrain</span>
          <span className="sr-only">{terrain ? "available" : "not available"}</span>
        </li>
        <li className="flex items-center gap-1.5 text-caption">
          <Dot on={!!os} />
          {os ? (
            <InfoPopover label={`Observation support ${os.observed_fraction === null ? "not available" : `${Math.round(os.observed_fraction * 100)} percent`}: what it means`}
              trigger={<span className="flex items-baseline gap-1.5"><span className="text-ink underline decoration-faint/50 decoration-dotted underline-offset-[3px]">Observation support</span>
                <span className="num text-num-sm text-ink">{os.observed_fraction === null ? "—" : `${Math.round(os.observed_fraction * 100)}%`}</span></span>}>
              <span className="mb-1 block text-label text-ink">MOLA observation support</span>
              Share of 463 m bins in the zone with at least one laser return; the rest are interpolated.
              <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <span className="text-faint">Interpolated</span><span className="num text-num-sm text-ink">{os.interpolation_dependence === null ? "—" : `${Math.round(os.interpolation_dependence * 100)}%`}</span>
                <span className="text-faint">50 km window</span><span className="num text-num-sm text-ink">{os.observed_fraction_native_50km === null ? "—" : `${Math.round(os.observed_fraction_native_50km * 100)}%`}</span>
                <span className="text-faint">Mean shots/bin</span><span className="num text-num-sm text-ink">{os.mean_counts === null ? "—" : os.mean_counts.toFixed(2)}</span>
                <span className="text-faint">Counts grid</span><span>{os.source_grid}</span>
              </span>
              <span className="mt-2 block text-faint">{os.note}</span>
            </InfoPopover>
          ) : <span className="text-faint">Observation support</span>}
          <span className="sr-only">{os ? "available" : "not available"}</span>
        </li>
        {factors.map((f) => (
          <li key={f.key} className="flex items-center gap-1.5 text-caption">
            <Dot on={f.value !== null} />
            <span className={f.value !== null ? "text-ink" : "text-faint"}>{SHORT[f.key] ?? f.label}</span>
            <span className="sr-only">{f.value !== null ? "available" : "not connected"}</span>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <Disclosure summary="What's missing" className="mt-2">
          <ul className="space-y-1.5 pb-1">
            {missing.map((f) => (
              <li key={f.key} className="text-caption">
                <span className="text-ink">{f.label}</span> <span className="text-faint">— {f.reason ?? "no dataset connected"}</span>
              </li>
            ))}
          </ul>
          {os && (
            <p className="mt-2.5 text-caption text-faint">
              Earth candidates are compared through the <Term k="operator" />, built from this zone's laser-return pattern.
            </p>
          )}
        </Disclosure>
      )}
    </div>
  );
}

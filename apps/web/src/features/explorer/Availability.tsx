import { Disclosure, Term } from "../../components/primitives";
import type { MarsAnalysis } from "../../types/contracts";
import { InfoPopover } from "./InfoPopover";
import { Mark } from "./parts";
import { availabilityItems, type AvailItem } from "./readouts";

const pctText = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * Evidence availability as a status board: what is available and what is missing, each item a square
 * mark (filled = available, outlined = not connected) with its name. Observation support is metadata,
 * never a confidence; the missing datasets and their reasons are one disclosure away.
 */
export function Availability({ a }: { a: MarsAnalysis }) {
  const items = availabilityItems(a);
  const on = items.filter((i) => i.on);
  const off = items.filter((i) => !i.on);
  const missing = a.unavailable_factors.filter((f) => f.value === null);
  const os = a.observation_support;
  const row = (list: AvailItem[]) => (
    list.length === 0 ? <span className="text-caption text-faint">None</span> : (
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {list.map((i) => (
          <li key={i.key} className="flex items-center gap-1.5 text-caption">
            <Mark on={i.on} />
            {i.key === "observation_support" && os ? (
              <InfoPopover label={`Observation support ${os.observed_fraction === null ? "not available" : `${Math.round(os.observed_fraction * 100)} percent`}: what it means`}
                trigger={<span className="flex items-baseline gap-1.5"><span className="text-ink underline decoration-faint/50 decoration-dotted underline-offset-[3px]">{i.label}</span>
                  <span className="num text-num-sm text-ink">{pctText(os.observed_fraction)}</span></span>}>
                <span className="label-caps mb-1.5 block text-ink">MOLA observation support</span>
                Share of the zone's MOLA bins with at least one laser return; the rest are interpolated.
                <span className="mt-2.5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 border-t border-line pt-2.5">
                  <span className="kicker">Interpolated</span><span className="num text-num-sm text-ink">{pctText(os.interpolation_dependence)}</span>
                  <span className="kicker">50 km window</span><span className="num text-num-sm text-ink">{pctText(os.observed_fraction_native_50km)}</span>
                  <span className="kicker">Shots / bin</span><span className="num text-num-sm text-ink">{os.mean_counts === null ? "—" : os.mean_counts.toFixed(2)}</span>
                  <span className="kicker">Counts grid</span><span>{os.source_grid}</span>
                </span>
                <span className="mt-2 block text-faint">{os.note}</span>
              </InfoPopover>
            ) : <span className={i.on ? "text-ink" : "text-faint"}>{i.label}</span>}
            <span className="sr-only">{i.on ? "available" : i.key === "terrain" || i.key === "observation_support" ? "not available" : "not connected"}</span>
          </li>
        ))}
      </ul>
    )
  );
  return (
    <div>
      <dl className="grid grid-cols-[76px_1fr] items-start gap-x-3 gap-y-3" aria-label="Evidence availability">
        <dt className="kicker pt-px">Available</dt>
        <dd className="min-w-0">{row(on)}</dd>
        <dt className="kicker pt-px">Missing</dt>
        <dd className="min-w-0">{row(off)}</dd>
      </dl>
      {missing.length > 0 && (
        <Disclosure summary="What's missing" className="mt-2.5">
          <ul className="space-y-1.5 pb-1">
            {missing.map((f) => (
              <li key={f.key} className="flex gap-2.5 text-caption">
                <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 bg-faint" />
                <span><span className="text-ink">{f.label}</span> <span className="text-faint">— {f.reason ?? "no dataset connected"}</span></span>
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

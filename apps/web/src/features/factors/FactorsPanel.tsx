import { StatusMark } from "../../components/marks";
import { Disclosure } from "../../components/primitives";
import { cx } from "../../components/ui";
import { compactUnit, factorShortLabel, factorValue, STATUS_WORDS, temporalText, useMarsFactors, type FactorRecord } from "./factors";

/**
 * "Additional scientific layers": the GIS Mars factors at a point (thermal inertia, geologic unit, rock
 * abundance, surface temperature, water-ice potential, solar energy). Collapsed by default; each factor shows
 * its value with units, or its status and reason, and its source, resolution, time context and limitations on
 * demand. Characterization only: these never change a similarity score, a ranking or mission suitability.
 */
export function FactorsPanel({ lat, lon, className, open = false }: { lat: number; lon: number; className?: string; open?: boolean }) {
  const q = useMarsFactors({ lat, lon });
  const fs = q.data?.factors ?? [];
  const n = fs.filter((f) => f.status === "available").length;
  return (
    <section aria-label="Additional scientific layers" className={className}>
      <Disclosure defaultOpen={open} summary={<span>Additional scientific layers{q.data && <span className="num ml-2 text-faint">{n}/{fs.length} available</span>}</span>}>
        <div className="pt-1.5">
          <p className="text-caption text-faint">Mars characterization at this point. Never part of the similarity score, a ranking or mission suitability.</p>
          {q.isPending && <p role="status" className="py-1.5 text-caption text-faint">Loading layers…</p>}
          {q.isError && <p className="flex items-baseline gap-2 py-1.5 text-caption text-muted"><StatusMark state="struck" />Layers are not available here: {(q.error as Error).message}. Nothing is substituted.</p>}
          {fs.length > 0 && <ul className="mt-2 divide-y divide-line border-y border-line">{fs.map((f) => <Factor key={f.factor_id} f={f} />)}</ul>}
        </div>
      </Disclosure>
    </section>
  );
}

function Factor({ f }: { f: FactorRecord }) {
  const v = factorValue(f);
  const when = temporalText(f);
  const detail = [f.native_resolution, f.coverage].filter(Boolean);
  return (
    <li className="py-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
        <span className="min-w-0 text-caption text-muted">{f.label}</span>
        {v !== null
          ? <span className="num whitespace-nowrap text-right text-num-sm text-ink">{v}</span>
          : <span className={cx("flex items-baseline gap-1.5 text-caption", f.status === "error" ? "text-bad" : "text-faint")}>
              <StatusMark state={f.status === "error" ? "fault" : "struck"} />{STATUS_WORDS[f.status]}
            </span>}
      </div>
      {v === null && f.reason && <p className="mt-0.5 text-caption text-faint">{f.reason}</p>}
      {(f.source_id || f.citation || when || detail.length > 0 || (f.limitations?.length ?? 0) > 0) && (
        <Disclosure summary="Source and caveats" className="mt-0.5">
          <dl className="space-y-1 pb-1 text-caption text-muted">
            {f.citation && <div><dt className="sr-only">Citation</dt><dd>{f.citation}</dd></div>}
            {!f.citation && f.source_id && <div><dt className="sr-only">Source</dt><dd className="num">{f.source_id}</dd></div>}
            {when && <div><dt className="inline text-faint">Time · </dt><dd className="inline">{when}</dd></div>}
            {detail.map((d) => <div key={d}><dd>{d}</dd></div>)}
            {f.state && <div><dt className="inline text-faint">State · </dt><dd className="inline">{f.state}{f.measurement_kind ? ` · ${f.measurement_kind.replace(/_/g, " ")}` : ""}</dd></div>}
            {(f.limitations ?? []).map((l) => <div key={l}><dd className="border-l border-line-strong pl-2">{l}</dd></div>)}
          </dl>
        </Disclosure>
      )}
    </li>
  );
}

/**
 * One wrapped line of the Mars target's available factors for result headers (Earth, Compare): the figure
 * and unit only, with the rule that they are characterization, not similarity. Nothing when none is available.
 */
export function FactorsStrip({ lat, lon, className }: { lat: number; lon: number; className?: string }) {
  const q = useMarsFactors({ lat, lon });
  const on = (q.data?.factors ?? []).filter((f) => factorValue(f) !== null);
  if (on.length === 0) return null;
  return (
    <div className={cx("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-caption", className)} aria-label="Mars target, planetary context">
      <span className="kicker whitespace-nowrap text-[10px] text-faint">Mars context</span>
      {on.map((f) => (
        <span key={f.factor_id} className="whitespace-nowrap">
          <span className="text-muted">{factorShortLabel(f)} </span>
          <span className="num text-num-sm text-ink">{typeof f.value === "number" ? f.value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(f.value) >= 10 ? 0 : 2 }) : f.value}</span>
          {compactUnit(f.unit) && <span className="text-faint"> {compactUnit(f.unit)}</span>}
        </span>
      ))}
      <span className="basis-full text-faint">Characterization only, not in the score.</span>
    </div>
  );
}

/** Print-friendly table of every factor with value or status, source and resolution (report). */
export function FactorsTable({ lat, lon }: { lat: number; lon: number }) {
  const q = useMarsFactors({ lat, lon });
  if (q.isPending) return <p role="status" className="text-caption text-faint">Loading the Mars planetary context…</p>;
  if (q.isError) return <p className="text-caption text-muted">The Mars planetary context is not available here: {(q.error as Error).message}. Nothing is substituted.</p>;
  const fs = q.data?.factors ?? [];
  return (
    <div>
      <table className="w-full border-y border-line text-left text-caption">
        <thead><tr className="text-faint"><th className="py-1.5 pr-3 font-semibold uppercase tracking-[0.12em] text-[10px]">Factor</th><th className="py-1.5 pr-3 font-semibold uppercase tracking-[0.12em] text-[10px]">Value</th><th className="py-1.5 font-semibold uppercase tracking-[0.12em] text-[10px]">Source · resolution · time</th></tr></thead>
        <tbody className="divide-y divide-line">
          {fs.map((f) => {
            const v = factorValue(f);
            const when = temporalText(f);
            return (
              <tr key={f.factor_id} className="align-baseline">
                <td className="py-1.5 pr-3 text-muted">{f.label}</td>
                <td className="py-1.5 pr-3">{v !== null ? <span className="num text-ink">{v}</span> : <span className="text-faint">{STATUS_WORDS[f.status]}{f.reason ? ` — ${f.reason}` : ""}</span>}</td>
                <td className="py-1.5 text-faint">{[f.citation ?? f.source_id, f.native_resolution, when].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-faint">{(q.data?.rules ?? [])[0] ?? "Mars characterization only: never a similarity feature, weight or confidence."} Values at each product's native resolution, at the analysed Mars point.</p>
    </div>
  );
}

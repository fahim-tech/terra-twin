import { StatusMark } from "../../components/marks";
import { Disclosure } from "../../components/primitives";
import { cx } from "../../components/ui";
import { factorValue, STATUS_WORDS, temporalText, useMarsFactors, type FactorRecord } from "./factors";

/**
 * "Additional scientific layers": the GIS Mars factors at a point (thermal inertia, geologic unit, rock
 * abundance, surface temperature, water-ice potential, solar energy). Collapsed by default; each factor shows
 * its value with units, or its status and reason, and its source, resolution, time context and limitations on
 * demand. Characterization only: these never change a similarity score, a ranking or mission suitability.
 */
export function FactorsPanel({ lat, lon, className }: { lat: number; lon: number; className?: string }) {
  const q = useMarsFactors({ lat, lon });
  const fs = q.data?.factors ?? [];
  const n = fs.filter((f) => f.status === "available").length;
  return (
    <section aria-label="Additional scientific layers" className={className}>
      <Disclosure summary={<span>Additional scientific layers{q.data && <span className="num ml-2 text-faint">{n}/{fs.length}</span>}</span>}>
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

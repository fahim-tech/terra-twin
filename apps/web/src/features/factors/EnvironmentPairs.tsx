import { cx } from "../../components/ui";
import { useContextPoint } from "../../services/gis";
import { environmentRows } from "./environment";
import { useMarsFactors } from "./factors";

/**
 * "Beyond terrain": the Mars target's planetary-context factors beside the Earth candidate's climate, ice and
 * cover records. Characterization only: never scored, never part of S.
 */
export function EnvironmentPairs({ mars, earth, bareFraction = null, className }: {
  mars: { lat: number; lon: number }; earth: { lat: number; lon: number }; bareFraction?: number | null; className?: string;
}) {
  const fq = useMarsFactors(mars);
  const eq = useContextPoint("earth", earth);
  if (fq.isError && eq.isError) return null; // GIS not connected here: the section is simply absent
  const rows = environmentRows(fq.data?.factors, eq.data, bareFraction);
  const loading = fq.isPending || eq.isPending;
  return (
    <section aria-label="Beyond terrain: Mars target and Earth candidate" className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h4 className="kicker text-ink">Beyond terrain · side by side</h4>
        <span className="text-caption text-faint">context · not in the score</span>
      </div>
      <table className="w-full border-y border-line text-left text-caption">
        <thead>
          <tr className="text-faint">
            <th scope="col" className="w-[21%] py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em]">Dimension</th>
            <th scope="col" className="w-[33%] py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-mars">Mars target</th>
            <th scope="col" className="py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-earth">Earth candidate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.dim} className="align-top">
              <th scope="row" className="py-1.5 pr-3 font-normal text-muted">{r.dim}</th>
              <td className="py-1.5 pr-3 text-ink">{loading && r.mars === "no record" ? "…" : r.mars}</td>
              <td className="py-1.5 text-ink">
                {loading && r.earth === "no record" ? "…" : r.earth}
                {r.reading && (
                  <span className={cx("mt-0.5 block", r.tone === "breaks" ? "text-warn" : r.tone === "holds" ? "text-ink/80" : "text-faint")}>
                    {r.tone === "breaks" ? "Analogy breaks: " : r.tone === "holds" ? "Analogy holds: " : ""}{r.reading}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-caption text-faint">Each value is its product's native pixel at the window centre. The two planets' products measure different things, so these rows characterize the pair; they never change S.</p>
    </section>
  );
}

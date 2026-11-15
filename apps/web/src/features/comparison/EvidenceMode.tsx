import { Disclosure, Kicker, Measure } from "../../components/primitives";
import { CompareTerm as Term } from "./CompareTerm";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import { useApp } from "../../store/app";
import type { AnalogSearch } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import { measuresLabel, notLoadedReasons, robustness } from "./model";
import { TIER2_LABELS } from "./science";

type Rep = "mars_observation_space" | "as_measured";

/**
 * Evidence mode: the two Earth representations side by side as a switch (G5 strings verbatim),
 * what each one scores, which per-descriptor values are not loaded and why, and robustness.
 */
export function EvidenceMode({ search, c }: { search: AnalogSearch; c: CandidateView }) {
  const representation = useApp((s) => s.representation);
  const set = useApp((s) => s.set);
  const t2 = search.tier2;
  const base = t2.as_measured_baseline;
  const rob = robustness(search);
  const reasons = notLoadedReasons(c);
  const em = c.t2?.features?.earth_as_measured ?? null;

  if (c.tier === 1) {
    return (
      <div className="max-w-[760px] space-y-3 text-body text-muted">
        <p className="text-ink">This is a global-screen cell. It has no research comparison: no 50 km window was re-observed the way MOLA saw the Mars site.</p>
        <p>Refining new screening cells needs on-demand extraction and the target's MOLA observation model, which are not connected.</p>
        {t2.live_refinement.missing_inputs.length > 0 && (
          <Disclosure summary="What is missing">
            <ul className="space-y-1">
              {t2.live_refinement.missing_inputs.map((m) => <li key={m} className="font-mono text-num-sm text-muted">{m}</li>)}
            </ul>
          </Disclosure>
        )}
        <p className="text-caption text-faint">{G5.scale}</p>
      </div>
    );
  }

  const options: { value: Rep; title: string; figure: number | null; who: string; note: string }[] = [
    {
      value: "mars_observation_space", title: G5.toggleOom, figure: c.score,
      who: c.label, note: `Research record · rotation 0°, equal weights${measuresLabel(c) ? ` · ${measuresLabel(c)}` : ""}`,
    },
    {
      value: "as_measured", title: G5.toggleMeasured, figure: base?.S ?? null,
      who: base ? `Comparator leader: ${base.leader}` : "No uncorrected comparator in the record",
      note: base?.label ?? "Uncorrected comparator. Not a fallback.",
    },
  ];

  return (
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <Kicker className="mb-2">Earth representation</Kicker>
        <div role="radiogroup" aria-label="Earth terrain representation" className="space-y-2">
          {options.map((o) => {
            const on = representation === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => set({ representation: o.value })}
                className={cx("hit flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors duration-150 active:scale-[0.99]",
                  on ? "bg-elevated shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "hover:bg-elevated/60")}>
                <span aria-hidden className={cx("mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ring-1 ring-inset", on ? "ring-ink" : "ring-faint")}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-label", on ? "text-ink" : "text-muted")}>{o.title}</span>
                  <span className="mt-0.5 block text-caption text-muted">{o.who}</span>
                  <span className="mt-0.5 block text-caption text-faint">{o.note}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-caption text-faint">S</span>
                  <Measure value={o.figure} digits={3} className="text-title font-normal text-ink" />
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-caption text-faint">
          The decision and the headline score use the first representation (<Term k="operator" />). The second is shown for contrast only.
        </p>
      </div>

      <div className="space-y-4">
        <section aria-label="Per-descriptor research values">
          <Kicker className="mb-1.5">Per-descriptor values · 50 km window</Kicker>
          <table className="w-full text-left text-caption">
            <thead className="text-faint">
              <tr>
                <th scope="col" className="py-1 font-normal">Descriptor</th>
                <th scope="col" className="py-1 text-right font-normal">Mars</th>
                <th scope="col" className="py-1 text-right font-normal">Earth<span className="max-sm:sr-only">{representation === "as_measured" ? " · as measured" : " · as MOLA would observe it"}</span></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(TIER2_LABELS).map(([k, l]) => (
                <tr key={k} className="border-t border-line/60">
                  <td className="py-1 text-ink">{l.label}</td>
                  <td className="py-1 text-right text-faint">not loaded</td>
                  <td className="py-1 text-right">
                    {representation === "as_measured" ? <Measure value={em?.[k] ?? null} unit={l.unit} missing="not loaded" className="text-num" /> : <span className="text-faint">not loaded</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-2 space-y-1 text-caption text-muted">
            <li><span className="text-ink">Mars:</span> {reasons.mars}</li>
            {representation === "mars_observation_space" && <li><span className="text-ink">Earth as MOLA would observe it:</span> {reasons.earthOom}</li>}
            {representation === "as_measured" && <li><span className="text-ink">Earth as measured:</span> Copernicus GLO-90 window on the 463 m grid, from the research record.</li>}
          </ul>
        </section>

        <section aria-label="Robustness">
          <Kicker className="mb-1.5">Robustness</Kicker>
          {rob ? (
            <ul className="space-y-1 text-caption text-muted">
              {rob.leaderSame50vs25 !== null && (
                <li className="text-ink">{rob.leaderSame50vs25 ? "⚠ Leader is the same at 25 km windows" : "⚠ Leader differs at 25 km windows (all 39 zones)"}
                  {rob.spearman50vs25 !== null && <span className="text-muted"> · rank agreement <span className="num">ρ {rob.spearman50vs25.toFixed(2)}</span></span>}
                </li>
              )}
              {rob.leaderChangedVsBaseline !== null && (
                <li>{rob.leaderChangedVsBaseline ? "Observation matching changes the leader versus the as-measured comparison" : "Same leader with and without observation matching"}
                  {rob.spearmanBaselineVsOom !== null && <> · <span className="num">ρ {rob.spearmanBaselineVsOom.toFixed(2)}</span></>}
                  {rob.top10Overlap !== null && <> · top-10 overlap <span className="num">{rob.top10Overlap}</span></>}
                </li>
              )}
              <li className="text-faint">{rob.note ?? "Ungated research diagnostics."} {G5.scale}.</li>
            </ul>
          ) : <p className="text-caption text-faint">No robustness diagnostics in the record. {G5.scale}.</p>}
        </section>

        <p className="text-caption text-muted"><span className="text-ink">Validation.</span> {G5.validation}.</p>
      </div>
    </div>
  );
}

import { SFigure, StatusMark } from "../../components/marks";
import { Disclosure, Measure, radioGroupKeys } from "../../components/primitives";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import { useApp } from "../../store/app";
import type { AnalogSearch } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import { CompareTerm as Term } from "./CompareTerm";
import { PlanetMark, SectionRule } from "./marks";
import { earthName, keepFigures, measuresLabel, molaGridText, notLoadedReasons, poolKindShort, robustness } from "./model";
import { TIER2_LABELS } from "./science";

type Rep = "mars_observation_space" | "as_measured";

/**
 * Evidence mode: the two Earth representations as a square radio switch (G5 strings verbatim), what each
 * one scores, which per-descriptor values are not loaded and why, and robustness.
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
        <p className="text-ink">This is a global-screen cell. It has no research comparison: no {t2.target.window_km} km window was re-observed the way MOLA saw the Mars site.</p>
        <p>Refining new screening cells needs on-demand extraction and the target&rsquo;s MOLA observation model, which are not connected.</p>
        {t2.live_refinement.missing_inputs.length > 0 && (
          <Disclosure summary="What is missing">
            <ul className="space-y-1 border-l border-line pl-3">
              {t2.live_refinement.missing_inputs.map((m) => <li key={m} className="font-mono text-num-sm text-muted">{m}</li>)}
            </ul>
          </Disclosure>
        )}
        <p className="text-caption text-faint">{G5.scale}</p>
      </div>
    );
  }

  // The window's name and pool stratum as Compare names it everywhere ("Window 233 · stratified random · roughness decile 8").
  const en = earthName(c);
  const isRandom = /^rand_d\d_\d+$/.test(c.t2?.id ?? "");
  const subLine = isRandom ? en.sub : poolKindShort(c.t2?.kind);
  const whoLine = subLine ? `${en.name} · ${subLine.charAt(0).toLowerCase()}${subLine.slice(1)}` : en.name;
  const options: { value: Rep; title: string; figure: number | null; who: string; note: string }[] = [
    {
      value: "mars_observation_space", title: G5.toggleOom, figure: c.score,
      who: whoLine, note: keepFigures(`Research record · rotation 0°, equal weights${measuresLabel(c) ? ` · ${measuresLabel(c)}` : ""}`),
    },
    {
      value: "as_measured", title: G5.toggleMeasured, figure: base?.S ?? null,
      who: base ? `Comparator leader: ${base.leader}` : "No uncorrected comparator in the record",
      note: base?.label ?? "Uncorrected comparator. Not a fallback.",
    },
  ];

  return (
    <div className="grid gap-x-10 gap-y-6 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <SectionRule title="Earth representation" as="h4" className="mb-2.5" />
        <div role="radiogroup" aria-label="Earth terrain representation" className="border border-line-strong"
          onKeyDown={radioGroupKeys(options.map((o) => o.value), representation, (v) => set({ representation: v }))}>
          {options.map((o, i) => {
            const on = representation === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => set({ representation: o.value })}
                className={cx("hit relative flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors duration-150 active:duration-0 focus-visible:z-10",
                  i > 0 && "border-t border-line-strong",
                  on ? "bg-white/[0.05]" : "hover:bg-white/[0.03] active:bg-white/[0.07]")}>
                {/* Selected: an ink bar on the leading edge and the radio square filled (on), outlined when off. Never
                    two nested squares, which is the tie's outcome mark. */}
                {on && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
                <span aria-hidden className={cx("mt-[3px] h-2.5 w-2.5 shrink-0", on ? "bg-ink" : "ring-1 ring-inset ring-faint")} />
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-label", on ? "text-ink" : "text-muted")}>{o.title}</span>
                  <span className="mt-0.5 block text-caption text-muted">{o.who}</span>
                  <span className="mt-0.5 block text-caption text-faint">{o.note}</span>
                </span>
                <SFigure value={o.figure} className={cx("shrink-0 self-center text-[20px] leading-none", on ? "text-ink" : "text-muted")} />
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-caption text-faint">
          The decision and the headline score use the first representation <span className="whitespace-nowrap">(<Term k="operator" />)</span>. The second is shown for contrast only.
        </p>
      </div>

      <div className="space-y-6">
        <section aria-label="Per-descriptor research values">
          <SectionRule title="Per-descriptor values" as="h4" aside={<span className="num text-[11px]">{c.t2?.window_km ?? t2.target.window_km} km window</span>} className="mb-1.5" />
          <table className="w-full text-left text-caption">
            <thead>
              <tr className="border-b border-line-strong">
                <th scope="col" className="kicker py-1.5 font-semibold">Descriptor</th>
                <th scope="col" className="kicker py-1.5 text-right font-semibold"><span className="inline-flex items-center gap-1.5"><PlanetMark planet="mars" />Mars</span></th>
                <th scope="col" className="kicker py-1.5 pl-3 text-right font-semibold">
                  <span className="inline-flex items-center gap-1.5"><PlanetMark planet="earth" />Earth</span>
                  <span className="max-sm:sr-only normal-case tracking-normal font-normal">{representation === "as_measured" ? " · as measured" : " · as MOLA would observe it"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(TIER2_LABELS).map(([k, l]) => (
                <tr key={k} className="border-t border-line first:border-t-0">
                  <td className="py-1.5 text-label text-ink">{l.label}</td>
                  <td className="py-1.5 text-right text-faint">not loaded</td>
                  <td className="py-1.5 pl-3 text-right">
                    {representation === "as_measured" ? <Measure value={em?.[k] ?? null} unit={l.unit} missing="not loaded" className="text-num" /> : <span className="text-faint">not loaded</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-caption">
            <Reason term="Mars">{reasons.mars}</Reason>
            {representation === "mars_observation_space" && <Reason term="Earth · MOLA view">{reasons.earthOom}</Reason>}
            {representation === "as_measured" && <Reason term="Earth · measured">Copernicus GLO-90 window on {molaGridText(search)}, from the research record.</Reason>}
          </dl>
        </section>

        <section aria-label="Robustness">
          <SectionRule title="Robustness" as="h4" className="mb-2" />
          {rob ? (
            <ul className="space-y-1.5 text-caption text-muted">
              {rob.lines.map((l) => (
                <li key={l.key} className={cx("flex items-baseline gap-2.5", l.caution && "text-ink")}>
                  {/* Only a caution carries a mark; a plain fact keeps the indent (an outlined square would read "off"). */}
                  {l.caution
                    ? <StatusMark state="caution" size={7} className="translate-y-[-1px]" />
                    : <span aria-hidden className="w-[7px] shrink-0" />}
                  <span>
                    {l.caution && <span className="kicker mr-2 !text-warn">Caution</span>}
                    {l.text}
                    {l.figure && <span className="text-muted"> · <span className="num">{l.figure}</span></span>}
                  </span>
                </li>
              ))}
              <li className="pl-[17px] text-faint">{rob.note ? `${rob.note} ` : ""}{G5.scale}.</li>
            </ul>
          ) : <p className="text-caption text-faint">No robustness diagnostics in the record. {G5.scale}.</p>}
        </section>

        <dl className="text-caption"><Reason term="Validation">{G5.validation}.</Reason></dl>
      </div>
    </div>
  );
}

/** A labelled line; every one in this mode shares the same label column, so the texts align. */
function Reason({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[148px_minmax(0,1fr)] gap-x-3 gap-y-0.5 @max-[560px]:grid-cols-1">
      <dt className="kicker pt-px">{term}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

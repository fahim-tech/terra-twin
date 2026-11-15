import type { ComponentType } from "react";
import { Disclosure, Term, Toponym } from "../../components/primitives";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import type { AnalogSearch, Tier2Candidate } from "../../types/contracts";
import { coord, decisionMembers, measuresOf, parseWindowId, prettyWindow, researchWindowKm, shortWindow, T2_MEASURES, unorderedMembers } from "./candidates";
import { Readout, Readouts, rowClass, SectionHead, SelectionBar } from "./instruments";
import { measuresText, sSpoken, sText } from "./readout";
import { ReliefSlot, type ReliefSlotProps } from "./ReliefSlot";
import { chooseCandidate, switchTier } from "./tierMemory";
import { decisionLabel, DecisionHead, OperatorStatus } from "./Verdict";

/**
 * Instrument-table columns for research windows: name · position · figure. The figure is the score with its
 * measures, "0.718 · 8/8", written as everywhere else in the app (one column, so its label never crowds).
 * Fixed figure columns, so the label row and every list share one grid (8 rem holds "25.16° N 102.38° W" in
 * 11.5 px mono). Names wrap instead of truncating: a tie member is often a named analog ("Holuhraun lava
 * field"), and its name must never be cut.
 * Phones drop the label row (the whole tied set should fit at half height) and print "S" in the cell instead.
 * Below 380 px the name column would squeeze "Window 233" onto two lines, so there the position moves under
 * the name instead and the name keeps the full width beside its figure.
 */
const WINDOW_ROW = cx(
  "grid grid-cols-[minmax(0,1fr)_8rem_5.5rem] items-baseline gap-x-2.5 pl-3 pr-3",
  // Disjoint ranges: Tailwind emits arbitrary breakpoints before named ones, so overlapping max-* rules would lose.
  "max-md:min-[380px]:grid-cols-[minmax(0,1fr)_7.75rem_6.25rem] max-md:min-[380px]:gap-x-2",
  "max-[379px]:grid-cols-[minmax(0,1fr)_auto] max-[379px]:gap-x-3 max-[379px]:gap-y-0.5",
);

function windowName(c: Tier2Candidate): { name: string; sub: string | null } {
  const w = parseWindowId(c.id);
  return w ? { name: shortWindow(c.id), sub: `Research pool · roughness decile ${w.decile}` } : { name: c.id, sub: c.kind && c.kind !== "random" ? c.kind : null };
}

/** Column labels (visual only: every row button carries its full accessible name). The figure label end-aligns with the figures. */
function WindowTableHead() {
  return (
    <div aria-hidden className={cx(WINDOW_ROW, "kicker border-b border-line py-1.5 max-md:hidden")}>
      <span>Window</span><span>Position</span><span className="justify-self-end whitespace-nowrap">S · Meas.</span>
    </div>
  );
}

function WindowRow({ c, on, onPick }: { c: Tier2Candidate; on: boolean; onPick: () => void }) {
  const { name } = windowName(c);
  return (
    <li>
      <button type="button" onClick={onPick} aria-pressed={on}
        aria-label={`${name}, ${coord(c.lat, c.lon)}, similarity ${sSpoken(c.S)}, ${measuresOf(c.coverage, T2_MEASURES) ?? "unknown"} of ${T2_MEASURES} measures`}
        className={rowClass(on, cx(WINDOW_ROW, "py-2.5 max-[379px]:py-2"))}>
        {on && <SelectionBar layoutId="t2-selection" />}
        <span className={cx("min-w-0 break-words text-label", on ? "text-earth" : "text-ink")}>{name}</span>
        <span className="num whitespace-nowrap text-num-sm text-muted max-[379px]:col-start-1 max-[379px]:row-start-2">{coord(c.lat, c.lon)}</span>
        <span className="num whitespace-nowrap text-right max-[379px]:col-start-2 max-[379px]:row-start-1">
          <span aria-hidden className="text-num text-faint md:hidden">S </span><span className="text-num text-ink">{sText(c.S)}</span>
          <span className="text-num-sm text-faint"> · {measuresText(c.coverage, T2_MEASURES)}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * The named leader: its name and position (selectable) beside the figure "S 0.614" and its measures. The
 * figure holds glossary terms (buttons of their own), so it sits beside the row button, not inside it; the
 * row itself carries the selected and hover fill, so both halves light together.
 */
function LeaderRow({ c, on, onPick }: { c: Tier2Candidate; on: boolean; onPick: () => void }) {
  const w = windowName(c);
  return (
    <div className={cx("relative grid grid-cols-[minmax(0,1fr)_auto] border-t border-line transition-colors duration-150",
      on ? "bg-white/[0.06]" : "[&:has(>button:hover)]:bg-white/[0.035] [&:has(>button:active)]:bg-white/[0.08] [&:has(>button:active)]:duration-0")}>
      {on && <SelectionBar layoutId="t2-selection" />}
      <button type="button" onClick={onPick} aria-pressed={on} className="hit w-full py-3 pl-3 pr-2 text-left"
        aria-label={`${w.name}, ${coord(c.lat, c.lon)}${w.sub ? `, ${w.sub}` : ""}, similarity ${sSpoken(c.S)}, ${measuresOf(c.coverage, T2_MEASURES) ?? "unknown"} of ${T2_MEASURES} measures`}>
        <Toponym as="span" size="sm" className={cx("block", on && "!text-earth")}>{w.name}</Toponym>
        <span className="num mt-1.5 block text-num-sm text-muted">{coord(c.lat, c.lon)}</span>
        {w.sub && <span className="mt-0.5 block text-caption text-faint">{w.sub}</span>}
      </button>
      <div className="flex flex-col items-end justify-center py-3 pl-2 pr-3">
        <span className="num flex items-baseline gap-1.5 whitespace-nowrap leading-none">
          <span className="text-num text-muted"><Term k="similarity">S</Term></span>
          <span className="text-[26px] tracking-[-0.01em] text-ink">{sText(c.S)}</span>
        </span>
        <span className="mt-2 whitespace-nowrap text-caption text-muted">
          <span className="num text-num-sm text-ink">{measuresText(c.coverage, T2_MEASURES)}</span> <Term k="measures">measures</Term>
        </span>
      </div>
    </div>
  );
}

/**
 * Stage 1 — the published research comparison for this zone (tier 2, OOM, fixed research pool).
 * `relief` is the slot for a 3D relief preview of the selected window (see ReliefSlot); it renders nothing yet.
 */
export function ResearchStage({ search, candidateId, relief: Relief = ReliefSlot }: {
  search: AnalogSearch; candidateId: string | null; relief?: ComponentType<ReliefSlotProps>;
}) {
  const t2 = search.tier2;
  const d = t2.decision;
  const label = decisionLabel(t2);
  const members = decisionMembers(t2);
  const others = t2.candidates.filter((c) => !d.members.includes(c.id) && c.lat !== null);
  const pool = t2.candidate_pool as (NonNullable<typeof t2.candidate_pool> & { n_ranked?: number }) | null;
  const gate = t2.landcover_gate;
  const winKm = researchWindowKm(search);
  const pick = (c: Tier2Candidate) => chooseCandidate(`t2:${c.id}`);
  const isOn = (c: Tier2Candidate) => candidateId === `t2:${c.id}`;
  const selected = t2.candidates.find(isOn) ?? null;
  const leader = d.type === "named_leader" ? members[0] : undefined;

  return (
    <section aria-labelledby="stage-research" className="pb-2">
      {/* The tab above names the stage; this line states only its basis. */}
      <p className="text-caption text-faint"><span id="stage-research" className="sr-only">Research comparison: </span>{winKm !== null ? `${winKm} km windows · ` : ""}Earth as MOLA would observe it</p>

      {/* Phones hide the rule (kept for screen readers): the status block is self-evidently the decision, and the
          members must fit at half height. */}
      <SectionHead index="01" className="mt-4 max-md:sr-only">Decision</SectionHead>
      {/* Status block: annunciator, what the decision is about (leader or tied members), then the research
          label (G5 verbatim) and its caveats. */}
      <div className="mt-2.5 border border-line-strong max-md:mt-3">
        <DecisionHead t2={t2} />

        {leader && <LeaderRow c={leader} on={isOn(leader)} onPick={() => pick(leader)} />}

        {d.type === "tied_set" && (
          <div role="group" aria-label={`${members.length} tied research windows, not ranked against each other, listed west to east`} className="border-t border-line">
            <WindowTableHead />
            <ul className="divide-y divide-line">
              {unorderedMembers(members).map((c) => <WindowRow key={c.id} c={c} on={isOn(c)} onPick={() => pick(c)} />)}
            </ul>
          </div>
        )}

        <div className="space-y-1.5 border-t border-line px-3 py-2.5 text-caption text-muted">
          {label && <p className="text-ink/80">{label}</p>}
          {(d.type === "insufficient_evidence" || d.type === "no_convincing_analog") && (
            <p>
              {t2.operator.status !== "ok"
                ? "No similarity score is shown: the MOLA observation model is unavailable here, and the uncorrected comparison is not substituted."
                : "No research window is named."}
              {search.tier1 && <> The <button type="button" className="text-ink underline decoration-faint underline-offset-2 hover:decoration-ink" onClick={() => switchTier(1)}>global screen</button> still lists comparable cells.</>}
            </p>
          )}
          {d.type === "tied_set" && (
            <p>
              Listed west to east. Equivalent at this resolution — none is preferred, so none is pre-selected.
              Scores use <Term k="measures">{T2_MEASURES} measures</Term>; validated on <Term k="synthetic">synthetic twins only</Term>.
            </p>
          )}
          {leader && <p>Validated on <Term k="synthetic">synthetic twins only</Term>.</p>}
        </div>
      </div>

      {selected && <Relief search={search} candidate={selected} windowKm={researchWindowKm(search, selected)} />}

      <SectionHead index="02" className="mt-6">Basis</SectionHead>
      <Readouts className="mt-2.5" label="Basis of the research comparison">
        <Readout label="Window">{winKm !== null ? <Term k="scale"><span className="num">{winKm}</span> km windows</Term> : "Not stated in the record"}</Readout>
        <Readout label="Observation"><OperatorStatus t2={t2} /></Readout>
        {pool && (
          <Readout label="Pool">
            <span className="num text-ink">{pool.n_ranked ?? pool.n_windows}</span> of <span className="num">{pool.n_windows}</span> windows ranked
            {gate?.mode === "exclude" ? " — those that pass the land-cover filter" : gate ? " · land cover reported, not used to exclude" : ""}
          </Readout>
        )}
        {gate && (
          <Readout label={<Term k="landCover">Land cover</Term>}>
            {gate.mode === "exclude" ? "Applied before ranking" : "Reported only, never excludes"} · bare ≥ <span className="num">{gate.bare_min.toFixed(2)}</span>
            {" "}· vegetated ≤ <span className="num">{gate.veg_max.toFixed(2)}</span> · working hypotheses
          </Readout>
        )}
        <Readout label="Scope"><Term k="scope" /></Readout>
      </Readouts>

      {others.length > 0 && (
        <>
          <SectionHead index="03" className="mt-6" aside={others.length}>Other windows</SectionHead>
          <p className="mt-1.5 text-caption text-muted">Context, not part of the decision.</p>
          <div className="mt-2 border-y border-line">
            <WindowTableHead />
            <ul aria-label="Other research windows, context only" className="divide-y divide-line">
              {others.map((c) => <WindowRow key={c.id} c={c} on={isOn(c)} onPick={() => pick(c)} />)}
            </ul>
          </div>
        </>
      )}

      {t2.as_measured_baseline && (
        <Disclosure className="mt-4" summary="Uncorrected comparator">
          <p className="mb-2.5 text-caption text-muted">
            The score above uses “{G5.toggleOom}”. For contrast, the uncorrected comparison with Earth terrain {G5.toggleMeasured}:
          </p>
          <div className="border border-line">
            <p className="border-b border-line px-3 py-1.5 text-caption text-muted">Earth terrain: {G5.toggleMeasured}</p>
            <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
              <span className="truncate text-label text-ink">{prettyWindow(t2.as_measured_baseline.leader)}</span>
              <span className="num shrink-0 text-num text-ink">S {sText(t2.as_measured_baseline.S)}
                <span className="text-faint"> · {measuresText(t2.as_measured_baseline.coverage, T2_MEASURES)}</span></span>
            </div>
            <p className="border-t border-line px-3 py-2 text-caption text-muted">{t2.as_measured_baseline.label}</p>
          </div>
        </Disclosure>
      )}
    </section>
  );
}

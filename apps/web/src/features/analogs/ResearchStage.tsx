import { Disclosure, Term, Toponym } from "../../components/primitives";
import { reliefWindowId } from "../../components/relief";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import { useEarthPool } from "../../services/api";
import type { AnalogSearch, Tier2Candidate } from "../../types/contracts";
import { coord, decisionMembers, measuresOf, parseWindowId, prettyWindow, researchWindowKm, shortWindow, T2_MEASURES, unorderedMembers } from "./candidates";
import { Readout, Readouts, rowClass, SectionHead, SelectionBar } from "./instruments";
import { measuresText, sSpoken, sText } from "./readout";
import { ReliefSlot } from "./ReliefSlot";
import { chooseCandidate, switchTier } from "./tierMemory";
import { decisionLabel, DecisionHead, OperatorStatus } from "./Verdict";

/**
 * Instrument-table columns for research windows: name · position · figure. The figure is the score with its
 * measures, "0.718 · 8/8", written as everywhere else in the app (one column, so its label never crowds).
 * Fixed figure columns, so the label row and every list share one grid (8 rem holds "25.16° N 102.38° W" in
 * 11.5 px mono). Names wrap instead of truncating: a tie member is often a named analog ("Holuhraun lava
 * field"), and its name must never be cut.
 * Phones drop the label row (the whole tied set should fit at half height) and print "S" in the cell instead.
 * Below the xs breakpoint (380 px) the name column would squeeze "Window 233" onto two lines, so there each
 * row is one line, name and figure; the coordinates stay in the row's accessible name and on the globe.
 */
const WINDOW_ROW = cx(
  "grid grid-cols-[minmax(0,1fr)_8rem_5.5rem] items-baseline gap-x-2.5 pl-3 pr-3",
  // Named breakpoints only (foundation-api.md): xs ≤ width < md is the phone grid, below xs one line.
  "xs:max-md:grid-cols-[minmax(0,1fr)_7.75rem_6.25rem] xs:max-md:gap-x-2",
  "max-xs:grid-cols-[minmax(0,1fr)_auto] max-xs:gap-x-3",
);

function windowName(c: Tier2Candidate): { name: string; sub: string | null } {
  const w = parseWindowId(c.id);
  return w ? { name: shortWindow(c.id), sub: `Research pool · roughness decile ${w.decile}` } : { name: c.id, sub: c.kind && c.kind !== "random" ? c.kind : null };
}

/**
 * Column labels (visual only: every row button carries its full accessible name). The figure label end-aligns
 * with the figures. Over a tied set the location column says the listing order and the figure column says it
 * is no rank, so the eye never reads the rows as places 1-2-3; `basis` names the orientation of S.
 */
function WindowTableHead({ tie = false, basis }: { tie?: boolean; basis?: string | null }) {
  return (
    <div aria-hidden className={cx(WINDOW_ROW, "kicker border-b border-line py-1.5 max-md:hidden")}>
      {/* Over a tie the order note spans the name and location columns, so it never runs into the figure label. */}
      {tie ? <span className="col-span-2 whitespace-nowrap">Window · location · west → east</span> : <><span>Window</span><span>Location</span></>}
      <span className="justify-self-end whitespace-nowrap">{tie ? (basis ? `S at ${basis}` : "S · no rank") : "S · Meas."}</span>
    </div>
  );
}

/** The orientation S was computed at ("0°"), from the record's S_basis ("rotation 0°, equal weights"), else null. */
function sBasisAngle(c: Tier2Candidate | undefined): string | null {
  const b = (c as { S_basis?: unknown } | undefined)?.S_basis;
  const m = typeof b === "string" ? /rotation\s+(-?\d+(?:\.\d+)?°)/.exec(b) : null;
  return m ? m[1] : null;
}

function WindowRow({ c, on, onPick }: { c: Tier2Candidate; on: boolean; onPick: () => void }) {
  const { name } = windowName(c);
  return (
    <li>
      <button type="button" onClick={onPick} aria-pressed={on}
        aria-label={`${name}, ${coord(c.lat, c.lon)}, similarity ${sSpoken(c.S)}, ${measuresOf(c.coverage, T2_MEASURES) ?? "unknown"} of ${T2_MEASURES} measures`}
        className={rowClass(on, cx(WINDOW_ROW, "py-2.5 max-md:py-2"))}>
        {on && <SelectionBar layoutId="t2-selection" />}
        <span className={cx("min-w-0 break-words text-label", on ? "text-earth" : "text-ink")}>{name}</span>
        <span className="num whitespace-nowrap text-num-sm text-muted max-xs:hidden">{coord(c.lat, c.lon)}</span>
        <span className="num whitespace-nowrap text-right">
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
      <button type="button" onClick={onPick} aria-pressed={on} className="hit w-full py-3 pl-3 pr-2 text-left max-md:py-2.5"
        aria-label={`${w.name}, ${coord(c.lat, c.lon)}${w.sub ? `, ${w.sub}` : ""}, similarity ${sSpoken(c.S)}, ${measuresOf(c.coverage, T2_MEASURES) ?? "unknown"} of ${T2_MEASURES} measures`}>
        <Toponym as="span" size="sm" className={cx("block", on && "!text-earth")}>{w.name}</Toponym>
        <span className="num mt-1.5 block text-num-sm text-muted max-md:mt-1">{coord(c.lat, c.lon)}</span>
        {w.sub && <span className="mt-0.5 block text-caption text-faint">{w.sub}</span>}
      </button>
      <div className="flex flex-col items-end justify-center py-3 pl-2 pr-3 max-md:py-2.5">
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
 * Stage 1 — the published research comparison for this zone (tier 2, OOM, fixed research pool). A selected
 * window that the research pool lists gets its 3D terrain relief under the decision (ReliefSlot); section
 * numbers follow the sections shown, without gaps.
 */
export function ResearchStage({ search, candidateId }: { search: AnalogSearch; candidateId: string | null }) {
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
  // The relief is keyed on the research-pool window id: exactly the record's id, and only when the pool lists it.
  const earthPool = useEarthPool();
  const reliefId = selected ? reliefWindowId({ tier: 2, t2: selected }, earthPool.data) : null;
  // While the research pool is still loading, a selected window keeps its relief section (and its index) in
  // place with a loading line, so the sections below never renumber or jump when the pool arrives.
  const reliefPending = !!selected && earthPool.isLoading;
  let n = 0;
  const next = () => String(++n).padStart(2, "0");
  const index = { decision: next(), relief: reliefId || reliefPending ? next() : "", basis: next(), others: others.length ? next() : "" };
  const basis = sBasisAngle(members[0]);
  const rotations = d.rotations_checked;

  return (
    <section aria-labelledby="stage-research" className="pb-2">
      {/* The tab above names the stage; this line states only its basis. */}
      <p className="text-caption text-faint"><span id="stage-research" className="sr-only">Research comparison: </span>{winKm !== null ? `${winKm} km windows · ` : ""}Earth as MOLA would observe it</p>

      {/* Phones hide the rule (kept for screen readers): the status block is self-evidently the decision, and the
          members must fit at half height. */}
      <SectionHead index={index.decision} className="mt-4 max-md:sr-only">Decision</SectionHead>
      {/* Status block: annunciator, what the decision is about (leader or tied members), then the research
          label (G5 verbatim) and its caveats. */}
      <div className="mt-2.5 border border-line-strong max-md:mt-2">
        <DecisionHead t2={t2} />

        {leader && <LeaderRow c={leader} on={isOn(leader)} onPick={() => pick(leader)} />}

        {d.type === "tied_set" && (
          <div role="group" aria-label={`${members.length} tied research windows, not ranked against each other, listed west to east`} className="border-t border-line">
            <WindowTableHead tie basis={basis} />
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
              Scores {basis ? <>at one orientation ({basis})</> : "at one orientation"}{rotations ? <>; the leader changes across the <span className="num">{rotations}</span> checked</> : ""}.
              They use <Term k="measures">{T2_MEASURES} measures</Term>; validated on <Term k="synthetic">synthetic twins only</Term>.
            </p>
          )}
          {leader && <p>Validated on <Term k="synthetic">synthetic twins only</Term>.</p>}
        </div>
      </div>

      {selected && reliefId && <ReliefSlot candidate={selected} windowId={reliefId} index={index.relief} />}
      {reliefPending && !reliefId && (
        <section aria-busy className="mt-6">
          <SectionHead index={index.relief}>Terrain relief</SectionHead>
          <p role="status" className="mt-2.5 flex h-9 items-center gap-2 text-caption text-faint md:h-[220px] md:items-start">
            <span aria-hidden className="h-2 w-2 animate-pulse bg-faint motion-reduce:animate-none" />Loading the research pool…
          </p>
        </section>
      )}

      <SectionHead index={index.basis} className="mt-6">Basis</SectionHead>
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
            {/* Each threshold stays on one line with its sign: "bare ≥ 0.50", never "bare ≥ / 0.50". */}
            {gate.mode === "exclude" ? "Applied before ranking" : "Reported only, never excludes"} ·{" "}
            <span className="whitespace-nowrap">bare ≥ <span className="num">{gate.bare_min.toFixed(2)}</span></span> ·{" "}
            <span className="whitespace-nowrap">vegetated ≤ <span className="num">{gate.veg_max.toFixed(2)}</span></span> · working hypotheses
          </Readout>
        )}
        <Readout label="Scope"><Term k="scope" /></Readout>
      </Readouts>

      {others.length > 0 && (
        <>
          <SectionHead index={index.others} className="mt-6" aside={others.length}>Other windows</SectionHead>
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

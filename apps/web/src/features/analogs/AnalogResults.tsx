import { ArrowRight } from "lucide-react";
import { useMemo, useRef } from "react";
import { useLayout } from "../../app/useLayout";
import { Disclosure, PanelBody, PanelFooter, PanelHeader, Tabs, Tag, Term } from "../../components/primitives";
import { Button, cx, Spinner } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useMissions } from "../../services/api";
import { useApp } from "../../store/app";
import { resultsAreStale, searchTarget, type SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import { type CandidateView, candidateList, measuresOf, prettyWindow, researchWindowKm, screenCellKm, selectedCandidate, T1_MEASURES, T2_MEASURES } from "./candidates";
import { EarthLookup } from "./EarthLookup";
import { GlobalStage } from "./GlobalStage";
import { Readout, Readouts, StatusMark } from "./instruments";
import { NoResult, NoResultFooter } from "./NoResult";
import { sText, tieNote } from "./readout";
import { ResearchStage } from "./ResearchStage";
import { switchTier } from "./tierMemory";
import { useSheetFit } from "./useSheetFit";

export { DECISION_COPY, DecisionBlock } from "./Verdict";

function targetName(t: SearchTarget) {
  return t.siteId ? zoneName(t.siteId) : t.label;
}

/** Search scope (coverage counts, pool, filter, what is not connected) — one step away from the headline. */
function SearchScope({ search }: { search: AnalogSearch }) {
  const t1 = search.tier1, t2 = search.tier2;
  const pool = t2.candidate_pool as (NonNullable<typeof t2.candidate_pool> & { n_random_stratified?: number; n_named_controls?: number }) | null;
  return (
    <Disclosure summary="Search scope">
      <Readouts className="mb-2" label="Search scope">
        <Readout label={<Term k="globalScreen">Global screen</Term>}>
          {t1 ? <>
            <span className="num text-ink">{t1.candidate_pool.n_cells_searched.toLocaleString("en-US")}</span> land cells
            {screenCellKm(search) !== null && <> of ≈<span className="num">{screenCellKm(search)}</span> km</>}, latitudes{" "}
            <span className="num">{formatLat(t1.candidate_pool.lat_range[0], 0)}</span> to <span className="num">{formatLat(t1.candidate_pool.lat_range[1], 0)}</span>.{" "}
            <span className="text-muted">{t1.candidate_pool.coverage_note}</span>
          </> : <span className="text-muted">Not run for this target.</span>}
        </Readout>
        <Readout label={<Term k="researchComparison">Research comparison</Term>}>
          {pool ? <>
            Fixed pool of <span className="num text-ink">{pool.n_windows}</span> windows
            {pool.n_random_stratified !== undefined && pool.n_named_controls !== undefined && <> (<span className="num">{pool.n_random_stratified}</span> stratified random, <span className="num">{pool.n_named_controls}</span> named controls)</>}
            , <span className="num">{pool.window_km}</span> km each. <span className="text-muted">{pool.note}</span>
          </> : <span className="text-muted">No research record for this target.</span>}
        </Readout>
        {t2.live_refinement.status !== "available" && (
          <Readout label="Not connected">
            <span className="text-muted">Live refinement of new shortlists needs {t2.live_refinement.missing_inputs.map((x) => x.replace(/\s*\(.*\)$/, "")).join(", ")}.</span>
          </Readout>
        )}
        <Readout label="Reference set">
          <span className="text-muted">Documented analogs in the research pool. Being outside it is not evidence of novelty; no site here is claimed to be newly discovered.</span>
        </Readout>
      </Readouts>
    </Disclosure>
  );
}

function Footer({ current, search, target, phone }: { current: CandidateView | null; search: AnalogSearch; target: SearchTarget; phone: boolean }) {
  const go = useApp((s) => s.go);
  const set = useApp((s) => s.set);
  const tier = useApp((s) => s.tier);
  const d = search.tier2.decision;
  if (!current) {
    const hint = tier === 2
      ? d.type === "tied_set" ? `Choose one of the ${d.members.length} tied windows to compare it with ${targetName(target)} — none is preferred.`
        : search.tier2.candidates.length ? `Select a research window to compare it with ${targetName(target)}.` : null
      : `Select a cell to compare it with ${targetName(target)}.`;
    return hint ? (
      <PanelFooter className="border-t border-line">
        <p className="flex items-baseline gap-2.5 text-caption text-muted"><StatusMark state="off" className="translate-y-[-1px]" />{hint}</p>
      </PanelFooter>
    ) : null;
  }
  const isT2 = current.tier === 2;
  // A tie member belongs to an unordered set: say so without a position ("2 of 3" would read as a rank).
  const tie = isT2 ? tieNote(d, current.t2!.id) : null;
  const n = isT2 ? measuresOf(current.coverage, T2_MEASURES) : current.t1?.n_features_used ?? null;
  const total = isT2 ? T2_MEASURES : T1_MEASURES;
  const winKm = isT2 ? researchWindowKm(search, current.t2) : null;
  const cellKm = isT2 ? null : screenCellKm(search);
  return (
    <PanelFooter className="border-t border-line pt-3.5">
      <div className="kicker mb-2 flex items-center justify-between gap-3">
        <span>Selected</span>
        {tie && <span className="!text-ink/80">{tie}</span>}
      </div>
      <div className="relative pl-3">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-earth" />
        <div className="flex items-baseline justify-between gap-3">
          <span className={cx("truncate text-earth", isT2 ? "text-label" : "num text-num")}>{isT2 ? prettyWindow(current.t2!.id) : `${formatLat(current.lat, 2)} ${formatLon(current.lon, 2)}`}</span>
          <span className="num shrink-0 text-num text-ink">S {sText(current.score)} <span className="text-faint">· {n ?? "—"}/{total}</span></span>
        </div>
        {/* The representation is the basis of S: never truncated; phones drop the stage name instead. */}
        <p className="mt-0.5 text-caption text-muted">
          {isT2
            ? `${phone ? "" : "Research comparison · "}${winKm !== null ? `${winKm} km ` : ""}window · as MOLA would observe it`
            : `${phone ? "" : "Global screen · "}${cellKm !== null ? `${cellKm} km ` : ""}cell · as measured`}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => { go("compare"); set({ whyOpen: true }); }}>Why this analog?</Button>
        <Button variant="primary-earth" onClick={() => go("compare")}>Compare <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>
      </div>
    </PanelFooter>
  );
}

/** Earth results surface: what the search found for its own Mars target, in two ordered stages. */
export function AnalogResults() {
  const search = useApp((s) => s.search);
  const selection = useApp((s) => s.selection);
  const tier = useApp((s) => s.tier);
  const candidateId = useApp((s) => s.candidateId);
  const go = useApp((s) => s.go);
  const missions = useMissions();
  const target = useMemo(() => searchTarget(search), [search]);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);
  const root = useRef<HTMLDivElement>(null);
  const phone = useLayout() === "phone";
  // Enabled only once the results column (not the placeholder) is the element behind `root`.
  const fit = useSheetFit(root, phone && !!target);

  if (!search || !target) return <div ref={root} className="p-6"><Spinner label="No search yet" /></div>;

  const mission = missions.data?.find((m) => m.id === target.mission);
  const stale = resultsAreStale(search, selection);
  const any = candidateList(search).length > 0;
  const noResult = search.status === "unavailable" || !any;
  const t1 = search.tier1;
  const activeTier = tier === 1 && t1 ? 1 : 2;

  return (
    <div ref={root} className={cx("flex min-h-0 flex-col", phone && "h-full")} style={fit ? { height: fit } : undefined}>
      <PanelHeader className="pb-0 max-md:pt-2">
        {/* Focus lands here after a stage change (screen readers announce it); the heading is not interactive, so no ring. */}
        <h2 data-stage-heading="earth" tabIndex={-1} style={{ outline: "none" }} className="flex items-baseline gap-x-2.5 md:block">
          <span className="kicker flex shrink-0 items-center gap-2"><StatusMark state="on" tone="mars" />Results for</span>
          {/* A toponym is a place name: an off-zone point is "Selected point", its coordinates stay in mono below. */}
          <span className="toponym text-toponym-sm text-ink md:mt-1.5 md:block md:text-toponym">{target.siteId ? zoneName(target.siteId) : "Selected point"}</span>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Tag>{mission?.label ?? target.mission.replace(/_/g, " ")}</Tag>
          <span className="num text-num-sm text-muted">{formatLat(target.lat, 3)}  {formatLon(target.lon, 3)}</span>
        </div>
        {stale && selection && (
          <div role="status" className="mt-3 border border-warn/45 bg-warn/[0.06] px-3 py-2.5 text-caption text-ink">
            <span className="kicker mb-1 flex items-center gap-2 !text-warn"><StatusMark state="caution" />Caution · results for an earlier target</span>
            Your selection moved to <span className="text-warn">{selection.label}</span>. These results are still for {targetName(target)}.{" "}
            <button type="button" onClick={() => go("mars")} className="hit inline-flex items-center gap-1 text-ink underline decoration-warn/60 underline-offset-2 hover:decoration-warn">
              Find Earth Analogs for the new point <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          </div>
        )}
        {!noResult && (
          <Tabs ariaLabel="Result stage" className="mt-3 shadow-[inset_0_-1px_0_var(--color-line)]" value={String(activeTier) as "1" | "2"} onChange={(v) => switchTier(Number(v) as 1 | 2)}
            options={[
              { value: "2", label: <span><span className="num mr-1.5 text-num-sm text-faint">1</span>Research comparison</span> },
              { value: "1", label: <span><span className="num mr-1.5 text-num-sm text-faint">2</span>Global screen</span>, disabled: !t1 },
            ]} />
        )}
      </PanelHeader>

      {/* Keyed on the stage so a tab switch starts at that stage's kicker, not at the old scroll offset. */}
      <PanelBody key={noResult ? "none" : activeTier} className="pt-3">
        {noResult ? <NoResult search={search} target={target} /> : (
          <div role="tabpanel" aria-label={activeTier === 2 ? "Research comparison" : "Global screen"}>
            {activeTier === 2 ? <ResearchStage search={search} candidateId={candidateId} /> : <GlobalStage search={search} candidateId={candidateId} />}
          </div>
        )}
        <div className="mt-3 space-y-1 border-t border-line pb-3 pt-2">
          <EarthLookup search={search} />
          <SearchScope search={search} />
        </div>
      </PanelBody>

      {/* The next step is the sticky footer action in every state, so it stays in reach at half height on phones. */}
      {noResult ? <NoResultFooter search={search} target={target} /> : <Footer current={current} search={search} target={target} phone={phone} />}
    </div>
  );
}

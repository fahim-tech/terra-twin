import { ArrowRight, Sparkles } from "lucide-react";
import { useMemo, useRef } from "react";
import { useLayout } from "../../app/useLayout";
import { Disclosure, PanelBody, PanelFooter, PanelHeader, Tabs, Term } from "../../components/primitives";
import { Button, cx, Spinner } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useMissions } from "../../services/api";
import { useApp } from "../../store/app";
import { resultsAreStale, searchTarget, type SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import { type CandidateView, candidateList, decisionMembers, measuresOf, prettyWindow, selectedCandidate, T1_MEASURES, T2_MEASURES, unorderedMembers } from "./candidates";
import { EarthLookup } from "./EarthLookup";
import { GlobalStage } from "./GlobalStage";
import { NoResult } from "./NoResult";
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
      <dl className="space-y-3 pb-2 text-caption">
        <div>
          <dt className="text-label text-ink"><Term k="globalScreen">Global screen</Term></dt>
          <dd className="mt-0.5 text-muted">
            {t1 ? <>
              <span className="num text-num-sm text-ink">{t1.candidate_pool.n_cells_searched.toLocaleString()}</span> land cells of ≈{t1.candidate_pool.cell_size_km} km,
              latitudes {formatLat(t1.candidate_pool.lat_range[0], 0)} to {formatLat(t1.candidate_pool.lat_range[1], 0)}. {t1.candidate_pool.coverage_note}
            </> : "Not run for this target."}
          </dd>
        </div>
        <div>
          <dt className="text-label text-ink"><Term k="researchComparison">Research comparison</Term></dt>
          <dd className="mt-0.5 text-muted">
            {pool ? <>
              Fixed pool of <span className="num text-num-sm text-ink">{pool.n_windows}</span> windows
              {pool.n_random_stratified !== undefined && pool.n_named_controls !== undefined && <> (<span className="num text-num-sm">{pool.n_random_stratified}</span> stratified random, <span className="num text-num-sm">{pool.n_named_controls}</span> named controls)</>}
              , {pool.window_km} km each. {pool.note}
            </> : "No research record for this target."}
          </dd>
        </div>
        {t2.live_refinement.status !== "available" && (
          <div>
            <dt className="text-label text-ink">Not connected yet</dt>
            <dd className="mt-0.5 text-muted">Live refinement of new shortlists needs {t2.live_refinement.missing_inputs.map((x) => x.replace(/\s*\(.*\)$/, "")).join(", ")}.</dd>
          </div>
        )}
        <div>
          <dt className="text-label text-ink">Reference set</dt>
          <dd className="mt-0.5 text-muted">Documented analogs in the research pool. Being outside it is not evidence of novelty; no site here is claimed to be newly discovered.</dd>
        </div>
      </dl>
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
    return hint ? <PanelFooter><p className="text-caption text-muted">{hint}</p></PanelFooter> : null;
  }
  const isT2 = current.tier === 2;
  // Position in the west-to-east listing, never in the API order (which is by S and would read as a rank).
  const tieIdx = isT2 && d.type === "tied_set" ? unorderedMembers(decisionMembers(search.tier2)).findIndex((m) => m.id === current.t2!.id) : -1;
  const n = isT2 ? measuresOf(current.coverage, T2_MEASURES) : current.t1?.n_features_used ?? null;
  const total = isT2 ? T2_MEASURES : T1_MEASURES;
  return (
    <PanelFooter className="shadow-[0_-1px_0_rgb(255_255_255/0.06)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("truncate text-earth", isT2 ? "text-label" : "num text-num")}>{isT2 ? prettyWindow(current.t2!.id) : `${formatLat(current.lat, 2)} ${formatLon(current.lon, 2)}`}</span>
        <span className="num shrink-0 text-num text-ink">S {current.score === null ? "—" : current.score.toFixed(3)} <span className="text-faint">· {n ?? "—"}/{total}</span></span>
      </div>
      {/* The representation is the basis of S: never truncated; phones drop the stage name instead. */}
      <p className="mt-0.5 text-caption text-muted">
        {isT2
          ? `${phone ? "" : "Research comparison · "}${current.t2!.window_km || 50} km window · as MOLA would observe it`
          : `${phone ? "" : "Global screen · "}${search.tier1?.candidate_pool.cell_size_km ?? 25} km cell · as measured`}
        {tieIdx >= 0 && <> · <span className="text-ink">member of a tie ({tieIdx + 1} of {d.members.length})</span></>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => { go("compare"); set({ whyOpen: true }); }}><Sparkles className="h-3.5 w-3.5" aria-hidden /> Why this analog?</Button>
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
    <div ref={root} className="flex h-full min-h-0 flex-col" style={fit ? { height: fit } : undefined}>
      <PanelHeader className="pb-1 max-sm:pt-2">
        {/* Focus lands here after a stage change (screen readers announce it); the heading is not interactive, so no ring. */}
        <h2 data-stage-heading="earth" tabIndex={-1} style={{ outline: "none" }}>
          <span className="mr-2 text-caption text-muted sm:mr-0 sm:block">Results for</span>
          <span className="toponym mt-0.5 text-toponym-sm text-ink sm:block sm:text-toponym">{targetName(target)}</span>
        </h2>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-caption text-muted">
          <span className="text-mars">{mission?.label ?? target.mission.replace(/_/g, " ")}</span>
          <span aria-hidden>·</span>
          <span className="num text-num-sm">{formatLat(target.lat, 3)} {formatLon(target.lon, 3)}</span>
        </p>
        {stale && selection && (
          <div role="status" className="mt-3 rounded-control bg-warn/10 px-3 py-2 text-caption text-ink">
            <span aria-hidden className="mr-1 text-warn">⚠</span>
            Your selection moved to <span className="text-warn">{selection.label}</span>. These results are still for {targetName(target)}.{" "}
            <button type="button" onClick={() => go("mars")} className="hit inline-flex items-center gap-1 text-ink underline decoration-warn/60 underline-offset-2 hover:decoration-warn">
              Find Earth Analogs for the new point <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          </div>
        )}
        {!noResult && (
          <Tabs ariaLabel="Result stage" className="mt-3 shadow-[inset_0_-1px_0_rgb(255_255_255/0.06)]" value={String(activeTier) as "1" | "2"} onChange={(v) => switchTier(Number(v) as 1 | 2)}
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
        <div className="mt-2 space-y-1 pb-3">
          <EarthLookup search={search} />
          <SearchScope search={search} />
        </div>
      </PanelBody>

      {!noResult && <Footer current={current} search={search} target={target} phone={phone} />}
    </div>
  );
}

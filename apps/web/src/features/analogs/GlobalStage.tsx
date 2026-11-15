import { Fragment, useId, useState } from "react";
import { MarkLegend, SFigure } from "../../components/marks";
import { Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import { api } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch, Tier1Candidate } from "../../types/contracts";
import { type CandidateView, candidateList, coord, groupNearTop, screenCellKm, unorderedMembers } from "./candidates";
import { ACTION, AnalogMark, NEAR_ANALOG, ReadoutStrip, rowClass, SectionHead, SegmentedField, SelectionBar, StatusMark } from "./instruments";
import { sSpoken, sText } from "./readout";
import { chooseCandidate } from "./tierMemory";
import { contiguousCount, mergeByRank, tier1InView, type ViewBox, viewBox } from "./viewQuery";

const NEAR_TOL = 0.05;

/**
 * Instrument-table columns for screened cells: rank · position · S · flag. Cells near the top have no rank column.
 * Phones drop the label row (the summary and filter already fill the half-height sheet) and print "S" in the cell.
 */
const RANKED_ROW = "grid grid-cols-[3.25rem_minmax(0,1fr)_3rem_1rem] items-center gap-x-2 pl-3 pr-2 max-md:grid-cols-[3.25rem_minmax(0,1fr)_3.75rem_1rem]";
const NEAR_ROW = "grid grid-cols-[minmax(0,1fr)_3rem_1rem] items-center gap-x-2 pl-3 pr-2 max-md:grid-cols-[minmax(0,1fr)_3.75rem_1rem]";

/** Column labels (visual only: every row button carries its full accessible name). */
function CellTableHead({ ranked }: { ranked: boolean }) {
  return (
    <div aria-hidden className={cx(ranked ? RANKED_ROW : NEAR_ROW, "kicker border-b border-line py-1.5 max-md:hidden")}>
      {ranked && <span>Rank</span>}<span>{ranked ? "Position" : "Position · west → east"}</span><span className="justify-self-end">S</span><span />
    </div>
  );
}

/** Row flags, drawn as marks (never typed glyphs): amber triangle = data-quality flag, outlined diamond = near documented analog. */
function CellFlag({ flagged, near }: { flagged: boolean; near: boolean }) {
  return flagged ? <StatusMark state="caution" /> : near ? <AnalogMark /> : null;
}

function CellRow({ c, on, approx }: { c: CandidateView; on: boolean; approx: boolean }) {
  const near = c.t1?.known_analog.status === "near_documented_analog";
  const flagged = !!c.t1?.quality_flags.some((f) => f.severity !== "info");
  const flagText = [near && `${NEAR_ANALOG.toLowerCase()} ${c.t1?.known_analog.name ?? ""}`.trim(), flagged && "data-quality flag"].filter(Boolean).join(", ");
  return (
    <li>
      <button type="button" onClick={() => chooseCandidate(c.id)} aria-pressed={on}
        aria-label={`${approx ? "Within 0.05 of the top" : `Rank ${c.rank}`}, ${coord(c.lat, c.lon)}, similarity ${sSpoken(c.score)}${flagText ? `, ${flagText}` : ""}`}
        className={rowClass(on, cx(approx ? NEAR_ROW : RANKED_ROW, "py-2"))}>
        {on && <SelectionBar layoutId="t1-selection" />}
        {!approx && <span className="num text-num-sm text-faint">{c.rank?.toLocaleString("en-US")}</span>}
        <span className={cx("num truncate text-num-sm", on ? "text-earth" : "text-ink")}>{coord(c.lat, c.lon)}</span>
        {/* No length bars: a bar would read as an order, and cells near the top are not ranked against each other.
            "S 0.909" is set as every view sets it; desktop prints the symbol once, in the column head. */}
        <SFigure value={c.score} symbolClassName="md:hidden" className="justify-self-end text-num text-ink" />
        <span aria-hidden className="grid place-items-center" title={flagText || undefined}><CellFlag flagged={flagged} near={near} /></span>
      </button>
    </li>
  );
}

/** Stage 2 — the global screen (tier 1): every screened land cell, Earth as measured. */
export function GlobalStage({ search, candidateId }: { search: AnalogSearch; candidateId: string | null }) {
  const t1 = search.tier1!;
  const knownFilter = useApp((s) => s.knownFilter);
  const set = useApp((s) => s.set);
  const [loading, setLoading] = useState<null | "more" | "view">(null);
  const zoomHintId = useId();
  const [inView, setInView] = useState<{ searchId: string; ids: Set<string>; total: number; box: ViewBox } | null>(null);
  const camera = useGlobes((s) => s.camera.earth);
  const insets = useGlobes((s) => s.insets.earth);
  const target = searchTarget(search)!;
  const view = inView?.searchId === search.id ? inView : null;
  const all = candidateList(search).filter((c) => c.tier === 1);
  const rows = (view ? all.filter((c) => view.ids.has(c.id)) : all)
    .filter((c) => knownFilter === "all" || c.t1?.known_analog.status === knownFilter);
  const top = t1.summary.leader_similarity;
  const grouped = groupNearTop(rows, top, NEAR_TOL);
  // Not ranked against each other → listed west to east, like a tied set; never by S.
  const near = unorderedMembers(grouped.near);
  const rest = grouped.rest;
  const nearMaxRank = near.reduce((m, c) => Math.max(m, c.rank ?? 0), 0);
  const contiguous = contiguousCount(t1.candidates);
  const km = screenCellKm(search);
  const frame = typeof window === "undefined" ? null : { w: window.innerWidth - insets.left - insets.right, h: window.innerHeight - 52 - insets.top - insets.bottom };
  const box = frame ? viewBox(camera, frame.w, frame.h) : null;

  /** Merge cells into the search (so they can be selected and compared) keeping global ranks. */
  const merge = (cells: Tier1Candidate[]) => {
    const cur = useApp.getState().search;
    if (cur?.id !== search.id || !cur.tier1) return false; // a newer search replaced this one
    set({ search: { ...cur, tier1: { ...cur.tier1, candidates: mergeByRank(cur.tier1.candidates, cells) } } });
    return true;
  };

  const loadMore = async () => {
    if (!search.mars.site) return;
    setLoading("more");
    try {
      const page = await api.tier1Page(search.mars.site, target.mission, contiguous, 100);
      if (merge(page.candidates)) useApp.getState().announce(`Loaded ${page.candidates.length} more cells, ranks ${contiguous + 1} to ${contiguous + page.candidates.length}.`);
    } catch (e) {
      useApp.getState().announce(`Could not load more cells: ${(e as Error).message}`, true);
    } finally {
      setLoading(null);
    }
  };

  const canRank = !loading && !!box && !!search.mars.site;
  const rankInView = async () => {
    if (!canRank || !box || !search.mars.site) {
      if (!box && !loading) useApp.getState().announce("Zoom in to a region to rank its cells; the whole-globe view is too wide.");
      return;
    }
    setLoading("view");
    try {
      const res = await tier1InView(search.mars.site, target.mission, box, 100);
      if (!merge(res.candidates)) return;
      setInView({ searchId: search.id, ids: new Set(res.candidates.map((c) => `t1:${c.region_id}`)), total: res.total, box });
      useApp.getState().announce(res.total ? `${res.total.toLocaleString()} screened cells in view; showing the ${Math.min(res.total, res.candidates.length)} highest by global rank.` : "No screened land cells in this view.");
    } catch (e) {
      useApp.getState().announce(`Could not rank cells in view: ${(e as Error).message}`, true);
    } finally {
      setLoading(null);
    }
  };

  return (
    <section aria-labelledby="stage-global" className="pb-2">
      <h3 id="stage-global" className="sr-only">Global screen</h3>
      <ReadoutStrip label="Global screen summary" cells={[
        { key: "cells", label: "Land cells", value: t1.candidate_pool.n_cells_searched.toLocaleString("en-US") },
        { key: "km", label: <Term k="scale">Cell</Term>, value: km !== null ? <>{km}<span className="ml-1 font-sans text-[12px] text-muted">km</span></> : "—" },
        { key: "top", label: <>Top <Term k="similarity">S</Term></>, value: sText(top) },
        { key: "strong", label: "S ≥ 0.75", value: t1.summary.n_strong_ge_0p75.toLocaleString("en-US") },
      ]} />
      <p className="mt-2 text-caption text-muted max-md:mt-1.5">Earth as measured · <Term k="globalScreen">a wide net, not a verdict</Term>.</p>

      <div className="mt-4 max-md:mt-3">
        <div className="kicker mb-1.5">Reference set</div>
        <SegmentedField label="Reference status" value={knownFilter} onChange={(v) => set({ knownFilter: v })}
          options={[
            { value: "all", label: "All", title: "All cells" },
            { value: "not_in_reference_set", label: "Not in set", title: "Not in the reference set" },
            { value: "near_documented_analog", label: NEAR_ANALOG },
          ]} />
      </div>

      {view && (
        <div className="mt-3 border border-line px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="kicker !text-ink/85">In view</span>
            <button type="button" onClick={() => setInView(null)} className={cx(ACTION, "px-2.5 py-1.5 text-ink ring-line-strong hover:bg-white/[0.06] active:bg-white/[0.12]")}>All ranks</button>
          </div>
          <p className="mt-1.5 text-caption text-muted">
            <span className="num text-num-sm text-ink">{view.total.toLocaleString()}</span> cells between{" "}
            <span className="num text-num-sm">{coord(view.box.north, view.box.west, 1)}</span> and <span className="num text-num-sm">{coord(view.box.south, view.box.east, 1)}</span>.
            Ranks stay global{view.total > view.ids.size ? `; the ${view.ids.size} highest are listed` : ""}.
          </p>
        </div>
      )}

      {near.length > 0 && (
        <div className="mt-5 max-md:mt-4">
          <SectionHead index="01">Near the top</SectionHead>
          <p className="mt-1.5 text-caption text-muted">
            {/* The global count only describes the unfiltered list; a filter or the in-view list counts what is shown. */}
            {view || knownFilter !== "all"
              ? <><span className="num text-num-sm text-ink">{near.length}</span> {near.length === 1 ? "cell" : "cells"}{knownFilter !== "all" && <> of <span className="num text-num-sm">{t1.summary.n_within_0p05_of_leader}</span></>}</>
              : <><span className="num text-num-sm text-ink">{t1.summary.n_within_0p05_of_leader}</span>{near.length < t1.summary.n_within_0p05_of_leader && <> (<span className="num text-num-sm">{near.length}</span> loaded)</>} cells</>}
            {" "}within {NEAR_TOL.toFixed(2)} of the top — not ranked against each other, listed west to east.
          </p>
          {/* A group (unranked set) around a real list, so screen readers still hear the item count. */}
          <div role="group" aria-label="Cells within 0.05 of the top, not ranked against each other, listed west to east" className="mt-2 border-b border-line">
            <CellTableHead ranked={false} />
            <ul className="divide-y divide-line">
              {near.map((c) => <CellRow key={c.id} c={c} on={candidateId === c.id} approx />)}
            </ul>
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div className="mt-5 max-md:mt-4">
          <SectionHead index={near.length > 0 ? "02" : "01"} aside={view ? "in view" : <>{contiguous.toLocaleString("en-US")} of {t1.total.toLocaleString("en-US")} loaded</>}>By global rank</SectionHead>
          <div className="mt-2 border-b border-line">
            <CellTableHead ranked />
            <ul aria-label="Further cells by global rank" className="divide-y divide-line">
              {rest.map((c, i) => {
                const prev = i ? rest[i - 1].rank! : nearMaxRank;
                const gap = !view && knownFilter === "all" && c.rank! - prev > 1;
                return (
                  <Fragment key={c.id}>
                    {gap && <li aria-hidden className="num py-1.5 pl-3 text-num-sm text-faint">⋯ ranks {(prev + 1).toLocaleString("en-US")}–{(c.rank! - 1).toLocaleString("en-US")} not loaded</li>}
                    <CellRow c={c} on={candidateId === c.id} approx={false} />
                  </Fragment>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      {rows.length === 0 && <p className="mt-4 border-y border-line py-4 text-caption text-muted">{view ? "No screened land cell in this view matches." : "No loaded cell matches this filter. Load more cells or choose “All”."}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="num text-num-sm text-faint">
          {view ? "Ranked in view" : <>{contiguous.toLocaleString("en-US")} of {t1.total.toLocaleString("en-US")} by rank</>}
        </span>
        <span className="flex items-center gap-2">
          {/* Stays focusable while unavailable (aria-disabled), with the reason as visible text below. */}
          <button type="button" onClick={rankInView} aria-disabled={!canRank} aria-describedby={!box ? zoomHintId : undefined}
            className={cx(ACTION, canRank ? "text-ink ring-line-strong hover:bg-white/[0.06] hover:ring-ink/60 active:bg-white/[0.12]" : "cursor-not-allowed text-faint ring-line")}>
            {loading === "view" ? "Ranking…" : "Rank cells in view"}
          </button>
          {!view && contiguous < t1.total && (
            <button type="button" onClick={loadMore} disabled={!!loading || !search.mars.site}
              className={cx(ACTION, "text-ink ring-line-strong hover:bg-white/[0.06] hover:ring-ink/60 active:bg-white/[0.12] disabled:cursor-not-allowed disabled:text-faint disabled:ring-line")}>
              {loading === "more" ? "Loading…" : "Load more"}
            </button>
          )}
        </span>
      </div>
      {!box && search.mars.site && (
        <p id={zoomHintId} className="mt-1.5 text-caption text-muted">Zoom in to a region to rank its cells — the whole-globe view is too wide.</p>
      )}
      <MarkLegend className="mt-3" label="Row marks" items={[
        { key: "near", mark: <AnalogMark />, word: NEAR_ANALOG },
        { key: "flag", mark: <StatusMark state="caution" />, word: "Data-quality flag" },
      ]} />
      <p className="mt-1.5 text-caption text-faint">{t1.disclaimer}</p>
    </section>
  );
}

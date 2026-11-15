import { Fragment, useId, useState } from "react";
import { Term } from "../../components/primitives";
import { Button, cx, Segmented } from "../../components/ui";
import { api } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch, Tier1Candidate } from "../../types/contracts";
import { type CandidateView, candidateList, coord, groupNearTop, unorderedMembers } from "./candidates";
import { chooseCandidate } from "./tierMemory";
import { contiguousCount, mergeByRank, tier1InView, type ViewBox, viewBox } from "./viewQuery";

const NEAR_TOL = 0.05;

function CellRow({ c, on, approx }: { c: CandidateView; on: boolean; approx: boolean }) {
  const near = c.t1?.known_analog.status === "near_documented_analog";
  const flagged = c.t1?.quality_flags.some((f) => f.severity !== "info");
  const flagText = [near && `near documented analog ${c.t1?.known_analog.name ?? ""}`.trim(), flagged && "quality flag"].filter(Boolean).join(", ");
  const s = c.score;
  return (
    <li>
      <button type="button" onClick={() => chooseCandidate(c.id)} aria-pressed={on}
        aria-label={`${approx ? "Within 0.05 of the top" : `Rank ${c.rank}`}, ${coord(c.lat, c.lon)}, similarity ${s === null ? "not available" : s.toFixed(3)}${flagText ? `, ${flagText}` : ""}`}
        className={cx("hit relative flex h-10 w-full items-center gap-2.5 rounded-control px-2 text-left transition-colors hover:bg-elevated", on && "bg-elevated")}>
        {on && <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-earth" />}
        <span className={cx("w-8 shrink-0", approx ? "text-caption text-muted" : "num text-num-sm text-faint")}>{approx ? "≈" : c.rank}</span>
        <span className={cx("num shrink-0 text-num-sm", on ? "text-earth" : "text-ink")}>{coord(c.lat, c.lon)}</span>
        {/* Cells near the top are not ranked against each other: no length bar that would read as an order. */}
        {approx ? <span aria-hidden className="min-w-6 flex-1" /> : (
          <span aria-hidden className="relative h-[3px] min-w-6 flex-1 rounded-full bg-line">
            {s !== null && <span className={cx("absolute inset-y-0 left-0 rounded-full", on ? "bg-earth" : "bg-muted")} style={{ width: `${Math.max(0, Math.min(1, s)) * 100}%` }} />}
          </span>
        )}
        <span className="num w-[42px] shrink-0 text-right text-num text-ink">{s === null ? "—" : s.toFixed(3)}</span>
        <span aria-hidden className="w-4 shrink-0 text-center text-caption" title={flagText || undefined}>
          {flagged ? <span className="text-warn">⚠</span> : near ? <span className="text-muted">◆</span> : null}
        </span>
      </button>
    </li>
  );
}

/** Stage 2 — the global screen (tier 1): every land cell, 25 km, Earth as measured. */
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
  const km = t1.candidate_pool.cell_size_km;
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
      <p className="text-caption text-faint">
        <span id="stage-global" className="sr-only">Global screen: </span><span className="num">{t1.candidate_pool.n_cells_searched.toLocaleString("en-US")}</span> land cells · {km} km · Earth as measured
      </p>
      <p className="mt-2 text-caption text-muted">
        <Term k="globalScreen">A wide net, not a verdict</Term>. Top <Term k="similarity">S</Term>{" "}
        <span className="num text-num-sm text-ink">{top.toFixed(3)}</span> ·{" "}
        <span className="num text-num-sm text-ink">{t1.summary.n_strong_ge_0p75.toLocaleString()}</span> cells at S ≥ 0.75 ·{" "}
        <Term k="scale">{km} km cells</Term>
      </p>

      <div className="mt-3">
        <Segmented ariaLabel="Reference status" size="sm" accent="ink" value={knownFilter} onChange={(v) => set({ knownFilter: v })}
          options={[{ value: "all", label: "All cells" }, { value: "not_in_reference_set", label: "Not in reference set" }, { value: "near_documented_analog", label: "Near known analog" }]} />
      </div>

      {view && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-control bg-elevated px-3 py-2">
          <p className="text-caption text-muted">
            <span className="text-ink">In view</span> · <span className="num text-num-sm text-ink">{view.total.toLocaleString()}</span> cells between{" "}
            <span className="num text-num-sm">{coord(view.box.north, view.box.west, 1)}</span> and <span className="num text-num-sm">{coord(view.box.south, view.box.east, 1)}</span>.
            Ranks stay global{view.total > view.ids.size ? `; the ${view.ids.size} highest are listed` : ""}.
          </p>
          <button type="button" onClick={() => setInView(null)} className="hit shrink-0 text-caption text-ink underline decoration-faint underline-offset-2 hover:decoration-ink">All ranks</button>
        </div>
      )}

      {near.length > 0 && (
        <div className="mt-3">
          <div className="px-2 pb-1 text-caption text-muted">
            {/* The global count only describes the unfiltered list; a filter or the in-view list counts what is shown. */}
            {view || knownFilter !== "all"
              ? <><span className="num text-num-sm text-ink">{near.length}</span> {near.length === 1 ? "cell" : "cells"}{knownFilter !== "all" && <> of <span className="num text-num-sm">{t1.summary.n_within_0p05_of_leader}</span></>}</>
              : <><span className="num text-num-sm text-ink">{t1.summary.n_within_0p05_of_leader}</span>{near.length < t1.summary.n_within_0p05_of_leader && <> (<span className="num text-num-sm">{near.length}</span> loaded)</>} cells</>}
            {" "}within {NEAR_TOL.toFixed(2)} of the top — not ranked against each other, listed west to east
          </div>
          <ul role="group" aria-label="Cells within 0.05 of the top, not ranked against each other" className="rounded-control bg-white/[0.025]">
            {near.map((c) => <CellRow key={c.id} c={c} on={candidateId === c.id} approx />)}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <ul aria-label="Further cells by global rank" className="mt-2">
          {rest.map((c, i) => {
            const prev = i ? rest[i - 1].rank! : nearMaxRank;
            const gap = !view && knownFilter === "all" && c.rank! - prev > 1;
            return (
              <Fragment key={c.id}>
                {gap && <li aria-hidden className="px-2 py-1 text-caption text-faint">⋯ ranks {prev + 1}–{c.rank! - 1} not loaded</li>}
                <CellRow c={c} on={candidateId === c.id} approx={false} />
              </Fragment>
            );
          })}
        </ul>
      )}
      {rows.length === 0 && <p className="px-2 py-4 text-caption text-muted">{view ? "No screened land cell in this view matches." : "No loaded cell matches this filter. Load more cells or choose “All cells”."}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2">
        <span className="text-caption text-faint">
          {view ? <>Ranked in view</> : <><span className="num text-num-sm">{contiguous.toLocaleString()}</span> of <span className="num text-num-sm">{t1.total.toLocaleString()}</span> by rank</>}
        </span>
        <span className="flex items-center gap-1">
          {/* Stays focusable while unavailable (aria-disabled), with the reason as visible text below. */}
          <button type="button" onClick={rankInView} aria-disabled={!canRank} aria-describedby={!box ? zoomHintId : undefined}
            className={cx("hit inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-label transition-[color,background,transform] duration-150",
              canRank ? "text-muted hover:bg-elevated hover:text-ink active:scale-[0.97]" : "cursor-not-allowed text-faint")}>
            {loading === "view" ? "Ranking…" : "Rank cells in view"}
          </button>
          {!view && contiguous < t1.total && (
            <Button variant="ghost" onClick={loadMore} disabled={!!loading || !search.mars.site}>{loading === "more" ? "Loading…" : "Load more"}</Button>
          )}
        </span>
      </div>
      {!box && search.mars.site && (
        <p id={zoomHintId} className="mt-1 px-2 text-caption text-muted">Zoom in to a region to rank its cells — the whole-globe view is too wide.</p>
      )}
      <p className="mt-2 px-2 text-caption text-faint">◆ near a documented analog · ⚠ data-quality flag. {t1.disclaimer}</p>
    </section>
  );
}

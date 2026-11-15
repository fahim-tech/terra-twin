import { useState } from "react";
import { Kicker, Term } from "../../components/primitives";
import { Button, cx, Segmented } from "../../components/ui";
import { api } from "../../services/api";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import { type CandidateView, candidateList, coord, groupNearTop } from "./candidates";
import { chooseCandidate } from "./tierMemory";

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
        <span aria-hidden className="relative h-[3px] min-w-6 flex-1 rounded-full bg-line">
          {s !== null && <span className={cx("absolute inset-y-0 left-0 rounded-full", on ? "bg-earth" : "bg-muted")} style={{ width: `${Math.max(0, Math.min(1, s)) * 100}%` }} />}
        </span>
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
  const [loading, setLoading] = useState(false);
  const target = searchTarget(search)!;
  const rows = candidateList(search).filter((c) => c.tier === 1)
    .filter((c) => knownFilter === "all" || c.t1?.known_analog.status === knownFilter);
  const top = t1.summary.leader_similarity;
  const { near, rest } = groupNearTop(rows, top, NEAR_TOL);
  const shown = t1.candidates.length;
  const km = t1.candidate_pool.cell_size_km;

  const loadMore = async () => {
    if (!search.mars.site) return;
    setLoading(true);
    try {
      const page = await api.tier1Page(search.mars.site, target.mission, shown, 100);
      const cur = useApp.getState().search;
      if (cur?.id !== search.id || !cur.tier1) return; // a newer search replaced this one
      set({ search: { ...cur, tier1: { ...cur.tier1, candidates: [...cur.tier1.candidates, ...page.candidates] } } });
      useApp.getState().announce(`Loaded ${page.candidates.length} more cells. ${(shown + page.candidates.length).toLocaleString()} of ${t1.total.toLocaleString()} shown.`);
    } catch (e) {
      useApp.getState().announce(`Could not load more cells: ${(e as Error).message}`, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="stage-global" className="pb-2">
      <Kicker className="leading-[1.5]">
        <span id="stage-global">Global screen</span> · <span className="num">{t1.candidate_pool.n_cells_searched.toLocaleString()}</span> land cells · {km} km · Earth as measured
      </Kicker>
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

      {near.length > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3 px-2 pb-1">
            <span className="text-caption text-muted">
              <span className="num text-num-sm text-ink">{t1.summary.n_within_0p05_of_leader}</span> cells within {NEAR_TOL.toFixed(2)} of the top — not ranked against each other
            </span>
          </div>
          <ul role="group" aria-label="Cells within 0.05 of the top, not ranked against each other" className="rounded-control bg-white/[0.025]">
            {near.map((c) => <CellRow key={c.id} c={c} on={candidateId === c.id} approx />)}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <ul aria-label="Further cells by rank" className="mt-2">
          {rest.map((c) => <CellRow key={c.id} c={c} on={candidateId === c.id} approx={false} />)}
        </ul>
      )}
      {rows.length === 0 && <p className="px-2 py-4 text-caption text-muted">No loaded cell matches this filter. Load more cells or choose “All cells”.</p>}

      <div className="mt-2 flex items-center justify-between gap-3 px-2">
        <span className="text-caption text-faint"><span className="num text-num-sm">{shown.toLocaleString()}</span> of <span className="num text-num-sm">{t1.total.toLocaleString()}</span> shown</span>
        {shown < t1.total && (
          <Button variant="ghost" onClick={loadMore} disabled={loading || !search.mars.site}>{loading ? "Loading…" : "Load 100 more"}</Button>
        )}
      </div>
      <p className="mt-2 px-2 text-caption text-faint">◆ near a documented analog · ⚠ data-quality flag. {t1.disclaimer}</p>
    </section>
  );
}

/**
 * Which research-pool window a selection stands for, so its relief grid can be fetched
 * (`GET /api/earth/pool/{window_id}/relief`).
 *
 * The pool endpoint keys each window by its own name (`earth_pool_meta.csv` → `name`, published as
 * `PoolWindow.id` by `GET /api/earth/pool`): a stratified random window is `rand_d<decile>_<n>`
 * ("rand_d8_233"), a named control keeps its name ("Atacama Yungay", "Arcadia gated #1"). The search
 * record names a research window by exactly that id (`Tier2Candidate.id`); `CandidateView` and
 * `ReportCandidate` carry the record's candidate as `t2`, so the id is read from there, never rebuilt
 * from a display label ("Window 233") or a prefixed key ("t2:rand_d8_233").
 *
 * A screening cell (tier 1) is a cell of the global screen, not a pool window: it has no relief grid.
 * A research window the pool does not list has none either, and while the pool list is not known yet
 * nothing is assumed. In every such case the answer is null and no terrain is shown — never another
 * window's.
 */
export interface WindowRef {
  tier: 1 | 2;
  /** The record's research-window candidate (tier 2). */
  t2?: { id: string } | null;
}

/** The exact research-pool window id behind a selection, or null when it has no pool window (or the pool is not known yet). */
export function reliefWindowId(ref: WindowRef | null | undefined, pool: readonly { id: string }[] | null | undefined): string | null {
  if (!ref || ref.tier !== 2 || !ref.t2) return null;
  const id = ref.t2.id;
  if (!pool) return null;
  return pool.some((w) => w.id === id) ? id : null;
}

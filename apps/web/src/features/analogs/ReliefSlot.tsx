import type { AnalogSearch, Tier2Candidate } from "../../types/contracts";

/**
 * SLOT — 3D relief preview of the selected research window. Renders nothing yet.
 *
 * Reserved for the WebGL terrain-relief view (the relief package, `components/relief`): the real Earth
 * research window resampled as MOLA would observe it, with labelled vertical exaggeration, km axes and an
 * elevation scale. <ResearchStage> mounts this directly under the decision whenever a research window is
 * selected (a decision member or a context window), and passes it nothing else.
 *
 * To fill it, either render the relief view here or hand <ResearchStage> another component through its
 * `relief` prop. Key the view on `candidate.id`; size it from `windowKm`, which comes from the record —
 * null means the record states no size, so none may be assumed. Until then: no placeholder art, no
 * stand-in terrain, no reserved empty box.
 */
export interface ReliefSlotProps {
  search: AnalogSearch;
  /** The selected research window (tier 2). */
  candidate: Tier2Candidate;
  /** Window size from the record (candidate, else target); null when the record has none. */
  windowKm: number | null;
}

export function ReliefSlot(_props: ReliefSlotProps): null {
  return null;
}

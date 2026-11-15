import type { AnalogSearch } from "../../types/contracts";
import type { ReportCandidate } from "./model";

/**
 * ── SLOT: 3D relief snapshot ────────────────────────────────────────────────────────────────────────
 *
 * Reserved place in the Location plates section for a still of the 3D terrain relief (the WebGL
 * heightfield of the real Earth research window, resampled as MOLA would observe it, with its labelled
 * vertical exaggeration, km axes and elevation scale in metres — see docs/redesign/v2-mission-control.md §6).
 *
 * It renders nothing until the relief view can hand over a real snapshot. When it does, render it here as
 * "Plate C" with the same plate furniture as LocationPlate (plate strip, frame, caption with its basis);
 * Mars relief only if a MOLA mosaic is connected, otherwise say so. Never a placeholder image.
 */
export function ReliefSnapshotSlot(_props: { search: AnalogSearch; candidate: ReportCandidate | null }): null {
  return null;
}

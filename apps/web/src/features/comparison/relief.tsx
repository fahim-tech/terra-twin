import type { ComponentType } from "react";
import type { AnalogSearch } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import type { CompareTargets } from "./model";

/**
 * "3D relief" — slot for the relief viewer in the comparison's mode switch.
 *
 * A later phase assigns its viewer here: a WebGL heightfield of the real Earth research window, resampled
 * as MOLA would observe it, with labelled vertical exaggeration, km axes and an elevation scale (Mars
 * relief only when a MOLA mosaic is connected). The viewer renders inside the expanded comparison panel,
 * under the section rule "3D relief", and receives the compared pair as bound to the search record.
 *
 * While this is null the "3D relief" mode is not offered at all (modes.ts → visibleModes): no
 * placeholder, no "coming soon" state.
 */
export interface ReliefViewerProps {
  search: AnalogSearch;
  c: CandidateView;
  targets: CompareTargets;
  phone: boolean;
}

export const ReliefViewer: ComponentType<ReliefViewerProps> | null = null;

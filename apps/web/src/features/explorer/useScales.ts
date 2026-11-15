import { useEvidence, useSites } from "../../services/api";
import { scalesFromEvidence, type Scales } from "./readouts";

/**
 * Cell size, window size and zone count for explorer copy, from the API (evidence coverage and the
 * sites list). Null until loaded or when absent; callers then phrase the sentence without a number.
 */
export function useScales(): Scales {
  const ev = useEvidence();
  const sites = useSites();
  const s = scalesFromEvidence(ev.data);
  return { ...s, zones: sites.data ? sites.data.length || null : s.zones };
}

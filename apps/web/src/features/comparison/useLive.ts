import { useMemo } from "react";
import { useDiscoveryRun } from "../../services/gis";
import { liveCompareActive, useApp } from "../../store/app";
import { type LivePair, livePair } from "./live";

export type LiveCompare =
  | { state: "off" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "missing" }
  | { state: "ready"; pair: LivePair };

/**
 * The live discovery window that Compare and Report describe (liveCompareActive), with its run: "off" when they
 * describe the research record instead; "missing" when the run no longer lists the selected window.
 */
export function useLiveCompare(): LiveCompare {
  const active = useApp(liveCompareActive);
  const runId = useApp((s) => s.liveRunId);
  const cand = useApp((s) => s.liveCandidate);
  const run = useDiscoveryRun(active ? runId : null);
  return useMemo<LiveCompare>(() => {
    if (!active) return { state: "off" };
    if (run.isError) return { state: "error", message: (run.error as Error).message };
    if (!run.data) return { state: "loading" };
    const pair = livePair(run.data, cand);
    return pair ? { state: "ready", pair } : { state: "missing" };
  }, [active, run.data, run.isError, run.error, cand]);
}

import { useFindAnalogs } from "../../services/api";
import { useApp, type Selection } from "../../store/app";

const DECISION_WORDS: Record<string, string> = {
  named_leader: "stable leader",
  tied_set: "tie",
  no_convincing_analog: "no convincing analog",
  insufficient_evidence: "not enough evidence",
};

/**
 * "Find Earth Analogs": runs the global screen + research comparison for the selection, announces the
 * outcome, and moves to Earth. Only a stable named leader is pre-selected; a tied set is never reduced
 * to one member on the user's behalf, and global-screen cells are a screening list, so nothing is
 * pre-selected there either.
 */
export function useRunSearch() {
  const find = useFindAnalogs();
  const run = (selection: Selection) => {
    const { footprintKm, mission } = useApp.getState();
    useApp.getState().announce(`Searching Earth for terrain like ${selection.label}.`);
    find.mutate({ lat: selection.lat, lon: selection.lon, footprint_km: footprintKm, mission }, {
      onError: (e) => useApp.getState().announce(`Search failed: ${(e as Error).message}`, true),
      onSuccess: (res) => {
        const d = res.tier2.decision;
        const leader = d.type === "named_leader" ? res.tier2.candidates[0]?.id : undefined;
        const members = d.members.length ? ` (${d.members.join(", ")})` : "";
        useApp.getState().announce(res.status === "available"
          ? `Earth analog search complete. ${res.tier1?.candidate_pool.n_cells_searched.toLocaleString("en-US") ?? 0} land cells screened. Research comparison: ${DECISION_WORDS[d.type] ?? d.type}${members}.`
          : "No Earth comparison for this point: research terrain data is not available here.");
        useApp.getState().set({ search: res, candidateId: leader ? `t2:${leader}` : null, tier: res.tier2.candidates.length || !res.tier1 ? 2 : 1 });
        useApp.getState().go("earth");
      },
    });
  };
  return { run, pending: find.isPending, error: find.isError ? (find.error as Error) : null };
}

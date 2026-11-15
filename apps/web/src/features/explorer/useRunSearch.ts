import { decisionWord } from "../../components/marks";
import { useFindAnalogs } from "../../services/api";
import { useApp, type Selection } from "../../store/app";
import { memberOrder, shortWindow, stableLeaderId } from "../analogs/candidates";


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
        const leader = stableLeaderId(res.tier2);
        const members = d.members.length ? ` (${memberOrder(res.tier2).map(shortWindow).join(", ")})` : "";
        const screen = res.tier1 ? `${res.tier1.candidate_pool.n_cells_searched.toLocaleString("en-US")} land cells screened.` : "Global screen not run.";
        useApp.getState().announce(res.status === "available"
          ? `Earth analog search complete. ${screen} Research comparison: ${decisionWord(d.type).toLowerCase()}${members}.`
          : "No Earth comparison for this point: research terrain data is not available here.");
        useApp.getState().set({ search: res, candidateId: leader ? `t2:${leader}` : null, tier: res.tier2.candidates.length || !res.tier1 ? 2 : 1 });
        useApp.getState().go("earth");
      },
    });
  };
  return { run, pending: find.isPending, error: find.isError ? (find.error as Error) : null };
}

import { useEffect, useMemo } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { useApp } from "../../store/app";
import { selectedCandidate } from "../analogs/candidates";

/** In the comparison stage, frames both globes at the same altitude so ground scale matches. */
export const COMPARE_HEIGHT_KM = 420;

export function CompareGlobeSync() {
  const bus = useGlobeBus();
  const stage = useApp((s) => s.stage);
  const selection = useApp((s) => s.selection);
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);

  useEffect(() => {
    if (stage !== "compare") return;
    if (selection) bus.send("mars", { t: "flyTo", lat: selection.lat, lon: selection.lon, heightKm: COMPARE_HEIGHT_KM });
    if (current) bus.send("earth", { t: "flyTo", lat: current.lat, lon: current.lon, heightKm: COMPARE_HEIGHT_KM });
  }, [bus, stage, selection, current]);
  return null;
}

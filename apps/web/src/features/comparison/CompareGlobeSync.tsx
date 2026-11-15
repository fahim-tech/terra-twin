import { useEffect, useMemo } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { useApp } from "../../store/app";
import { selectedCandidate } from "../analogs/candidates";
import { searchTarget } from "../../store/searchTarget";

/** In the comparison stage, frames both globes at the same altitude so ground scale matches. */
export const COMPARE_HEIGHT_KM = 420;

export function CompareGlobeSync() {
  const bus = useGlobeBus();
  const stage = useApp((s) => s.stage);
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);

  useEffect(() => {
    if (stage !== "compare") return;
    const target = searchTarget(search);
    if (target) bus.send("mars", { t: "flyTo", lat: target.lat, lon: target.lon, heightKm: COMPARE_HEIGHT_KM });
    if (current) bus.send("earth", { t: "flyTo", lat: current.lat, lon: current.lon, heightKm: COMPARE_HEIGHT_KM });
  }, [bus, stage, search, current]);
  return null;
}

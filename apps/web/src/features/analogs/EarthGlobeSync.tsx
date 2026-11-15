import { useEffect, useMemo } from "react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import type { GlobeMarker } from "../../globes/protocol";
import { useEarthSites } from "../../services/api";
import { useApp } from "../../store/app";
import { candidateList, selectedCandidate } from "./candidates";

/** Keeps the Earth globe in step with search results and the selected candidate. */
export function EarthGlobeSync() {
  const bus = useGlobeBus();
  const earthSites = useEarthSites();
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const stage = useApp((s) => s.stage);
  const cands = useMemo(() => candidateList(search), [search]);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);

  useEffect(() => {
    if (!earthSites.data) return;
    bus.send("earth", {
      t: "setMarkers", group: "reference", markers: earthSites.data.map((x) => ({
        id: `ref:${x.id}`, lat: x.lat, lon: x.lon, kind: x.category === "negative_control" ? "control" : "reference", label: x.name,
      })),
    });
  }, [bus, earthSites.data]);

  useEffect(() => {
    const markers: GlobeMarker[] = cands.map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, kind: c.tier === 2 ? "leader" : "candidate", label: c.label, rank: c.tier === 1 ? c.rank : undefined }));
    bus.send("earth", { t: "setMarkers", group: "candidates", markers });
  }, [bus, cands]);

  useEffect(() => {
    if (!current) {
      bus.send("earth", { t: "setFootprints", group: "cand", footprints: [] });
      bus.send("earth", { t: "select", id: null });
      return;
    }
    bus.send("earth", { t: "select", id: current.id });
    bus.send("earth", {
      t: "setFootprints", group: "cand", footprints: [current.tier === 1 && current.bbox
        ? { id: current.id, kind: "cell", lat: current.lat, lon: current.lon, bbox: current.bbox }
        : { id: current.id, kind: "window", lat: current.lat, lon: current.lon, km: 50 }],
    });
    if (stage === "earth") bus.send("earth", { t: "flyTo", lat: current.lat, lon: current.lon, heightKm: 1600 });
  }, [bus, current, stage]);

  useEffect(() => {
    if (stage === "earth" && !current) bus.send("earth", { t: "reset" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useGlobeEvents("earth", (m) => {
    if (m.t === "markerClick" && !m.id.startsWith("ref:")) useApp.getState().set({ candidateId: m.id });
  });
  return null;
}

import { useEffect } from "react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { siteContaining } from "./MarsControls";

/** Keeps the Mars globe in step with app state (sites, selection, AOI) and turns picks into selections. */
export function MarsGlobeSync() {
  const bus = useGlobeBus();
  const sites = useSites();
  const selection = useApp((s) => s.selection);
  const footprintKm = useApp((s) => s.footprintKm);

  useEffect(() => {
    if (!sites.data) return;
    bus.send("mars", { t: "setMarkers", group: "sites", markers: sites.data.map((x) => ({ id: `site:${x.id}`, lat: x.lat, lon: x.lon, kind: "research_site", label: x.name })) });
  }, [bus, sites.data]);

  useEffect(() => {
    if (!selection) {
      bus.send("mars", { t: "setMarkers", group: "selection", markers: [] });
      bus.send("mars", { t: "setFootprints", group: "aoi", footprints: [] });
      bus.send("mars", { t: "select", id: null });
      return;
    }
    bus.send("mars", { t: "setMarkers", group: "selection", markers: [{ id: "selection", lat: selection.lat, lon: selection.lon, kind: "selection", label: selection.label }] });
    const site = sites.data?.find((x) => x.id === selection.siteId);
    bus.send("mars", {
      t: "setFootprints", group: "aoi", footprints: [
        { id: "aoi", kind: "aoi", lat: selection.lat, lon: selection.lon, km: footprintKm },
        ...(site ? [{ id: "ez", kind: "research_bbox" as const, lat: site.lat, lon: site.lon, bbox: [site.bbox.lon_min, site.bbox.lat_min, site.bbox.lon_max, site.bbox.lat_max] as [number, number, number, number] }] : []),
      ],
    });
    bus.send("mars", { t: "select", id: selection.siteId ? `site:${selection.siteId}` : "selection" });
  }, [bus, selection, footprintKm, sites.data]);

  useEffect(() => {
    if (selection) bus.send("mars", { t: "flyTo", lat: selection.lat, lon: selection.lon, heightKm: Math.max(1100, footprintKm * 30) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  useGlobeEvents("mars", (m) => {
    const { select, set } = useApp.getState();
    if (m.t === "pick") {
      const site = siteContaining(sites.data, m.lat, m.lon);
      select({ lat: m.lat, lon: m.lon, siteId: site?.id ?? null, label: site ? `${site.name} · picked point` : `${formatLat(m.lat, 2)}, ${formatLon(m.lon, 2)}` });
      if (useApp.getState().introOpen) set({ introOpen: false });
    } else if (m.t === "markerClick" && m.id.startsWith("site:")) {
      const site = sites.data?.find((x) => `site:${x.id}` === m.id);
      if (site) select({ lat: site.lat, lon: site.lon, siteId: site.id, label: site.name });
      if (useApp.getState().introOpen) set({ introOpen: false });
    }
  });
  return null;
}

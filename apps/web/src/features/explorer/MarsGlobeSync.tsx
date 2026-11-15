import { useEffect } from "react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import { zoneName } from "../../lib/glossary";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useExplorer } from "./explorerStore";
import { selectionFor, zoneSelection } from "./zones";

/**
 * Keeps the Mars globe in step with app state: the 39 research zones (faint footprints + centre
 * markers), the selection and its requested footprint, and turns picks into selections.
 */
export function MarsGlobeSync() {
  const bus = useGlobeBus();
  const sites = useSites();
  const selection = useApp((s) => s.selection);
  const footprintKm = useApp((s) => s.footprintKm);

  // Research zones layer: every zone's footprint drawn faintly, with its centre marker. Names come from
  // the hover readout and HTML annotations, so Cesium labels stay off.
  useEffect(() => {
    if (!sites.data) return;
    bus.send("mars", {
      t: "setMarkers", group: "sites", options: { labels: "none" },
      markers: sites.data.map((x) => ({ id: `site:${x.id}`, lat: x.lat, lon: x.lon, kind: "research_site", label: zoneName(x.id) })),
    });
    bus.send("mars", {
      t: "setFootprints", group: "zones",
      footprints: sites.data.map((x) => ({ id: x.id, kind: "research_bbox", lat: x.lat, lon: x.lon, bbox: [x.bbox.lon_min, x.bbox.lat_min, x.bbox.lon_max, x.bbox.lat_max] })),
    });
  }, [bus, sites.data]);

  // Selection marker and the requested footprint (AOI) around it.
  useEffect(() => {
    if (!selection) {
      bus.send("mars", { t: "setMarkers", group: "selection", markers: [] });
      bus.send("mars", { t: "setFootprints", group: "aoi", footprints: [] });
      bus.send("mars", { t: "select", id: null });
      return;
    }
    const atCentre = !!selection.siteId && sites.data?.some((x) => x.id === selection.siteId && Math.abs(x.lat - selection.lat) < 1e-6 && Math.abs(x.lon - selection.lon) < 1e-6);
    bus.send("mars", {
      t: "setMarkers", group: "selection", options: { labels: "none" },
      markers: atCentre ? [] : [{ id: "selection", lat: selection.lat, lon: selection.lon, kind: "selection", label: selection.label }],
    });
    bus.send("mars", { t: "setFootprints", group: "aoi", footprints: [{ id: "aoi", kind: "aoi", lat: selection.lat, lon: selection.lon, km: footprintKm }] });
    bus.send("mars", { t: "select", id: atCentre ? `site:${selection.siteId}` : "selection" });
  }, [bus, selection, footprintKm, sites.data]);

  useEffect(() => {
    if (selection) bus.send("mars", { t: "flyTo", lat: selection.lat, lon: selection.lon, heightKm: Math.max(1100, footprintKm * 30) });
    // Fly only when the selection changes; changing the footprint keeps the user's camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  useGlobeEvents("mars", (m) => {
    const { select, set, introOpen } = useApp.getState();
    // During the intro a click on the planet only dismisses the intro; it never selects a point.
    if ((m.t === "pick" || m.t === "markerClick") && introOpen) { set({ introOpen: false }); return; }
    if (m.t === "pick") {
      useExplorer.getState().set({ origin: null });
      select(selectionFor(sites.data, m.lat, m.lon));
    } else if (m.t === "markerClick" && m.id.startsWith("site:")) {
      const site = sites.data?.find((x) => `site:${x.id}` === m.id);
      if (site) { useExplorer.getState().set({ origin: null }); select(zoneSelection(site)); }
    }
  });
  return null;
}

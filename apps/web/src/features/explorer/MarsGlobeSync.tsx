import { useEffect, useSyncExternalStore } from "react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import { useLayout } from "../../app/useLayout";
import { zoneName } from "../../lib/glossary";
import { useSites } from "../../services/api";
import { DataLayerSync } from "../../components/datalayers/DataLayerSync";
import { useApp } from "../../store/app";
import { useExplorer } from "./explorerStore";
import { introOverlapsPlanet } from "./readouts";
import { selectionFor, zoneSelection } from "./zones";

const onResize = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };
/** Whether the window is taller than it is wide. */
function usePortrait(): boolean {
  return useSyncExternalStore(onResize, () => window.innerHeight > window.innerWidth, () => false);
}

/**
 * Keeps the Mars globe in step with app state: the 39 research zones (faint footprints + centre
 * markers), the selection and its requested footprint, and turns picks into selections.
 */
export function MarsGlobeSync() {
  const bus = useGlobeBus();
  const sites = useSites();
  const selection = useApp((s) => s.selection);
  const footprintKm = useApp((s) => s.footprintKm);
  const introOpen = useApp((s) => s.introOpen);
  const stage = useApp((s) => s.stage);

  // The title screen's three-quarter light, set for legibility (not the Sun's position), follows the intro
  // itself — not the idle spin, which stops at the first touch or never runs under reduced motion.
  useEffect(() => {
    bus.send("mars", { t: "setLight", mode: introOpen ? "intro" : "work" });
  }, [bus, introOpen]);

  // Research zones layer: every zone's footprint drawn faintly, with its centre marker. Names come from
  // the hover readout and HTML annotations, so Cesium labels stay off. Wherever the intro's copy overlaps the
  // planet — phones, and tablets and portrait windows, where the planet's left limb reaches under the copy
  // column — the zone glyphs and outlines would show through the text: they wait until it closes.
  const layout = useLayout();
  const portrait = usePortrait();
  const quietForIntro = introOpen && introOverlapsPlanet(layout, portrait);
  useEffect(() => {
    if (!sites.data) return;
    const zones = quietForIntro ? [] : sites.data;
    bus.send("mars", {
      t: "setMarkers", group: "sites", options: { labels: "none" },
      markers: zones.map((x) => ({ id: `site:${x.id}`, lat: x.lat, lon: x.lon, kind: "research_site", label: zoneName(x.id) })),
    });
    bus.send("mars", {
      t: "setFootprints", group: "zones",
      footprints: zones.map((x) => ({ id: x.id, kind: "research_bbox", lat: x.lat, lon: x.lon, bbox: [x.bbox.lon_min, x.bbox.lat_min, x.bbox.lon_max, x.bbox.lat_max] })),
    });
  }, [bus, sites.data, quietForIntro]);

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
    // A fresh id per AOI: re-adding the same entity id in one suspended batch can leave the new square undrawn.
    const aoiId = `aoi:${selection.lat.toFixed(5)}:${selection.lon.toFixed(5)}:${footprintKm}`;
    bus.send("mars", { t: "setFootprints", group: "aoi", footprints: [{ id: aoiId, kind: "aoi", lat: selection.lat, lon: selection.lon, km: footprintKm }] });
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
  // The 1 km data layer is drawn only while the explorer (and the layer's legend) is on screen.
  return <DataLayerSync planet="mars" active={stage === "mars" && !introOpen} />;
}

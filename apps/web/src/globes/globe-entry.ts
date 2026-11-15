/**
 * Globe iframe entry. One planet per JS realm (Ellipsoid.default is global mutable state).
 * Query string: ?planet=mars|earth. The parent sends `init` (with optional ion token) after load.
 */
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  CallbackProperty,
  Cesium3DTileset,
  CesiumTerrainProvider,
  Credit,
  DirectionalLight,
  EasingFunction,
  Ellipsoid,
  Entity,
  GeographicTilingScheme,
  Globe,
  HeightReference,
  ImageryLayer,
  Ion,
  LabelStyle,
  Math as CMath,
  NearFarScalar,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  WebMercatorTilingScheme,
  defined,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { MARS_IAU2000, R_EARTH_MEAN_M, R_MARS_M, centricToGraphic, graphicToCentric, normLon, squareFootprint } from "../lib/geodesy";
import { type GlobeFootprint, type GlobeMarker, type GlobeToParent, type LayerInfo, type ParentToGlobe, type Planet, isEnvelope, wrap } from "./protocol";

(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = CESIUM_BASE_URL;

const planet: Planet = new URLSearchParams(location.search).get("planet") === "earth" ? "earth" : "mars";
const parentOrigin = location.origin;

function post(msg: GlobeToParent) {
  window.parent.postMessage(wrap(msg), parentOrigin);
}

// ---------------------------------------------------------------- imagery definitions
const TREK = "https://trek.nasa.gov/tiles/Mars/EQ";
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

interface LayerDef extends LayerInfo {
  make: (ellipsoid: Ellipsoid) => UrlTemplateImageryProvider;
}

const MARS_LAYERS: LayerDef[] = [
  {
    id: "viking_color", label: "Viking colour mosaic", kind: "imagery",
    note: "NASA Mars Trek · Viking MDIM 2.1 colour, 232 m. Visualization only.",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`,
      tilingScheme: new GeographicTilingScheme({ ellipsoid: e }), maximumLevel: 7,
      credit: new Credit("NASA/JPL-Caltech/USGS · Mars Trek Viking MDIM 2.1"),
    }),
  },
  {
    id: "mola_shade", label: "MOLA colour shaded relief", kind: "imagery",
    note: "NASA Mars Trek · MOLA elevation colour shaded relief, 463 m. Colour encodes elevation; visualization only.",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${TREK}/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`,
      tilingScheme: new GeographicTilingScheme({ ellipsoid: e }), maximumLevel: 7,
      credit: new Credit("NASA/JPL/GSFC · MOLA shaded relief via Mars Trek"),
    }),
  },
];

const EARTH_LAYERS: LayerDef[] = [
  {
    id: "blue_marble_relief", label: "Blue Marble shaded relief", kind: "imagery",
    note: "NASA GIBS · Blue Marble shaded relief + bathymetry, 500 m. Visualization only.",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid: e }), maximumLevel: 8,
      credit: new Credit("NASA Earth Observatory · Blue Marble via GIBS"),
    }),
  },
  {
    id: "blue_marble_ng", label: "Blue Marble next generation", kind: "imagery",
    note: "NASA GIBS · Blue Marble Next Generation true colour, 500 m. Visualization only.",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${GIBS}/BlueMarble_NextGeneration/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid: e }), maximumLevel: 8,
      credit: new Credit("NASA Earth Observatory · Blue Marble NG via GIBS"),
    }),
  },
];

const LAYERS = planet === "mars" ? MARS_LAYERS : EARTH_LAYERS;

// ---------------------------------------------------------------- state
let viewer: Viewer | null = null;
let ellipsoid: Ellipsoid;
let mode: "ion" | "fallback" = "fallback";
let baseLayer: ImageryLayer | null = null;
let spinning = false;
let selectedId: string | null = null;
const groups = new Map<string, Entity[]>();
const meanR = planet === "mars" ? R_MARS_M : R_EARTH_MEAN_M;

// Latitude conversion between the API convention (planetocentric) and the rendering ellipsoid.
function toRender(lat: number) {
  return planet === "mars" ? centricToGraphic(lat, ellipsoid.maximumRadius, ellipsoid.minimumRadius) : lat;
}
function fromRender(lat: number) {
  return planet === "mars" ? graphicToCentric(lat, ellipsoid.maximumRadius, ellipsoid.minimumRadius) : lat;
}
function pos(lat: number, lon: number, h = 0) {
  return Cartesian3.fromDegrees(lon, toRender(lat), h, ellipsoid);
}

const HOME = planet === "mars"
  ? { lat: 12, lon: 70, heightKm: 9_200 }
  : { lat: 18, lon: 10, heightKm: 17_500 };

const STYLE: Record<GlobeMarker["kind"], { color: Color; size: number; outline: Color }> = {
  research_site: { color: Color.fromCssColorString("#F2F5F8").withAlpha(0.55), size: 5, outline: Color.fromCssColorString("#080D14").withAlpha(0.6) },
  selection: { color: Color.fromCssColorString("#EB896A"), size: 9, outline: Color.WHITE },
  candidate: { color: Color.fromCssColorString("#57BDB4").withAlpha(0.85), size: 6, outline: Color.fromCssColorString("#080D14").withAlpha(0.7) },
  leader: { color: Color.fromCssColorString("#F2F5F8"), size: 10, outline: Color.fromCssColorString("#57BDB4") },
  reference: { color: Color.fromCssColorString("#D9AD70"), size: 6, outline: Color.fromCssColorString("#080D14") },
  control: { color: Color.fromCssColorString("#94A3B5").withAlpha(0.6), size: 5, outline: Color.fromCssColorString("#080D14") },
};

function clearGroup(group: string) {
  for (const e of groups.get(group) ?? []) viewer?.entities.remove(e);
  groups.delete(group);
}

function setMarkers(group: string, markers: GlobeMarker[]) {
  if (!viewer) return;
  clearGroup(group);
  const list: Entity[] = [];
  for (const m of markers) {
    const st = STYLE[m.kind];
    const id = m.id;
    const isSel = () => selectedId === id;
    const e = viewer.entities.add({
      id: `${group}::${id}`,
      position: pos(m.lat, m.lon),
      point: {
        pixelSize: new CallbackProperty(() => (isSel() ? st.size + 5 : st.size), false),
        color: st.color,
        outlineColor: new CallbackProperty(() => (isSel() ? Color.WHITE : st.outline), false),
        outlineWidth: new CallbackProperty(() => (isSel() ? 2.5 : 1.2), false),
        heightReference: HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(1e5, 1.25, 2.5e7, 0.8),
      },
      label: m.label ? {
        text: m.rank ? `${m.rank}  ${m.label}` : m.label,
        font: "500 12px Inter, system-ui, sans-serif",
        fillColor: Color.fromCssColorString("#F2F5F8"),
        outlineColor: Color.fromCssColorString("#080D14").withAlpha(0.9),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: new CallbackProperty(() => isSel() || m.kind === "selection" || m.kind === "leader", false),
      } : undefined,
    });
    list.push(e);
  }
  groups.set(group, list);
}

const FOOT_COLOR: Record<GlobeFootprint["kind"], string> = {
  aoi: "#EB896A", cell: "#57BDB4", window: "#F2F5F8", research_bbox: "#EB896A",
};

function setFootprints(group: string, fps: GlobeFootprint[]) {
  if (!viewer) return;
  clearGroup(group);
  const list: Entity[] = [];
  for (const f of fps) {
    let corners: { lat: number; lon: number }[];
    if (f.bbox) {
      const [w, s, e, n] = f.bbox;
      corners = [{ lat: s, lon: w }, { lat: s, lon: e }, { lat: n, lon: e }, { lat: n, lon: w }];
    } else {
      corners = squareFootprint(f.lat, f.lon, f.km ?? 25, meanR);
    }
    const ring = corners.map((c) => pos(c.lat, normLon(c.lon)));
    const color = Color.fromCssColorString(FOOT_COLOR[f.kind]);
    list.push(viewer.entities.add({
      id: `${group}::${f.id}`,
      polygon: {
        hierarchy: new PolygonHierarchy(ring),
        material: color.withAlpha(f.kind === "research_bbox" ? 0.05 : 0.14),
        outline: false,
      },
      polyline: {
        positions: [...ring, ring[0]],
        width: f.kind === "research_bbox" ? 1 : 1.6,
        material: color.withAlpha(f.kind === "research_bbox" ? 0.45 : 0.95),
        clampToGround: false,
        arcType: 1,
      },
    }));
  }
  groups.set(group, list);
}

function flyTo(lat: number, lon: number, heightKm = planet === "mars" ? 1_400 : 2_200, durationS = 1.8) {
  if (!viewer) return;
  spinning = false;
  viewer.camera.flyTo({
    destination: pos(lat, lon, heightKm * 1000),
    orientation: { heading: 0, pitch: -CMath.PI_OVER_TWO, roll: 0 },
    duration: durationS,
    easingFunction: EasingFunction.QUADRATIC_IN_OUT,
  });
}

function setLayer(id: string) {
  if (!viewer) return;
  const def = LAYERS.find((l) => l.id === id) ?? LAYERS[0];
  const layer = new ImageryLayer(def.make(ellipsoid));
  if (baseLayer) viewer.imageryLayers.remove(baseLayer, true);
  viewer.imageryLayers.add(layer, 0);
  baseLayer = layer;
}

// Light from just above-left of the camera so the hemisphere in view is always lit, with soft terminator.
function updateLight() {
  if (!viewer) return;
  const cam = viewer.camera;
  const dir = Cartesian3.clone(cam.directionWC);
  const right = Cartesian3.multiplyByScalar(cam.rightWC, 0.55, new Cartesian3());
  const up = Cartesian3.multiplyByScalar(cam.upWC, -0.35, new Cartesian3());
  Cartesian3.add(dir, right, dir);
  Cartesian3.add(dir, up, dir);
  Cartesian3.normalize(dir, dir);
  (viewer.scene.light as DirectionalLight).direction = dir;
}

async function init(ionToken: string | null) {
  if (viewer) return;
  if (planet === "mars") {
    // Mars sphere matches the MOLA mosaic CRS and the research code exactly (planetocentric = geodetic).
    // With the official Cesium Mars tileset we must use Ellipsoid.MARS (IAU 2000) instead.
    ellipsoid = ionToken ? Ellipsoid.MARS : new Ellipsoid(R_MARS_M, R_MARS_M, R_MARS_M);
  } else {
    ellipsoid = Ellipsoid.WGS84;
  }
  Ellipsoid.default = ellipsoid; // safe: this realm hosts one planet only
  if (ionToken) Ion.defaultAccessToken = ionToken;

  const useMarsTiles = planet === "mars" && !!ionToken;
  viewer = new Viewer("globe", {
    globe: useMarsTiles ? false : new Globe(ellipsoid),
    baseLayer: false,
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, timeline: false,
    animation: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, requestRenderMode: false, msaaSamples: 4,
  });
  const scene = viewer.scene;
  scene.backgroundColor = Color.fromCssColorString("#080D14");
  scene.light = new DirectionalLight({ direction: new Cartesian3(1, 0, 0), intensity: 2.2 });
  scene.postUpdate.addEventListener(updateLight);
  (viewer.cesiumWidget.creditContainer as HTMLElement).style.cssText =
    "font:10px Inter,system-ui;opacity:.55;filter:grayscale(1) invert(1);";
  scene.screenSpaceCameraController.minimumZoomDistance = planet === "mars" ? 20_000 : 20_000;
  scene.screenSpaceCameraController.maximumZoomDistance = planet === "mars" ? 40_000_000 : 80_000_000;

  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    if (planet === "mars") {
      scene.skyAtmosphere.hueShift = -0.08;
      scene.skyAtmosphere.saturationShift = -0.35;
      scene.skyAtmosphere.brightnessShift = -0.45;
    } else {
      scene.skyAtmosphere.brightnessShift = -0.15;
    }
  }

  if (scene.globe) {
    const g = scene.globe;
    g.baseColor = Color.fromCssColorString(planet === "mars" ? "#3a1f17" : "#0d1a26");
    g.enableLighting = true;
    g.dynamicAtmosphereLighting = false;
    g.showGroundAtmosphere = planet === "earth";
    g.atmosphereLightIntensity = 6;
    g.maximumScreenSpaceError = 1.6;
    g.tileCacheSize = 200;
    setLayer(LAYERS[0].id);
  }

  try {
    if (useMarsTiles) {
      const tileset = await Cesium3DTileset.fromIonAssetId(3644333); // Cesium Mars
      scene.primitives.add(tileset);
      mode = "ion";
    } else if (planet === "earth" && ionToken) {
      scene.globe.terrainProvider = await CesiumTerrainProvider.fromIonAssetId(1);
      mode = "ion";
    }
  } catch (err) {
    post({ t: "error", message: `Cesium ion asset failed, using NASA imagery fallback: ${String(err)}` });
    if (!scene.globe) scene.globe = new Globe(ellipsoid);
    setLayer(LAYERS[0].id);
    mode = "fallback";
  }

  viewer.camera.setView({ destination: pos(HOME.lat, HOME.lon, HOME.heightKm * 1000) });

  // Interaction
  const handler = new ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((ev: { position: Cartesian2 }) => {
    post({ t: "interaction" });
    spinning = false;
    const picked = scene.pick(ev.position);
    if (defined(picked) && picked.id instanceof Entity && typeof picked.id.id === "string" && picked.id.point) {
      const [, id] = picked.id.id.split("::");
      if (id) { post({ t: "markerClick", id }); return; }
    }
    const c = pickCarto(ev.position);
    if (c) post({ t: "pick", lat: c.lat, lon: c.lon });
  }, ScreenSpaceEventType.LEFT_CLICK);

  let last = 0;
  handler.setInputAction((ev: { endPosition: Cartesian2 }) => {
    const now = performance.now();
    if (now - last < 60) return;
    last = now;
    const c = pickCarto(ev.endPosition);
    post({ t: "hover", lat: c?.lat ?? null, lon: c?.lon ?? null });
  }, ScreenSpaceEventType.MOUSE_MOVE);
  for (const t of [ScreenSpaceEventType.LEFT_DOWN, ScreenSpaceEventType.WHEEL, ScreenSpaceEventType.PINCH_START]) {
    handler.setInputAction(() => { if (spinning) { spinning = false; post({ t: "interaction" }); } }, t);
  }

  // Idle spin (stops on interaction / reduced-motion)
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let prev = performance.now();
  scene.preRender.addEventListener(() => {
    const now = performance.now();
    const dt = (now - prev) / 1000;
    prev = now;
    if (spinning && !reduced) viewer!.camera.rotate(Cartesian3.UNIT_Z, -0.035 * dt);
  });

  post({
    t: "ready", planet, mode,
    layers: LAYERS.map(({ id, label, kind, note }) => ({ id, label, kind, note })),
    ellipsoid: planet === "earth" ? "WGS84" : ionToken ? `Mars IAU 2000 (${MARS_IAU2000.a}/${MARS_IAU2000.b} m)` : `Mars sphere R = ${R_MARS_M} m`,
  });
}

function pickCarto(p: Cartesian2): { lat: number; lon: number } | null {
  if (!viewer) return null;
  const scene = viewer.scene;
  let cart: Cartesian3 | undefined;
  if (mode === "ion" && planet === "mars" && scene.pickPositionSupported) {
    cart = scene.pickPosition(p);
  }
  if (!cart) cart = viewer.camera.pickEllipsoid(p, ellipsoid);
  if (!cart) return null;
  const c = Cartographic.fromCartesian(cart, ellipsoid);
  if (!c) return null;
  return { lat: fromRender(CMath.toDegrees(c.latitude)), lon: normLon(CMath.toDegrees(c.longitude)) };
}

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.origin !== parentOrigin || ev.source !== window.parent || !isEnvelope(ev.data)) return;
  const m = ev.data.msg as ParentToGlobe;
  try {
    switch (m.t) {
      case "init": void init(m.ionToken); break;
      case "flyTo": flyTo(m.lat, m.lon, m.heightKm, m.durationS); break;
      case "reset":
        viewer?.camera.flyTo({ destination: pos(HOME.lat, HOME.lon, HOME.heightKm * 1000), duration: m.durationS ?? 1.6, easingFunction: EasingFunction.QUADRATIC_IN_OUT });
        break;
      case "setMarkers": setMarkers(m.group, m.markers); break;
      case "setFootprints": setFootprints(m.group, m.footprints); break;
      case "select": selectedId = m.id; break;
      case "setLayer": setLayer(m.layer); break;
      case "setSpin": spinning = m.on; break;
      case "resize": viewer?.resize(); break;
    }
  } catch (err) {
    post({ t: "error", message: String(err) });
  }
});

window.addEventListener("beforeunload", () => { viewer?.destroy(); viewer = null; });

// Handshake: tell the parent this realm is listening; it replies with `init`.
post({ t: "boot", planet });

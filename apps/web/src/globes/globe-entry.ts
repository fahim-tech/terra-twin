/**
 * Globe iframe entry. One planet per JS realm (Ellipsoid.default is global mutable state).
 * Query string: ?planet=mars|earth. The parent sends `init` (with optional ion token) after `boot`.
 *
 * Besides rendering, this realm reports camera telemetry (altitude, ground scale, heading) and the
 * projected screen positions of tracked points, so the React shell can draw map instruments and
 * leader-line annotations in HTML without reaching into Cesium.
 */
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  CallbackProperty,
  Cesium3DTileset,
  CesiumTerrainProvider,
  Color,
  Credit,
  CustomDataSource,
  DirectionalLight,
  EasingFunction,
  Ellipsoid,
  EllipsoidGeodesic,
  EllipsoidalOccluder,
  Entity,
  GeographicTilingScheme,
  Globe,
  HeightReference,
  HorizontalOrigin,
  ImageryLayer,
  Ion,
  LabelStyle,
  Math as CMath,
  NearFarScalar,
  PerspectiveFrustum,
  PolygonHierarchy,
  Rectangle,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  WebMercatorTilingScheme,
  defined,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { MARS_IAU2000, R_EARTH_MEAN_M, R_MARS_M, centricToGraphic, distanceKm, graphicToCentric, normLon, squareFootprint } from "../lib/geodesy";
import {
  type AnchorPosition,
  type AnchorRequest,
  type CameraTelemetry,
  type GlobeFootprint,
  type GlobeMarker,
  type GlobeToParent,
  type LayerInfo,
  type MarkerGroupOptions,
  type ParentToGlobe,
  type Planet,
  isEnvelope,
  wrap,
} from "./protocol";

(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = CESIUM_BASE_URL;

const planet: Planet = new URLSearchParams(location.search).get("planet") === "earth" ? "earth" : "mars";
const parentOrigin = location.origin;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
let moving = false;
let selectedId: string | null = null;
const groups = new Map<string, CustomDataSource>();
const overlays = new Map<string, ImageryLayer>();
let graticule: CustomDataSource | null = null;
let anchors: AnchorRequest[] = [];
let lastAnchors = "";
let lastTelemetry = "";
let lastTelemetryAt = 0;
const meanR = planet === "mars" ? R_MARS_M : R_EARTH_MEAN_M;
let insets = { top: 0, right: 0, bottom: 0, left: 0 };
let occluder: EllipsoidalOccluder | null = null;

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
function requestRender() {
  viewer?.scene.requestRender();
}

const HOME = planet === "mars"
  ? { lat: 12, lon: 70, heightKm: 9_200 }
  : { lat: 18, lon: 10, heightKm: 17_500 };

const css = (c: string) => Color.fromCssColorString(c);
const STYLE: Record<GlobeMarker["kind"], { color: Color; size: number; outline: Color; outlineWidth: number }> = {
  research_site: { color: css("#F2EEE8").withAlpha(0.7), size: 5, outline: css("#07090C").withAlpha(0.65), outlineWidth: 1 },
  selection: { color: css("#E8835F"), size: 9, outline: css("#FFF6EE"), outlineWidth: 2 },
  candidate: { color: css("#5CC4B6").withAlpha(0.9), size: 6, outline: css("#07090C").withAlpha(0.7), outlineWidth: 1 },
  leader: { color: css("#F4F1EA"), size: 10, outline: css("#5CC4B6"), outlineWidth: 2.5 },
  pool: { color: css("#C9D3DC").withAlpha(0.32), size: 3.5, outline: css("#07090C").withAlpha(0.4), outlineWidth: 0.5 },
  reference: { color: css("#D9B07A"), size: 6, outline: css("#07090C"), outlineWidth: 1 },
  control: { color: css("#8E99A6").withAlpha(0.6), size: 5, outline: css("#07090C"), outlineWidth: 1 },
};

function dataSource(group: string, opts: MarkerGroupOptions = {}): CustomDataSource {
  let ds = groups.get(group);
  if (!ds) {
    ds = new CustomDataSource(group);
    groups.set(group, ds);
    void viewer!.dataSources.add(ds);
  }
  const clustering = ds.clustering;
  clustering.enabled = !!opts.cluster;
  if (opts.cluster) {
    clustering.pixelRange = 26;
    clustering.minimumClusterSize = 3;
    clustering.clusterBillboards = false;
    clustering.clusterLabels = true;
    clustering.clusterPoints = true;
    clustering.clusterEvent.removeEventListener(styleCluster);
    clustering.clusterEvent.addEventListener(styleCluster);
  }
  return ds;
}

function styleCluster(entities: Entity[], cluster: { billboard: { show: boolean }; label: any; point: any }) {
  cluster.billboard.show = false;
  cluster.point.show = true;
  cluster.point.pixelSize = 16 + Math.min(18, Math.round(Math.sqrt(entities.length) * 3));
  cluster.point.color = css("#5CC4B6").withAlpha(0.22);
  cluster.point.outlineColor = css("#5CC4B6").withAlpha(0.95);
  cluster.point.outlineWidth = 1.25;
  cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
  cluster.label.show = true;
  cluster.label.text = String(entities.length);
  cluster.label.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace";
  cluster.label.fillColor = css("#EAF7F4");
  cluster.label.outlineColor = css("#07090C");
  cluster.label.outlineWidth = 2;
  cluster.label.style = LabelStyle.FILL_AND_OUTLINE;
  cluster.label.horizontalOrigin = HorizontalOrigin.CENTER;
  cluster.label.verticalOrigin = VerticalOrigin.CENTER;
  cluster.label.pixelOffset = new Cartesian2(0, 0);
  cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
}

function setMarkers(group: string, markers: GlobeMarker[], opts: MarkerGroupOptions = {}) {
  if (!viewer) return;
  const ds = dataSource(group, opts);
  ds.entities.suspendEvents();
  ds.entities.removeAll();
  const labels = opts.labels ?? "selected";
  for (const m of markers) {
    const st = STYLE[m.kind];
    const id = m.id;
    const isSel = () => selectedId === id;
    const world = pos(m.lat, m.lon);
    // Drawn over the imagery (no depth test) but hidden, and unpickable, when behind the planet.
    const visible = () => !occluder || occluder.isPointVisible(world);
    ds.entities.add({
      id: `${group}::${id}`,
      position: world,
      point: {
        show: new CallbackProperty(visible, false),
        pixelSize: new CallbackProperty(() => (isSel() ? st.size + 5 : st.size), false),
        color: st.color,
        outlineColor: new CallbackProperty(() => (isSel() ? Color.WHITE : st.outline), false),
        outlineWidth: new CallbackProperty(() => (isSel() ? 2.5 : st.outlineWidth), false),
        heightReference: HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(1e5, 1.25, 2.5e7, 0.8),
      },
      label: m.label && labels !== "none" ? {
        text: m.rank ? `${m.rank}  ${m.label}` : m.label,
        font: "500 12px 'IBM Plex Sans', system-ui, sans-serif",
        fillColor: css("#F2EEE8"),
        outlineColor: css("#07090C").withAlpha(0.9),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: new CallbackProperty(() => visible() && (labels === "all" || isSel() || m.kind === "selection" || m.kind === "leader"), false),
      } : undefined,
    });
  }
  ds.entities.resumeEvents();
  requestRender();
}

const FOOT_COLOR: Record<GlobeFootprint["kind"], string> = {
  aoi: "#E8835F", cell: "#5CC4B6", window: "#F4F1EA", research_bbox: "#E8835F",
};

function setFootprints(group: string, fps: GlobeFootprint[]) {
  if (!viewer) return;
  const ds = dataSource(`fp:${group}`);
  ds.entities.suspendEvents();
  ds.entities.removeAll();
  for (const f of fps) {
    let corners: { lat: number; lon: number }[];
    if (f.bbox) {
      const [w, s, e, n] = f.bbox;
      corners = [{ lat: s, lon: w }, { lat: s, lon: e }, { lat: n, lon: e }, { lat: n, lon: w }];
    } else {
      corners = squareFootprint(f.lat, f.lon, f.km ?? 25, meanR);
    }
    const ring = corners.map((c) => pos(c.lat, normLon(c.lon)));
    const color = css(FOOT_COLOR[f.kind]);
    const faint = f.kind === "research_bbox";
    ds.entities.add({
      id: `fp:${group}::${f.id}`,
      polygon: { hierarchy: new PolygonHierarchy(ring), material: color.withAlpha(faint ? 0.04 : 0.12), outline: false },
      polyline: {
        positions: [...ring, ring[0]],
        width: faint ? 1 : 1.5,
        material: color.withAlpha(faint ? 0.5 : 0.95),
        arcType: ArcType.GEODESIC,
      },
    });
  }
  ds.entities.resumeEvents();
  requestRender();
}

function setGraticule(on: boolean, stepDeg = 30) {
  if (!viewer) return;
  if (!graticule) {
    graticule = new CustomDataSource("graticule");
    void viewer.dataSources.add(graticule);
  }
  graticule.entities.removeAll();
  if (on) {
    const material = Color.WHITE.withAlpha(0.13);
    for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
      const positions: Cartesian3[] = [];
      for (let lon = -180; lon <= 180; lon += 3) positions.push(pos(lat, lon));
      graticule.entities.add({ polyline: { positions, width: lat === 0 ? 1.2 : 0.8, material, arcType: ArcType.RHUMB } });
    }
    for (let lon = -180; lon < 180; lon += stepDeg) {
      const positions: Cartesian3[] = [];
      for (let lat = -88; lat <= 88; lat += 2) positions.push(pos(lat, lon));
      graticule.entities.add({ polyline: { positions, width: lon === 0 ? 1.2 : 0.8, material, arcType: ArcType.GEODESIC } });
    }
  }
  requestRender();
}

async function setOverlay(id: string, url: string | null, alpha = 1) {
  if (!viewer) return;
  const prev = overlays.get(id);
  if (prev) {
    viewer.imageryLayers.remove(prev, true);
    overlays.delete(id);
  }
  if (!url) { requestRender(); return; }
  try {
    const provider = await SingleTileImageryProvider.fromUrl(url, {
      rectangle: Rectangle.fromDegrees(-180, -90, 180, 90),
      ellipsoid,
    });
    if (!viewer) return;
    const layer = new ImageryLayer(provider, { alpha });
    viewer.imageryLayers.add(layer);
    overlays.set(id, layer);
    requestRender();
  } catch (err) {
    post({ t: "error", message: `overlay ${id} failed: ${String(err)}` });
  }
}

/** Centre of the frame area not covered by shell UI, in CSS pixels. */
function focusPoint() {
  const c = viewer!.scene.canvas;
  const freeW = Math.max(40, c.clientWidth - insets.left - insets.right);
  const freeH = Math.max(40, c.clientHeight - insets.top - insets.bottom);
  return { x: insets.left + freeW / 2, y: insets.top + freeH / 2, freeW, freeH, w: c.clientWidth, h: c.clientHeight };
}

function currentCenter(): { lat: number; lon: number } | null {
  if (!viewer) return null;
  const f = focusPoint();
  return pickCarto(new Cartesian2(f.x, f.y));
}

/** Ground metres per CSS pixel at nadir for a camera at heightM. */
function mppAtHeight(heightM: number) {
  const fr = viewer!.camera.frustum as PerspectiveFrustum;
  const fovy = fr.fovy ?? CMath.toRadians(60);
  return (2 * heightM * Math.tan(fovy / 2)) / viewer!.scene.canvas.clientHeight;
}

/** Camera nadir point that puts (lat, lon) at the focus point of the free area (heading 0). */
function aimFor(lat: number, lon: number, heightM: number) {
  const f = focusPoint();
  const m = mppAtHeight(heightM);
  const north = (f.y - f.h / 2) * m;
  const east = -(f.x - f.w / 2) * m;
  const dLat = (north / meanR) * (180 / Math.PI);
  const dLon = (east / (meanR * Math.max(Math.cos((lat * Math.PI) / 180), 0.05))) * (180 / Math.PI);
  return { lat: Math.max(-89.5, Math.min(89.5, lat + dLat)), lon: normLon(lon + dLon) };
}

function fitBounds(west: number, south: number, east: number, north: number, padding = 0.18, minKm = 30, maxKm?: number, durationS?: number) {
  if (!viewer) return;
  const span = ((east - west) % 360 + 360) % 360 || 360;
  const lat = (south + north) / 2;
  const lon = normLon(west + span / 2);
  const groundW = (span * Math.PI / 180) * meanR * Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
  const groundH = ((north - south) * Math.PI / 180) * meanR;
  const f = focusPoint();
  const mpp = Math.max(groundW / f.freeW, groundH / f.freeH) * (1 + 2 * padding);
  const fr = viewer.camera.frustum as PerspectiveFrustum;
  const fovy = fr.fovy ?? CMath.toRadians(60);
  let heightKm = (mpp * viewer.scene.canvas.clientHeight) / (2 * Math.tan(fovy / 2)) / 1000;
  heightKm = Math.max(minKm, Math.min(maxKm ?? (planet === "mars" ? 30_000 : 60_000), heightKm));
  flyTo(lat, lon, heightKm, durationS);
}

/** Flight duration grows with angular distance and altitude change; reduced motion jumps. */
function autoDuration(lat: number, lon: number, heightKm: number) {
  if (reducedMotion) return 0;
  const from = currentCenter();
  const h0 = (viewer?.camera.positionCartographic.height ?? heightKm * 1000) / 1000;
  const ang = from ? distanceKm(from.lat, from.lon, lat, lon, meanR) / (Math.PI * meanR / 1000) : 0.5;
  const zoom = Math.abs(Math.log10(Math.max(heightKm, 1) / Math.max(h0, 1)));
  return Math.min(2.1, Math.max(0.7, 0.7 + 1.1 * ang + 0.35 * zoom));
}

function flyTo(lat: number, lon: number, heightKm = planet === "mars" ? 1_400 : 2_200, durationS?: number) {
  if (!viewer) return;
  spinning = false;
  const aim = aimFor(lat, lon, heightKm * 1000);
  viewer.camera.flyTo({
    destination: pos(aim.lat, aim.lon, heightKm * 1000),
    orientation: { heading: 0, pitch: -CMath.PI_OVER_TWO, roll: 0 },
    duration: durationS ?? autoDuration(lat, lon, heightKm),
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
  requestRender();
}

function zoom(direction: "in" | "out") {
  if (!viewer) return;
  const cam = viewer.camera;
  const h = cam.positionCartographic.height;
  const target = direction === "in" ? h * 0.55 : h / 0.55;
  const c = currentCenter();
  if (!c) { direction === "in" ? cam.zoomIn(h * 0.45) : cam.zoomOut(h * 0.8); requestRender(); return; }
  cam.flyTo({
    destination: pos(c.lat, c.lon, Math.min(Math.max(target, 25_000), planet === "mars" ? 40_000_000 : 80_000_000)),
    orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 },
    duration: reducedMotion ? 0 : 0.45,
    easingFunction: EasingFunction.QUADRATIC_OUT,
  });
}

/** Pan by a fraction of the frame (dx, dy in −1..1), keeping altitude. Keyboard alternative to dragging. */
function panBy(dx: number, dy: number) {
  if (!viewer) return;
  const c = currentCenter();
  if (!c) return;
  const canvas = viewer.scene.canvas;
  const mpp = metersPerPixel() ?? (viewer.camera.positionCartographic.height / canvas.clientHeight);
  const heading = viewer.camera.heading;
  const ex = dx * canvas.clientWidth * mpp;
  const ny = -dy * canvas.clientHeight * mpp;
  const north = ny * Math.cos(heading) - ex * Math.sin(heading);
  const east = ny * Math.sin(heading) + ex * Math.cos(heading);
  const dLat = (north / meanR) * (180 / Math.PI);
  const dLon = (east / (meanR * Math.max(Math.cos((c.lat * Math.PI) / 180), 0.05))) * (180 / Math.PI);
  const lat = Math.max(-89.5, Math.min(89.5, c.lat + dLat));
  viewer.camera.flyTo({
    destination: pos(lat, normLon(c.lon + dLon), viewer.camera.positionCartographic.height),
    orientation: { heading, pitch: viewer.camera.pitch, roll: 0 },
    duration: reducedMotion ? 0 : 0.35,
    easingFunction: EasingFunction.QUADRATIC_OUT,
  });
}

function resetHeading() {
  if (!viewer) return;
  const cam = viewer.camera;
  cam.flyTo({
    destination: cam.positionWC.clone(),
    orientation: { heading: 0, pitch: cam.pitch, roll: 0 },
    duration: reducedMotion ? 0 : 0.4,
  });
}

function metersPerPixel(): number | null {
  if (!viewer) return null;
  const f = focusPoint();
  const a = viewer.camera.pickEllipsoid(new Cartesian2(f.x - 50, f.y), ellipsoid);
  const b = viewer.camera.pickEllipsoid(new Cartesian2(f.x + 50, f.y), ellipsoid);
  if (!a || !b) return null;
  const g = new EllipsoidGeodesic(Cartographic.fromCartesian(a, ellipsoid), Cartographic.fromCartesian(b, ellipsoid), ellipsoid);
  const d = g.surfaceDistance;
  return Number.isFinite(d) && d > 0 ? d / 100 : null;
}

function emitTelemetry(force = false) {
  if (!viewer) return;
  const now = performance.now();
  if (!force && now - lastTelemetryAt < 90) return;
  const cam = viewer.camera;
  const center = currentCenter();
  const t: CameraTelemetry = {
    heightKm: Math.round(cam.positionCartographic.height / 10) / 100,
    center: center ? { lat: Math.round(center.lat * 1e4) / 1e4, lon: Math.round(center.lon * 1e4) / 1e4 } : null,
    metersPerPixel: (() => { const m = metersPerPixel(); return m === null ? null : Math.round(m * 10) / 10; })(),
    headingDeg: Math.round(CMath.toDegrees(cam.heading) * 10) / 10 % 360,
    pitchDeg: Math.round(CMath.toDegrees(cam.pitch) * 10) / 10,
    moving,
  };
  const key = JSON.stringify(t);
  if (key === lastTelemetry && !force) return;
  lastTelemetry = key;
  lastTelemetryAt = now;
  post({ t: "camera", camera: t });
}

function emitAnchors() {
  if (!viewer || anchors.length === 0) return;
  const scene = viewer.scene;
  const occluder = new EllipsoidalOccluder(ellipsoid, viewer.camera.positionWC);
  const w = scene.canvas.clientWidth, h = scene.canvas.clientHeight;
  const out: AnchorPosition[] = anchors.map((a) => {
    const world = pos(a.lat, a.lon);
    const win = SceneTransforms.worldToWindowCoordinates(scene, world);
    const onScreen = !!win && win.x >= -20 && win.y >= -20 && win.x <= w + 20 && win.y <= h + 20;
    return {
      id: a.id,
      x: win ? Math.round(win.x * 2) / 2 : -1,
      y: win ? Math.round(win.y * 2) / 2 : -1,
      visible: onScreen && occluder.isPointVisible(world),
    };
  });
  const key = JSON.stringify(out);
  if (key === lastAnchors) return;
  lastAnchors = key;
  post({ t: "anchors", anchors: out });
}

async function snapshot(requestId: string, lat: number, lon: number, heightKm: number, maxWidth = 960) {
  if (!viewer) return post({ t: "snapshot", requestId, dataUrl: null, width: 0, height: 0, error: "viewer not ready" });
  const scene = viewer.scene;
  const cam = viewer.camera;
  const saved = { position: cam.positionWC.clone(), direction: cam.directionWC.clone(), up: cam.upWC.clone() };
  const wasSpinning = spinning;
  spinning = false;
  try {
    cam.setView({ destination: pos(lat, lon, heightKm * 1000), orientation: { heading: 0, pitch: -CMath.PI_OVER_TWO, roll: 0 } });
    const t0 = performance.now();
    // Wait (bounded) for imagery tiles of the new view to load.
    await new Promise<void>((resolve) => {
      let stable = 0;
      const tick = () => {
        scene.requestRender();
        const loaded = scene.globe ? scene.globe.tilesLoaded : true;
        stable = loaded ? stable + 1 : 0;
        if (stable >= 6 || performance.now() - t0 > 9000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const shot = await new Promise<{ url: string; w: number; h: number }>((resolve, reject) => {
      const remove = scene.postRender.addEventListener(() => {
        remove();
        try {
          const src = scene.canvas;
          const scale = Math.min(1, maxWidth / src.width);
          const out = document.createElement("canvas");
          out.width = Math.round(src.width * scale);
          out.height = Math.round(src.height * scale);
          out.getContext("2d")!.drawImage(src, 0, 0, out.width, out.height);
          resolve({ url: out.toDataURL("image/jpeg", 0.86), w: out.width, h: out.height });
        } catch (e) {
          reject(e);
        }
      });
      scene.requestRender();
    });
    post({ t: "snapshot", requestId, dataUrl: shot.url, width: shot.w, height: shot.h });
  } catch (err) {
    post({ t: "snapshot", requestId, dataUrl: null, width: 0, height: 0, error: String(err) });
  } finally {
    cam.setView({ destination: saved.position, orientation: { direction: saved.direction, up: saved.up } });
    spinning = wasSpinning;
    requestRender();
  }
}

// Light from just above-left of the camera so the hemisphere in view is always lit, with a soft terminator.
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
    selectionIndicator: false, msaaSamples: 4,
    // Render only when something changes (camera, tiles, data, messages): saves GPU and battery.
    requestRenderMode: true, maximumRenderTimeChange: Infinity,
  });
  const scene = viewer.scene;
  scene.backgroundColor = css("#05070A");
  scene.light = new DirectionalLight({ direction: new Cartesian3(1, 0, 0), intensity: 2.2 });
  scene.postUpdate.addEventListener(updateLight);
  occluder = new EllipsoidalOccluder(ellipsoid, viewer.camera.positionWC);
  scene.preUpdate.addEventListener(() => { if (occluder && viewer) occluder.cameraPosition = viewer.camera.positionWC; });
  scene.postRender.addEventListener(() => { emitTelemetry(); emitAnchors(); });
  (viewer.cesiumWidget.creditContainer as HTMLElement).style.cssText =
    "font:10px 'IBM Plex Sans',system-ui;opacity:.5;filter:grayscale(1) invert(1);";
  scene.screenSpaceCameraController.minimumZoomDistance = 20_000;
  scene.screenSpaceCameraController.maximumZoomDistance = planet === "mars" ? 40_000_000 : 80_000_000;
  viewer.camera.moveStart.addEventListener(() => { moving = true; emitTelemetry(true); });
  viewer.camera.moveEnd.addEventListener(() => { moving = false; emitTelemetry(true); emitAnchors(); });

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
    g.baseColor = css(planet === "mars" ? "#3a1f17" : "#0d1a26");
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
    if (defined(picked) && Array.isArray(picked.id) && picked.id.length) {
      // A cluster: zoom towards its members.
      const pts = (picked.id as Entity[]).map((e) => e.position?.getValue(viewer!.clock.currentTime)).filter(Boolean) as Cartesian3[];
      if (pts.length) {
        const mid = Cartesian3.multiplyByScalar(pts.reduce((a, b) => Cartesian3.add(a, b, new Cartesian3()), new Cartesian3()), 1 / pts.length, new Cartesian3());
        const carto = Cartographic.fromCartesian(mid, ellipsoid);
        if (carto) flyTo(fromRender(CMath.toDegrees(carto.latitude)), normLon(CMath.toDegrees(carto.longitude)), Math.max(300, viewer!.camera.positionCartographic.height / 1000 / 3));
      }
      return;
    }
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
  scene.canvas.addEventListener("pointerleave", () => post({ t: "hover", lat: null, lon: null }));

  // Idle spin (stops on interaction; never with reduced motion). Drives its own frames in request-render mode.
  let prev = performance.now();
  const spin = (now: number) => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (spinning && !reducedMotion && viewer) {
      viewer.camera.rotate(Cartesian3.UNIT_Z, -0.035 * dt);
      scene.requestRender();
    }
    requestAnimationFrame(spin);
  };
  requestAnimationFrame(spin);

  post({
    t: "ready", planet, mode,
    layers: LAYERS.map(({ id, label, kind, note }) => ({ id, label, kind, note })),
    ellipsoid: planet === "earth" ? "WGS84" : ionToken ? `Mars IAU 2000 (${MARS_IAU2000.a}/${MARS_IAU2000.b} m)` : `Mars sphere R = ${R_MARS_M} m`,
  });
  emitTelemetry(true);
  if (import.meta.env.DEV) Object.assign(window, { __globe: { viewer, groups, occluder: () => occluder, pos } });
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
      case "fitBounds": fitBounds(m.west, m.south, m.east, m.north, m.padding, m.minHeightKm, m.maxHeightKm, m.durationS); break;
      case "setInsets": insets = { top: m.top, right: m.right, bottom: m.bottom, left: m.left }; lastTelemetry = ""; break;
      case "setView":
        viewer?.camera.setView({ destination: pos(m.lat, m.lon, m.heightKm * 1000), orientation: { heading: 0, pitch: -CMath.PI_OVER_TWO, roll: 0 } });
        break;
      case "reset":
        spinning = false;
        flyTo(HOME.lat, HOME.lon, HOME.heightKm, reducedMotion ? 0 : m.durationS);
        break;
      case "setMarkers": setMarkers(m.group, m.markers, m.options); break;
      case "setFootprints": setFootprints(m.group, m.footprints); break;
      case "select": selectedId = m.id; break;
      case "setLayer": setLayer(m.layer); break;
      case "setOverlay": void setOverlay(m.id, m.url, m.alpha); break;
      case "setGraticule": setGraticule(m.on, m.stepDeg); break;
      case "trackAnchors": anchors = m.anchors; lastAnchors = ""; break;
      case "zoom": zoom(m.direction); break;
      case "panBy": panBy(m.dx, m.dy); break;
      case "resetHeading": resetHeading(); break;
      case "snapshot": void snapshot(m.requestId, m.lat, m.lon, m.heightKm, m.maxWidth); break;
      case "setSpin": spinning = m.on; break;
      case "resize": viewer?.resize(); break;
    }
    requestRender();
  } catch (err) {
    post({ t: "error", message: String(err) });
  }
});

// Keyboard operation when the globe frame has focus: every pointer action has a key equivalent.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!viewer || e.metaKey || e.ctrlKey || e.altKey) return;
  const step = e.shiftKey ? 0.5 : 0.2;
  let handled = true;
  switch (e.key) {
    case "ArrowUp": panBy(0, -step); break;
    case "ArrowDown": panBy(0, step); break;
    case "ArrowLeft": panBy(-step, 0); break;
    case "ArrowRight": panBy(step, 0); break;
    case "+": case "=": zoom("in"); break;
    case "-": case "_": zoom("out"); break;
    case "n": case "N": resetHeading(); break;
    case "Enter": case " ": {
      const c = currentCenter();
      if (c) post({ t: "pick", lat: c.lat, lon: c.lon });
      break;
    }
    case "Escape": post({ t: "key", key: "Escape" }); break;
    default: handled = false;
  }
  if (handled) {
    e.preventDefault();
    spinning = false;
    post({ t: "interaction" });
  }
});

window.addEventListener("beforeunload", () => { viewer?.destroy(); viewer = null; });

// Handshake: tell the parent this realm is listening; it replies with `init`.
post({ t: "boot", planet });

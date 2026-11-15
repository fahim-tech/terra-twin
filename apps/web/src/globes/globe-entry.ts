/**
 * Globe iframe entry. One planet per JS realm (Ellipsoid.default is global mutable state).
 * Query string: ?planet=mars|earth. The parent sends `init` (with optional ion token) after `boot`.
 *
 * Besides rendering, this realm reports camera telemetry (altitude, ground scale, heading, pitch, the ground
 * in view) and the projected screen positions of tracked points, so the React shell can draw map instruments
 * and leader-line annotations in HTML without reaching into Cesium.
 *
 * Snapshots (report plates) run one at a time, can be withdrawn, settle on the tile load queue and can hide
 * everything the app draws; while one renders, camera commands wait and telemetry pauses (see runSnapshot).
 *
 * 3D: site flights end in an oblique view pitched about −50° (geometry in camera.ts) and the TILT control
 * or the T key switches top-down ⇄ oblique around the point under the reticle. Footprints are drawn as
 * scan volumes whose walls appear only when the camera is tilted; the selection, the selected marker and
 * leaders stand on stems; Phobos and Deimos orbits ring Mars at true scale in whole-planet views; the real
 * Tycho-2 star field sits dimmed behind both planets.
 */
import {
  ArcType,
  buildModuleUrl,
  Cartesian2,
  Cartesian3,
  Cartographic,
  CallbackPositionProperty,
  CallbackProperty,
  Cesium3DTileset,
  CesiumTerrainProvider,
  Color,
  ColorMaterialProperty,
  Credit,
  CubeMapPanorama,
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
  ImageMaterialProperty,
  ImageryLayer,
  Ion,
  type Label,
  LabelCollection,
  LabelStyle,
  Material,
  Math as CMath,
  Matrix3,
  NearFarScalar,
  PerspectiveFrustum,
  PolygonHierarchy,
  type Polyline,
  PolylineCollection,
  Rectangle,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  SkyAtmosphere,
  SkyBox,
  TextureMagnificationFilter,
  TextureMinificationFilter,
  Transforms,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  WebMercatorTilingScheme,
  defined,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { MARS_IAU2000, R_EARTH_MEAN_M, R_MARS_M, centricToGraphic, distanceKm, graphicToCentric, normLon } from "../lib/geodesy";
import {
  OBLIQUE_PITCH_DEG, attitudeAt, exactNadir, fitDepth, flightPitchDeg, focusOf, isTilted, nadirFor, poseAt, stemHeightM, tiltWeight,
  verticalPxPerMetre, type Enu, type Vec3, type View,
} from "./camera";
import { SETTLE_START, SNAPSHOT_SETTLE, type SettleVerdict, captureSse, serialRunner, settleStep } from "./capture";
import { footprintCorners, footprintSideKm, hasScanVolume, outlineRing, scanHeightM, volumeSizeWeight } from "./footprints";
import { GLYPH_EARTH, GLYPH_INK, GLYPH_KINDS, GLYPH_MARS, GLYPH_SPACE, glyph, wallGradient } from "./glyphs";
import { borderSamples, groundBox, horizonAlong } from "./ground";
import { MARS_MOONS, arcClearOfBox, clearOfDisc, easeToward, orbitFade, orbitLabel, orbitRing, refineMin, ringArcs, visibleColumns, type ScreenRect } from "./moons";
import {
  type AnchorPosition,
  type AnchorRequest,
  type CameraTelemetry,
  type GlobeFootprint,
  type GlobeMarker,
  type DataLayerSpec,
  type GlobeToParent,
  type GroundBox,
  type ImagerySource,
  type LayerInfo,
  type LightMode,
  type MarkerGroupOptions,
  type MarkerKind,
  type ParentToGlobe,
  type Planet,
  isEnvelope,
  wrap,
} from "./protocol";
import { icrfToMarsFixed } from "./sky";
import { applyMask, dataLayerChange, hexRgb } from "./dataLayer";

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
  /** The data credit, drawn in the globe's own credit strip (on screen, never only in a lightbox). */
  credit: string;
  make: (ellipsoid: Ellipsoid) => UrlTemplateImageryProvider;
}

const MARS_LAYERS: LayerDef[] = [
  {
    id: "viking_color", label: "Viking colour mosaic", kind: "imagery",
    note: "NASA Mars Trek · Viking MDIM 2.1 colour, 232 m. Visualization only.",
    credit: "NASA/JPL-Caltech/USGS · Mars Trek Viking MDIM 2.1",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`,
      tilingScheme: new GeographicTilingScheme({ ellipsoid: e }), maximumLevel: 7,
      credit: new Credit("NASA/JPL-Caltech/USGS · Mars Trek Viking MDIM 2.1", true),
    }),
  },
  {
    id: "mola_shade", label: "MOLA colour shaded relief", kind: "imagery",
    note: "NASA Mars Trek · MOLA elevation colour shaded relief, 463 m. Colour encodes elevation; visualization only.",
    credit: "NASA/JPL/GSFC · MOLA shaded relief via Mars Trek",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${TREK}/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`,
      tilingScheme: new GeographicTilingScheme({ ellipsoid: e }), maximumLevel: 7,
      credit: new Credit("NASA/JPL/GSFC · MOLA shaded relief via Mars Trek", true),
    }),
  },
];

const EARTH_LAYERS: LayerDef[] = [
  {
    id: "blue_marble_relief", label: "Blue Marble shaded relief", kind: "imagery",
    note: "NASA GIBS · Blue Marble shaded relief + bathymetry, 500 m. Visualization only.",
    credit: "NASA Earth Observatory · Blue Marble via GIBS",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid: e }), maximumLevel: 8,
      credit: new Credit("NASA Earth Observatory · Blue Marble via GIBS", true),
    }),
  },
  {
    id: "blue_marble_ng", label: "Blue Marble next generation", kind: "imagery",
    note: "NASA GIBS · Blue Marble Next Generation true colour, 500 m. Visualization only.",
    credit: "NASA Earth Observatory · Blue Marble NG via GIBS",
    make: (e) => new UrlTemplateImageryProvider({
      url: `${GIBS}/BlueMarble_NextGeneration/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
      tilingScheme: new WebMercatorTilingScheme({ ellipsoid: e }), maximumLevel: 8,
      credit: new Credit("NASA Earth Observatory · Blue Marble NG via GIBS", true),
    }),
  },
];

const LAYERS = planet === "mars" ? MARS_LAYERS : EARTH_LAYERS;

/** What replaces the imagery when the Cesium Mars 3D tiles are drawn (ion token set). */
const MARS_ION_SOURCE = {
  label: "Cesium Mars 3D Tiles",
  note: "Cesium ion asset 3644333 (Cesium Mars 3D Tiles). Visualization only.",
  credit: "Cesium ion · Cesium Mars",
};

/**
 * A plain sphere of the planet's tone under the remote imagery, so the planet (and everything drawn on it) shows
 * from the first frame instead of markers and rings floating in black until the first NASA tile arrives. Cesium
 * draws a tile as soon as any of its imagery layers is ready, and this one is a local image. It is one flat
 * colour: it carries no data and is covered as the imagery loads.
 */
const PLACEHOLDER_TONE = planet === "mars" ? "#6a4130" : "#10273a";
function placeholderProvider(): SingleTileImageryProvider {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 2;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PLACEHOLDER_TONE;
  ctx.fillRect(0, 0, 4, 2);
  return new SingleTileImageryProvider({ url: c.toDataURL("image/png"), tileWidth: 4, tileHeight: 2, rectangle: Rectangle.fromDegrees(-180, -90, 180, 90), ellipsoid });
}

// ---------------------------------------------------------------- state
let viewer: Viewer | null = null;
let ellipsoid: Ellipsoid;
let mode: "ion" | "fallback" = "fallback";
let baseLayer: ImageryLayer | null = null;
/** The flat placeholder under the base imagery (PLACEHOLDER_TONE). */
let placeholderLayer: ImageryLayer | null = null;
/** The gridded data layer (setDataLayer), drawn above the base imagery and below overlays and drawings. */
let dataLayer: { spec: DataLayerSpec; layer: ImageryLayer } | null = null;
/** The Cesium Mars 3D tileset, when an ion token is set (it then replaces the globe and its imagery). */
let marsTiles: Cesium3DTileset | null = null;
let spinning = false;
/**
 * The presentation light the shell asked for (setLight), independent of the idle spin: the intro's three-quarter
 * light stays put when the spin stops on a touch, and stays the working light when no spin ever runs (reduced motion).
 */
let lightMode: LightMode = "work";
/** 0 = working light (hemisphere in view lit), 1 = intro three-quarter light; eased between. */
let lightMix = 0;
/**
 * A snapshot is rendering: the camera shows the capture view, so camera commands wait for it (`cameraCommand`),
 * telemetry and anchors pause (they would describe the capture, not the reader's view) and inputs are off.
 */
let capturing = false;
/** Camera commands received during a capture, applied in order once the reader's view is back. */
const deferred: (() => void)[] = [];
/** Everything the app draws is hidden for a clean capture (markers, footprints, overlays, graticule, orbits). */
let drawingsHidden = false;
/** Drawing groups the shell has hidden (setGroupShown), by data-source name: `group`, or `fp:group` for footprints. */
const hiddenGroups = new Set<string>();
const groupShown = (name: string) => !drawingsHidden && !hiddenGroups.has(name);
let moving = false;
let selectedId: string | null = null;
/** The user's choice for site flights: end in the 3D view (default) or look straight down. */
let tiltPref = true;
const groups = new Map<string, CustomDataSource>();
const overlays = new Map<string, ImageryLayer>();
let graticule: CustomDataSource | null = null;
let anchors: AnchorRequest[] = [];
let lastAnchors = "";
let lastTelemetry = "";
let lastTelemetryAt = 0;
const meanR = planet === "mars" ? R_MARS_M : R_EARTH_MEAN_M;
let insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * A camera framing: a ground target on the free area's centre, seen from `depthKm` with a pitch and heading.
 * `exact` refines a top-down placement to the pixel (user actions that must keep the target where it is);
 * programmatic flights keep the original north-up aim that callers plan around (phone framing).
 */
interface Placement { lat: number; lon: number; depthKm: number; pitchDeg: number; headingDeg: number; exact?: boolean }
/** Last programmatic framing target; re-aimed when insets change, forgotten once the user moves the camera. */
let lastTarget: Placement | null = null;
/** Keep rendering until this time (ms), so geometry built off-thread appears without a camera move. */
let settleUntil = 0;

let occluder: EllipsoidalOccluder | null = null;

/**
 * Data credits as a quiet strip at the bottom of the free area, clear of the shell's instruments: centred
 * between the scale, altitude and centre readouts (bottom-left) and navigation (bottom-right) on wide
 * frames; in the bottom-right corner on narrow ones, where the scale readout takes the bottom-left and the
 * navigation sits top-right.
 */
function placeCredits() {
  const el = viewer?.cesiumWidget.creditContainer as HTMLElement | undefined;
  if (!el) return;
  const narrow = (viewer?.scene.canvas.clientWidth ?? 0) < 640;
  // Narrow: right-aligned and wrapping clear of the scale readout in the bottom-left (its box is ~130 px wide).
  const across = narrow
    ? `left:auto;right:${insets.right + 8}px;transform:scale(.8);transform-origin:100% 100%;text-align:right;max-width:calc((100% - ${insets.left + insets.right + 160}px) / .8);white-space:normal!important;`
    : `left:calc(${insets.left}px + (100% - ${insets.left + insets.right}px) / 2);transform:translateX(-50%) scale(.8);transform-origin:50% 100%;`;
  el.style.cssText = `position:absolute;z-index:1;${across}bottom:${insets.bottom + 2}px;white-space:nowrap;` +
    "font:10px 'Barlow',system-ui;opacity:.5;filter:grayscale(1) invert(1);";
}

/**
 * Keyboard and assistive access. The canvas is the globe's one tab stop (role application, named by the frame's
 * title, which lists the keys), with an ink focus ring (globe.html) and a key legend while it has keyboard focus.
 * Cesium's credit links leave the tab order (re-applied whenever Cesium redraws the credits), and its "Data
 * attribution" expander and lightbox are retired (globe.html): every credit is drawn on screen in the strip. The
 * page around the frame is never scrolled by focus landing in here (the intro slides this frame partly past the
 * window's edge, and a focused element is scrolled into view): an overflow-hidden ancestor is put back.
 */
function initKeyboardSurface() {
  if (!viewer) return;
  const canvas = viewer.scene.canvas;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-roledescription", "globe");
  let title = "";
  try { title = (window.frameElement as HTMLIFrameElement | null)?.title ?? ""; } catch { /* cross-origin: keep the default */ }
  canvas.setAttribute("aria-label", title || `${planet === "mars" ? "Mars" : "Earth"} globe`);
  const credits = viewer.cesiumWidget.creditContainer as HTMLElement;
  const quiet = () => credits.querySelectorAll<HTMLElement>("a, button, [tabindex]").forEach((a) => { if (a.tabIndex !== -1) a.tabIndex = -1; });
  quiet();
  new MutationObserver(quiet).observe(credits, { subtree: true, childList: true });

  const keys = document.createElement("div");
  keys.className = "tt-keys";
  keys.setAttribute("aria-hidden", "true");
  keys.innerHTML = [["← ↑ → ↓", "Pan"], ["+ −", "Zoom"], ["N", "North up"], ["T", "3D / top-down"], ["Enter", "Select centre"]]
    .map(([k, v]) => `<span><b>${k}</b>${v}</span>`).join("");
  viewer.container.appendChild(keys);
  const placeKeys = () => { keys.style.top = `${Math.max(insets.top, 64) + 8}px`; keys.style.left = `calc(${insets.left}px + (100% - ${insets.left + insets.right}px) / 2)`; };
  canvas.addEventListener("focus", () => {
    placeKeys();
    keys.classList.toggle("on", canvas.matches(":focus-visible"));
    unscrollAncestors();
    requestAnimationFrame(unscrollAncestors);
  });
  canvas.addEventListener("blur", () => keys.classList.remove("on"));
  canvas.addEventListener("pointerdown", () => keys.classList.remove("on"));
  window.addEventListener("focus", () => requestAnimationFrame(unscrollAncestors));
}

/** Put back any overflow-hidden ancestor of this frame that focus scrolled (it has no scrollbar to undo that). */
function unscrollAncestors() {
  try {
    let el = (window.frameElement as HTMLElement | null)?.parentElement ?? null;
    while (el) {
      if (el.scrollLeft || el.scrollTop) {
        const st = window.parent.getComputedStyle(el);
        if (st.overflowX === "hidden" || st.overflowX === "clip") el.scrollLeft = 0;
        if (st.overflowY === "hidden" || st.overflowY === "clip") el.scrollTop = 0;
      }
      el = el.parentElement;
    }
  } catch { /* cross-origin parent: nothing to do */ }
}

// Latitude conversion between the API convention and the rendering ellipsoid. The API gives planetocentric
// latitude on Mars and geodetic WGS84 latitude on Earth: only Mars is converted (and only changes anything on the
// IAU 2000 ellipsoid used with the Cesium Mars tiles; on the app's sphere the two latitudes are the same).
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
function settle(ms = 1500) {
  settleUntil = Math.max(settleUntil, performance.now() + ms);
  requestRender();
}

const toVec = (c: Cartesian3): Vec3 => [c.x, c.y, c.z];
const toCart = (v: Vec3) => new Cartesian3(v[0], v[1], v[2]);
/** Local east / north / up axes at a surface point (columns of Cesium's column-major ENU matrix). */
function enuAt(world: Cartesian3): Enu {
  const m = Transforms.eastNorthUpToFixedFrame(world, ellipsoid) as unknown as ArrayLike<number>;
  return { east: [m[0], m[1], m[2]], north: [m[4], m[5], m[6]], up: [m[8], m[9], m[10]] };
}

/**
 * Home framing: the whole planet with the north pole tipped towards the camera, so the moons' orbital plane
 * (Mars's equator) opens into rings around the planet instead of lying edge-on.
 */
const HOME = planet === "mars"
  ? { lat: 24, lon: 70, heightKm: 10_400 }
  : { lat: 18, lon: 10, heightKm: 17_500 };

const css = (c: string) => Color.fromCssColorString(c);
const INK = css(GLYPH_INK);
const SPACE = css(GLYPH_SPACE);
const MARS = css(GLYPH_MARS);
const EARTH = css(GLYPH_EARTH);

/** Data points stay true circles; places and the user's point are HUD glyphs (glyphs.ts). */
const POINT: Partial<Record<MarkerKind, { color: Color; size: number; outline: Color; outlineWidth: number }>> = {
  candidate: { color: EARTH.withAlpha(0.9), size: 6, outline: SPACE.withAlpha(0.7), outlineWidth: 1 },
  leader: { color: INK, size: 10, outline: EARTH, outlineWidth: 2.5 },
  pool: { color: css("#C9D3DC").withAlpha(0.32), size: 3.5, outline: SPACE.withAlpha(0.4), outlineWidth: 0.5 },
};

function dataSource(group: string, opts: MarkerGroupOptions = {}): CustomDataSource {
  let ds = groups.get(group);
  if (!ds) {
    ds = new CustomDataSource(group);
    ds.show = groupShown(group);
    ds.clustering.show = ds.show;
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

/**
 * Replace all of a data source's entities. Cesium treats an id that is removed and added again inside one
 * suspended batch as unchanged, so its visualizers keep drawing the old entity object — the user's point
 * stayed at the previous click, a glyph kept its old frame. The removal is flushed as its own event first,
 * then the new entities are added in one batch.
 */
function replaceEntities(ds: CustomDataSource, add: () => void) {
  ds.entities.removeAll();
  ds.entities.suspendEvents();
  try {
    add();
  } finally {
    ds.entities.resumeEvents();
  }
}

function styleCluster(entities: Entity[], cluster: { billboard: { show: boolean }; label: any; point: any }) {
  cluster.billboard.show = false;
  cluster.point.show = true;
  cluster.point.pixelSize = 16 + Math.min(18, Math.round(Math.sqrt(entities.length) * 3));
  cluster.point.color = EARTH.withAlpha(0.22);
  cluster.point.outlineColor = EARTH.withAlpha(0.95);
  cluster.point.outlineWidth = 1.25;
  cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
  cluster.label.show = true;
  cluster.label.text = String(entities.length);
  cluster.label.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace";
  cluster.label.fillColor = css("#EAF7F4");
  cluster.label.outlineColor = SPACE;
  cluster.label.outlineWidth = 2;
  cluster.label.style = LabelStyle.FILL_AND_OUTLINE;
  cluster.label.horizontalOrigin = HorizontalOrigin.CENTER;
  cluster.label.verticalOrigin = VerticalOrigin.CENTER;
  cluster.label.pixelOffset = new Cartesian2(0, 0);
  cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------- markers and stems
interface MarkerRec extends GlobeMarker {
  group: string;
  labels: "none" | "selected" | "all";
  ground: Cartesian3;
  up: Cartesian3;
}
/** Every marker on the globe, keyed `group::id`. */
const markerRecs = new Map<string, MarkerRec>();
let stems: CustomDataSource | null = null;

/** Drawn on a stem (standing off the ground in the 3D view): the user's point, leaders and the selected marker. */
function isStemmed(m: { kind: MarkerKind; id: string }) {
  return m.kind === "selection" || m.kind === "leader" || m.id === selectedId;
}

/** Drawn over the imagery (no depth test) but hidden, and unpickable, when behind the planet. */
function onNearSide(world: Cartesian3) {
  return !occluder || occluder.isPointVisible(world);
}

function hudLabel(m: GlobeMarker, show: CallbackProperty, dx: number) {
  return {
    text: (m.rank ? `${m.rank}  ${m.label}` : m.label!).toUpperCase(),
    font: "600 12px 'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif",
    fillColor: INK,
    outlineColor: SPACE.withAlpha(0.9),
    outlineWidth: 3,
    style: LabelStyle.FILL_AND_OUTLINE,
    horizontalOrigin: HorizontalOrigin.LEFT,
    verticalOrigin: VerticalOrigin.CENTER,
    pixelOffset: new Cartesian2(dx, 0),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    show,
  };
}

function setMarkers(group: string, markers: GlobeMarker[], opts: MarkerGroupOptions = {}) {
  if (!viewer) return;
  const ds = dataSource(group, opts);
  for (const key of [...markerRecs.keys()]) if (key.startsWith(`${group}::`)) markerRecs.delete(key);
  const labels = opts.labels ?? "selected";
  replaceEntities(ds, () => {
    for (const m of markers) {
      const ground = pos(m.lat, m.lon);
      const rec: MarkerRec = { ...m, group, labels, ground, up: ellipsoid.geodeticSurfaceNormal(ground, new Cartesian3()) };
      markerRecs.set(`${group}::${m.id}`, rec);
      // A stemmed marker is drawn by its stem; the ground glyph stands down meanwhile.
      const shown = new CallbackProperty(() => onNearSide(ground) && !isStemmed(rec), false);
      const g = GLYPH_KINDS.has(m.kind) ? glyph(m.kind, false) : null;
      const pt = POINT[m.kind];
      ds.entities.add({
        id: `${group}::${m.id}`,
        position: ground,
        billboard: g ? { image: g.url, width: g.size, height: g.size, show: shown, disableDepthTestDistance: Number.POSITIVE_INFINITY } : undefined,
        point: !g && pt ? {
          show: shown,
          pixelSize: pt.size,
          color: pt.color,
          outlineColor: pt.outline,
          outlineWidth: pt.outlineWidth,
          heightReference: HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(1e5, 1.25, 2.5e7, 0.8),
        } : undefined,
        label: m.label && labels === "all" ? hudLabel(m, shown, (g?.size ?? pt?.size ?? 8) / 2 + 5) : undefined,
      });
    }
  });
  rebuildStems();
}

/**
 * Stem height above a ground point for the current camera: the height that stands STEM_PX tall on screen
 * (0 when looking straight down). Visual only.
 */
function stemHeight(m: { ground: Cartesian3; up: Cartesian3 }): number {
  if (!viewer) return 0;
  const cam = viewer.camera;
  const c = viewer.scene.canvas;
  const fovy = (cam.frustum as PerspectiveFrustum).fovy ?? CMath.toRadians(60);
  const pose = { position: toVec(cam.positionWC), direction: toVec(cam.directionWC), up: toVec(cam.upWC), right: toVec(cam.rightWC) };
  const v: View = { w: c.clientWidth, h: c.clientHeight, fovy, focus: { x: c.clientWidth / 2, y: c.clientHeight / 2 } };
  const pxPerM = verticalPxPerMetre(pose, toVec(m.ground), toVec(m.up), v);
  // Keep the glyph well below the camera however oblique the view.
  return stemHeightM(pxPerM, CMath.toDegrees(cam.pitch), 0.3 * Math.max(0, cam.positionCartographic.height));
}
const scratchStem = new Cartesian3();
function stemTop(m: { ground: Cartesian3; up: Cartesian3 }, result = new Cartesian3()) {
  return Cartesian3.add(m.ground, Cartesian3.multiplyByScalar(m.up, stemHeight(m), scratchStem), result);
}

const STEM_COLOR: Partial<Record<MarkerKind, Color>> = { selection: MARS, leader: EARTH, candidate: EARTH };

/**
 * One entity per stemmed marker: a hairline from the ground point up to the glyph. In a top-down view the
 * stem has no height and the glyph sits on its ground point; tilted, it stands STEM_PX (46 px) above it on
 * screen, clear of the reticle around the ground point.
 */
function rebuildStems() {
  if (!viewer) return;
  if (!stems) {
    stems = new CustomDataSource("stems");
    stems.show = !drawingsHidden;
    void viewer.dataSources.add(stems);
  }
  const ds = stems;
  // Every stem is rebuilt with the same ids on each marker or selection change: flush the old ones first.
  replaceEntities(ds, () => {
    for (const m of markerRecs.values()) {
      // A marker of a hidden group has no glyph to stand on a stem either.
      if (!isStemmed(m) || hiddenGroups.has(m.group)) continue;
      const g = glyph(m.kind, m.id === selectedId);
      const near = new CallbackProperty(() => onNearSide(m.ground), false);
      ds.entities.add({
        // `stem:<group>::<id>` keeps the marker id after "::", so a click on the glyph reports the marker.
        id: `stem:${m.group}::${m.id}`,
        position: new CallbackPositionProperty((_t, result) => stemTop(m, result), false),
        billboard: { image: g.url, width: g.size, height: g.size, show: near, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        polyline: {
          positions: new CallbackProperty(() => [m.ground, stemTop(m)], false),
          width: 1.25,
          arcType: ArcType.NONE,
          material: (STEM_COLOR[m.kind] ?? INK).withAlpha(0.9),
          show: new CallbackProperty(() => onNearSide(m.ground) && stemHeight(m) > 0, false),
        },
        label: m.label && m.labels !== "none" ? hudLabel(m, near, g.size / 2 + 3) : undefined,
      });
    }
  });
  requestRender();
}

/** The stemmed marker drawn at a tracked anchor's coordinates, if any. */
function stemAt(lat: number, lon: number): MarkerRec | null {
  for (const m of markerRecs.values()) {
    if (isStemmed(m) && !hiddenGroups.has(m.group) && Math.abs(m.lat - lat) < 1e-6 && Math.abs(m.lon - lon) < 1e-6) return m;
  }
  return null;
}

/** Show or hide one drawing group (setGroupShown), leaving its contents as they are. */
function setGroupShown(kind: "markers" | "footprints", group: string, on: boolean) {
  const name = kind === "footprints" ? `fp:${group}` : group;
  if (on) hiddenGroups.delete(name);
  else hiddenGroups.add(name);
  const ds = groups.get(name);
  if (ds) {
    ds.show = groupShown(name);
    ds.clustering.show = ds.show;
  }
  if (kind === "markers") rebuildStems();
  lastAnchors = "";
  requestRender();
}

// ---------------------------------------------------------------- footprints as scan volumes
/** Base fill and outline for every footprint; wall and raised-edge strength for those drawn as volumes. */
const FOOT: Record<GlobeFootprint["kind"], { color: Color; fill: number; line: number; width: number; wall: number; edge: number }> = {
  aoi: { color: MARS, fill: 0.1, line: 0.95, width: 1.5, wall: 0.42, edge: 0.85 },
  cell: { color: EARTH, fill: 0.1, line: 0.95, width: 1.5, wall: 0.42, edge: 0.85 },
  window: { color: INK, fill: 0.05, line: 0.95, width: 1.5, wall: 0.3, edge: 0.75 },
  research_bbox: { color: MARS, fill: 0.04, line: 0.5, width: 1, wall: 0, edge: 0 },
};

let wallImage: HTMLCanvasElement | null = null;
/** Counts rendered frames (scene.preUpdate), so per-frame values can be memoised. */
let frameTick = 0;

/**
 * How much of one footprint's scan volume to draw this frame: the view's tilt (none looking straight down)
 * times the footprint's size on screen (none while it is a few tens of pixels across, footprints.ts).
 * Memoised per frame: a volume's wall, edge and posts all ask.
 */
function volumeWeightFor(centre: Cartesian3, sideM: number) {
  let frame = -1, weight = 0;
  return () => {
    if (!viewer) return 0;
    if (frame === frameTick) return weight;
    frame = frameTick;
    const cam = viewer.camera;
    const tilt = tiltWeight(CMath.toDegrees(cam.pitch));
    if (tilt <= 0) return (weight = 0);
    const fovy = (cam.frustum as PerspectiveFrustum).fovy ?? CMath.toRadians(60);
    const k = viewer.scene.canvas.clientHeight / 2 / Math.tan(fovy / 2);
    const sidePx = (sideM * k) / Math.max(1, Cartesian3.distance(cam.positionWC, centre));
    return (weight = tilt * volumeSizeWeight(sidePx));
  };
}

/** A footprint colour at `alpha` × the volume's weight, written into Cesium's scratch colour. */
function volumeColor(base: Color, alpha: number, weight: () => number) {
  return new CallbackProperty((_t, result?: Color) => {
    const c = Color.clone(base, result ?? new Color());
    c.alpha = alpha * weight();
    return c;
  }, false);
}

function setFootprints(group: string, fps: GlobeFootprint[]) {
  if (!viewer) return;
  const ds = dataSource(`fp:${group}`);
  replaceEntities(ds, () => {
    for (const f of fps) {
      const st = FOOT[f.kind];
      const raw = footprintCorners(f, meanR);
      const sideKm = footprintSideKm(f, meanR);
      // No size in the payload: nothing is drawn rather than a made-up square.
      if (!raw || sideKm === null) continue;
      const corners = raw.map((c) => ({ lat: c.lat, lon: normLon(c.lon) }));
      // Densified outline (footprints.ts explains the gaps a few long chords left in the window outline).
      const ring = outlineRing(f, meanR);
      const volume = hasScanVolume(f.kind);
      // Scan-volume wall height: visual only, it gives the outline depth in the 3D view and is never a
      // measurement (a footprint is a ground area).
      const H = volume ? scanHeightM(f, meanR) : 0;
      // The base outline floats a hair above the surface so it never z-fights the imagery tiles.
      const lift = 20 + H * 0.002;
      const id = `fp:${group}::${f.id}`;
      ds.entities.add({
        id,
        polygon: { hierarchy: new PolygonHierarchy(corners.map((c) => pos(c.lat, c.lon))), material: st.color.withAlpha(st.fill), outline: false },
        polyline: { positions: ring.map((p) => pos(p.lat, p.lon, lift)), width: st.width, material: st.color.withAlpha(st.line), arcType: ArcType.NONE },
      });
      if (!volume) continue;
      const weight = volumeWeightFor(pos(f.lat, f.lon), sideKm * 1000);
      const show = new CallbackProperty(() => weight() > 0.01, false);
      const edge = new ColorMaterialProperty(volumeColor(st.color, st.edge, weight));
      ds.entities.add({
        id: `${id}::wall`,
        wall: {
          positions: ring.map((p) => pos(p.lat, p.lon)),
          minimumHeights: ring.map(() => 0),
          maximumHeights: ring.map(() => H),
          material: new ImageMaterialProperty({ image: (wallImage ??= wallGradient()), transparent: true, color: volumeColor(st.color, st.wall, weight) }),
          outline: false,
          show,
        },
      });
      ds.entities.add({
        id: `${id}::top`,
        polyline: { positions: ring.map((p) => pos(p.lat, p.lon, H)), width: 1, material: edge, arcType: ArcType.NONE, show },
      });
      corners.forEach((c, i) => ds.entities.add({
        id: `${id}::post${i}`,
        polyline: { positions: [pos(c.lat, c.lon, lift), pos(c.lat, c.lon, H)], width: 1, material: edge, arcType: ArcType.NONE, show },
      }));
    }
  });
  settle();
}

// ---------------------------------------------------------------- graticule
let graticuleLabels: LabelCollection | null = null;
let graticuleStep = 30;

function graticuleText(v: number, axis: "lat" | "lon") {
  const a = Math.abs(v);
  if (a === 0 || (axis === "lon" && a === 180)) return `${a}°`;
  return `${a}°${axis === "lat" ? (v > 0 ? "N" : "S") : v > 0 ? "E" : "W"}`;
}

function setGraticule(on: boolean, stepDeg = 30) {
  if (!viewer) return;
  if (!graticule) {
    graticule = new CustomDataSource("graticule");
    graticule.show = !drawingsHidden;
    void viewer.dataSources.add(graticule);
  }
  graticule.entities.removeAll();
  graticuleLabels?.removeAll();
  graticuleStep = stepDeg;
  if (on) {
    // Hairlines sampled every 0.25° and lifted 30 m, so no chord dips under the imagery tiles.
    const material = INK.withAlpha(0.16);
    const lift = 30;
    for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
      const positions: Cartesian3[] = [];
      for (let lon = -180; lon <= 180; lon += 0.25) positions.push(pos(lat, lon, lift));
      graticule.entities.add({ polyline: { positions, width: lat === 0 ? 1.25 : 1, material, arcType: ArcType.NONE } });
    }
    for (let lon = -180; lon < 180; lon += stepDeg) {
      const positions: Cartesian3[] = [];
      for (let lat = -88; lat <= 88; lat += 0.25) positions.push(pos(lat, lon, lift));
      graticule.entities.add({ polyline: { positions, width: lon === 0 ? 1.25 : 1, material, arcType: ArcType.NONE } });
    }
    if (!graticuleLabels) {
      graticuleLabels = new LabelCollection();
      graticuleLabels.show = !drawingsHidden;
      viewer.scene.primitives.add(graticuleLabels);
    }
    // Latitudes sit above-right of their intersection, longitudes below-right, so the pair that shares the
    // intersection nearest the view centre never overlaps.
    const label = (text: string, below: boolean) => graticuleLabels!.add({
      position: Cartesian3.ZERO.clone(),
      text, font: "500 10px 'IBM Plex Mono', ui-monospace, monospace",
      fillColor: INK.withAlpha(0.62), outlineColor: SPACE.withAlpha(0.85), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: below ? VerticalOrigin.TOP : VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(4, below ? 3 : -3),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
      const l = label(graticuleText(lat, "lat"), false);
      (l as Label & { _grid: { lat: number } })._grid = { lat };
    }
    for (let lon = -180; lon < 180; lon += stepDeg) {
      const l = label(graticuleText(lon, "lon"), true);
      (l as Label & { _grid: { lon: number } })._grid = { lon };
    }
    placeGraticuleLabels();
  }
  settle(600);
}

/** Grid labels sit at the intersections nearest the view centre: latitudes along one meridian, longitudes along one parallel. */
function placeGraticuleLabels() {
  if (!viewer || !graticuleLabels || graticuleLabels.length === 0) return;
  const c = currentCenter() ?? (() => {
    const p = viewer!.camera.positionCartographic;
    return { lat: fromRender(CMath.toDegrees(p.latitude)), lon: normLon(CMath.toDegrees(p.longitude)) };
  })();
  const step = graticuleStep;
  const lonM = normLon(Math.round(c.lon / step) * step);
  const latP = Math.max(-90 + step, Math.min(90 - step, Math.round(c.lat / step) * step));
  for (let i = 0; i < graticuleLabels.length; i++) {
    const l = graticuleLabels.get(i) as Label & { _grid?: { lat?: number; lon?: number } };
    const g = l._grid;
    if (!g) continue;
    l.position = g.lat !== undefined ? pos(g.lat, lonM, 30) : pos(latP, g.lon!, 30);
  }
  requestRender();
}

function updateGraticuleLabels() {
  if (!graticuleLabels) return;
  for (let i = 0; i < graticuleLabels.length; i++) {
    const l = graticuleLabels.get(i);
    l.show = onNearSide(l.position);
  }
}

// ---------------------------------------------------------------- moons (Mars)
interface OrbitDraw {
  /** The ring as short arcs, so the part that would cross the intro's title can fade out alone (see copyBox). */
  aKm: number; arcs: { line: Polyline; pts: Cartesian3[] }[]; label: Label; labelPx: number; prefer: { x: number; y: number };
  /** 0–1: how far the orbit is drawn, eased; it is drawn only while its label has a place (see updateOrbits). */
  named: number;
  /** Where the label last hung, kept while the orbit fades out after losing its place. */
  spot: Cartesian3 | null;
}
const orbitDraws: OrbitDraw[] = [];
/** Height of an orbit label's box above the point it hangs from (10.5 px mono with its outline, plus the 6 px offset), px. */
const ORBIT_LABEL_H = 20;
/** Clearance between an orbit label's box and the planet's limb, px. */
const ORBIT_LABEL_LIMB_GAP = 8;
/**
 * Outside the intro, the shell's navigator field covers the top-left of the frame (12 px inset, 44 px tall,
 * 360 px wide; the full width below 640 px) without being an occluding inset: an orbit label's box keeps out
 * of that corner, with a little air.
 */
const NAVIGATOR = { bottom: 64, right: 384, fullWidthBelow: 640 };
/** Seconds for an orbit to fade in or out as its label finds or loses a place. */
const ORBIT_NAME_FADE_S = 0.25;
let orbitsAt = 0;

function initOrbits() {
  if (!viewer || planet !== "mars") return;
  const scene = viewer.scene;
  const lines = new PolylineCollection();
  const labels = new LabelCollection();
  scene.primitives.add(lines);
  scene.primitives.add(labels);
  MARS_MOONS.forEach((m, i) => {
    const arcs = ringArcs(orbitRing(m.aKm, 720).map(toCart), 12).map((pts) => ({
      pts: [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]],
      line: lines.add({ positions: pts, width: 1, show: false, material: Material.fromType("Color", { color: INK.withAlpha(0) }) }),
    }));
    const label = labels.add({
      position: new Cartesian3(m.aKm * 1000, 0, 0),
      text: orbitLabel(m), show: false,
      font: "500 10.5px 'IBM Plex Mono', ui-monospace, monospace",
      fillColor: INK, outlineColor: SPACE, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(6, -6),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    // Preferred label spots (fractions of the frame): right of the planet, Deimos above Phobos. The label
    // runs right from its point, about 6.3 px per mono character.
    orbitDraws.push({
      aKm: m.aKm, arcs, label, labelPx: orbitLabel(m).length * 6.3 + 6, prefer: i === 0 ? { x: 0.68, y: 0.44 } : { x: 0.66, y: 0.2 },
      named: 0, spot: null,
    });
  });
  scene.preRender.addEventListener(updateOrbits);
}

/**
 * The intro's copy column (its title, lines and buttons) in this canvas's pixels, read from the parent page (same
 * origin): the block that holds the title marked data-stage-heading="intro". Null when it is not on the page.
 */
function copyBox(): ScreenRect | null {
  try {
    const h = window.parent.document.querySelector<HTMLElement>('[data-stage-heading="intro"]');
    const block = h?.parentElement;
    const fe = window.frameElement as HTMLElement | null;
    if (!block || !fe) return null;
    const r = block.getBoundingClientRect(), f = fe.getBoundingClientRect();
    if (r.width === 0) return null;
    // The block's own padding is air around the copy: measure the title and what follows it instead.
    let x1 = r.left, y0 = Infinity, y1 = -Infinity;
    for (const c of Array.from(block.children) as HTMLElement[]) {
      const b = c.getBoundingClientRect();
      if (b.width === 0 || getComputedStyle(c).position === "absolute") continue;
      x1 = Math.max(x1, b.right);
      y0 = Math.min(y0, b.top);
      y1 = Math.max(y1, b.bottom);
    }
    if (!Number.isFinite(y0)) return null;
    return { x0: r.left - f.left, y0: y0 - f.top, x1: x1 - f.left, y1: y1 - f.top };
  } catch {
    return null;
  }
}

const scratchA = new Cartesian3();
const scratchB = new Cartesian3();
const scratchW = new Cartesian2();
/**
 * The columns of this globe's canvas that are on screen. The shell may slide the frame partly past the window's
 * edge (the intro moves the Mars frame right by a sixth of the window), and a label placed out there is cut off.
 * Read from the frame element the parent gives this realm (same origin); the whole canvas when that fails.
 */
function onScreenColumns(w: number): { x0: number; x1: number } {
  try {
    const fe = window.frameElement as HTMLElement | null;
    const r = fe?.getBoundingClientRect();
    return visibleColumns(w, r ? { left: r.left, width: r.width } : null, window.parent.innerWidth);
  } catch {
    return { x0: 0, x1: w };
  }
}

/**
 * A point on the orbit to hang its label from: in front of space, with the label's whole box clear of the
 * planet's disc (a moon's name over the planet would read as a surface feature's), on screen, and as close as
 * possible to the preferred spot. The ring is searched coarsely, then the angle is refined continuously
 * (moons.ts refineMin), so the label holds still while the planet turns under the camera instead of stepping
 * from one sample to the next.
 */
function orbitLabelSpot(o: OrbitDraw): Cartesian3 | null {
  const scene = viewer!.scene;
  const cam = viewer!.camera;
  const w = scene.canvas.clientWidth, h = scene.canvas.clientHeight;
  const C = cam.positionWC;
  const disc = Math.asin(Math.min(1, ellipsoid.maximumRadius / Cartesian3.magnitude(C)));
  const toCentre = Cartesian3.normalize(Cartesian3.negate(C, scratchA), scratchA);
  // The planet's disc on screen: its centre's projection, and its angular radius at the camera's focal length.
  const fovy = (cam.frustum as PerspectiveFrustum).fovy ?? CMath.toRadians(60);
  const centre = SceneTransforms.worldToWindowCoordinates(scene, Cartesian3.ZERO, new Cartesian2());
  const limb = centre ? { x: centre.x, y: centre.y, r: (h / 2 / Math.tan(fovy / 2)) * Math.tan(disc) } : null;
  const cols = onScreenColumns(w);
  // On the title screen the intro's copy fills the left of the window: labels hang right of the planet's centre.
  const left = Math.max(0.04 * w, cols.x0 + 12, lightMode === "intro" && limb ? limb.x : -Infinity);
  const right = Math.min(0.96 * w, w - 12, cols.x1 - 12);
  const navCorner = lightMode === "intro" ? 0 : w < NAVIGATOR.fullWidthBelow ? w : NAVIGATOR.right;
  const a = o.aKm * 1000;
  const P = new Cartesian3();
  const cost = (th: number) => {
    P.x = a * Math.cos(th); P.y = a * Math.sin(th); P.z = 0;
    const toP = Cartesian3.normalize(Cartesian3.subtract(P, C, scratchB), scratchB);
    if (Math.acos(Math.max(-1, Math.min(1, Cartesian3.dot(toP, toCentre)))) < disc + 0.03) return Infinity;
    const s = SceneTransforms.worldToWindowCoordinates(scene, P, scratchW);
    if (!s || s.x < left || s.x + o.labelPx > right || s.y < 0.07 * h || s.y > 0.93 * h) return Infinity;
    if (navCorner && s.x < navCorner && s.y - ORBIT_LABEL_H < NAVIGATOR.bottom) return Infinity;
    if (limb && !clearOfDisc({ x0: s.x, y0: s.y - ORBIT_LABEL_H, x1: s.x + o.labelPx, y1: s.y }, limb, ORBIT_LABEL_LIMB_GAP)) return Infinity;
    return Math.hypot(s.x / w - o.prefer.x, (s.y / h - o.prefer.y) * 0.7);
  };
  const N = 240, step = (Math.PI * 2) / N;
  let bestI = -1, bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const d = cost(i * step);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  if (bestI < 0) return null;
  const fine = refineMin(cost, (bestI - 1) * step, (bestI + 1) * step);
  const th = fine.c <= bestD ? fine.t : bestI * step;
  return new Cartesian3(a * Math.cos(th), a * Math.sin(th), 0);
}

/**
 * Orbit visibility for this frame. An orbit is drawn only with its name: a ring whose label has nowhere to go
 * (zoomed in so it runs along the frame's edge, or only crossing the planet) reads as a decorative line, so it
 * fades out — and back in once its label has a place again. On a narrow screen the intro's copy sits over the
 * planet, so the orbits are not drawn there at all; the intro light is the shell's mark that the title screen is
 * up.
 */
function updateOrbits() {
  if (!viewer) return;
  const now = performance.now();
  const dt = orbitsAt ? Math.min(0.1, (now - orbitsAt) / 1000) : 0;
  orbitsAt = now;
  const k = orbitFade(viewer.camera.positionCartographic.height / 1000);
  const narrowIntro = lightMode === "intro" && viewer.scene.canvas.clientWidth < 640;
  const drawn = !drawingsHidden && !narrowIntro && k > 0.005;
  let fading = false;
  const copy = lightMode === "intro" ? copyBox() : null;
  for (const o of orbitDraws) {
    const spot = drawn ? orbitLabelSpot(o) : null;
    if (spot) o.spot = spot;
    // Captures and reduced motion switch at once; otherwise the ring and its label fade together.
    o.named = drawingsHidden || !drawn ? 0 : easeToward(o.named, spot ? 1 : 0, dt, reducedMotion ? 0 : ORBIT_NAME_FADE_S);
    if (o.named > 0 && o.named < 1) fading = true;
    const alpha = k * o.named;
    const shown = drawn && alpha > 0.005;
    for (const arc of o.arcs) {
      // On the title screen, the stretch of ring that would run through the copy column fades out.
      const a = shown ? alpha * (copy ? arcClearOfBox(arc.pts.map((q) => SceneTransforms.worldToWindowCoordinates(viewer!.scene, q, new Cartesian2()) ?? null), copy) : 1) : 0;
      arc.line.show = a > 0.005;
      if (arc.line.show) arc.line.material.uniforms.color = INK.withAlpha(0.34 * a);
    }
    o.label.show = shown && !!o.spot;
    if (!shown) continue;
    if (o.label.show) {
      o.label.position = o.spot!;
      o.label.fillColor = INK.withAlpha(0.74 * alpha);
      o.label.outlineColor = SPACE.withAlpha(0.9 * alpha);
    }
  }
  if (fading) settle(ORBIT_NAME_FADE_S * 1000 + 50);
}

// ---------------------------------------------------------------- stars
/** Brightness of the star field (Tycho-2 cube map) relative to Cesium's default: a quiet backdrop. */
const STAR_BRIGHTNESS = 0.5;
let marsSky: Matrix3 | null = null;

async function initSky() {
  if (!viewer) return;
  const faces = [["positiveX", "px"], ["negativeX", "mx"], ["positiveY", "py"], ["negativeY", "my"], ["positiveZ", "pz"], ["negativeZ", "mz"]] as const;
  const dimmed = await Promise.all(faces.map(async ([, f]) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = buildModuleUrl(`Assets/Textures/SkyBox/tycho2t3_80_${f}.jpg`);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    ctx.globalAlpha = 1 - STAR_BRIGHTNESS;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }));
  if (!viewer) return;
  const sources = Object.fromEntries(faces.map(([key], i) => [key, dimmed[i]]));
  if (planet === "earth") {
    // Cesium orients its sky box for Earth (TEME axes at the scene time).
    viewer.scene.skyBox = new SkyBox({ sources });
  } else {
    // Behind Mars the same stars are rotated into Mars's body-fixed axes (sky.ts). The panorama is drawn
    // through the scene's sky-box slot so the atmosphere limb still renders over it.
    marsSky = Matrix3.fromRowMajorArray(icrfToMarsFixed(new Date()));
    const options = { sources, transform: marsSky, returnCommand: true };
    const panorama = new CubeMapPanorama(options);
    viewer.scene.skyBox = {
      update: (frameState: unknown, hdr: boolean) => (panorama as unknown as { update: (f: unknown, h: boolean) => unknown }).update(frameState, hdr),
      isDestroyed: () => false,
      destroy: () => { panorama.destroy(); },
      show: true,
    } as unknown as SkyBox;
    // Mars turns 0.24° a minute: keep the sky in step with the real rotation.
    setInterval(() => {
      if (marsSky) Matrix3.fromRowMajorArray(icrfToMarsFixed(new Date()), marsSky);
      requestRender();
    }, 60_000);
  }
  requestRender();
}

/**
 * Hide (or show again) everything the app draws on this globe — marker and footprint groups with their labels
 * and clusters, stems, data overlays, the graticule and the moon orbits — leaving only the planet's imagery and
 * its atmosphere. Contents are untouched: messages that arrive meanwhile update the hidden groups, which then
 * show as they now are.
 */
function setDrawingsHidden(on: boolean) {
  drawingsHidden = on;
  for (const [name, ds] of groups) {
    ds.show = groupShown(name);
    ds.clustering.show = ds.show;
  }
  if (stems) stems.show = !on;
  if (graticule) graticule.show = !on;
  if (graticuleLabels) graticuleLabels.show = !on;
  for (const layer of overlays.values()) layer.show = !on;
  if (dataLayer) dataLayer.layer.show = !on;
  updateOrbits();
  requestRender();
}

// ---------------------------------------------------------------- overlays
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
    // Nearest sampling: each raster pixel (a 0.25° cell of the field) stays a crisp square at any zoom instead of
    // being blended with its neighbours into values no cell has.
    const layer = new ImageryLayer(provider, {
      alpha, show: !drawingsHidden,
      magnificationFilter: TextureMagnificationFilter.NEAREST, minificationFilter: TextureMinificationFilter.NEAREST,
    });
    viewer.imageryLayers.add(layer);
    overlays.set(id, layer);
    requestRender();
  } catch (err) {
    post({ t: "error", message: `overlay ${id} failed: ${String(err)}` });
  }
}

// ---------------------------------------------------------------- gridded data layer
let dataFailures = 0;
let dataFailureTimer: ReturnType<typeof setTimeout> | null = null;

/** Index just above the base imagery (or its placeholder): where the data layer goes. */
function aboveBase(): number {
  if (!viewer) return 0;
  const below = baseLayer ?? placeholderLayer;
  return below ? viewer.imageryLayers.indexOf(below) + 1 : 0;
}

/**
 * Mask a data layer's tiles by a second tile set of the same grid (DataLayerSpec.mask): each tile is drawn only
 * where the mask tile has one of the kept colours. Both tiles share the grid and tiling, so pixels align. A tile
 * whose mask fails fails too (nothing drawn rather than unmasked values).
 */
function maskProvider(provider: UrlTemplateImageryProvider, mask: NonNullable<DataLayerSpec["mask"]>, spec: DataLayerSpec) {
  const masker = new UrlTemplateImageryProvider({
    url: mask.url, tilingScheme: new GeographicTilingScheme({ ellipsoid }), maximumLevel: spec.maximumLevel,
    tileWidth: spec.tileSize, tileHeight: spec.tileSize, hasAlphaChannel: true,
  });
  const keep = mask.keep.map(hexRgb).filter((c): c is [number, number, number] => !!c);
  const own = provider.requestImage.bind(provider);
  provider.requestImage = (x, y, level, request) => {
    const base = own(x, y, level, request);
    if (!base) return base; // throttled: Cesium asks again
    return Promise.all([base, masker.requestImage(x, y, level)]).then(([img, m]) => {
      if (!img || !m) throw new Error("mask tile unavailable");
      const w = (img as { width: number }).width, h = (img as { height: number }).height;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(m as CanvasImageSource, 0, 0, w, h);
      const md = ctx.getImageData(0, 0, w, h).data;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      applyMask(d.data, md, keep);
      ctx.putImageData(d, 0, 0);
      return c;
    }) as ReturnType<UrlTemplateImageryProvider["requestImage"]>;
  };
}

/**
 * Draw one gridded data layer (protocol: setDataLayer) over the base imagery and under overlays and drawings, or
 * clear it. Tiles use the geographic tiling scheme on this globe's own body (on Mars the app's sphere); nearest
 * sampling keeps a cell a cell. A change of alpha alone keeps the tiles already loaded.
 */
function setDataLayer(spec: DataLayerSpec | null) {
  if (!viewer) return;
  const change = dataLayerChange(dataLayer?.spec ?? null, spec);
  if (change === "none") return;
  if (change === "alpha" && dataLayer && spec) {
    dataLayer.spec = spec;
    dataLayer.layer.alpha = spec.alpha;
    requestRender();
    return;
  }
  if (dataLayer) {
    viewer.imageryLayers.remove(dataLayer.layer, true);
    dataLayer = null;
  }
  // The Cesium Mars 3D tiles replace the globe: there is no surface to drape tiles on.
  if (!spec || !viewer.scene.globe) { requestRender(); return; }
  const provider = new UrlTemplateImageryProvider({
    url: spec.url,
    tilingScheme: new GeographicTilingScheme({ ellipsoid }),
    maximumLevel: spec.maximumLevel,
    tileWidth: spec.tileSize,
    tileHeight: spec.tileSize,
    hasAlphaChannel: true,
  });
  if (spec.mask) maskProvider(provider, spec.mask, spec);
  const id = spec.id;
  provider.errorEvent.addEventListener(() => {
    dataFailures++;
    if (dataFailureTimer) return;
    dataFailureTimer = setTimeout(() => {
      post({ t: "dataLayerStatus", id, failures: dataFailures });
      dataFailures = 0;
      dataFailureTimer = null;
    }, 3000);
  });
  const layer = new ImageryLayer(provider, {
    alpha: spec.alpha, show: !drawingsHidden,
    magnificationFilter: TextureMagnificationFilter.NEAREST, minificationFilter: TextureMinificationFilter.NEAREST,
  });
  viewer.imageryLayers.add(layer, aboveBase());
  dataLayer = { spec, layer };
  requestRender();
}

// ---------------------------------------------------------------- camera
/** Centre of the frame area not covered by shell UI, in CSS pixels. */
function focusPoint() {
  const c = viewer!.scene.canvas;
  return { ...focusOf(c.clientWidth, c.clientHeight, insets), w: c.clientWidth, h: c.clientHeight };
}

function view(): View {
  const f = focusPoint();
  const fovy = (viewer!.camera.frustum as PerspectiveFrustum).fovy ?? CMath.toRadians(60);
  return { w: f.w, h: f.h, fovy, focus: { x: f.x, y: f.y } };
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

/** Camera position and orientation for a placement. */
function cameraFor(p: Placement) {
  const v = view();
  if (p.pitchDeg <= -89.5) {
    // Straight down from above the nadir that puts the target on the focus point.
    const heightM = p.depthKm * 1000, mpp = mppAtHeight(heightM);
    const n = p.exact
      ? exactNadir(toVec(pos(p.lat, p.lon)), p.lat, p.lon, heightM, mpp, v, p.headingDeg, meanR, (la, lo) => {
        const g = pos(la, lo);
        return { ground: toVec(g), enu: enuAt(g) };
      })
      : nadirFor(p.lat, p.lon, mpp, v, p.headingDeg, meanR);
    return {
      destination: pos(n.lat, n.lon, p.depthKm * 1000),
      orientation: { heading: CMath.toRadians(p.headingDeg), pitch: -CMath.PI_OVER_TWO, roll: 0 },
    };
  }
  const target = pos(p.lat, p.lon);
  const pose = poseAt(toVec(target), enuAt(target), p.depthKm * 1000, p.pitchDeg, p.headingDeg, v);
  return { destination: toCart(pose.position), orientation: { direction: toCart(pose.direction), up: toCart(pose.up) } };
}

function place(p: Placement, durationS: number, opts: { remember?: boolean; easing?: EasingFunction.Callback } = {}) {
  if (!viewer) return;
  spinning = false;
  if (opts.remember ?? true) lastTarget = p;
  const c = cameraFor(p);
  if (durationS <= 0) {
    viewer.camera.cancelFlight();
    viewer.camera.setView(c);
    requestRender();
    return;
  }
  viewer.camera.flyTo({ ...c, duration: durationS, easingFunction: opts.easing ?? EasingFunction.QUADRATIC_IN_OUT });
}

/**
 * The current framing: the ground point under the centre of the free area, how far it is in front of the
 * camera, and the camera's pitch and heading in that point's frame. Looking past the limb at the focus
 * point falls back to the frame centre; null when the planet is not under either.
 */
function viewTarget(): Placement | null {
  if (!viewer) return null;
  const cam = viewer.camera;
  const f = focusPoint();
  const world = cam.pickEllipsoid(new Cartesian2(f.x, f.y), ellipsoid) ?? cam.pickEllipsoid(new Cartesian2(f.w / 2, f.h / 2), ellipsoid);
  if (!world) return null;
  const c = Cartographic.fromCartesian(world, ellipsoid);
  if (!c) return null;
  const depth = Cartesian3.dot(Cartesian3.subtract(world, cam.positionWC, scratchA), cam.directionWC);
  const topDown = cam.pitch < CMath.toRadians(-88.5);
  const att = attitudeAt(toVec(cam.directionWC), toVec(cam.upWC), enuAt(world));
  return {
    lat: fromRender(CMath.toDegrees(c.latitude)),
    lon: normLon(CMath.toDegrees(c.longitude)),
    depthKm: Math.max(1, depth / 1000),
    pitchDeg: topDown ? -90 : Math.min(-10, att.pitchDeg),
    headingDeg: topDown ? CMath.toDegrees(cam.heading) : att.headingDeg,
    exact: true,
  };
}

const MAX_DEPTH_KM = planet === "mars" ? 40_000 : 80_000;

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
  const max = maxKm ?? (planet === "mars" ? 30_000 : 60_000);
  let heightKm = (mpp * viewer.scene.canvas.clientHeight) / (2 * Math.tan(fovy / 2)) / 1000;
  heightKm = Math.max(minKm, Math.min(max, heightKm));
  const pitch = flightPitchDeg(planet, heightKm, tiltPref);
  if (pitch <= -89.5) {
    place({ lat, lon, depthKm: heightKm, pitchDeg: -90, headingDeg: 0 }, durationS ?? autoDuration(lat, lon, heightKm));
    return;
  }
  // Tilted, the box's far edge recedes and its near edge grows: fit its projected outline to the free area
  // (the same padding share on every side) instead of its ground size.
  const outline: Vec3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    for (const [la, lo] of [[south, west + span * t], [north, west + span * t], [south + (north - south) * t, west], [south + (north - south) * t, west + span]]) {
      outline.push(toVec(pos(la, normLon(lo))));
    }
  }
  const k = padding / (1 + 2 * padding);
  const box = { x0: insets.left + f.freeW * k, x1: insets.left + f.freeW * (1 - k), y0: insets.top + f.freeH * k, y1: insets.top + f.freeH * (1 - k) };
  const target = pos(lat, lon);
  const depthKm = fitDepth(outline, toVec(target), enuAt(target), pitch, 0, view(), box, minKm * 1000, max * 1000) / 1000;
  place({ lat, lon, depthKm, pitchDeg: pitch, headingDeg: 0 }, durationS ?? autoDuration(lat, lon, depthKm));
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

function flyTo(lat: number, lon: number, heightKm = planet === "mars" ? 1_400 : 2_200, durationS?: number, tilt = tiltPref) {
  if (!viewer) return;
  // Site-scale flights end in the oblique approach; wider framings look straight down (camera.ts).
  const pitchDeg = flightPitchDeg(planet, heightKm, tilt);
  place({ lat, lon, depthKm: heightKm, pitchDeg, headingDeg: 0 }, durationS ?? autoDuration(lat, lon, heightKm));
}

/**
 * Switch top-down ⇄ 3D around the point under the reticle, at the same ground scale. Looking past the planet
 * there is nothing to turn about: the choice still holds for later flights, and the shell is told so.
 */
function setTilt(on: boolean) {
  if (!viewer) return;
  tiltPref = on;
  const t = viewTarget();
  if (!t) {
    post({ t: "tilt", on, turned: false });
    return;
  }
  place({ ...t, pitchDeg: on ? OBLIQUE_PITCH_DEG : -90 }, reducedMotion ? 0 : 0.9, { easing: EasingFunction.CUBIC_IN_OUT });
  post({ t: "tilt", on, turned: true });
}

/** Run a camera command now, or once the snapshot in progress has put the reader's view back. */
function cameraCommand(run: () => void) {
  if (capturing) deferred.push(run);
  else run();
}

let currentLayerId: string | null = null;
let tileFailures = 0;
let failureTimer: ReturnType<typeof setTimeout> | null = null;
/** Report imagery outages to the shell, at most every 5 s, so a dead tile server is visible, not silent. */
function watchProvider(provider: UrlTemplateImageryProvider, layerId: string) {
  provider.errorEvent.addEventListener(() => {
    tileFailures++;
    if (failureTimer) return;
    failureTimer = setTimeout(() => {
      post({ t: "imageryStatus", layer: layerId, failures: tileFailures, ok: false });
      tileFailures = 0;
      failureTimer = null;
    }, 5000);
  });
}

function setLayer(id: string) {
  if (!viewer) return;
  const def = LAYERS.find((l) => l.id === id) ?? LAYERS[0];
  if (def.id === currentLayerId) return;
  currentLayerId = def.id;
  const old = baseLayer;
  const provider = def.make(ellipsoid);
  watchProvider(provider, def.id);
  const layer = new ImageryLayer(provider, { alpha: old && !reducedMotion ? 0 : 1 });
  // Insert directly above the old base (or the placeholder), so the data layer and overlays stay on top, then
  // crossfade (no base-colour flash).
  const below = old ?? placeholderLayer;
  viewer.imageryLayers.add(layer, below ? viewer.imageryLayers.indexOf(below) + 1 : 0);
  baseLayer = layer;
  reportImagery();
  if (!old) { requestRender(); return; }
  if (reducedMotion) { viewer.imageryLayers.remove(old, true); requestRender(); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    if (!viewer) return;
    const k = Math.min(1, (now - t0) / 450);
    layer.alpha = k * k * (3 - 2 * k);
    viewer.scene.requestRender();
    if (k < 1) requestAnimationFrame(step);
    else viewer.imageryLayers.remove(old, true);
  };
  setTimeout(() => requestAnimationFrame(step), 250);
}

/** The base imagery now drawn, as the shell should credit it. */
function imagerySource(): ImagerySource {
  if (marsTiles) return { mode, layer: null, ...MARS_ION_SOURCE };
  const def = LAYERS.find((l) => l.id === currentLayerId) ?? LAYERS[0];
  return { mode, layer: def.id, label: def.label, note: def.note, credit: def.credit };
}
let imageryReported = false;
/** Tell the shell which imagery is drawn (from `ready` on; `ready` itself carries the first). */
function reportImagery() {
  if (imageryReported) post({ t: "imagery", imagery: imagerySource() });
}

/** Zoom towards the point under the reticle, keeping it there and keeping the view's pitch and heading. */
function zoom(direction: "in" | "out") {
  if (!viewer) return;
  const cam = viewer.camera;
  lastTarget = null;
  const t = viewTarget();
  if (!t) {
    const h = cam.positionCartographic.height;
    if (direction === "in") cam.zoomIn(h * 0.45); else cam.zoomOut(h * 0.8);
    requestRender();
    return;
  }
  const depthKm = Math.min(Math.max(direction === "in" ? t.depthKm * 0.55 : t.depthKm / 0.55, 25), MAX_DEPTH_KM);
  place({ ...t, depthKm }, reducedMotion ? 0 : 0.45, { remember: false, easing: EasingFunction.QUADRATIC_OUT });
}

/** Pan by a fraction of the frame (dx, dy in −1..1), keeping altitude. Keyboard alternative to dragging. */
function panBy(dx: number, dy: number) {
  if (!viewer) return;
  lastTarget = null;
  const t = viewTarget();
  if (!t) return;
  const canvas = viewer.scene.canvas;
  const mpp = metersPerPixel() ?? (viewer.camera.positionCartographic.height / canvas.clientHeight);
  const heading = CMath.toRadians(t.headingDeg);
  const ex = dx * canvas.clientWidth * mpp;
  const ny = -dy * canvas.clientHeight * mpp;
  const north = ny * Math.cos(heading) - ex * Math.sin(heading);
  const east = ny * Math.sin(heading) + ex * Math.cos(heading);
  const dLat = (north / meanR) * (180 / Math.PI);
  const dLon = (east / (meanR * Math.max(Math.cos((t.lat * Math.PI) / 180), 0.05))) * (180 / Math.PI);
  const lat = Math.max(-89.5, Math.min(89.5, t.lat + dLat));
  place({ ...t, lat, lon: normLon(t.lon + dLon) }, reducedMotion ? 0 : 0.35, { remember: false, easing: EasingFunction.QUADRATIC_OUT });
}

/** Face north, turning about the point under the reticle. */
function resetHeading() {
  if (!viewer) return;
  const t = viewTarget();
  if (!t) return;
  place({ ...t, headingDeg: 0 }, reducedMotion ? 0 : 0.4);
}

function metersPerPixel(): number | null {
  if (!viewer) return null;
  const f = focusPoint();
  // Horizontal through the focus point: in a tilted view that row has no foreshortening, so this is the
  // ground scale at the reticle (perspective makes it larger below and smaller above).
  const a = viewer.camera.pickEllipsoid(new Cartesian2(f.x - 50, f.y), ellipsoid);
  const b = viewer.camera.pickEllipsoid(new Cartesian2(f.x + 50, f.y), ellipsoid);
  if (!a || !b) return null;
  const g = new EllipsoidGeodesic(Cartographic.fromCartesian(a, ellipsoid), Cartographic.fromCartesian(b, ellipsoid), ellipsoid);
  const d = g.surfaceDistance;
  return Number.isFinite(d) && d > 0 ? d / 100 : null;
}

/**
 * The ground visible in the free area: its border sampled and projected onto the planet, each sample that looks
 * past the limb replaced by the horizon along its line from the reticle (ground.ts). Null when the reticle itself
 * is off the planet.
 */
function visibleGround(center: { lat: number; lon: number } | null): GroundBox | null {
  if (!viewer || !center) return null;
  const cam = viewer.camera;
  const f = focusPoint();
  const scratch = new Cartesian2();
  const hit = (x: number, y: number) => {
    scratch.x = x;
    scratch.y = y;
    const w = cam.pickEllipsoid(scratch, ellipsoid);
    if (!w) return null;
    const c = Cartographic.fromCartesian(w, ellipsoid);
    return c ? { lat: fromRender(CMath.toDegrees(c.latitude)), lon: normLon(CMath.toDegrees(c.longitude)) } : null;
  };
  const x0 = insets.left, y0 = insets.top, x1 = Math.max(x0 + 1, f.w - insets.right), y1 = Math.max(y0 + 1, f.h - insets.bottom);
  const pts: { lat: number; lon: number }[] = [];
  for (const s of borderSamples(x0, y0, x1, y1, 6)) {
    const p = hit(s.x, s.y) ?? horizonAlong({ x: f.x, y: f.y }, s, hit, 8);
    if (p) pts.push(p);
  }
  // A pole on the near side and inside the free area opens the box to every longitude.
  const poleIn = (lat: number) => {
    const world = pos(lat, 0);
    const s = SceneTransforms.worldToWindowCoordinates(viewer!.scene, world);
    return !!s && onNearSide(world) && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
  };
  const box = groundBox(pts, center, { north: poleIn(90), south: poleIn(-90) });
  if (!box) return null;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { west: r(box.west), south: r(box.south), east: r(box.east), north: r(box.north) };
}

function emitTelemetry(force = false) {
  if (!viewer || capturing) return;
  const now = performance.now();
  if (!force && now - lastTelemetryAt < 90) return;
  const cam = viewer.camera;
  const center = currentCenter();
  // Heading as the compass should read it: which way north lies at the reticle. (The camera's own heading
  // differs slightly when the reticle is off the frame centre in a tilted view.) Pitch stays the camera's
  // own, so a top-down camera always reads −90° however far the reticle sits from the frame centre.
  const f = focusPoint();
  const at = cam.pickEllipsoid(new Cartesian2(f.x, f.y), ellipsoid);
  const heading = at && cam.pitch > CMath.toRadians(-88.5)
    ? attitudeAt(toVec(cam.directionWC), toVec(cam.upWC), enuAt(at)).headingDeg
    : CMath.toDegrees(cam.heading);
  const t: CameraTelemetry = {
    heightKm: Math.round(cam.positionCartographic.height / 10) / 100,
    center: center ? { lat: Math.round(center.lat * 1e4) / 1e4, lon: Math.round(center.lon * 1e4) / 1e4 } : null,
    view: visibleGround(center),
    metersPerPixel: (() => { const m = metersPerPixel(); return m === null ? null : Math.round(m * 10) / 10; })(),
    headingDeg: Math.round(heading * 10) / 10 % 360,
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
  if (!viewer || capturing || anchors.length === 0) return;
  const scene = viewer.scene;
  const occluder = new EllipsoidalOccluder(ellipsoid, viewer.camera.positionWC);
  const w = scene.canvas.clientWidth, h = scene.canvas.clientHeight;
  const out: AnchorPosition[] = anchors.map((a) => {
    const world = pos(a.lat, a.lon);
    const win = SceneTransforms.worldToWindowCoordinates(scene, world);
    const onScreen = !!win && win.x >= -20 && win.y >= -20 && win.x <= w + 20 && win.y <= h + 20;
    const res: AnchorPosition = {
      id: a.id,
      x: win ? Math.round(win.x * 2) / 2 : -1,
      y: win ? Math.round(win.y * 2) / 2 : -1,
      visible: onScreen && occluder.isPointVisible(world),
    };
    // A marker on a stem: report where its glyph is drawn, so the label meets the glyph.
    const stem = stemAt(a.lat, a.lon);
    const top = stem && win ? SceneTransforms.worldToWindowCoordinates(scene, stemTop(stem)) : undefined;
    if (top) res.top = { x: Math.round(top.x * 2) / 2, y: Math.round(top.y * 2) / 2 };
    return res;
  });
  const key = JSON.stringify(out);
  if (key === lastAnchors) return;
  lastAnchors = key;
  post({ t: "anchors", anchors: out });
}

// ---------------------------------------------------------------- snapshots
interface SnapshotJob { id: string; lat: number; lon: number; heightKm: number; maxWidth: number; clean: boolean }

const noShot = (requestId: string, extra: Partial<Extract<GlobeToParent, { t: "snapshot" }>> = {}): GlobeToParent =>
  ({ t: "snapshot", requestId, dataUrl: null, width: 0, height: 0, ...extra });

/** One capture at a time; a queued capture withdrawn before its turn is answered at once. */
const snapshots = serialRunner<SnapshotJob>(runSnapshot, (job) => post(noShot(job.id, { cancelled: true })));

/**
 * Renders until the capture view's tiles have loaded (capture.ts: the tile load queue empty on two renders in a
 * row), the bounded wait runs out, or the capture is withdrawn. A timer backs up the frame count in case
 * frames stop (a hidden tab), so a withdrawal or the bound always ends the wait.
 */
function capturedTiles(signal: AbortSignal): Promise<SettleVerdict | "cancelled"> {
  const scene = viewer!.scene;
  const t0 = performance.now();
  return new Promise((resolve) => {
    let state = SETTLE_START;
    let done = false;
    let remove: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (v: SettleVerdict | "cancelled") => {
      if (done) return;
      done = true;
      remove?.();
      if (timer) clearTimeout(timer);
      resolve(v);
    };
    if (signal.aborted) { finish("cancelled"); return; }
    signal.addEventListener("abort", () => finish("cancelled"), { once: true });
    remove = scene.postRender.addEventListener(() => {
      // Imagery tiles on the globe, or the Cesium Mars 3D tiles when an ion token replaced the globe.
      const loaded = (scene.globe ? scene.globe.tilesLoaded : true) && (marsTiles ? marsTiles.tilesLoaded : true);
      const step = settleStep(state, loaded, performance.now() - t0);
      state = step.state;
      if (step.verdict !== "wait") finish(step.verdict);
      else scene.requestRender();
    });
    timer = setTimeout(() => finish("timeout"), SNAPSHOT_SETTLE.timeoutMs + 500);
    scene.requestRender();
  });
}

/** The next rendered frame, scaled to `maxWidth` px wide, as a JPEG (taken in postRender, before the buffer clears). */
function grabFrame(maxWidth: number, signal: AbortSignal): Promise<{ url: string; w: number; h: number } | null> {
  const scene = viewer!.scene;
  return new Promise((resolve, reject) => {
    if (signal.aborted) { resolve(null); return; }
    let remove = () => {};
    const onAbort = () => { remove(); resolve(null); };
    signal.addEventListener("abort", onAbort, { once: true });
    remove = scene.postRender.addEventListener(() => {
      remove();
      signal.removeEventListener("abort", onAbort);
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
}

/**
 * One snapshot: a nadir, north-up view of (lat, lon) from `heightKm`, in the working light, taken as soon as its
 * imagery has really loaded. The reader's view is put back exactly — a flight that was under way is completed
 * first, so it is the view they were heading for — and camera commands that arrived meanwhile then run in order.
 * Plates are always top-down: scan-volume walls and stems have no height when not tilted.
 */
async function runSnapshot(job: SnapshotJob, signal: AbortSignal) {
  if (!viewer) { post(noShot(job.id, { error: "viewer not ready" })); return; }
  if (signal.aborted) { post(noShot(job.id, { cancelled: true })); return; }
  const scene = viewer.scene;
  const cam = viewer.camera;
  const globe = scene.globe as Globe | undefined;
  const controller = scene.screenSpaceCameraController;
  cam.completeFlight();
  const saved = { position: cam.positionWC.clone(), direction: cam.directionWC.clone(), up: cam.upWC.clone() };
  const wasSpinning = spinning;
  const inputs = controller.enableInputs;
  const sse = globe?.maximumScreenSpaceError;
  capturing = true;
  spinning = false;
  controller.enableInputs = false;
  if (job.clean) setDrawingsHidden(true);
  let reply: GlobeToParent = noShot(job.id, { error: "not taken" });
  try {
    // The picture is the canvas scaled to maxWidth: load tiles only as fine as it can show (capture.ts).
    if (globe && sse !== undefined) globe.maximumScreenSpaceError = captureSse(sse, scene.canvas.width, job.maxWidth);
    cam.setView({ destination: pos(job.lat, job.lon, job.heightKm * 1000), orientation: { heading: 0, pitch: -CMath.PI_OVER_TWO, roll: 0 } });
    const tiles = await capturedTiles(signal);
    const shot = tiles === "cancelled" ? null : await grabFrame(job.maxWidth, signal);
    reply = shot && tiles !== "cancelled"
      ? { t: "snapshot", requestId: job.id, dataUrl: shot.url, width: shot.w, height: shot.h, imagery: tiles === "loaded" ? "complete" : "partial" }
      : noShot(job.id, { cancelled: true });
  } catch (err) {
    reply = noShot(job.id, { error: String(err) });
  } finally {
    if (globe && sse !== undefined) globe.maximumScreenSpaceError = sse;
    cam.setView({ destination: saved.position, orientation: { direction: saved.direction, up: saved.up } });
    if (job.clean) setDrawingsHidden(false);
    controller.enableInputs = inputs;
    spinning = wasSpinning;
    capturing = false;
    lastTelemetry = "";
    lastAnchors = "";
    for (const run of deferred.splice(0)) {
      try { run(); } catch (err) { post({ t: "error", message: String(err) }); }
    }
    emitTelemetry(true);
    emitAnchors();
    requestRender();
    post(reply);
  }
}

// ---------------------------------------------------------------- light
/**
 * A presentation light, set for legibility — not the Sun's position (the app has no solar ephemeris for either
 * body). It is fixed to the viewer, so the lit hemisphere and the terminator hold still on screen while the
 * planet turns beneath them (the intro's spin, a drag). Its mode comes from the shell (setLight), never from the
 * spin. Working views: light from just above-left of the camera, so the hemisphere in view is lit. Intro: a
 * three-quarter light from the upper left with a soft terminator and a lit limb. Snapshots always use the
 * working light, so a plate's locator does not depend on which screen asked for it.
 */
const LIGHT = { work: { right: 0.32, up: -0.24 }, intro: { right: 1.25, up: -0.62 } };
/** Seconds to change between the two lights (the shell slides the Mars frame in 0.6 s as the intro closes). */
const LIGHT_EASE_S = 0.6;
function updateLight() {
  if (!viewer) return;
  const cam = viewer.camera;
  const mix = capturing ? 0 : lightMix;
  const k = mix * mix * (3 - 2 * mix);
  const r = LIGHT.work.right + (LIGHT.intro.right - LIGHT.work.right) * k;
  const u = LIGHT.work.up + (LIGHT.intro.up - LIGHT.work.up) * k;
  const dir = Cartesian3.clone(cam.directionWC);
  Cartesian3.add(dir, Cartesian3.multiplyByScalar(cam.rightWC, r, scratchA), dir);
  Cartesian3.add(dir, Cartesian3.multiplyByScalar(cam.upWC, u, scratchA), dir);
  Cartesian3.normalize(dir, dir);
  (viewer.scene.light as DirectionalLight).direction = dir;
}

// ---------------------------------------------------------------- init
/**
 * Label fonts must be loaded before Cesium rasterises the first glyph (it caches glyphs per font), so
 * `ready` — after which the shell's label-bearing messages arrive — waits for them, briefly. Started at
 * load so it overlaps the boot handshake; the shell has usually fetched the same files already.
 */
const fontsReady = (() => {
  const faces = [
    "600 12px 'Barlow Semi Condensed'",
    "500 10.5px 'IBM Plex Mono'",
    "500 10px 'IBM Plex Mono'",
    "600 11px 'IBM Plex Mono'",
  ];
  const all = Promise.all(faces.map((f) => document.fonts.load(f))).then(() => undefined, () => undefined);
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, 1500))]);
})();

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
    // No default sky box, Sun or Moon: the light is a presentation light, not the Sun, and the star field
    // is added below (dimmed, and oriented for Mars behind Mars).
    skyBox: false,
    // Cesium's default sky atmosphere is WGS84-sized; give each planet a shell of its own radius.
    skyAtmosphere: new SkyAtmosphere(ellipsoid),
    // Render only when something changes (camera, tiles, data, messages): saves GPU and battery.
    requestRenderMode: true, maximumRenderTimeChange: Infinity,
  });
  const scene = viewer.scene;
  scene.backgroundColor = SPACE;
  scene.light = new DirectionalLight({ direction: new Cartesian3(1, 0, 0), intensity: 2.2 });
  scene.postUpdate.addEventListener(updateLight);
  occluder = new EllipsoidalOccluder(ellipsoid, viewer.camera.positionWC);
  scene.preUpdate.addEventListener(() => {
    frameTick++;
    if (occluder && viewer) occluder.cameraPosition = viewer.camera.positionWC;
  });
  scene.preRender.addEventListener(updateGraticuleLabels);
  scene.postRender.addEventListener(() => { emitTelemetry(); emitAnchors(); });
  placeCredits();
  initKeyboardSurface();
  scene.screenSpaceCameraController.minimumZoomDistance = 20_000;
  scene.screenSpaceCameraController.maximumZoomDistance = planet === "mars" ? 40_000_000 : 80_000_000;
  viewer.camera.moveStart.addEventListener(() => { moving = true; emitTelemetry(true); });
  viewer.camera.moveEnd.addEventListener(() => { moving = false; emitTelemetry(true); emitAnchors(); placeGraticuleLabels(); });

  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    if (planet === "mars") {
      // Thin, dusty limb: warm, red-weighted scattering with more Mie (suspended dust) than Rayleigh.
      // Scale heights near Mars's own (~11 km gas, a few km of dust haze), so the glow stays a thin ring.
      const sa = scene.skyAtmosphere;
      sa.atmosphereRayleighCoefficient = new Cartesian3(24.0e-6, 15.0e-6, 8.0e-6);
      sa.atmosphereMieCoefficient = new Cartesian3(40.0e-6, 30.0e-6, 20.0e-6);
      sa.atmosphereRayleighScaleHeight = 14_000;
      sa.atmosphereMieScaleHeight = 4_000;
      sa.atmosphereLightIntensity = 32;
      sa.saturationShift = 0;
      sa.brightnessShift = -0.16;
    } else {
      scene.skyAtmosphere.brightnessShift = -0.15;
    }
  }

  if (scene.globe) {
    const g = scene.globe;
    g.baseColor = css(planet === "mars" ? "#3a1f17" : "#0d1a26");
    g.enableLighting = true;
    // The limb glow follows the scene light, so it brightens on the lit side and fades past the terminator.
    g.dynamicAtmosphereLighting = true;
    g.dynamicAtmosphereLightingFromSun = false;
    g.showGroundAtmosphere = planet === "earth";
    g.atmosphereLightIntensity = 6;
    // Shading fades out as the camera nears the surface (everything lit at working altitudes) and is full
    // in whole-planet views; distances are from the planet's centre, scaled to each planet.
    g.lightingFadeOutDistance = meanR + (planet === "mars" ? 2_000_000 : 3_500_000);
    g.lightingFadeInDistance = meanR + (planet === "mars" ? 5_000_000 : 9_000_000);
    g.maximumScreenSpaceError = 1.6;
    g.tileCacheSize = 200;
    placeholderLayer = viewer.imageryLayers.addImageryProvider(placeholderProvider(), 0);
    setLayer(LAYERS[0].id);
  }

  try {
    if (useMarsTiles) {
      const tileset = await Cesium3DTileset.fromIonAssetId(3644333); // Cesium Mars
      scene.primitives.add(tileset);
      marsTiles = tileset;
      mode = "ion";
    } else if (planet === "earth" && ionToken) {
      scene.globe.terrainProvider = await CesiumTerrainProvider.fromIonAssetId(1);
      mode = "ion";
    }
  } catch (err) {
    post({ t: "error", message: `Cesium ion asset failed, using NASA imagery fallback: ${String(err)}` });
    if (!scene.globe) {
      scene.globe = new Globe(ellipsoid);
      placeholderLayer = viewer.imageryLayers.addImageryProvider(placeholderProvider(), 0);
    }
    marsTiles = null;
    mode = "fallback";
    setLayer(LAYERS[0].id);
  }

  viewer.camera.setView({ destination: pos(HOME.lat, HOME.lon, HOME.heightKm * 1000) });

  // Interaction
  const handler = new ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((ev: { position: Cartesian2 }) => {
    // A click during a capture would pick on the capture view, not on what the reader saw.
    if (capturing) return;
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
    if (defined(picked) && picked.id instanceof Entity && typeof picked.id.id === "string" && (picked.id.point || picked.id.billboard)) {
      const [, id] = picked.id.id.split("::");
      if (id) { post({ t: "markerClick", id }); return; }
    }
    const c = pickCarto(ev.position);
    if (c) post({ t: "pick", lat: c.lat, lon: c.lon });
  }, ScreenSpaceEventType.LEFT_CLICK);

  let last = 0;
  handler.setInputAction((ev: { endPosition: Cartesian2 }) => {
    const now = performance.now();
    if (capturing || now - last < 60) return;
    last = now;
    const c = pickCarto(ev.endPosition);
    post({ t: "hover", lat: c?.lat ?? null, lon: c?.lon ?? null });
  }, ScreenSpaceEventType.MOUSE_MOVE);
  for (const t of [ScreenSpaceEventType.LEFT_DOWN, ScreenSpaceEventType.RIGHT_DOWN, ScreenSpaceEventType.MIDDLE_DOWN, ScreenSpaceEventType.WHEEL, ScreenSpaceEventType.PINCH_START]) {
    handler.setInputAction(() => { lastTarget = null; if (spinning) { spinning = false; post({ t: "interaction" }); } }, t);
  }
  scene.canvas.addEventListener("pointerleave", () => post({ t: "hover", lat: null, lon: null }));

  // One animation loop drives the idle spin, the light easing and settle renders (request-render mode
  // otherwise renders only when something changes). Spin never runs with reduced motion.
  let prev = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (viewer) {
      if (spinning && !reducedMotion) {
        viewer.camera.rotate(Cartesian3.UNIT_Z, -0.035 * dt);
        scene.requestRender();
      }
      const goal = lightMode === "intro" ? 1 : 0;
      if (lightMix !== goal) {
        // The change of light runs with the shell's 0.6 s slide of the frame as the intro opens or closes, so it
        // reads as part of that one transition rather than as a terminator sweeping on its own afterwards.
        lightMix = reducedMotion ? goal : goal > lightMix ? Math.min(goal, lightMix + dt / LIGHT_EASE_S) : Math.max(goal, lightMix - dt / LIGHT_EASE_S);
        scene.requestRender();
      }
      if (now < settleUntil) scene.requestRender();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  void initSky().catch((err) => post({ t: "error", message: `star field unavailable: ${String(err)}` }));
  await fontsReady;
  initOrbits();

  post({
    t: "ready", planet, mode,
    layers: LAYERS.map(({ id, label, kind, note }) => ({ id, label, kind, note })),
    ellipsoid: planet === "earth" ? "WGS84" : ionToken ? `Mars IAU 2000 (${MARS_IAU2000.a}/${MARS_IAU2000.b} m)` : `Mars sphere R = ${R_MARS_M} m`,
    imagery: imagerySource(),
  });
  imageryReported = true;
  emitTelemetry(true);
  settle();
  if (import.meta.env.DEV) Object.assign(window, { __globe: { viewer, groups, occluder: () => occluder, pos, markers: markerRecs, place, viewTarget } });
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
      // Camera commands wait for a capture in progress (cameraCommand): they act on the reader's view.
      case "flyTo": { const { lat, lon, heightKm, durationS, tilt } = m; cameraCommand(() => flyTo(lat, lon, heightKm, durationS, tilt)); break; }
      case "fitBounds": { const b = m; cameraCommand(() => fitBounds(b.west, b.south, b.east, b.north, b.padding, b.minHeightKm, b.maxHeightKm, b.durationS)); break; }
      case "setInsets":
        insets = { top: m.top, right: m.right, bottom: m.bottom, left: m.left };
        placeCredits();
        lastTelemetry = "";
        cameraCommand(() => { if (lastTarget) place(lastTarget, reducedMotion ? 0 : 0.6); });
        break;
      case "setView": {
        const { lat, lon, heightKm } = m;
        cameraCommand(() => viewer?.camera.setView({ destination: pos(lat, lon, heightKm * 1000), orientation: { heading: 0, pitch: -CMath.PI_OVER_TWO, roll: 0 } }));
        break;
      }
      case "reset": {
        const { durationS } = m;
        cameraCommand(() => {
          spinning = false;
          flyTo(HOME.lat, HOME.lon, HOME.heightKm, reducedMotion ? 0 : durationS);
        });
        break;
      }
      case "setMarkers": setMarkers(m.group, m.markers, m.options); break;
      case "setFootprints": setFootprints(m.group, m.footprints); break;
      case "setGroupShown": setGroupShown(m.kind, m.group, m.on); break;
      case "select": selectedId = m.id; rebuildStems(); break;
      case "setLayer": setLayer(m.layer); break;
      case "setOverlay": void setOverlay(m.id, m.url, m.alpha); break;
      case "setDataLayer": setDataLayer(m.layer); break;
      case "setGraticule": setGraticule(m.on, m.stepDeg); break;
      case "trackAnchors": anchors = m.anchors; lastAnchors = ""; break;
      case "zoom": { const d = m.direction; cameraCommand(() => zoom(d)); break; }
      case "panBy": { const { dx, dy } = m; cameraCommand(() => panBy(dx, dy)); break; }
      case "resetHeading": cameraCommand(resetHeading); break;
      case "snapshot":
        snapshots.add({ id: m.requestId, lat: m.lat, lon: m.lon, heightKm: m.heightKm, maxWidth: m.maxWidth ?? 960, clean: !!m.clean });
        break;
      case "cancelSnapshot":
        // Unknown ids (already answered) need no reply; a queued one is answered by the runner, a running one by itself.
        snapshots.cancel(m.requestId);
        break;
      // The spin moves the camera: during a capture it waits too (the capture restores the spin it found).
      case "setSpin": { const on = m.on; cameraCommand(() => { spinning = on; }); break; }
      case "setLight":
        lightMode = m.mode === "intro" ? "intro" : "work";
        // The shell slides the frame as the intro opens or closes (0.6 s): keep rendering until it has arrived,
        // so the orbit labels are placed for where the frame ends up, not where it was mid-slide.
        settle(900);
        break;
      case "resize": viewer?.resize(); placeCredits(); break;
      case "setTilt": {
        const { on, turn } = m;
        if (turn === false) tiltPref = on;
        else cameraCommand(() => setTilt(on));
        break;
      }
    }
    requestRender();
  } catch (err) {
    post({ t: "error", message: String(err) });
  }
});

// Keyboard operation when the globe frame has focus: every pointer action has a key equivalent.
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!viewer || e.metaKey || e.ctrlKey || e.altKey) return;
  // Enter or Space on a link or button inside the frame (a data credit) activates it; it never picks a point.
  const target = e.target as HTMLElement | null;
  if ((e.key === "Enter" || e.key === " ") && target && (target.tagName === "A" || target.tagName === "BUTTON")) return;
  const step = e.shiftKey ? 0.5 : 0.2;
  let handled = true;
  switch (e.key) {
    case "ArrowUp": cameraCommand(() => panBy(0, -step)); break;
    case "ArrowDown": cameraCommand(() => panBy(0, step)); break;
    case "ArrowLeft": cameraCommand(() => panBy(-step, 0)); break;
    case "ArrowRight": cameraCommand(() => panBy(step, 0)); break;
    case "+": case "=": cameraCommand(() => zoom("in")); break;
    case "-": case "_": cameraCommand(() => zoom("out")); break;
    case "n": case "N": cameraCommand(resetHeading); break;
    // Off the planet the camera has no pitch to judge by: the key then flips the stored preference.
    case "t": case "T": cameraCommand(() => setTilt(currentCenter() ? !isTilted(CMath.toDegrees(viewer!.camera.pitch)) : !tiltPref)); break;
    case "Enter": case " ": {
      // During a capture the centre is the capture's, not the reader's: nothing to pick.
      const c = capturing ? null : currentCenter();
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

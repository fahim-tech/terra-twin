/**
 * Typed message protocol between the React shell and the isolated globe iframes.
 *
 * Each planet runs CesiumJS in its own iframe because Cesium's `Ellipsoid.default` is shared
 * mutable module state: a Mars viewer and an Earth viewer in one JS realm would corrupt each
 * other's geodesy. All coordinates crossing this boundary are planetocentric latitude and
 * east-positive longitude in degrees (-180..180), for both bodies.
 */
export type Planet = "mars" | "earth";

export type MarkerKind =
  | "research_site" // Mars Exploration Zone
  | "selection" // user-selected point
  | "candidate" // tier-1 coarse candidate
  | "leader" // tier-2 named leader / tied-set member
  | "pool" // tier-2 research pool window (examined, not a result)
  | "reference" // documented analog
  | "control"; // negative control

export interface GlobeMarker {
  id: string;
  lat: number;
  lon: number;
  kind: MarkerKind;
  label?: string;
  rank?: number;
}

export interface MarkerGroupOptions {
  /** Cluster nearby markers into count bubbles (Cesium EntityCluster). */
  cluster?: boolean;
  /** Which Cesium labels to draw. HTML annotations in the shell usually replace them. */
  labels?: "none" | "selected" | "all";
}

export interface GlobeFootprint {
  id: string;
  kind: "aoi" | "cell" | "window" | "research_bbox";
  /** Either a square of side `km` centred on lat/lon, or an explicit geographic bbox. */
  lat: number;
  lon: number;
  km?: number;
  bbox?: [west: number, south: number, east: number, north: number];
}

export interface LayerInfo {
  id: string;
  label: string;
  kind: "imagery" | "overlay";
  note: string;
}

export interface AnchorRequest {
  id: string;
  lat: number;
  lon: number;
}

export interface AnchorPosition {
  id: string;
  /** CSS pixels relative to the globe frame's top-left corner. */
  x: number;
  y: number;
  /** False when the point is behind the planet or off-screen. */
  visible: boolean;
  /**
   * When the anchor is a marker the globe draws on a stem (the selection, the selected marker, leaders):
   * where its glyph is drawn, at the top of the stem. Equals (x, y) in a top-down view; above it when the
   * camera is tilted. Labels should attach here so they meet the glyph, not the stem's foot.
   */
  top?: { x: number; y: number };
}

/** Where a label's leader line should start for an anchor: the marker's glyph (stem top) when it has one. */
export function anchorPoint(a: AnchorPosition): { x: number; y: number; glyph: boolean } {
  return a.top ? { x: a.top.x, y: a.top.y, glyph: true } : { x: a.x, y: a.y, glyph: false };
}

/** Names of the two camera views, as the tilt control and announcements say them. */
export const VIEW_NAMES = { tilted: "3D view", topDown: "Top-down view" } as const;

export function viewName(tilted: boolean): string {
  return tilted ? VIEW_NAMES.tilted : VIEW_NAMES.topDown;
}

export interface CameraTelemetry {
  /** Camera height above the reference surface, km. */
  heightKm: number;
  /** Surface point under the frame centre (planetocentric, east-positive), or null when looking past the limb. */
  center: { lat: number; lon: number } | null;
  /**
   * Ground distance per CSS pixel at the frame centre, metres, along the screen horizontal (in a tilted view
   * that row is not foreshortened); null when the centre is off the planet.
   */
  metersPerPixel: number | null;
  /** Direction of north at the frame centre, degrees clockwise (the compass). */
  headingDeg: number;
  /** Camera pitch below its own horizon: −90 looking straight down, about −56° to −69° in the 3D view. */
  pitchDeg: number;
  moving: boolean;
}

export type ParentToGlobe =
  | { t: "init"; ionToken: string | null }
  /**
   * Fly so the target sits at the centre of the free area, `heightKm` from the camera (its altitude when
   * looking straight down). Site-scale flights end in the oblique 3D view (pitched ≈ −50°) unless the
   * user chose the top-down view; whole-planet framings always look straight down.
   */
  | { t: "flyTo"; lat: number; lon: number; heightKm?: number; durationS?: number }
  /** Fit a geographic box into the unobstructed part of the frame (see setInsets). */
  | { t: "fitBounds"; west: number; south: number; east: number; north: number; padding?: number; minHeightKm?: number; maxHeightKm?: number; durationS?: number }
  /** CSS-pixel insets covered by shell UI; framing, the reticle point and telemetry use the free area. */
  | { t: "setInsets"; top: number; right: number; bottom: number; left: number }
  | { t: "setView"; lat: number; lon: number; heightKm: number }
  | { t: "reset"; durationS?: number }
  | { t: "setMarkers"; group: string; markers: GlobeMarker[]; options?: MarkerGroupOptions }
  | { t: "setFootprints"; group: string; footprints: GlobeFootprint[] }
  | { t: "select"; id: string | null }
  | { t: "setLayer"; layer: string }
  | { t: "setOverlay"; id: string; url: string | null; alpha?: number }
  | { t: "setGraticule"; on: boolean; stepDeg?: number }
  | { t: "trackAnchors"; anchors: AnchorRequest[] }
  | { t: "zoom"; direction: "in" | "out" }
  | { t: "panBy"; dx: number; dy: number }
  | { t: "resetHeading" }
  | { t: "snapshot"; requestId: string; lat: number; lon: number; heightKm: number; maxWidth?: number }
  /** Idle rotation; while on (the intro) the planet is also lit by a stronger three-quarter light. */
  | { t: "setSpin"; on: boolean }
  | { t: "resize" }
  /**
   * Switch between the top-down and the oblique 3D view, keeping the point under the centre of the free
   * area where it is and at the same ground scale. Later site flights follow the choice.
   */
  | { t: "setTilt"; on: boolean };

export type GlobeToParent =
  | { t: "boot"; planet: Planet }
  | { t: "ready"; planet: Planet; mode: "ion" | "fallback"; layers: LayerInfo[]; ellipsoid: string }
  | { t: "pick"; lat: number; lon: number }
  | { t: "hover"; lat: number | null; lon: number | null }
  | { t: "markerClick"; id: string }
  | { t: "camera"; camera: CameraTelemetry }
  | { t: "anchors"; anchors: AnchorPosition[] }
  | { t: "snapshot"; requestId: string; dataUrl: string | null; width: number; height: number; error?: string }
  | { t: "interaction" }
  | { t: "key"; key: "Escape" }
  /** The view was switched (T key in the globe, or setTilt): on = 3D view, off = top-down. */
  | { t: "tilt"; on: boolean }
  /** Imagery tiles failing to load (throttled); `failures` counts since the previous report. */
  | { t: "imageryStatus"; layer: string; failures: number; ok: boolean }
  | { t: "error"; message: string };

export const CHANNEL = "terratwin-globe/1";

export interface Envelope<T> {
  channel: typeof CHANNEL;
  msg: T;
}

export function wrap<T>(msg: T): Envelope<T> {
  return { channel: CHANNEL, msg };
}

export function isEnvelope(data: unknown): data is Envelope<unknown> {
  return typeof data === "object" && data !== null && (data as { channel?: unknown }).channel === CHANNEL;
}

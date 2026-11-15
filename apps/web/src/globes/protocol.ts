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
}

export interface CameraTelemetry {
  /** Camera height above the reference surface, km. */
  heightKm: number;
  /** Surface point under the frame centre (planetocentric, east-positive), or null when looking past the limb. */
  center: { lat: number; lon: number } | null;
  /** Ground distance per CSS pixel at the frame centre, metres; null when the centre is off the planet. */
  metersPerPixel: number | null;
  headingDeg: number;
  pitchDeg: number;
  moving: boolean;
}

export type ParentToGlobe =
  | { t: "init"; ionToken: string | null }
  | { t: "flyTo"; lat: number; lon: number; heightKm?: number; durationS?: number }
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
  | { t: "setSpin"; on: boolean }
  | { t: "resize" };

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

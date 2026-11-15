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

export type ParentToGlobe =
  | { t: "init"; ionToken: string | null }
  | { t: "flyTo"; lat: number; lon: number; heightKm?: number; durationS?: number }
  | { t: "reset"; durationS?: number }
  | { t: "setMarkers"; group: string; markers: GlobeMarker[] }
  | { t: "setFootprints"; group: string; footprints: GlobeFootprint[] }
  | { t: "select"; id: string | null }
  | { t: "setLayer"; layer: string }
  | { t: "setSpin"; on: boolean }
  | { t: "resize" };

export type GlobeToParent =
  | { t: "boot"; planet: Planet }
  | { t: "ready"; planet: Planet; mode: "ion" | "fallback"; layers: LayerInfo[]; ellipsoid: string }
  | { t: "pick"; lat: number; lon: number }
  | { t: "hover"; lat: number | null; lon: number | null }
  | { t: "markerClick"; id: string }
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

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

/**
 * What the shell announces when the 3D preference changes (a `tilt` event): the view now shown, or — when the
 * camera could not be turned because nothing but sky is under the centre of the view — that the choice holds
 * for the next site flight.
 */
export function tiltAnnouncement(on: boolean, turned = true): string {
  return turned ? viewName(on) : `${viewName(on)} applies from the next site flight: there is no ground under the centre of the view to turn about.`;
}

/** A geographic box, degrees (planetocentric latitude, east-positive longitude). West > east when it crosses ±180°. */
export interface GroundBox { west: number; south: number; east: number; north: number }

export interface CameraTelemetry {
  /** Camera height above the reference surface, km. */
  heightKm: number;
  /** Surface point under the frame centre (planetocentric, east-positive), or null when looking past the limb. */
  center: { lat: number; lon: number } | null;
  /**
   * The ground actually visible in the free area: the box around the free area's border projected on the planet
   * (up to the horizon where the border looks past it), so a tilted view's far ground is included. Null when the
   * centre is off the planet; absent from globes that predate it.
   */
  view?: GroundBox | null;
  /**
   * Ground distance per CSS pixel at the frame centre, metres, along the screen horizontal (in a tilted view
   * that row is not foreshortened); null when the centre is off the planet.
   */
  metersPerPixel: number | null;
  /** Direction of north at the frame centre, degrees clockwise (the compass). */
  headingDeg: number;
  /**
   * Camera pitch below its own horizon: exactly −90 looking straight down; in the 3D view about −56° to −69°
   * at site scale, nearer −90° from far away (see camera.ts isTilted).
   */
  pitchDeg: number;
  moving: boolean;
}

export type ParentToGlobe =
  | { t: "init"; ionToken: string | null }
  /**
   * Fly so the target sits at the centre of the free area, `heightKm` from the camera (its altitude when
   * looking straight down). Site-scale flights end in the oblique 3D view (pitched ≈ −50°) unless the
   * user chose the top-down view; whole-planet framings always look straight down. `tilt` overrides the
   * globe's own view preference for this flight (two globes flown together then end at the same pitch).
   */
  | { t: "flyTo"; lat: number; lon: number; heightKm?: number; durationS?: number; tilt?: boolean }
  /** Fit a geographic box into the unobstructed part of the frame (see setInsets). */
  | { t: "fitBounds"; west: number; south: number; east: number; north: number; padding?: number; minHeightKm?: number; maxHeightKm?: number; durationS?: number }
  /** CSS-pixel insets covered by shell UI; framing, the reticle point and telemetry use the free area. */
  | { t: "setInsets"; top: number; right: number; bottom: number; left: number }
  | { t: "setView"; lat: number; lon: number; heightKm: number }
  | { t: "reset"; durationS?: number }
  | { t: "setMarkers"; group: string; markers: GlobeMarker[]; options?: MarkerGroupOptions }
  | { t: "setFootprints"; group: string; footprints: GlobeFootprint[] }
  /**
   * Show or hide one drawing group without touching its contents: setMarkers / setFootprints keep updating it
   * while it is hidden, and it shows as it then is. Every group is shown until hidden here.
   */
  | { t: "setGroupShown"; kind: "markers" | "footprints"; group: string; on: boolean }
  | { t: "select"; id: string | null }
  | { t: "setLayer"; layer: string }
  | { t: "setOverlay"; id: string; url: string | null; alpha?: number }
  | { t: "setGraticule"; on: boolean; stepDeg?: number }
  | { t: "trackAnchors"; anchors: AnchorRequest[] }
  | { t: "zoom"; direction: "in" | "out" }
  | { t: "panBy"; dx: number; dy: number }
  | { t: "resetHeading" }
  /**
   * Render the view straight down on (lat, lon) from `heightKm`, north up, and reply with a JPEG. Snapshots run
   * one at a time; each settles when the globe's tile load queue is empty (every imagery tile of that view has
   * loaded), not after a fixed wait. Any camera flight in progress is completed first, and camera commands that
   * arrive meanwhile are applied after it, so the view the reader returns to is the one they were heading for.
   * `clean` hides everything the app draws (markers, labels, footprints, overlays, graticule, moon orbits) for
   * this capture only; it is shown again afterwards exactly as it was.
   */
  | { t: "snapshot"; requestId: string; lat: number; lon: number; heightKm: number; maxWidth?: number; clean?: boolean }
  /**
   * Withdraw a snapshot: dropped if it is still queued, or stopped at once if it is rendering (camera,
   * drawings and inputs restored). Either way the reply is a snapshot with `cancelled: true`.
   */
  | { t: "cancelSnapshot"; requestId: string }
  /** Idle rotation (the intro). Rotation only: the light is set separately (setLight). */
  | { t: "setSpin"; on: boolean }
  /**
   * The presentation light, which is set for legibility, not the Sun's position (the app has no solar
   * ephemeris for either body). It is fixed to the viewer, so the lit hemisphere and the terminator hold
   * still on screen however the planet turns beneath them. `work` lights the hemisphere in view; `intro`
   * is a three-quarter light from the upper left with a soft terminator, for the title screen.
   */
  | { t: "setLight"; mode: LightMode }
  | { t: "resize" }
  /**
   * Switch between the top-down and the oblique 3D view, keeping the point under the centre of the free
   * area where it is and at the same ground scale. Later site flights follow the choice. `turn: false` only
   * records the choice for later flights (the camera stays as it is and no `tilt` event is sent).
   */
  | { t: "setTilt"; on: boolean; turn?: boolean };

/** Presentation light modes (see setLight). */
export type LightMode = "work" | "intro";

export type GlobeToParent =
  | { t: "boot"; planet: Planet }
  | { t: "ready"; planet: Planet; mode: "ion" | "fallback"; layers: LayerInfo[]; ellipsoid: string }
  | { t: "pick"; lat: number; lon: number }
  | { t: "hover"; lat: number | null; lon: number | null }
  | { t: "markerClick"; id: string }
  | { t: "camera"; camera: CameraTelemetry }
  | { t: "anchors"; anchors: AnchorPosition[] }
  /**
   * A snapshot's result. `imagery` says whether every tile of the view had loaded when it was taken
   * ("complete") or the bounded wait ran out first ("partial": some ground may show coarser imagery).
   * `cancelled` marks a snapshot withdrawn with cancelSnapshot (no image).
   */
  | { t: "snapshot"; requestId: string; dataUrl: string | null; width: number; height: number; error?: string; imagery?: "complete" | "partial"; cancelled?: boolean }
  | { t: "interaction" }
  | { t: "key"; key: "Escape" }
  /**
   * The 3D preference was switched (T key in the globe, or setTilt): on = 3D view, off = top-down. `turned`
   * is false when the camera could not be turned because there is no ground under the centre of the view
   * (it is looking past the planet): the preference still applies to the next site flight.
   */
  | { t: "tilt"; on: boolean; turned?: boolean }
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

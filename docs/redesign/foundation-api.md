# Redesign foundation — APIs for view packages

Everything here already exists on `redesign/planetary-workspace`. View packages consume these APIs
and must not edit the files listed under "Shared files".

## Globe access

```tsx
import { useGlobeBus, useGlobeEvents } from "@/app/globeBus";
const bus = useGlobeBus();
bus.send("earth", { t: "fitBounds", west, south, east, north, padding: 0.2 });
useGlobeEvents("mars", (m) => { if (m.t === "pick") … });
bus.handles.earth.current?.snapshot(lat, lon, heightKm, maxWidth) // → { dataUrl, width, height } | null
```

Commands (`ParentToGlobe`, `src/globes/protocol.ts`): `flyTo`, `fitBounds`, `setView`, `reset`,
`setMarkers` (group, markers, `{ cluster, labels: "none" | "selected" | "all" }`), `setFootprints`, `select`,
`setLayer`, `setOverlay` (id, url | null, alpha), `setGraticule`, `trackAnchors`, `zoom`, `panBy`,
`resetHeading`, `snapshot`, `setSpin`, `setInsets`, `resize`.
Marker kinds: `research_site`, `selection`, `candidate`, `leader`, `pool`, `reference`, `control`.
Footprint kinds: `aoi`, `cell`, `window`, `research_bbox`.

Events (`GlobeToParent`): `pick` (lat, lon), `markerClick` (id without group prefix), `hover`, `camera`,
`anchors`, `snapshot`, `interaction`, `key` (Escape), `error`.

Conventions: planetocentric latitude, east-positive longitude −180..180, both planets. Markers behind the
planet are hidden and unpickable. Flights aim targets at the centre of the **free area** (the part of the
frame not covered by elements marked `data-occludes`), and re-aim when that area changes until the user
moves the camera.

## Occlusion and framing
Mark any floating UI that covers a globe with `data-occludes="mars" | "earth" | "both"`. The shell measures
these (`useGlobeInsets`) and tells the globes; camera framing, the centre reticle and keyboard Enter-picks
then use the free area. Mirror: `useGlobes((s) => s.insets[planet])`.

## Live globe state (high frequency; separate store)
`useGlobes((s) => s.camera[planet])` → `{ heightKm, center, metersPerPixel, headingDeg, pitchDeg, moving }`;
`s.anchors[planet][id]` → `{ x, y, visible }`; `s.hover`; `s.ready[planet]`.

## Map instruments — `src/components/map/`
`ScaleBar`, `AltitudeReadout`, `CenterReadout`, `Reticle`, `NavControls` (zoom, compass/north, reset),
`AnnotationLayer` (HTML labels with leader lines pinned to lat/lon; items `{ id, lat, lon, content, tone, side }`).

## App state — `src/store/app.ts`
`stage` (mars | earth | compare | evidence | report), `selection`, `mission`, `footprintKm`, `search`
(the last analog search; it is kept when the selection changes — compare `search.request` with `selection`
to label stale results), `tier`, `candidateId` (`t1:<region_id>` / `t2:<window id>`), `representation`,
`whyOpen`, `earthOverlays`, `graticule`, `knownFilter`, `leftOpen`, `rightOpen`, `marsLayer`, `earthLayer`.
Actions: `set`, `go(stage)`, `back()`, `select(selection)`, `announce(text, urgent?)`, `closeTopmost()`.
Feature-local UI state belongs in the feature folder (component state or a small local store).

## Data hooks — `src/services/api.ts`
`useSites`, `useEarthSites`, `useMissions`, `useDatasets`, `useEvidence`, `useMarsAnalysis(params)`,
`useFindAnalogs()`, `useResearchSummary()`, `useEarthPool()`, `useLegend()`;
`api.similarityRasterUrl(site, mission)`, `api.coverageRasterUrl()`, `api.tier1Page(...)`.
Per-site research outcome for the active mission: `useSiteOutcomes()` in `features/explorer/outcomes.ts`.

## Accessibility contracts
- The main heading of each stage carries `data-stage-heading="<stage>"`; the shell focuses it after a stage change.
- Async results call `useApp.getState().announce(...)` (polite) or `announce(msg, true)` for errors.
- Escape closes the topmost layer via `closeTopmost()`; menus/popovers handle Escape themselves first
  (call `e.preventDefault()`).
- Every globe action has a keyboard path inside the focused globe (arrows, ±, N, Enter).

## Mobile
`src/components/Sheet.tsx` — gesture bottom sheet (`snap`: peek | half | full) with momentum projection,
rubber-banding and keyboard resizing.

## URL state
`#/<stage>?site=<EZ>|lat=&lon=&mission=&cand=` is written and restored by the shell (`useUrlState`).

## Shared files (foundation only)
`src/index.css`, `index.html`, `globe.html`, `src/app/**`, `src/components/**`, `src/globes/**`,
`src/store/**`, `src/services/**`, `src/types/**`, `src/lib/**`, `package.json`, `apps/api/**`.
View packages own only their feature folder (`src/features/<package>/**`) and may add files there.

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

## Shell slots (exports the shell imports — keep these names and files)

| Package | Export (file) | Where the shell mounts it |
|---|---|---|
| Mars | `MarsSearch` (`features/explorer/MarsSearch.tsx`) | top-left navigator capsule, 360 px (full width on phones) |
| Mars | `MarsInspector` (`features/explorer/MarsInspector.tsx`) | right context surface (380 px, full height, `rounded-surface`) on desktop/tablet; bottom `Sheet` on phones. Render a flex column: `PanelHeader` / `PanelBody` / `PanelFooter` (sticky CTA). Shown only when a selection exists. |
| Mars | `MarsOverlay` (`features/explorer/MarsOverlay.tsx`) | over the Mars globe (annotations) |
| Mars | `MarsGlobeSync` (`features/explorer/MarsGlobeSync.tsx`) | non-visual |
| Earth | `EarthLayers` (`features/analogs/EarthLayers.tsx`) | top-left navigator capsule |
| Earth | `AnalogResults` (`features/analogs/AnalogResults.tsx`) | right context surface / phone sheet when a search exists (same column contract) |
| Earth | `EarthGlobeSync` (`features/analogs/EarthGlobeSync.tsx`) | non-visual |
| Compare | `ComparisonPanel` (`features/comparison/ComparisonPanel.tsx`) | over the split globes (and the phone Mars/Earth switch); owns its strip/drawer; must mark its surfaces `data-occludes="both"` |
| Compare | `CompareGlobeSync` (`features/comparison/CompareGlobeSync.tsx`) | non-visual |
| Evidence | default export `features/evidence/EvidenceView.tsx` | full page over the dimmed globe |
| Report | default export `features/report/ReportView.tsx` | full page over the dimmed globe |

A package may add components/files inside its folder and re-export through these names.

## Primitives — `src/components/primitives.tsx`
`Kicker`, `Toponym` (serif place names; sizes sm/md/lg), `Measure` (mono value + unit, missing ≠ 0), `Figure`
(key figure + label + basis), `Term` (plain label with technical term/definition popover, keys from
`src/lib/glossary.ts`), `Disclosure`, `Tag`, `IconButton`, `Tabs`, `Dots` (availability), `PanelHeader`,
`PanelBody`, `PanelFooter`, `Block`, `SPRING` (Motion spring: bounce 0, 0.35 s). Legacy `components/ui.tsx`
(`Button`, `Segmented`, `Chip`, `Note`, `Spinner`, `Bar`, `fmt`, `pct`, `cx`) restyled and still available.

Glossary and G5 strings: `src/lib/glossary.ts` (`GLOSSARY`, `G5`, `zoneName()`). Use `G5.*` verbatim.

Tokens (Tailwind v4): colours `space surface elevated line line-strong ink muted faint mars earth warn bad`;
text sizes `text-display text-toponym text-toponym-sm text-title text-lead text-body text-label text-caption
text-kicker text-figure text-num text-num-sm`; classes `.surface` (basalt), `.surface-solid` (opaque, for
menus/drawers on top of surfaces), `.num`, `.toponym`, `.kicker`, `.on-imagery` (text halo over imagery),
`.fade-edges`, `.hit` (44 px targets on coarse pointers); radii `rounded-control` (6), `rounded-surface` (14).

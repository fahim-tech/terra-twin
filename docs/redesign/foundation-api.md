# Redesign foundation — APIs for view packages

Everything here exists on `redesign/mission-control` (v2, "Mission control": see
`docs/redesign/v2-mission-control.md`). View packages consume these APIs and must not edit the files listed
under "Shared files".

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
`resetHeading`, `snapshot`, `setSpin`, `setInsets`, `resize`, `setTilt` (`{ on }`).
Marker kinds: `research_site`, `selection`, `candidate`, `leader`, `pool`, `reference`, `control`.
Footprint kinds: `aoi`, `cell`, `window`, `research_bbox`.

Events (`GlobeToParent`): `boot`, `ready`, `pick` (lat, lon), `markerClick` (id without group prefix), `hover`,
`camera`, `anchors`, `snapshot`, `interaction`, `key` (Escape), `tilt` (`{ on }`), `imageryStatus`, `error`.

Conventions: east-positive longitude −180..180 on both planets. Latitude follows each planet's API
convention: **planetocentric on Mars** (the research sphere, R = 3,396,190 m; with the IAU 2000 ellipsoid the
globe converts to planetographic for rendering) and **geodetic WGS84 on Earth**. The report's plate neatline
ticks use the same conventions (planetocentric on Mars, geodetic WGS84 on Earth). Markers behind the planet are
hidden and unpickable. Flights aim targets at the centre of the **free area** (the part of the frame not covered
by elements marked `data-occludes`), and re-aim when that area changes until the user moves the camera.

### 3D view (tilt)
- Site-scale `flyTo` flights end in the oblique 3D view (camera pitched ≈ −50°) unless the user chose the
  top-down view; whole-planet framings always look straight down.
- `setTilt { on }` switches top-down ⇄ 3D around the point under the centre of the free area, at the same ground
  scale; later site flights follow the choice. The globe answers with a `tilt { on }` event (also sent when the
  user presses **T** inside the focused globe). Name the two views with `viewName(on)` / `VIEW_NAMES`
  ("3D view", "Top-down view").
- `NavControls` carries the **3D** toggle button (`aria-pressed` while tilted, 6 px status square) and announces
  the new view; telemetry `camera.pitchDeg` with `isTilted(pitch)` (`src/globes/camera.ts`) tells instruments
  whether the view is tilted (the scale bar then reads "at centre").

### Footprints and scan volumes
- A footprint's size always comes from the caller's payload: a square of side `km` centred on lat/lon, or an
  explicit `bbox` [west, south, east, north]. A footprint with neither (no `km`, no `bbox`) is skipped — never
  drawn with a default size.
- `aoi`, `cell` and `window` are drawn as **scan volumes** in the 3D view: walls and a raised edge that appear
  only when the camera is tilted, weighted by the footprint's size on screen (a flat outline below 56 px, the
  whole volume from 112 px, so small boxes never blur around their marker). The wall height
  (max(250 m, 0.3 × side)) is visual only and never shown or read as a measurement.
- `research_bbox` (research zones) stays a **flat** outline: zones are context, not scanned areas.

### Anchors
`trackAnchors` returns `AnchorPosition { id, x, y, visible, top? }` in CSS pixels of the frame. `top` is where a
marker standing on a stem (the selection, the selected marker, leaders) draws its glyph: equal to (x, y)
top-down, above it in the 3D view. Attach labels with `anchorPoint(a)` so leader lines meet the glyph, not the
stem's foot.

## Occlusion and framing
Mark any floating UI that covers a globe with `data-occludes="mars" | "earth" | "both"`. The shell measures
these (`useGlobeInsets`) and tells the globes; camera framing, the centre reticle and keyboard Enter-picks
then use the free area. Mirror: `useGlobes((s) => s.insets[planet])`.

## Live globe state (high frequency; separate store)
`useGlobes((s) => s.camera[planet])` → `{ heightKm, center, metersPerPixel, headingDeg, pitchDeg, moving }`;
`s.anchors[planet][id]` → `{ x, y, visible, top? }`; `s.hover`; `s.ready[planet]` (true once the globe has
booted — `scripts/shots.mjs` waits on it).

## Map instruments — `src/components/map/`
`ScaleBar`, `AltitudeReadout`, `CenterReadout`, `Reticle`, `NavControls` (zoom, compass/north, 3D tilt, reset),
`AnnotationLayer` (HTML labels with leader lines pinned to lat/lon; items `{ id, lat, lon, content, tone, side }`).

## Terrain relief — `src/components/relief/`
Real elevation grids in 3D (raw WebGL2, no dependency; a 2D hillshade with the same labels without WebGL2).

```tsx
import { ReliefView, EXAGGERATIONS, homePose, renderReliefSnapshot } from "@/components/relief";
<ReliefView planet="earth" id={windowId} occludes="both" />          // fetches, draws, or says why it cannot
const shot = await renderReliefSnapshot(relief, { planet: "earth", ve: 4, width: 640, height: 400 });
// → { dataUrl, width, height, mode: "3d" | "2d" } | null — a static, self-captioned image for reports
```

- `ReliefView` props: `planet`, `id` (research-pool window id on Earth, Exploration Zone id on Mars), `title?`,
  `defaultExaggeration?` (one of `EXAGGERATIONS` = 1, 2, 4, 8; default 4), `header?`, `renderer?`
  (`"auto" | "2d"`), `occludes?`, `className?`. Drag orbits with momentum, two fingers zoom and turn, arrows rotate
  and tilt, ± zoom, N faces north, R resets.
- Data: `useRelief(windowId)` / `useMarsRelief(site)` and `api.relief(id)` / `api.marsRelief(site)`
  (`src/services/api.ts`), validated by the Zod `Relief` schema (`src/types/contracts.ts`; it asserts the grid
  orientation and `rows × cols` values). Endpoints: `GET /api/earth/pool/{window_id}/relief` and
  `GET /api/mars/relief?site=` (`contracts/api-contract.md`).
- **What the grid is.** Earth **as measured**: Copernicus DEM GLO-90 elevations aggregated to 463.09 m cells
  (the MOLA mosaic grid spacing) on a local azimuthal-equidistant grid centred on the window, 108 × 108 cells
  (rows, cols and `cell_m` always come from the payload). The MOLA observation operator is **not** applied
  (the payload's `source.note` says so), so relief views and captions say "Earth as measured" and never
  "as MOLA would observe it" — that phrase describes the research comparison's decision, which does compare
  Earth as MOLA would observe it. Nulls are water-masked cells, never 0.
- **Mars relief** exists only when a MOLA mosaic reader is connected. Until then `GET /api/mars/relief` answers
  503 with the reason and the view shows it; nothing is substituted.

## App state — `src/store/app.ts`
`stage` (mars | earth | compare | evidence | report), `selection`, `mission`, `footprintKm`, `search`
(the last analog search; it is kept when the selection changes — compare `search.request` with `selection`
to label stale results), `tier`, `candidateId` (`t1:<region_id>` / `t2:<window id>`), `representation`,
`whyOpen`, `earthOverlays`, `graticule`, `knownFilter`, `leftOpen`, `rightOpen`, `marsLayer`, `earthLayer`.
Actions: `set`, `go(stage)`, `back()`, `select(selection)`, `announce(text, urgent?)`, `closeTopmost()`.
Feature-local UI state belongs in the feature folder (component state or a small local store).

## Data hooks — `src/services/api.ts`
`useSites`, `useEarthSites`, `useMissions`, `useDatasets`, `useEvidence`, `useMarsAnalysis(params)`,
`useFindAnalogs()`, `useResearchSummary()`, `useEarthPool()`, `useLegend()`, `useRelief(id)`, `useMarsRelief(site)`;
`api.similarityRasterUrl(site, mission)`, `api.coverageRasterUrl()`, `api.tier1Page(...)`.
Per-site research outcome for the active mission: `useSiteOutcomes()` in `features/explorer/outcomes.ts`.

## Accessibility contracts
- The main heading of each stage carries `data-stage-heading="<stage>"`; the shell focuses it after a stage change.
- Async results call `useApp.getState().announce(...)` (polite) or `announce(msg, true)` for errors.
- Escape closes the topmost layer via `closeTopmost()`; menus/popovers handle Escape themselves first
  (call `e.preventDefault()`).
- Every globe action has a keyboard path inside the focused globe (arrows, ±, N, T, Enter).
- Focus is visible everywhere: the global ring is 1 px ink, 2 px out (`@layer base`); adjust it per element with
  `focus-visible:outline-*` utilities (no `!` needed).

## Mobile
`src/components/Sheet.tsx` — gesture bottom sheet (`snap`: peek | half | full) with momentum projection,
rubber-banding and keyboard resizing. The phone top rail shows the current step only, its detail set on a
second line under the step name (full detail in the accessible name).

## URL state
`#/<stage>?site=<EZ>|lat=&lon=&mission=&cand=` is written and restored by the shell (`useUrlState`).

## Shared files (foundation only)
`src/index.css`, `index.html`, `globe.html`, `src/app/**`, `src/components/**`, `src/globes/**`,
`src/store/**`, `src/services/**`, `src/types/**`, `src/lib/**`, `package.json`, `apps/api/**`.
View packages own only their feature folder (`src/features/<package>/**`) and may add files there.

## Shell slots (exports the shell imports — keep these names and files)

| Package | Export (file) | Where the shell mounts it |
|---|---|---|
| Mars | `MarsSearch` (`features/explorer/MarsSearch.tsx`) | top-left navigator, 360 px (full width on phones) |
| Mars | `MarsInspector` (`features/explorer/MarsInspector.tsx`) | right context surface (380 px, full height, `rounded-surface`) on desktop/tablet; bottom `Sheet` on phones. Render a flex column: `PanelHeader` / `PanelBody` / `PanelFooter` (sticky CTA). Shown only when a selection exists. |
| Mars | `MarsOverlay` (`features/explorer/MarsOverlay.tsx`) | over the Mars globe (annotations) |
| Mars | `MarsGlobeSync` (`features/explorer/MarsGlobeSync.tsx`) | non-visual |
| Earth | `EarthLayers` (`features/analogs/EarthLayers.tsx`) | top-left navigator |
| Earth | `AnalogResults` (`features/analogs/AnalogResults.tsx`) | right context surface / phone sheet when a search exists (same column contract) |
| Earth | `EarthGlobeSync` (`features/analogs/EarthGlobeSync.tsx`) | non-visual |
| Compare | `ComparisonPanel` (`features/comparison/ComparisonPanel.tsx`) | over the split globes (and the phone Mars/Earth switch); owns its strip/drawer; must mark its surfaces `data-occludes="both"` |
| Compare | `CompareGlobeSync` (`features/comparison/CompareGlobeSync.tsx`) | non-visual |
| Evidence | default export `features/evidence/EvidenceView.tsx` | full page over the dimmed globe |
| Report | default export `features/report/ReportView.tsx` | full page over the dimmed globe |

A package may add components/files inside its folder and re-export through these names.

## Primitives — `src/components/primitives.tsx`
`Kicker`, `Toponym` (place names in the condensed uppercase sans — Barlow Semi Condensed 600, caps; sizes
sm/md/lg; no serif anywhere), `Measure` (mono value + unit, missing ≠ 0), `Figure` (key figure + label + basis),
`Term` (plain label with technical term/definition popover, keys from `src/lib/glossary.ts`; the popover stays
inside the viewport and terms with Greek symbols keep their case), `Disclosure`, `Tag`, `IconButton`, `Tabs`,
`Dots` (availability), `PanelHeader`, `PanelBody`, `PanelFooter`, `Block`, `SPRING` (Motion spring: bounce 0,
0.35 s), `radioGroupKeys`, `useTermTriggers`. Legacy `components/ui.tsx` (`Button`, `Segmented`, `Chip`, `Note`,
`Spinner`, `Bar`, `fmt`, `pct`, `cx`) restyled and still available.

Glossary and G5 strings: `src/lib/glossary.ts` (`GLOSSARY`, `G5`, `decisionG5Label()`, `zoneName()`,
`keepsTermCase()`). Use `G5.*` and `decisionG5Label` verbatim. The glossary also serves the method-evidence chart
terms (`mrr`, `megdr`, `aeqd`, `rho`, `kappa`; `features/evidence/Gloss.tsx` is an alias of `Term`).
`zoneName(id)` typesets research-zone ids (spaces, "1–2" ranges, a joined number or compass prefix split) and
never renames a zone: no source gives other names.

## Tokens and classes (Tailwind v4, `src/index.css`)
Colours `space surface elevated line line-strong ink muted faint mars earth warn bad`; text sizes `text-display
text-toponym text-toponym-sm text-title text-lead text-body text-label text-caption text-kicker text-figure
text-num text-num-sm`; fonts `font-sans` (Barlow), `font-[family-name:var(--font-display)]` (Barlow Semi
Condensed), `font-mono` (IBM Plex Mono). Radii `rounded-control` and `rounded-surface` are both **2 px**;
`rounded-full` only for true circles in data graphics.

Classes: `.surface` (instrument glass), `.surface-solid` (opaque, for menus/drawers on top of surfaces),
`.frame` (corner registration brackets; `--frame-l` sets their length), `.num`, `.toponym`, `.kicker`,
`.label-caps`, `.rule-after` (title + hairline), `.on-imagery` (text halo over imagery), `.fade-edges`,
`.scroll-thin`, `.hit` (44 px targets on coarse pointers), `.term-hit`, `.no-print`.

### Breakpoints
Tailwind's `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536, plus **`xs` = 380 px** (`--breakpoint-xs:
23.75rem`) for narrow phones: `xs:` applies from 380 px, `max-xs:` below it. It is set in rem like the built-in
breakpoints, so it sorts with them — `max-xs:` wins over `max-sm:` / `max-md:` on the same property and `sm:` /
`md:` win over `xs:` — instead of `max-[379px]:` / `min-[380px]:` pairs, which sort before the named
breakpoints and leave a gap at 379.5 px. The shell's layout classes (`useLayout`) are phone < 768 ≤ tablet <
1200 ≤ desktop.

### Cascade layers
`index.css` follows Tailwind's layer order `theme → base → components → utilities`:
- `@layer base`: element defaults — `body`, the global `:focus-visible` ring, `::selection`, 16 px form fields on
  coarse pointers, the contrast and reduced-motion preferences, and the print colour scheme (`color-scheme:
  light`, paper colours).
- `@layer components`: the shared classes above, plus their print and preference variants.
- Utilities always win over both, so restyle a shared class or the focus ring on one element with a plain
  utility (`kicker text-ink`, `label-caps text-[10.5px]`, `rule-after gap-2`,
  `focus-visible:outline-offset-[-4px]`). Existing `!` utilities keep working; new code should not need them.
  Add new shared classes inside `@layer components`, never unlayered (unlayered rules beat every utility).

## Screenshots — `apps/web/scripts/shots.mjs`
`node scripts/shots.mjs --base http://localhost:<port> --views intro,compare --sizes 1440x900,390x844 --out <dir>`
(flags `--base --out --sizes --views --chrome --settle`). Views: `intro`, `mars-empty`, `mars-selected`,
`mars-unavailable`, `earth-results`, `earth-tier1`, `earth-unavailable`, `earth-tied`, `compare`, `compare-why`,
`compare-relief` (opens the comparison's "3D relief" mode; skipped with a note when the build has none),
`evidence`, `report`. Waits are condition-based and bounded: both globes ready (30 s) and the web fonts before
any view, then a quiet network (no request in flight for 0.7 s, at most 8 s — imagery tiles) after boot and
before each capture; Evidence and the report are captured screen by screen to the end; the report waits (30 s)
until every `#dossier-plates` figure image has loaded and no plate or whole-disk locator is still rendering.

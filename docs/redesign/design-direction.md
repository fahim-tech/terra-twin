# TerraTwin design direction — "Planetary atlas instrument"

Definitive spec for the redesign. Derived from `audit.md`. The three-way design-direction workflow was
interrupted before producing output, so this spec was written directly; it keeps the audit's consensus
recommendations and resolves its contradictions (see the critic's corrections).

## 1 Concept

TerraTwin is a living planetary atlas with precise instruments. The planet fills the screen; place names are
set like a cartographer's plate (serif toponyms); measurements read like instrument output (mono numerals);
the interface is a few small, near-opaque basalt surfaces that appear when there is something to say and
leave again. Investigation flows as a trail — Mars › Earth › Compare — never as a dashboard.

## 2 Principles

1. **The planet is the canvas.** Chrome ≤ 25 % of the desktop stage. No permanent side panels.
2. **One question per surface.** Each floating surface answers one question (where am I, what is here, what
   did we find, how sure are we) and has one primary action.
3. **Science in the headline, caveats one step away.** The decision and its basis are the headline; required
   G5 strings are always reachable (one click, one line), never deleted.
4. **Shape and position before colour.** Planet hues identify planets only. Status uses glyph + words.
5. **Motion explains space.** Camera moves carry context; surfaces enter from the edge they belong to and exit
   the same way. Nothing loops, nothing bounces without momentum.

## 3 Typography (Google Fonts)

Load: `Instrument Serif` (400, 400 italic), `Instrument Sans` (400, 500, 600), `IBM Plex Mono` (400, 500).

| Token | Family | px | line-height | tracking | weight | Use |
|---|---|---|---|---|---|---|
| `display` | Instrument Serif | 56 | 1.02 | −0.02em | 400 | Intro title, report title |
| `toponym` | Instrument Serif | 30 | 1.08 | −0.012em | 400 | Selected place name, page titles |
| `toponym-sm` | Instrument Serif | 22 | 1.15 | −0.008em | 400 | Candidate names, section heads in report/evidence |
| `title` | Instrument Sans | 17 | 1.3 | −0.006em | 600 | Surface titles |
| `lead` | Instrument Sans | 16 | 1.5 | 0 | 400 | Intro body, report body |
| `body` | Instrument Sans | 14 | 1.5 | 0 | 400 | Panel prose (max 2 lines per idea) |
| `label` | Instrument Sans | 13 | 1.35 | 0 | 500 | Control labels, row names |
| `caption` | Instrument Sans | 12 | 1.4 | +0.005em | 400 | Secondary notes (floor for prose) |
| `kicker` | Instrument Sans | 11 | 1.3 | +0.08em | 600 | UPPERCASE kicker — one tier only, max one per surface section |
| `figure` | IBM Plex Mono | 26 | 1.1 | −0.01em | 400 | Key figures (S, observed %) |
| `num` | IBM Plex Mono | 13 | 1.35 | 0 | 400 | Measurements, coordinates in rows |
| `num-sm` | IBM Plex Mono | 11.5 | 1.3 | 0 | 400 | Instrument readouts, legends |

Rules: every number is IBM Plex Mono with tabular figures; units in Instrument Sans at caption size, muted,
after a thin space. Coordinates are always `17.68° N 77.01° E` (2 dp in rows, 3 dp in headers). Fixed
precision per descriptor (slope 1 dp, relief/RMS 0 dp, Hurst 2 dp, S 3 dp, fractions as % 0 dp).
Inputs are ≥ 16 px on coarse pointers.

## 4 Colour

Semantic token names are kept (existing classes keep working); values change.

| Token | Hex | Role | Contrast on surface |
|---|---|---|---|
| `space` | #05070A | page backdrop | — |
| `surface` | #0E1116 | basalt surfaces (used at 94 % alpha) | — |
| `elevated` | #171C23 | raised rows, inputs, menus | — |
| `line` | #252C35 | hairlines (list rows only) | — |
| `line-strong` | #3A434E | input borders, focus fallback | — |
| `ink` | #EEECE6 | primary text (warm white) | 16.0 |
| `muted` | #A9B1BA | secondary text | 8.7 |
| `faint` | #8B95A1 | tertiary text (≥ 4.5 everywhere) | 6.2 |
| `mars` | #E8835F | Mars identity: target, AOI, Mars column, Mars CTA | 7.1 |
| `earth` | #5CC4B6 | Earth identity: candidates, Earth column, Earth CTA | 9.0 |
| `warn` | #E2C46C | caution (with ⚠ glyph) | 11.1 |
| `bad` | #F2788F | errors / unavailable (with ⊘ glyph) | 7.1 |
| `ok` | #EEECE6 | positive status = ink + ✓ glyph (no green) | 16.0 |

Data colour: tier-1 similarity raster uses **viridis** (served by the API, legend from `/api/visualization/legend`).
Comparison encodes Mars = terracotta dot, Earth = teal dot on a neutral axis; the research-tolerance band is
neutral ink at 8 % alpha. Brand accents never encode quantity. Print: ink #111, secondary #444, mars #B4532F,
earth #1E7F74.

## 5 Surfaces, spacing, radii, elevation

- Spacing: 4 px base — 4, 8, 12, 16, 20, 24, 32, 48. Surface inset 20 px (16 px on phones).
- Radii: 6 (controls, rows), 14 (surfaces), 999 (search capsule and pills only).
- Surface: `background: rgb(14 17 22 / .94); backdrop-filter: blur(16px) saturate(1.1)`, no border except a
  1 px `rgb(255 255 255 / .06)` inner highlight; shadow `0 18px 50px -12px rgb(0 0 0 / .65)`.
  Never stack translucent on translucent: menus/drawers on a surface are `elevated`, opaque.
- `prefers-reduced-transparency`: surfaces opaque, no blur. `prefers-contrast: more`: 1 px `line-strong` border.
- Grouping by space and type weight; hairlines only between list rows; scroll edges fade (mask) instead of rules.

## 6 Motion

- `MotionConfig reducedMotion="user"` at the root.
- Surfaces: spring `{ type: "spring", bounce: 0, duration: 0.35 }`; enter from their own edge (x/y 16 px) with
  opacity; exit the same way.
- Press feedback on pointer-down: `scale(0.97)` 90 ms.
- Camera flights: duration scales with distance (0.7–2.1 s, implemented in the globe); reduced motion = jump.
- Mars → Earth: opacity crossfade 600 ms (Mars out 0–400 ms, Earth in 200–600 ms); no CSS scale on iframes.
- Compare: globes cross-fade into the split; panels resize once (no animated WebGL resize).
- Candidate highlight: marker grows (+5 px) and list row gains `elevated` background; no pulsing.
- Reduced motion: 150 ms opacity only.

## 7 Shell & navigation

Desktop (≥ 1200 px):

```
┌ TerraTwin  Mars · Jezero › Earth · Atacama Yungay › Compare        Evidence  Report  ⋯ ┐  52 px rail
│ [⌕ Search 39 research zones or lat, lon        ]                          ┌──────────┐ │
│                                                                           │Inspector │ │
│                            planet                                         │ 360 px   │ │
│                              +                                            │ appears  │ │
│                                                                           │ on select│ │
│ 200 km ▭  Altitude 1,100 km  Centre 17.68° N 77.01° E     legend      [+−◎⌂] └──────────┘ │
└──────────────────────────────── NASA/Trek credits ─────────────────────────────────────┘
```

- **Top rail (52 px, transparent over a top fade):** wordmark (Instrument Serif 20 px, twin-ring mark) · the
  investigation **trail**: `Mars · <target>` › `Earth · <decision short>` › `Compare` — the current step has
  `aria-current="step"`; locked steps are visible in `faint` with their prerequisite on hover/focus
  ("Run Find Earth Analogs first"). Right: `Evidence`, `Report` (disabled until results), `⋯` menu (Layers,
  Lat/lon grid, Data status, About, AstroSUST credit).
- **Mission** lives in the inspector (Mars) and in the results header (Earth), never in the rail.
- **Status banner** (top, under the rail) only when the API is unreachable or imagery fails: one line + Retry.
- **Tablet (768–1199 px):** same rail (trail truncates to the current step); search capsule; inspector as an
  overlay 340 px; at most one surface open.
- **Phone (< 768 px):** rail 48 px (mark + current step + ⋯); search capsule below the rail; content in a bottom
  `Sheet` (peek / half / full) with a sticky primary action at the sheet's foot; instruments reduced to scale bar
  + nav cluster (top-right). Compare uses a Mars | Earth segmented switch over one globe.

## 8 Mars explorer

- **First impression:** Mars disc offset right (camera framing uses insets: the intro copy column is an
  occluder), slow spin, thin dusty limb. Intro copy left: kicker "AstroSUST · NASA Space Apps 2026", display
  "TerraTwin", lead "Two worlds. Shared terrain.", body (≤ 45 words) "Explore 39 candidate landing zones on
  Mars, measure their terrain, and screen Earth's land for comparable ground. Research comparisons re-observe
  Earth the way NASA's MOLA altimeter saw Mars.", actions: `Explore Mars` (primary, mars) and `Start with
  Jezero` (ghost). Clicking the planet during the intro does not select; it dismisses the intro.
- **Research zones layer:** all 39 EZ boxes drawn as faint terracotta outlines (`research_bbox`), plus their
  centre markers; hover readout states "Research zone · Jezero" or "No terrain data here · nearest zone
  Noachis, 1,540 km" (computed client-side) before any click.
- **Search capsule (top-left, 360 px):** input "Search 39 research zones or enter lat, lon"; dropdown lists zones
  (proper names, `Deuteronilus1_2` → "Deuteronilus 1–2") with the research outcome glyph for the active
  mission (◉ stable leader, ◎ tie, — none) and coordinates; first group "Start here" (Jezero, Gale, Arcadia
  Planitia, Cerberus) — chosen for showing a stable leader, a tie and a documented positive-control limit.
  Typing "lat, lon" offers "Go to 17.68° N 77.01° E".
- **Instruments:** reticle at the free-area centre; scale bar, altitude, centre readout (bottom-left of the free
  area); nav cluster (zoom, north, reset) bottom-right of the free area; layer legend chip (base imagery name +
  "visualization only"); selection annotation with leader line (toponym + coordinates); AOI square (mars).
- **Inspector (on selection), order:**
  1. Header — kicker "Research zone" or "Outside research zones"; toponym; coordinates; `×` close.
  2. Mission row — `Mission` label + compact select; one sentence of effect ("Vegetated ground is removed
     before ranking").
  3. Terrain — 2×2 key metrics (Mean slope, 90th-pct slope, Relief, RMS height ~1.85 km) as mono figures with
     units; "All 7 measures" and "Whole zone · 8 measures" disclosures; each value has a `Term` popover
     (definition, source, grid 463 m, state derived).
  4. Footprint — segmented `1 · 5 · 25 · 100 km` + one caption ("Analyses run on 25 km cells and 50 km
     windows").
  5. Evidence availability — one row of labelled dots: Terrain ●, Observation support ● 31 %, Thermal ○,
     Geology ○, Ice ○, Climate ○; "What's missing" disclosure.
  6. Sticky CTA `Find Earth Analogs →` (mars), caption "Global screen + research comparison".
- **Outside research zones:** header kicker "Outside research zones"; one sentence "TerraTwin measures Mars
  terrain only inside 39 research zones for now."; primary `Go to nearest zone · Noachis · 1,540 km`; secondary
  `Keep this point` (keeps marker + coordinate); disclosure "What would be needed" listing MOLA mosaic, MEGDR
  counts, GIS extraction. No Find Earth Analogs button.

## 9 Earth explorer

- On arrival, frame the **active result set** (`fitBounds` of tier-2 members; for the global screen, the
  first page of cells), never a single fixed altitude.
- **Results surface (right, 380 px)** — header: `Results for Jezero · Landing Site` (search target, never the
  live selection) with a stale notice if the selection moved; then two ordered stages:
  1. **Research comparison** — kicker "Research comparison · 50 km windows · Earth as MOLA would observe it";
     verdict headline: "Stable leader" + toponym-sm member name, or "Tie · 3 equivalent windows" (members as an
     unordered group, none selected), or "Not enough evidence"; the G5 label verbatim beneath; figure `S 0.614`
     with `8/8 measures` and "validated on synthetic twins only ⓘ"; rotation glyph (four small squares, all
     filled = stable); "Ranked among 50 of 230 research windows that pass the land-cover gate".
  2. **Global screen** — kicker "Global screen · 249,165 land cells · 25 km · Earth as measured"; single-line
     40 px rows: rank · coordinates · bar · S · flags; cells within 0.05 of the top grouped ("11 cells within
     0.05 — not ranked against each other"); "Load more" and "Rank cells in view".
- **Layers (top-left capsule + legend):** Similarity field (viridis legend 0–1, "not a probability"),
  Research pool (230 windows, faint dots), Screening coverage. Toggle chips.
- Markers: tier-2 members `leader`; pool `pool`; tier-1 `candidate` clustered; reference sites only when
  "Reference sites" layer on.
- **No-result state:** kicker "Not enough evidence"; title "No Earth comparison for this point"; one sentence;
  primary `Go to nearest research zone`; disclosure with the missing inputs as a list (mono for env names).

## 10 Comparison

- Two globes at full height (split 50/50) at matched altitude; both draw the **50 km research window**
  (Mars: `tier2.target`; Earth: candidate) in white with identical styling plus a scale bar each; labels on a
  plate (toponym-sm + planet kicker).
- **Summary strip** (bottom, 176 px, occludes both): left: `Jezero ↔ Atacama Yungay` (serif) + verdict line;
  middle: `S 0.614` figure + basis "Research comparison · Earth as MOLA would observe it · 8/8 measures" +
  scope line "Terrain geometry only — not geology, formation process, habitability, gravity, atmosphere or
  radiation"; right: mode tabs `Spatial · Measurements · Evidence · Relevance` and `Why this analog?`.
- Choosing a mode other than Spatial expands the strip to 56 % height.
  - **Measurements:** ratio chart (SVG): one row per tier-1 descriptor, x = Earth/Mars on a log axis 0.5×–2×,
    neutral tolerance band [1/(1+τ), 1+τ], dot at the ratio (teal) relative to Mars (=1, terracotta tick); Hurst
    on a linear Δ axis ±0.3 with ±0.08 band. Rows grouped "Similar" / "Different". Header states the basis:
    "Global-screen descriptors, 25 km, as measured — context, not the research score".
  - **Evidence:** representation switch with the two G5 strings; "as MOLA would observe it" → S 0.614 (research
    record); "as measured" → uncorrected comparator leader + S; per-descriptor research values listed as not
    loaded (with why). Robustness line: "Leader differs at 25 km windows (all 39 zones)".
  - **Relevance:** dimensions of analogy (evaluated / partial / not evaluated), applications "to be verified",
    planetary differences table.
- **Why this analog?** drawer (opaque `elevated`, dialog semantics, Escape closes): blocks Similar, Different,
  Processes (not established), Applications (to be verified), Limits, Evidence — each block labels its basis.
- Tie: comparing a tie member shows "Member of a tie (1 of 3)" in the verdict line.

## 11 Evidence

Editorial page (max 1040 px) over a dimmed (not blurred) static Mars:
1. Title (toponym) "Observation-operator matching", kicker "Research method · synthetic validation only".
2. Key figures block (tagged SYNTHETIC): direct 18 % → OOM 95 % top-1; MRR 0.30 → 0.97; per-site bias
   correction 82 % (the strongest alternative); adverse result: cubic chain 0.54 vs 0.65.
3. **Process figure** — four-stage schematic (SVG, labelled "Schematic — not data"): sampling (bins with shots
   along N–S tracks, ~31 % observed), interpolation (Delaunay), half-pixel blend, warp to 463 m window; each stage
   cites the documented constant.
4. Charts (dragmode off): ranked dots with CIs for 5 methods; falsification dumbbells per true chain (cubic
   flagged); interpolator paired error; observation support as a dot strip; abstention split into "Synthetic
   twins" vs "Real MOLA targets — no ground truth".
5. Controls, coverage, limitations (verbatim), provenance.

## 12 Report dossier

Editorial: title block (display serif "Jezero ↔ Atacama Yungay"), status line "Candidate identification — not
validation of a new analog"; two location plates (globe snapshots, labelled "NASA Mars Trek / GIBS imagery —
visualization only", with the 50 km window and coordinates); key figures strip (decision · S · measures ·
validation); terrain comparison (ratio chart); dimensions; provenance; limitations verbatim; references.
Tier-aware: no candidate → "No candidate selected" dossier (search summary only). Exports keep tier, unit,
representation and decision columns. Print: light theme variables.

## 13 Copy glossary (plain label → term on demand)

| Primary | Technical term |
|---|---|
| Global screen | Tier 1 coarse screening (GMTED2010, 25 km, as measured) |
| Research comparison | Tier 2 observation-operator matching (OOM), fixed 230-window pool |
| Similarity | S, normalised log-ratio similarity index 0–1 (not a probability) |
| 8/8 measures | coverage: descriptors finite for this window |
| MOLA observation model | target-specific observation operator (MEGDR mask + linear interpolation + ½-px blend) |
| Stable leader / Tie / Not enough evidence | named_leader / tied_set / insufficient_evidence |
| Research zone | NASA human-landing Exploration Zone (EZ) |
| Land-cover filter | mission-conditional ESA WorldCover gate (working hypotheses) |

G5 strings appear verbatim: toggle (Compare › Evidence), stable/tied labels (verdict lines), operator note
(Term popover on "MOLA observation model"), validation note (popover on "synthetic twins only"), scope (Compare
strip), scale (Global screen header popover and Compare › Evidence).

## 14 Accessibility

Every globe action has a keyboard path (search capsule + globe keys). Stage headings carry
`data-stage-heading`. Dialogs trap focus and restore it. Live region announces search status/results. Focus ring
2 px `earth` at 70 % mix, offset 2. Touch targets ≥ 44 px on coarse pointers. Contrast per §4.

## 15 Remove / demote

Permanent left panel; coordinate form as first item; mission select in top bar; API dot + team credit in the
bar (→ ⋯ menu); 10.5 px pills for decisions; env-var chips; Python identifiers in primary views; "Tier 1/Tier 2"
labels in primary text; blurred globe behind full pages; Cesium labels where HTML annotations exist.

## 16 Implementation notes

Globe protocol already supports telemetry, anchors, insets, fitBounds, overlays, clustering, graticule,
snapshots, imagery status (see `foundation-api.md`). New shared primitives: `Kicker`, `Toponym`, `Figure`,
`Measure`, `Term` (popover glossary), `Disclosure`, `Tag`, `Surface`, `IconButton`, `Menu`, `Tabs`, `Dots`.

## 17 Build plan

**(a) Foundation (done first, one engineer):** tokens + fonts (`index.css`, `index.html`, `globe.html`);
primitives (`src/components/ui/*`, kept backward compatible through `components/ui.tsx`); shell
(`src/app/*`: top rail with trail and ⋯ menu, stage layout with slots, intro, status banner, MotionConfig,
responsive surface hosts incl. phone `Sheet`, instruments placement, credits strip); shared glossary
(`src/lib/glossary.ts`). Only the foundation edits shared files.

**(b) Parallel view packages** (own only their folder):

1. **Mars explorer** — `src/features/explorer/**`: `MarsSearch` (capsule), `MarsInspector`, `MarsOverlay`
   (selection annotation, hover zone readout), `MarsGlobeSync` (+ zone outlines). Acceptance @1440×900: planet
   visible ≥ 70 % of the stage width; inspector content-sized with terrain metrics above the fold; unavailable
   state offers nearest zone with distance; @390×844 sheet with sticky CTA.
2. **Earth explorer** — `src/features/analogs/**`: `EarthResults`, `EarthLayers` (capsule + legend),
   `EarthGlobeSync`. Acceptance: verdict headline + two ordered stages; ties never pre-selected; results labelled
   by search target; set framed on arrival; no-result state with next action.
3. **Comparison** — `src/features/comparison/**`: `ComparisonView` (strip, modes, ratio chart, Why drawer),
   `CompareGlobeSync` (50 km windows both planets, plates). Acceptance: both targets visible above the strip
   with matched footprints; basis labelled on every score; mobile switch.
4. **Evidence** — `src/features/evidence/**`. Acceptance: key figures tagged synthetic, process schematic, all
   charts readable at 390 px, no drag traps.
5. **Report** — `src/features/report/**`. Acceptance: dossier with plates, tier-aware, exports, print preview
   light.

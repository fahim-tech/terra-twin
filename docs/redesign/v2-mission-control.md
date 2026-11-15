# TerraTwin v2 — "Mission control" design direction

Feedback on v1: no Times-like serif anywhere, no pills or soft generic "AI app" styling. The app
should read like real flight software for a planetary science mission: precise, technical, dark,
monochrome with sparing signal colour, and strongly three-dimensional. The intro keeps its idea
(Mars beside the title and copy).

Science rules from v1 are unchanged: G5 strings verbatim, tied sets unordered (west to east, never
pre-selected), missing values never shown as 0, nothing invented. 3D views show only real data.

## 1. Character

- **Instrument, not brochure.** Every surface is a readout or a control. Labels are short,
  uppercase, tracked; values are monospaced with units.
- **Monochrome first.** White ink on black. Colour is signal: Mars rust and Earth teal mark data
  of that planet; amber = caution; red = fault. Never decorative gradients or glows.
- **Hairlines and brackets, not blobs.** 1 px rules, square corners, corner registration
  brackets on framed surfaces. No pills, no capsules, no rounded cards, no soft drop shadows as
  decoration.
- **Depth from the scene.** The globes are lit 3D bodies with atmosphere limbs, orbits and
  oblique approach views; interface chrome stays flat and thin above them.

## 2. Typography (no serif anywhere)

| Role | Face | Setting |
|---|---|---|
| Display / toponyms | Barlow Semi Condensed 500–600 | UPPERCASE, +0.04em (display +0.02em), tight leading |
| UI text | Barlow 400/500/600 | sentence case for prose; labels UPPERCASE +0.14em |
| Data | IBM Plex Mono 400/500 | tabular, slashed zero; units in Barlow |

Classes: `.toponym` (now condensed uppercase sans), `.kicker` (11 px, 600, +0.16em, uppercase),
`.label-caps` (12 px, 600, +0.12em, uppercase), `.num`.
Never use `italic` for emphasis; use weight or ink colour.

## 3. Colour tokens

`space #020304` · `surface #07090c` · `elevated #0f1216` · `line #1d2227` · `line-strong #2f363e`
· `ink #f2f4f5` · `muted #a6aeb6` · `faint #7f8891` · `mars #ec7f53` · `earth #4fc9bb` ·
`warn #e6c15a` · `bad #ff6b7f`.
Contrast: `faint` on `space` ≥ 5:1; never put text in `line` colours.

## 4. Shape and material

- Radii: `rounded-control` = 2 px, `rounded-surface` = 2 px. `rounded-full` only for true circles
  in data graphics (map markers, chart points) — never for buttons, tags, tabs or containers.
- `.surface`: near-black glass (`rgb(5 7 9 / .82)`, 18 px blur), 1 px `rgb(255 255 255/.09)`
  border. `.frame` adds corner brackets (10 px, 1 px, ink at 55 %).
- Buttons (`Button` in `components/ui.tsx`): rectangular, UPPERCASE 12 px +0.12em.
  `primary` = solid ink with space text; `primary-mars` / `primary-earth` = solid ink with a
  planet-colour square marker; `outline` = 1 px line-strong; `ghost` = text only.
  Trailing arrow glyph `→` for forward actions. Press = instant inversion/brightness change.
- Tags: square, 1 px border, mono 10.5 px uppercase. Status marks are 6 px squares (filled = on,
  outlined = off), always with words.
- Segmented controls: joined square cells with 1 px dividers; selected cell inverted (ink fill).
- Tabs: UPPERCASE labels, 1 px ink underline on the selected tab.
- Section headers inside panels: index + title + hairline, e.g. `02  TERRAIN ─────────`.

## 5. HUD instruments

Scale bar with end ticks, altitude and centre readouts as labelled mono values, nav stack of
square buttons with hairline dividers (+, −, north, tilt 2D/3D, home), reticle = gapped crosshair
with corner brackets. A mission clock in the top bar shows real UTC and Mars Coordinated Time
(MTC, Mars24 algorithm). No fake telemetry.

## 6. 3D

- Globes: oblique approach (camera pitched ≈ −50°) when flying to a site, with a TILT control to
  switch top-down ⇄ oblique; research windows drawn as translucent 3D scan volumes; Phobos and
  Deimos orbits drawn around Mars at true scale (semi-major axes 9,376 km and 23,463 km); strong
  but honest lighting with a soft terminator and atmosphere limb.
- Terrain relief: a WebGL heightfield of the real 50 km Earth research window, resampled as MOLA
  would observe it (108 × 108 cells at 463 m), with labelled vertical exaggeration, km axes and
  an elevation scale in metres. Drag to orbit with momentum, keyboard arrows rotate. Mars relief
  appears only if a MOLA mosaic is connected; otherwise the panel says so.

## 7. Motion

Critically damped springs for UI (bounce 0, 0.3–0.4 s); momentum and velocity hand-off for
dragged 3D views; reduced motion → cross-fades and no auto-rotation.

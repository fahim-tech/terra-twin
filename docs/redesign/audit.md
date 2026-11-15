# TerraTwin UI audit (baseline)

The science is careful, but the interface undercuts it. Permanent chrome takes 47% of a 1440×900 screen. Camera flights leave targets under the sheets, far-side markers invent nearby sites, and on phones the primary actions are cut off. Three defects are accuracy failures, not polish: results show the name of the current selection, the OOM score is explained with tier-1 evidence, and the first member of a tied set is treated as the leader.

**Baseline.** 30 scripted captures of commit 4c40c68, covering ten views: intro, Mars selected (Jezero), Mars unavailable (−60°, 10°), Earth results, Earth tier 1, Earth unavailable, compare, Why drawer, evidence and report. Each was taken at 1440×900, 1920×1080 and 390×844. The brief's four supplied screenshots were not provided. Not captured: tied sets, loading, failures, menus, and widths from 768 to 1,280 px. The Anthropic Frontend Design skill is not installed, so its documented principles were applied; the Apple Design skill was used.

## Top issues (ranked)

1. **Chrome buries the planet** — explorer and compare views (App.tsx:202-203) — the top bar and two fixed, full-height panels (300 and 348 px) take 47% of 1440×900, and compare takes 56–68%; at 768 px only 96 px of globe remain. — Show one content-sized inspector on selection and fold the controls into a search, using smaller, near-opaque surfaces and at most 25% chrome.
2. **Far-side markers draw through the planet** — every globe (globe-entry.ts:156,168) — `disableDepthTestDistance: Infinity` draws back-hemisphere points and lets users click them: 27 of the 39 zone dots on the intro, the "sites" around −60°, 10°, and most of the teal dots near Atacama. — Restore horizon occlusion for points, labels and picking, and add a regression test.
3. **Mobile workflow is blocked** — 390×844 (App.tsx:203) — the sheets have a max-height but no height, so nothing scrolls and the Find Earth Analogs and Compare footers are cut off; the mission control is hidden below 1,024 px. — Use detented sheets with definite heights, a sticky safe-area CTA, and one panel at a time.
4. **Results show the current selection's name** — Earth, compare, report (SearchContext.tsx:20, ReportView.tsx:52-119) — at baseline this is a race condition; on the branch it always happens: Jezero → Gale → Report prints "Gale ↔ Atacama Yungay" with Jezero's S 0.614. — Bind results, exports and the URL to `search.request`/`search.mars`.
5. **Compare doesn't compare and mixes bases** — compare (ComparisonPanel.tsx:129-228) — 16 "n/a" cells, a toggle that never changes the headline, OOM 0.614 explained with tier-1 as-measured rows (S 0.529), and the user's AOI drawn instead of the 50 km window that was actually compared. — Lead with a similar/different narrative on a tolerance-band chart, label every block by tier and representation, and draw matched footprints on both globes.
6. **Tiers blur and a tie reads as a win** — Earth results (AnalogResults.tsx:10-26,86-87; MarsInspector.tsx:68-71) — both tiers share one score style, so tier-1 0.909 outshines OOM 0.614; "refinement" names a fixed 230-window record (50 eligible under Landing Site); the decision is a 10.5 px traffic-light pill; and the first member of a tied set is auto-selected. — Show ordered stages with distinct score names, make the decision the headline, and present a tied set as one unordered group.
7. **Off-zone points dead-end, and they are the likely first click** — Mars unavailable (MarsInspector.tsx:96-157) — the zones cover 1.29% of Mars, and a click on the intro globe selects a point. The panel then shows jargon, a `get_mars_features()` chip, six "Unavailable" rows, and a CTA that can only return insufficient evidence, with no route to Noachis (≈1,540 km away). — Use a plain sentence, keep the original coordinate, offer "Go to nearest research zone", and show the missing datasets on demand.
8. **Framing ignores panels and footprints** — compare, mobile (App.tsx:56,98,102) — flights centre targets on the full canvas, so they land under sheets, and the fixed altitudes draw the 25 km AOI about 28 px wide. — Fit footprints into the unobstructed area with padded rectangles; frustum offsets would break picking.
9. **Inspector order inverts the brief** — Mars selected (MarsInspector.tsx:79-157) — status notes come before terrain. Mean slope starts about 70% of the way down at 1440×900 and falls below the CTA in a real ≈720 px viewport. Mission is a 10.5 px caption. — Order it as region, mission, terrain, footprint, one evidence line, then the CTA.
10. **Code leads while required caveats don't** — Earth, compare (SearchContext.tsx:28, ComparisonPanel.tsx:92, candidates.ts:24) — `TIER1_MISSION_WEIGHTS[…]`, `gmted25k:153073` and "Cell 207754" appear in primary views, while the G5 caveat strings are missing from results and paraphrased elsewhere. — Use plain labels with exact terms on demand, and put a scope line under every S that expands to the verbatim strings.
11. **Type and colour carry no hierarchy** — all views (index.css, ui.tsx:49-59) — 18 font sizes (66% at 12 px or smaller), faint caveat text at 2.99–3.58:1, 44 all-caps eyebrows, stock Inter, and one pill style used for six jobs. The ok and Earth colours (ΔE₀₀ 8.6) and the bad and Mars colours (10.6) are too close to tell apart. — Use 7–8 tokenised steps with a 12 px floor, a characterful type pairing with one face for numerals, and planet hues for identity only.
12. **The top bar does ten jobs** — all views (TopBar.tsx:46-109) — 11 equal-weight items, a 285 px mission select, wrapped labels, locked steps at 35% opacity explained only on hover, and a "Back to globe" whose target drifts. — Split it into identity, an investigation trail whose locked steps name their prerequisite, and a utility cluster, and move the mission control beside the CTA.
13. **Evidence and report read as flat documents, with errors** — evidence, report (EvidenceView.tsx:102-133, ReportView.tsx:97-163) — the 18% figure sits level with the OOM bar, and twin accuracy (98.9%) shares tiles with counts for real zones. The report buries S 0.614 in prose and prints "As measured (tier 1)" when there is no candidate. — Open each with a tagged key-figure block, add a figure for the four OOM stages, and make the report, CSV and print output tier-aware.

## By view

- **Shell/navigation:** the bar reflows when the hover readout appears, and there is no URL state, so the browser's Back button leaves the app.
- **Mars explorer:** the coordinate form comes first; zones show raw ids ("Deuteronilus1 2"); there is no altitude, scale, reticle or legend.
- **Unavailable states:** Earth shows clipped env-var chips and "No candidates in this view." with no action; API, WebGL and tile failures have no designed state.
- **Earth explorer:** the camera holds one cell at 1,600 km while tier-1 results #2–#7 span three continents; 89 px rows show 4.5 of 249,165 results.
- **Comparison:** the Mars label disappears into the terrain, the Why drawer stacks one translucent surface on another, and Report is reachable only from the top bar.
- **Evidence:** text cards stand in for a process figure, per-site bias correction (82% top-1) is never explained, and the charts capture touch scrolling.
- **Report:** exports come before the title; there are no locator maps and no method version; the CSV merges both tiers' scores.
- **Mobile:** Compare drops the Mars globe, and widths from 768 to 1,180 px get the desktop layout with only 96–508 px of globe.

## Accessibility & motion

- Faint text #5d6b7c measures 3.58, 3.28 and 2.99:1 on the space, surface and elevated backgrounds. Muted text passes at 6.32–7.57:1. Locked steps measure 1.95:1.
- Heatmap labels measure 2.05:1, the retired bar about 2:1, and split-view globe labels an estimated 1.2–2.4:1. Accent colours printed on white measure 2.05–2.88:1.
- There is no focus management, no dialog semantics and no Escape handling. A collapsed panel and the hidden globe stay in the tab order, icon buttons have no accessible name below 640 px, and status and error messages are not announced.
- Touch targets are 24–32 px, and inputs at 12–12.5 px trigger zoom on iOS.
- Motion's reducedMotion setting defaults to "never". The 1.6–1.8 s camera flights and the pulse loops ignore the reduced-motion preference.
- Both globes render every frame with 4× MSAA, even when hidden, and width transitions resize the WebGL buffers on every frame. There is no handling for reduced transparency, increased contrast or forced colours.

## Strengths to preserve

- Honest science: decision labels taken verbatim, Zod enforcing "no S without coverage", no silent substitution, and falsification kept visible.
- A sound globe core: one iframe per planet, a typed protocol that checks origins, and correct latitude conventions; ground scale in compare matches within about 1%.
- Authentic, credited NASA imagery with striking crater close-ups.
- Usable design tokens: near-black, basalt, terracotta and teal (accents 6.2–8.7:1 on surface), and tabular numerals.
- One unmistakable primary action in each desktop panel.
- The API already provides mission descriptions, descriptor explanations, `tier2.target`, and pool and raster data.
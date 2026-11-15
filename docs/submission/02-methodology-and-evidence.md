# TerraTwin — Methodology, algorithm and scientific evidence

Team AstroSUST · NASA Space Apps Challenge 2026 · Challenge: *Identify Earth Locations that Analog the Permanent
Moon Base Locations and Mars*

This document is the technical companion to the submission. Every number is read from the research package
(`TerraTwin_AstroSUST_research_package.zip`, SHA-256 `5c9cffca…930b13`, tables `oom_key_numbers.json`,
`oom_gated_key_numbers.json`, `tier1_match_specificity.csv`) or from the deployed API
(https://terratwin-five.vercel.app/api/…). The research code is vendored unmodified in `apps/api/vendor/terratwin`
and hash-checked at every API start. Nothing here involves machine learning, expert assessment or fitted weights.

---

## 1. The scientific problem

Earth analog sites for Mars are mostly chosen by reputation. When they are compared quantitatively, Mars and
Earth elevation data are treated as the same kind of measurement. They are not.

The Mars elevation field is the output of an observation chain, not a direct measurement:

```
z_Mars = W( B( I( S( z_true ) ) ) )
```

| Step | Meaning | Measured on the real data |
|---|---|---|
| **S** sampling | MOLA laser shots binned into 1/128° cells (≈ 463 m) | At the 39 human-landing Exploration Zones only **31.4 %** of native bins hold ≥ 1 shot (range 29.9–33.2 %; Jezero 31.3 %). Measured from the PDS MEGDR counts tiles, two extraction paths agreeing to 0.0016. |
| **I** gridding | Empty bins receive an interpolated value | The PDS label says so; the method is not documented. Selected from Mars-observable statistics (§3.2). |
| **B** registration | The USGS 463 m mosaic sits half a native column east of the counts grid | Measured on 39/39 zones (fidelity profile symmetric about +0.5 column). |
| **W** warp | Bilinear resampling onto a local equal-distance (AEQD) analysis grid | TerraTwin's own step, identical for both planets. |

Consequence: every nonlinear terrain descriptor computed from the Mars grid carries a chain-dependent bias.
Passing densely measured Earth windows through the modelled chain (213 windows × 39 zones = 8,307 applications)
gives the size of that bias:

| Descriptor | After the chain ÷ as measured (median, p10–p90) |
|---|---|
| RMS deviation, 0.93 km | **0.692** (0.576–0.796) |
| RMS deviation, 2.3 km | 0.812 (0.727–0.886) |
| RMS deviation, 9.3 km | 0.932 (0.861–0.975) |
| Mean slope (926 m) | 0.861 (0.796–0.924) |
| 90th-percentile slope | 0.855 (0.789–0.926) |
| Detrended RMS height | 0.927 (0.854–0.964) |
| Relative relief | 0.921 (0.808–0.967) |
| Hurst exponent (difference) | **+0.124** (+0.079 to +0.178) |

The chain smooths terrain, most at short baselines. The median Mars–Earth Hurst gap shrinks from 0.251 to 0.114
when Earth is passed through the chain, so about 55 % of the apparent gap is the data, not the planets.

A second failure is independent of the data chain: for a flat Mars target (Arcadia Planitia), terrain-only
matching across all 249,165 Earth cells ranked the West Siberian wetland 1st and the Papua New Guinea lowland
3rd, ahead of every documented analog. Flat plains are geometrically indistinguishable from rainforest floors at
kilometre baselines. Analog search needs an independent surface-cover check and the ability to say "no
convincing analog".

## 2. Data

| Role | Product | Provider | Native resolution | Use in TerraTwin |
|---|---|---|---|---|
| Mars observation mask | MGS MOLA MEGDR 128 ppd shot counts (`megc*hb.img`), MGS-M-MOLA-5-MEGDR-L3-V1.0 | NASA PDS Geosciences Node | 1/128° (≈ 463 m) bins | S step of the operator; observed-fraction metadata |
| Mars elevation | Mars MGS MOLA DEM global mosaic, 463 m | USGS Astrogeology (from NASA MOLA) | 463.0935 m/px, 46080 × 23040 | All Mars descriptors; Mars 3D relief |
| Mars targets | 39 candidate human Exploration Zones, 2015 First Landing Site/EZ Workshop | NASA (Bussey & Hoffman 2016, NTRS 20160001040) | ~100 km zones; 50 km analysis windows | Target catalogue; any coordinate also accepted |
| Mars context | TES thermal inertia (Putzig & Mellon 2007), TES rock abundance (Nowicki & Christensen 2007), Odyssey GRS H₂O, SWIM ice consistency (Morgan et al. 2021), JMARS KRC surface temperature, USGS SIM 3292 geology | NASA PDS / ASU / PSI / USGS | native | Characterisation only; never in the score |
| Earth screen | GMTED2010 30″ mean elevation | USGS/NGA, catalogued on data.nasa.gov | ≈ 926 m | 249,165 land cells of 25 km (tier 1) |
| Earth refinement | Copernicus DEM GLO-90 | ESA (AWS Open Data) | 3″ (≈ 90 m), area-averaged to 463.09 m | 50 km windows (tier 2), 3D relief |
| Surface cover | ESA WorldCover 10 m 2021 v200 | ESA | 10 m | Mission-conditional exposed-ground gate |
| Earth context | Aridity index, Köppen–Geiger (Beck 2023), permafrost probability (Obu 2019) | various, open | native | Characterisation only |
| Imagery | NASA Mars Trek (Viking MDIM 2.1, MOLA shaded relief), NASA GIBS Blue Marble | NASA | 232 m / 463 m / 500 m | Globe visualization only; never a measurement |

Conventions: Mars planetocentric latitude, east-positive longitude, sphere R = 3,396,190 m; Earth WGS84. Both
planets are warped onto local azimuthal-equidistant grids built with their own radii, so ground distances are true
metres, and both pass through **one shared descriptor function** (verified bit-identical between code paths).
Missing values are `null` with a stated reason, never zero.

## 3. The algorithm: Observation-Operator Matching (OOM)

### 3.1 Principle

Do not invert the Mars chain on Mars (ill-posed). Apply the same chain to each Earth candidate, then compare in
Mars observation space:

```
D( z_Mars )   vs   D( H_t( z_Earth ) ),      H_t = W ∘ B ∘ I ∘ S_t ∘ T_t
```

where *t* is the Mars target, S_t its **measured** observation mask, T_t the transplant of the Earth window onto
the target's native bin grid, and D the descriptor function. No confidence weight, penalty or tuning constant is
introduced. This is the forward-operator principle of satellite simulators (Bodas-Salcedo et al. 2011; Swales et
al. 2018) and of observation operators and representation error in data assimilation (Janjić et al. 2017; Carrassi
et al. 2018), and of change-of-support in spatial statistics (Gotway & Young 2002), adapted to Mars–Earth analog
search. We did not find it applied to analog search in our literature search; no priority is claimed.

### 3.2 Operator definition (as implemented in `obsop.py` / `oom_worker.py`)

1. **Target geometry.** Build the native-bin block around the target (50 km window plus margin); read the MEGDR
   counts; `observed = counts > 0`. Compute the maps native bin ↔ AEQD pixel with pyproj on the Mars sphere.
2. **T, transplant.** Sample the Earth AEQD window bilinearly at native bin centres. Earth metres are interpreted as
   Mars AEQD metres, so geometry is compared at the same physical size (no gravity scaling).
3. **S, mask.** Keep only bins that are observed on Mars and finite on Earth.
4. **I, interpolate.** Unobserved bins are filled by piecewise-linear barycentric interpolation over the Delaunay
   triangulation of observed bins; bins outside the hull by nearest neighbour. The interpolator was **selected from
   two statistics observable on the real MOLA grid**, never from twin-recovery performance: ρ_NS (RMS north–south
   lag-1 difference between unobserved bins ÷ between observed bins) and κ_EW (RMS east–west second difference at
   unobserved ÷ observed bins). Mars medians: ρ_NS 0.863, κ_EW 0.625. Paired error over 20 zones × 30 windows:
   linear + ½-pixel **0.097**; linear no shift 0.278; cubic 0.396–0.413; nearest 1.008–1.865.
5. **B, half-pixel blend.** `z[:, c] ← ½ (z[:, c] + z[:, c+1])`, from the measured registration offset.
6. **W, warp.** Bilinear resample native → 463 m AEQD window (108 × 108 px = 50 km).
7. **Descriptors** (identical for the Mars window):

| Descriptor | Definition | Unit |
|---|---|---|
| mean slope, 90th-percentile slope | Horn 3 × 3 slope after 2 × 2 block-mean coarsening (baseline 926 m) | deg |
| relative relief | max − min elevation in the window | m |
| detrended RMS | RMS residual after a least-squares plane | m |
| RMS deviation at 926 m, 2,315 m, 9,262 m | √⟨(z(x+L) − z(x))²⟩ over both grid axes at lags 2, 5, 20 px | m |
| Hurst exponent H | slope of log RMS deviation vs log lag over those three lags | – |

### 3.3 Similarity kernel

For target features M and candidate features E: for positive heavy-tailed features
`s_i = exp(−|ln max(E_i, f_i) − ln max(M_i, f_i)| / ln(1 + τ_i))` with floors f_i at the measurement quantum
(0.062° for slopes over a 926 m baseline, 1 m for reliefs and RMS values) and tolerances τ_i = 0.30–0.40; for the
Hurst exponent `s_H = exp(−|E_H − M_H| / 0.08)`. The score is the weighted mean over **valid** features,
`S = Σ w_i s_i / Σ w_i`; coverage (the share of required features that are valid) is reported separately and gates
the verdict: **no score without coverage**, enforced server-side (`assert_score_contract`) and client-side (Zod).
Mission weight profiles (landing site, permanent base, rover mobility, geological exploration, terrain-only) are
hypotheses; the method evaluation uses equal weights.

### 3.4 Decision rule: leader, tied set, or no analog

An Earth window has no physically preferred orientation relative to MOLA's north–south tracks, and the true
descriptors are exactly invariant under 90° rotations (verified, maximum relative change 0.0). So:

1. For r ∈ {0°, 90°, 180°, 270°}, rotate the Earth window, apply the same target operator, compute S_r and its
   leader a_r.
2. If a_0 = a_90 = a_180 = a_270 → **named leader** with S_0 and the range over rotations.
3. Otherwise → **tied set** of the distinct leaders, labelled "leader underdetermined by MOLA observation
   geometry", shown unordered. Never display a tied-set member as the single best analog.
4. Verdict thresholds on top (strong ≥ 0.75; partial ≥ 0.55; else "no convincing analog") are stated hypotheses.

This is the reject option of Chow (1970) applied to registration invariance; it has no tuned threshold.

### 3.5 Surface-cover gate (engineering correction for field-test missions)

For missions that need exposed ground, candidates must satisfy ESA WorldCover bare-like ≥ 0.50 and vegetated
≤ 0.20 **before ranking** (gate-then-rank). Unavailable cover is not a pass. Vegetation is not a Martian variable
and never enters the similarity score. Thresholds are working hypotheses.

### 3.6 Two tiers in the product

- **Tier 1, global screen:** every one of the 249,165 land cells of 25 km (GMTED2010) is scored against the Mars
  target with north–south directional descriptors at 1.85 km and 7.4 km baselines (meridional spacing is
  latitude-independent, so baselines are exactly comparable). The production kernel is specific: median leader
  similarity 0.886; at most 0.22 % of Earth cells score ≥ 0.75 for any zone; the live screen reproduces the research
  specificity table for all 39 zones to 10⁻⁹.
- **Tier 2, OOM refinement:** shortlisted 50 km windows (the fixed 230-window research pool, or on-demand
  Copernicus windows extracted for the top-600 shortlist of a live discovery run) pass through the target's
  operator and the decision rule. Live discovery at Jezero refined 40 windows in 41 s (104 vegetated shortlist cells
  excluded before extraction).

## 4. Evidence

### 4.1 Benchmark design (fixed before results were inspected)

- Earth pool: 230 windows of 108 × 108 px at 463.09 m (50 km) from Copernicus GLO-90: 213 random land windows
  stratified by roughness decile, 17 named (documented analogs, negative controls). Centres ≥ 79 km apart.
- Mars targets: the 39 Exploration Zones as 50 km windows.
- **Synthetic twin test:** target i is Earth window i passed through zone a(i) = i mod 39. Candidates are all 230
  windows passed through a *different* zone b(i) = (a(i)+7) mod 39, so candidates never see the target's exact
  track pattern (conservative). Baseline candidates are the windows as measured. Metric: mean reciprocal rank
  (MRR) of the true twin, top-1, top-5; paired bootstrap CI (2,000 resamples) and Wilcoxon signed-rank test.
- Operator runs: 5 variants × 39 zones × 230 windows = 44,850 applications; 3 extra rotations = 26,910.
  Fixed seeds; regenerated end to end by `run_oom.py`, `run_rot.py`, `oom_experiments.py`.

### 4.2 Results

| Method | MRR [95 % CI] | Top-1 | Top-5 | ΔMRR vs baseline [95 % CI] | improved / worse |
|---|---|---|---|---|---|
| Baseline: Earth as measured | 0.300 [0.250, 0.349] | 0.178 | 0.390 | — | — |
| Coverage-fraction confidence weights (retired) | 0.303 [0.258, 0.352] | 0.174 | 0.408 | +0.003 [−0.004, +0.009] | 82 / 26 |
| Constant debias, global (cross-fitted) | 0.844 [0.806, 0.881] | 0.746 | 0.977 | +0.544 [0.481, 0.604] | 173 / 12 |
| Constant debias, per target zone (cross-fitted) | 0.891 [0.858, 0.923] | 0.822 | 0.986 | +0.592 [0.534, 0.649] | 173 / 9 |
| **OOM** (linear + ½ px, track mask) | **0.973 [0.955, 0.987]** | **0.948** | **1.000** | **+0.673 [0.624, 0.722]**, p = 1.7 × 10⁻³⁰ | **175 / 0** |
| Ablation: no half-pixel blend | 0.965 | 0.934 | 1.000 | +0.665 | 174 / 0 |
| Ablation: random mask, same observed fraction | 0.931 | 0.883 | 0.991 | +0.631 | 175 / 0 |
| Ablation: nearest interpolation | 0.643 | 0.484 | 0.845 | +0.343 | 168 / 2 |
| Ablation: cubic interpolation | 0.561 | 0.408 | 0.742 | +0.261 | 164 / 10 |

- The interpolator dominates; track geometry adds a little (random mask −0.042); the half-pixel blend adds least.
- The gain is larger at short baselines (+0.702) than long (+0.444), non-overlapping CIs, as the support mechanism
  predicts.
- Robustness: ΔMRR > 0 in **200/200** lognormal weight draws (σ = 0.35), in all **10** roughness deciles
  (0.440–0.775), under a standardized-Euclidean kernel (0.182 → 0.905) and at a 25 km window (0.332 → 0.917).
- Abstention: a leader is named for 83.6 % of twin targets; when named it is correct **98.9 %** of the time; in all
  **35/35** abstentions the tied set (median size 2, max 3) contained the true twin. A margin rule tuned to the same
  coverage reaches the same 0.989, so the rotation rule's advantage is the absence of a tuned constant, not accuracy.

### 4.3 Falsification (pre-specified)

| Criterion | Outcome | Verdict |
|---|---|---|
| F1 ΔMRR CI includes 0 | +0.673 [0.624, 0.722] | not falsified |
| F2 Gain not larger at short baselines | short +0.702 vs long +0.444 | not falsified |
| F3 Random mask equals track mask | 0.931 vs 0.973 | partly: observed fraction and interpolation carry most of the effect |
| F4 OOM fixes flat-target negative controls | 3/36 in top-10 under every method | confirmed: OOM does not address surface cover |
| **F5 A misspecified operator still helps** | true chain cubic → OOM 0.539 < baseline 0.652 | **falsified for misspecified operators**: the claim is conditional on operator selection from Mars-observable statistics |
| F6 A cheaper alternative achieves the same | per-zone constant debias 0.891 vs 0.973, ΔMRR +0.081 [0.045, 0.118] | narrowed: bias correction is the main effect; forward modelling adds a modest, significant increment |
| **F7 The positive control is recovered** | Holuhraun ranks 111/230 for Cerberus (Elysium Planitia) | **not recovered** (its documented analogy is lava-flow morphology below MOLA's support) |
| **F8 Leaders stable across footprints** | identical at 50 km and 25 km in 0/39 zones | **not stable**: rankings are reported per window size |

### 4.4 Controls

- Negative controls (Amazon, Congo, Papua New Guinea, West Siberia, Bangladesh, Netherlands): **0 of 6** pass the
  land-cover gate; gate-then-rank leaves 50 of 230 pool windows.
- Named controls that fail the gate: Mauna Kea (21.5 % vegetated); McMurdo Dry Valleys returns *unavailable*
  (south of WorldCover coverage) and unavailable is treated as a fail.

### 4.5 Real Mars results (no ground truth exists; these measure the method's output, not correctness)

- Gated, over the 230-window pool: **29 of 39** zones get a rotation-invariant named leader, **10** return tied
  sets; median leader S 0.614.
- **Jezero, landing-site profile, pool:** Atacama Yungay (24.09° S, 69.99° W), S 0.614, stable under 4/4
  orientations, exposed ground 100 %; uncorrected comparator 0.755. Atacama is documented as a dryness and
  oxidising-soil analog, not a terrain analog, so this is candidate identification, not validation.
- **Jezero, live global discovery** (run `533a52bdf72b`, 40 Copernicus windows refined from the 249,165-cell
  screen in 41 s): a tie between **37.06° N 86.21° E** (≈ Kunlun–Altun mountain belt, south rim of the Tarim
  Basin, Xinjiang, China; S 0.781) and **37.29° N 97.51° E** (≈ north-eastern Qaidam Basin near Delingha,
  Qinghai, China; S 0.693), both passing the gate; also the southern High Atlas, Morocco (31.21° N 6.36° W, 0.774),
  the Changtang, northern Tibetan Plateau (32.79° N 88.13° E, 0.759), the Tibesti Mountains, Chad (21.11° N
  18.49° E, 0.675) and west-central Nevada, USA (38.19° N 117.88° W, 0.675). Place names are approximate,
  read from the coordinates by the team. The Qaidam Basin is independently proposed as a Mars analog (Xiao et al.
  2017; Meng et al. 2024). TerraTwin makes no novelty claim.
- Jezero 50 km descriptors, Mars vs the Xinjiang window as MOLA would see it: mean slope 2.82° / 2.67°; 90th-pct
  slope 6.11° / 5.30°; relief 1,763 / 1,711 m; RMS deviation at 0.93 km 49.6 / 49.7 m; Hurst 0.678 / 0.663.
- Characterisation at that window: aridity index 0.15 (arid), Köppen ET, permafrost probability 1.00, bare ground
  99.7 % — against Jezero's TES thermal inertia 296 J m⁻² K⁻¹ s⁻½, rock abundance 32 %, KRC surface temperature
  217 K, SWIM ice consistency −0.34 (not indicated), geologic unit mNhm, solar energy 171 W m⁻². The Xinjiang window
  is permafrost terrain while Jezero shows no shallow-ice signal: a stated break in the analogy.

## 5. Limitations (shown verbatim in the app and the exported dossier)

1. **Synthetic validation only.** Twins are generated with our own operator model; nothing has been validated
   against field data, MOLA PEDR shots, HRSC/CTX DEMs, or expert review.
2. **The operator is a surrogate.** The MEGDR gridding algorithm is undocumented; if the true chain were cubic, OOM
   would score below no correction (0.539 vs 0.652). Bins are binary (one shot = observed); shot positions, footprint
   size and ranging noise are not modelled.
3. **Terrain geometry only.** Similarity does not establish geology, formation process or habitability.
4. **Footprint-dependent.** Leaders change between 50 km and 25 km windows at every zone; compare only within one
   window size.
5. **Small research pool.** The 230-window pool demonstrates the method; live discovery is the search tool.
6. **Assumed thresholds.** Verdict (0.75 / 0.55) and gate (0.50 / 0.20) thresholds are working hypotheses.
7. **Earth DEM is itself an observation.** Copernicus GLO-90 is a radar surface model including vegetation and
   buildings.
8. **No planetary environment.** Earth reproduces none of Mars' gravity (3.71 vs 9.81 m s⁻²), pressure, atmosphere
   or radiation.
9. **Positive-control miss.** Holuhraun is not recovered for Elysium Planitia at 50 km; Mauna Kea leads Gale on
   relief alone.

## 6. Reproducibility and engineering verification

- Research package imported with an allow-list and a SHA-256 manifest; 8/8 integrity checks re-run at every API
  start and exposed at `/api/datasets`.
- Vendored research engine hash-pinned (`test_vendored_engine_is_unmodified`); live tier-1 screen reproduces
  `tier1_match_specificity.csv` for all 39 zones × 2 weight sets to 10⁻⁹; the G5 sample (Jezero gated → Atacama
  Yungay 0.614, baseline 0.755) is returned by production `/v1/compare`.
- 82 API tests (pytest), 493 web tests (vitest), a scripted browser journey against production.
- Every figure in the app names the record it was read from; imagery is never used in a measurement; the globes
  are lit for legibility and say so.

## 7. Proposed next steps (not done)

Validation against MOLA PEDR shots; HRSC/CTX DEM cross-check of the bias; OOM at tier 1 (926 m support); an
independent known-analog benchmark (Ryan et al. 2024 volcanic fields); Earth-side thermal, geological and ice
comparison; Moon targets; expert geoscientific review.

## 8. References

Bodas-Salcedo, A. et al. (2011). COSP: Satellite simulation software for model assessment. *Bull. Amer. Meteor. Soc.*
doi:10.1175/2011BAMS2856.1 · Swales, D. J., Pincus, R., Bodas-Salcedo, A. (2018). COSP2. *Geosci. Model Dev.* 11, 77.
doi:10.5194/gmd-11-77-2018 · Janjić, T. et al. (2017). On the representation error in data assimilation. *Q. J. R.
Meteorol. Soc.* doi:10.1002/qj.3130 · Carrassi, A. et al. (2018). Data assimilation in the geosciences. *WIREs Clim.
Change.* doi:10.1002/wcc.535 · Gotway, C. A., Young, L. J. (2002). Combining incompatible spatial data. *JASA.*
doi:10.1198/016214502760047140 · Chow, C. (1970). On optimum recognition error and reject tradeoff. *IEEE Trans. Inf.
Theory.* doi:10.1109/TIT.1970.1054406 · Kreslavsky, M. A., Head, J. W. (1999, 2000). Kilometer-scale roughness of
Mars. *JGR.* doi:10.1029/1999JE001051; doi:10.1029/2000JE001259 · Shepard, M. K. et al. (2001). The roughness of
natural terrain. *JGR.* doi:10.1029/2000JE001429 · Golombek, M. P. et al. (2003). Selection of the MER landing sites.
*JGR.* doi:10.1029/2003JE002074 · Bussey, B., Hoffman, S. J. (2016). NASA NTRS 20160001040 · Tanaka, K. L. et al.
(2014). Geologic Map of Mars. USGS SIM 3292. doi:10.3133/sim3292 · Putzig, N. E., Mellon, M. T. (2007). *Icarus* ·
Nowicki, S. A., Christensen, P. R. (2007). *JGR* · Morgan, G. A. et al. (2021). *Nature Astronomy* · Mashal, Y. et
al. (2025). *Planet. Sci. J.* 6, 166. doi:10.3847/PSJ/ade30e · Meng et al. (2024). arXiv:2501.08584 · Xiao, L. et
al. (2017). *Earth-Science Reviews* 164 · Voigt et al. (2025). *Planet. Sci. J.* doi:10.3847/PSJ/adb5f1 · Ryan et
al. (2024). *Geosphere.* doi:10.1130/GES02712.1 · Azúa-Bustos, A. et al. (2022), Atacama as a Mars analog.

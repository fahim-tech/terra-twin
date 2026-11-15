# NASA Space Apps 2026 — TerraTwin submission form (paste-ready)

Team **AstroSUST** · Challenge **Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars**
Deadline: 15 November 2026, 11:59 PM, local event time of the team owner. Every field below is in English.
Every number is traceable to the research package (`oom_key_numbers.json`, `oom_gated_key_numbers.json`) or to the
live API (`/api/datasets`, `/v1/compare`, `/api/gis/runs/533a52bdf72b`).

---

## Project name

TerraTwin — Mars–Earth terrain analogs, compared as MOLA would observe both

## High-level project summary (≈ 150 words)

Crews, rovers and instruments rehearse Mars operations at Earth analog sites that are mostly chosen by reputation
rather than measurement. TerraTwin is an interactive 3D tool that finds and characterises Earth terrain analogs
for Mars landing and exploration sites from NASA data. Pick any point on Mars: TerraTwin reads its measured
terrain from the MOLA altimeter, screens all 249,165 land cells of Earth, then refines the best windows with
Observation-Operator Matching (OOM). OOM is the key idea: the MOLA grid is not a direct measurement (only about
one 463 m cell in three holds a laser return; the rest are interpolated), so every Earth candidate is passed
through that Mars site's own MOLA sampling-and-interpolation chain before comparison. Earth and Mars are compared
as MOLA would see both. On synthetic terrain twins this raised exact-twin recovery from 18% to 95%. Every result
states what matches, where the analogy breaks down, and what it can and cannot be used for.

## Detailed project description

### What it does

TerraTwin answers one question for any site on Mars: where on Earth does the ground look like this to the
instrument that mapped Mars, and how far can that analogy be trusted?

1. **Select a Mars target.** A 3D Mars globe (NASA Mars Trek imagery) carries NASA's 39 candidate human-landing
   Exploration Zones; any other coordinate can be picked too. The inspector shows measured terrain from the USGS
   MOLA 463 m mosaic (mean slope, 90th-percentile slope, relief, roughness at 0.93, 2.3 and 9.3 km baselines,
   Hurst exponent), the fraction of MOLA cells actually observed (about 31%), and six planetary-context layers for
   that point: TES thermal inertia, TES rock abundance, USGS SIM 3292 geologic unit, KRC surface temperature, SWIM
   subsurface-ice consistency and solar energy. Context layers are shown for characterisation and never enter
   the similarity score.
2. **Screen Earth (tier 1).** Every one of the 249,165 land cells of 25 km (GMTED2010) is scored against the Mars
   target with the same terrain descriptors, computed by one shared function for both planets. The result is a
   global similarity field on a 3D Earth globe, with the candidate cells drawn where they are.
3. **Refine with Observation-Operator Matching (tier 2).** Shortlisted 50 km Earth windows (Copernicus DEM
   GLO-90, aggregated to the MOLA grid spacing of 463 m) are passed through the Mars site's own observation chain:
   the measured MOLA shot-count mask from the PDS MEGDR counts product, the interpolator selected from statistics
   observable on Mars itself, and the mosaic's measured half-pixel registration. Only then are eight terrain
   descriptors compared with a transparent log-ratio kernel. No machine learning and no fitted weights are used.
4. **Decide honestly.** A single leader is named only if it survives all four orientations of the Earth window
   relative to MOLA's north–south tracks; otherwise the tool reports a tied set, or "no convincing analog". For
   field-test missions an ESA WorldCover land-cover gate removes vegetated or water-covered windows before ranking.
5. **Explain and export.** Compare mode shows the two 50 km windows side by side at one ground scale, every
   descriptor ratio against its tolerance band, 3D relief of both windows at equal exaggeration, and a Relevance
   tab that states which dimensions were evaluated, which were not, and the planetary differences Earth cannot
   reproduce (gravity, pressure, atmosphere, radiation). A Report exports an 11-section dossier (JSON, CSV, print)
   with provenance, verbatim limitations and references. An Evidence page shows the full benchmark, falsification
   matrix and controls.

### Verified results (all reproducible from the live app)

- **Jezero crater (Perseverance landing site), landing-site mission, research pool of 230 Earth windows:** named
  leader **Atacama Desert, Yungay, Chile (24.09° S, 69.99° W)**, similarity S = 0.614, stable under all four
  orientations, exposed ground 100%. The uncorrected comparison (Earth as measured) gives 0.755: the observation
  operator changes the answer, which is the point.
- **Jezero, live global discovery (40 Copernicus windows refined from the 249,165-cell screen in 41 s):** a tie
  between the **Kunlun–Altun mountain belt on the south rim of the Tarim Basin, Xinjiang, China (37.06° N,
  86.21° E; S = 0.781)** and the **north-eastern Qaidam Basin near Delingha, Qinghai, China (37.29° N, 97.51° E;
  S = 0.693)**, both passing the land-cover gate and each scoring above the classic Atacama analog that leads the
  fixed pool. Other refined windows include the southern High Atlas, Morocco (31.21° N, 6.36° W; 0.774), the
  Changtang on the northern Tibetan Plateau (32.79° N, 88.13° E; 0.759), the Tibesti Mountains, Chad (21.11° N,
  18.49° E; 0.675) and west-central Nevada, USA (38.19° N, 117.88° W; 0.675). 104 vegetated shortlist cells were
  excluded by the gate before extraction. Place names are approximate, read from the coordinates by the team; the
  Qaidam Basin is independently proposed as a Mars analog in the literature (Xiao et al. 2017), and TerraTwin
  makes no novelty claim.
- **Method benchmark (synthetic terrain twins, 213 Earth windows degraded through the observation chain of a
  different Exploration Zone each):** direct comparison recovers the true twin first 18% of the time (mean
  reciprocal rank 0.30); Observation-Operator Matching recovers it 95% of the time (MRR 0.97; ΔMRR +0.67, 95% CI
  0.62–0.72, 175 targets improved, 0 worse). It beats constant bias correction (0.89) and coverage-based
  confidence weighting (0.30). The gain held in 200 of 200 random weight perturbations and in all ten roughness
  deciles.
- **Abstention:** when the tool declines to name a single leader, the tied set contained the true twin in 35 of
  35 cases; when it names one, it was correct in 98.9% of cases (twin test).
- **Negative controls:** with gate-then-rank, all six vegetated negative-control regions (Amazon, Congo, Papua
  New Guinea, West Siberia, Bangladesh, Netherlands) are removed, and 29 of 39 Exploration Zones receive a
  registration-stable named leader.

### How it addresses the challenge

- Uses open NASA Mars data (MOLA MEGDR counts, MOLA mosaic, TES, GRS, Mars Trek, GIBS) together with NASA-hosted
  and partner Earth data (GMTED2010, Copernicus DEM, ESA WorldCover).
- Searches the whole land surface of Earth, not only the famous analog regions, and returns named, located
  candidates with measurements.
- Characterises each analogy quantitatively (terrain geometry at stated baselines) and states exactly where it
  breaks down (geology, process, gravity, atmosphere, radiation, scale).
- Connects to exploration use: screening sites for rover-mobility, landing-hazard and DEM-algorithm field tests,
  with the mission profile changing the descriptor weights.

### Limitations we state up front

- The benefit of the method is shown on synthetic twins only; no ranking has been field-validated or reviewed
  by external experts. The MOLA observation operator is a statistically selected surrogate for an undocumented
  gridding algorithm; if the true chain were cubic, the correction would hurt (MRR 0.54 vs 0.65).
- Similarity is terrain geometry only. It does not establish shared geology, formation process or habitability.
- Rankings depend on the analysis window (50 km vs 25 km) and are reported per window size; verdict and
  land-cover thresholds are working assumptions.
- The 230-window research pool demonstrates the method; the live global discovery is the search tool.

### Tools, languages and hardware

Web: React, TypeScript, Vite, Tailwind CSS, CesiumJS (two isolated 3D globes), Zustand, TanStack Query, Zod,
Motion. API: Python 3.11, FastAPI, Pydantic, NumPy, SciPy, pandas, pyarrow. GIS pipeline: GDAL, pyproj, rasterio.
Research code: Python (vendored unmodified, hash-checked at every API start). Tests: pytest (82), vitest (493),
scripted browser journey against production. Hosting: Vercel (frontend), AWS Lightsail (API, 2.1 GB MOLA mosaic,
MEGDR counts tiles, 1 km grids).

## Project demonstration link

Use one of these (both meet the limits: 7 slides, or 28.5 seconds):

- Deck: https://terratwin-five.vercel.app/deck/ (PDF: https://terratwin-five.vercel.app/deck/TerraTwin-slides.pdf)
- Video: https://terratwin-five.vercel.app/deck/TerraTwin-demo-30s.mp4 (or the YouTube upload of the same file)

Both links go live after the deploy step in `04-checklist-and-hosting.md`; test them in a private window first.

## Final project link

https://terratwin-five.vercel.app

(Public, no login. Source code: https://github.com/fahim-tech/terra-twin — make the repository public before
linking it, or link the app only.)

## NASA data

1. **MGS MOLA MEGDR shot-count products, 128 pixel/degree** (`megc*hb.img`), NASA PDS Geosciences Node,
   MGS-M-MOLA-5-MEGDR-L3-V1.0 — https://pds-geosciences.wustl.edu/missions/mgs/megdr.html. Use: the per-cell
   observation mask of every Mars target (the observation operator), and the observed-fraction metadata.
2. **Mars MGS MOLA DEM global mosaic, 463 m** (USGS Astrogeology, from NASA MOLA) —
   https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif. Use: all Mars terrain
   descriptors and the Mars 3D relief.
3. **MGS TES apparent thermal inertia** (Putzig & Mellon 2007), NASA PDS —
   https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/. Use: Mars context layer.
4. **MGS TES rock abundance** (Nowicki & Christensen 2007), via ASU Mars Space Flight Facility WMS. Use: context.
5. **Mars Odyssey GRS water-equivalent hydrogen** (NASA PDS). Use: context layer.
6. **SWIM subsurface water-ice consistency** (Morgan et al. 2021; NASA-funded Subsurface Water Ice Mapping
   project) — https://swim.psi.edu/SWIM4MIMProducts.php. Use: context layer.
7. **JMARS yearly Mars surface temperature (KRC 2.3.2)**, ASU Mars Space Flight Facility (NASA-funded). Use:
   context layer.
8. **NASA Mars Trek WMTS**: Viking MDIM 2.1 colour mosaic (232 m) and MOLA colour shaded relief (463 m) —
   https://trek.nasa.gov/mars/. Use: Mars globe imagery (visualization only, never a measurement).
9. **NASA GIBS Blue Marble shaded relief** — https://gibs.earthdata.nasa.gov/. Use: Earth globe imagery
   (visualization only).
10. **GMTED2010 30-arc-second mean elevation** (USGS/NGA; catalogued on data.nasa.gov) —
    https://data.nasa.gov/dataset/global-multi-resolution-terrain-elevation-data-2010-gmted2010. Use: the tier-1
    screen of 249,165 Earth land cells.
11. **NASA First Landing Site / Exploration Zone Workshop (2015)** Exploration Zone footprints (USGS CTX mosaics)
    and Bussey & Hoffman (2016), NTRS 20160001040. Use: the 39 Mars targets.
12. **NSSDCA planetary fact sheets (Mars, Earth)** — https://nssdc.gsfc.nasa.gov/planetary/factsheet/. Use: the
    planetary-differences table (gravity, pressure, atmosphere, temperature, radiation).

## Space agency partner data and other references

**Partner and other data**
- ESA / Copernicus DEM GLO-90 (surface model), AWS Open Data registry — https://registry.opendata.aws/copernicus-dem/.
  Use: tier-2 50 km Earth windows (230 research windows and on-demand windows), 3D relief.
- ESA WorldCover 10 m 2021 v200 — https://esa-worldcover.org/. Use: the mission-conditional exposed-ground gate.
- USGS SIM 3292 Geologic Map of Mars (Tanaka et al. 2014) — https://pubs.usgs.gov/sim/3292/. Use: context layer.
- Cesium Mars 3D Tiles (Cesium ion asset 3644333), optional visualization only.

**Literature**
- Bodas-Salcedo, A. et al. (2011). COSP: Satellite simulation software for model assessment. Bull. Amer. Meteor.
  Soc. doi:10.1175/2011BAMS2856.1
- Swales, D. J., Pincus, R. & Bodas-Salcedo, A. (2018). COSP version 2. Geosci. Model Dev. 11, 77.
  doi:10.5194/gmd-11-77-2018
- Janjić, T. et al. (2017). On the representation error in data assimilation. Q. J. R. Meteorol. Soc.
  doi:10.1002/qj.3130
- Carrassi, A., Bocquet, M., Bertino, L. & Evensen, G. (2018). Data assimilation in the geosciences. WIREs Climate
  Change. doi:10.1002/wcc.535
- Gotway, C. A. & Young, L. J. (2002). Combining incompatible spatial data. J. Amer. Stat. Assoc.
  doi:10.1198/016214502760047140
- Chow, C. (1970). On optimum recognition error and reject tradeoff. IEEE Trans. Inf. Theory.
  doi:10.1109/TIT.1970.1054406
- Kreslavsky, M. A. & Head, J. W. (1999, 2000). Kilometer-scale roughness of Mars. J. Geophys. Res.
  doi:10.1029/1999JE001051; doi:10.1029/2000JE001259
- Shepard, M. K. et al. (2001). The roughness of natural terrain. J. Geophys. Res. doi:10.1029/2000JE001429
- Golombek, M. P. et al. (2003). Selection of the Mars Exploration Rover landing sites. J. Geophys. Res.
  doi:10.1029/2003JE002074
- Bussey, B. & Hoffman, S. J. (2016). Human Mars landing site and impacts on Mars surface operations. NASA NTRS
  20160001040.
- Tanaka, K. L. et al. (2014). Geologic Map of Mars. USGS SIM 3292. doi:10.3133/sim3292
- Putzig, N. E. & Mellon, M. T. (2007). Apparent thermal inertia and the surface heterogeneity of Mars. Icarus.
- Nowicki, S. A. & Christensen, P. R. (2007). Rock abundance on Mars from TES. J. Geophys. Res.
- Morgan, G. A. et al. (2021). Availability of subsurface water-ice resources in the northern mid-latitudes of
  Mars. Nature Astronomy.
- Mashal, Y. et al. (2025). Planet. Sci. J. 6, 166. doi:10.3847/PSJ/ade30e
- Meng et al. (2024). Mars–Earth image similarity, Qaidam Basin. arXiv:2501.08584
- Voigt et al. (2025). Holuhraun–Elysium Planitia analog. Planet. Sci. J. doi:10.3847/PSJ/adb5f1
- Ryan et al. (2024). Geosphere. doi:10.1130/GES02712.1
- Azúa-Bustos, A. et al. (2022). Atacama Desert as a Mars analog (dryness, oxidising soils).

**Open-source software**
CesiumJS (Apache-2.0), React, Vite, TypeScript, Tailwind CSS, Zustand, TanStack Query, Zod, Motion, lucide-react;
FastAPI, Pydantic, uvicorn, NumPy, SciPy, pandas, pyarrow, GDAL, pyproj, rasterio; Playwright; fonts Barlow, IBM
Plex Mono and Noto Sans (SIL Open Font License, via Google Fonts).

## Use of Super Intelligence (SI) / AI tools

TerraTwin was built with substantial AI assistance, and it is disclosed in the README, in the app's Evidence page
provenance section and here.

- **Research package** (the Observation-Operator Matching method, the experiment design, the synthetic-twin
  benchmark, the literature and novelty searches, and the research code vendored in the API) was produced in
  AI-assisted research sessions (Claude Science, Anthropic), directed and reviewed by the AstroSUST team.
- **Application code** (React web app and FastAPI service), the **GIS pipeline** (Mars feature extraction,
  discovery jobs, 1 km grids, the six Mars context factors), deployment scripts, documentation, the
  logo/icon artwork and these submission materials (slides, demo video, text) were written with AI coding
  assistants (Claude Code, Anthropic), directed by the team.
- **No measurement was generated by AI.** Every value shown comes from the cited NASA, USGS and ESA datasets and
  is processed by the code above. The synthetic terrain twins in the benchmark are computed by the research code
  from real Earth windows and are labelled "synthetic" wherever they appear. The scoring is a transparent
  log-ratio kernel: there is no trained machine-learning model anywhere in TerraTwin.
- **Verification by the team:** automated tests (82 API tests, 493 web tests), SHA-256 checks of the research
  package at every API start, reproduction of the research specificity table by the live code, the "no score
  without coverage" contract enforced server- and client-side, and a scripted browser journey against
  production. The team chose the scope, reviewed the results and is responsible for the submission.
- **AI-generated images or video:** the demo video and slides contain screen recordings and screenshots of the
  application and plots generated from the data; no generative-AI imagery is used.

## Checkboxes

- Original work: yes (the team's own code and research package; third-party data and software credited above).
- Terms and conditions: accept.
- No images of people under 18: confirmed (none).

# Research package integration status

Source: `TerraTwin_AstroSUST_research_package.zip` (Claude Science, G-series). Imported by
`scripts/import_research_package.py`. The script copies an allow-list of 21 CSV/JSON/Parquet/NumPy files, never
extracts or loads `*.pkl`, and writes `manifest.json` with SHA-256 hashes. The API re-checks hashes, row counts,
schema and coordinate ranges at start-up and exposes the results at `GET /api/datasets`.

The research code in `09_code/terratwin/` is vendored **unmodified** in `apps/api/vendor/terratwin`.
`SHA256SUMS` is enforced by a test.

## Verified against the package

| Check | Result |
|---|---|
| Earth tier-1 screen row count | 249,165 ✓ |
| Mars Exploration Zones | 39 ✓ (east-positive longitudes; Jezero 77.01°E, Gale 137.21°E) |
| Tier-2 pool array | (230, 108, 108) float32 ✓, 230 metadata rows |
| Tier-1 live screen reproduces `tier1_match_specificity.csv` | exact, all 39 EZs × {permanent_base, equal}: leader S, n within 0.05, n ≥ 0.75 |
| G5 §5 sample (Jezero, gated) | named leader Atacama Yungay, S 0.614, cover 0.999 bare-like, baseline 0.755 ✓ |
| G5 test 2: descriptors invariant under `rot90` | ≤ 1e-12 ✓ |
| G5 test 7: six negative controls fail the gate; McMurdo not cleared | ✓ |
| G5 test 8: no counts tiles → `operator.status = unavailable`, no S | ✓ |
| G5 test 9: no S without coverage/representation (all 39 EZs × both gate modes) | ✓ |
| Gated named leaders 29/39; ungated 16/39 | ✓ (matches key numbers) |

**Naming trap found:** `oom_real_mars_decisions_gated.csv` is the *ungated* ranking annotated with land cover
(rank-then-gate). The gate-then-rank result of G3 §8b / G5 is `oom_real_mars_gated_decisions.csv`. The API uses
the latter for `exclude` gate mode.

## Operational

- **Tier 1 (live):** a Mars EZ fingerprint (`mars_ez_tier1_median.csv`) is scored against all 249,165 cells with
  `similarity.score` + `TIER1_FEATURES` + mission weights. Results are paginated and viewport-filterable. The full
  table never goes to the browser.
- **Tier 2 (research records):** OOM decisions for the 39 EZs over the fixed 230-window pool, in both gate modes.
  These include decision type, members, S at rotation 0°, gate outcome and the as-measured comparator.
- **Earth window descriptors as measured:** computed live from `earth_pool_463m.npy` with `oom_worker.features`.
- **Tier-1 cell lookup at any Earth coordinate** (`GET /api/earth/region`).
- **Evidence:** benchmark, falsification matrix, interpolator selection, abstention, controls, robustness and
  observation support, all read from package tables.

## GIS-backed capabilities (connected on the production host)

The GIS workstream's library (`terratwin_gis`, repo `fahim-tech/terratwin-dataset`) runs in-process with the API on
the production host (`/srv/terratwin`, see `docs/deployment.md`). There the following are **connected**; a local
checkout without the GIS library and its data reports each one as unavailable, with the reason:

| Capability | Production | Local checkout without GIS |
|---|---|---|
| Mars features at arbitrary coordinates (`/api/gis/mars/features`) | connected (MOLA 463 m mosaic + MEGDR counts) | 503 with the missing inputs |
| Mars relief grids for the 39 zones (`/api/mars/relief`) | connected | 503 |
| Live OOM discovery for any Mars point (`/api/gis/discovery`, GIS worker queue, 1–6 min) | connected; cached runs reopen instantly | unavailable |
| Global tier-1 screen for any Mars point (`/api/gis/tier1`) | connected | unavailable |
| Copernicus GLO-90 windows for new shortlist cells, live WorldCover gate | connected (inside discovery runs) | unavailable |
| Six Mars planetary-context factors: thermal inertia, geologic unit, rock abundance, surface temperature, water-ice potential, solar energy (`/api/gis/mars/factors`, `mars-factors-1.0`) | connected, verified at Jezero, 75° N and Gusev (`docs/gis-handoff-status.md`) | `not_integrated` |
| ~1 km descriptor grids and context layers (`/api/gis/grid`, `/api/gis/context`) | connected | unavailable |

The six factors are Mars characterization: they never enter OOM similarity, rankings or a suitability score.

## Still not available anywhere

| Capability | Why |
|---|---|
| Mars 50 km window descriptors and per-rotation S for the *research records* | stored only in the research pickles, which are never loaded (live discovery runs do report them) |
| 25 km window tier-2 results | no published record; returned as unavailable |
| Polar targets beyond ±88° | MEGDR counts tiles stop at ±88°: operator unavailable there |
| Earth-side counterparts of the six Mars factors | not compared (context only) |

The API never falls back silently: missing inputs give `operator.status = "unavailable"` with a
`decision.type = "insufficient_evidence"` and a list of what is missing.

## Plugging in the GIS service

Set `TERRATWIN_GIS_PROVIDER=package.module:function`. The function receives
`lat, lon, mission, window_km, representation` and must return the G5 `/v1/compare` response
(see `contracts/api-contract.md`). The API validates it (`assert_score_contract`) before returning it.
Replace the research data by re-running the importer with a new package. Bump `RESEARCH_ENGINE_VERSION` /
`OOM_METHOD_VERSION` in `apps/api/terratwin_api/config.py` when the method changes.

## Fixtures

There are no synthetic UI fixtures. Everything shown is a research-package record, labelled with its candidate
pool and validation status, or an explicit unavailable state.

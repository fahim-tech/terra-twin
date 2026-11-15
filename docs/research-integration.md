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

## Pending or blocked (needs the GIS workstream)

| Capability | Blocked by |
|---|---|
| Mars features at arbitrary coordinates | USGS MOLA 463 m mosaic + `aoi.mars_aoi` extraction service |
| Live OOM for any target | MEGDR counts tiles (`megc*hb.img`, 16 for global bands), `obsop.TargetGeometry` |
| Mars 50 km window descriptors / Earth "as MOLA would see" per-descriptor values | Stored only in the research pickles (not loaded); need the rasters above |
| Per-rotation S range | Same (pickles) |
| Refining new tier-1 shortlist cells (outside the 230 pool) | On-demand Copernicus GLO-90 + WBM window extraction |
| Live WorldCover gate for new windows | `landcover.cover_fractions` (needs GDAL + network) |
| 25 km window tier-2 results | No published record; returned as unavailable |
| Thermal inertia, geology, ice, temperature, rock abundance | No dataset ingested; shown as unavailable |

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

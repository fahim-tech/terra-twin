# TerraTwin API contract (2026-11-15)

Machine-readable schema: `GET /openapi.json`. Frontend validation: `apps/web/src/types/contracts.ts` (Zod).

## Conventions

- Mars: planetocentric latitude, east-positive longitude −180…180, sphere R = 3,396,190 m.
- Earth: WGS84 geodetic latitude, east-positive longitude.
- Missing values are `null` with a `state` (`measured | derived | modelled | proxy | unavailable |
  insufficient_resolution`) and a `reason`. They are never zero.
- **No score without `coverage`, `representation` and `operator.status`** (enforced server-side and in Zod).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | status and method versions |
| GET | `/api/datasets` | dataset catalogue, integrity checks, live-refinement status |
| GET | `/api/mission-profiles` | missions → tier-1 weights (hypotheses) and gate mode |
| GET | `/api/mars/sites` | 39 Exploration Zones |
| GET | `/api/earth/sites` | reference analogs and negative controls (benchmarks, not results) |
| GET | `/api/earth/region?lat&lon` | tier-1 cell at any Earth coordinate |
| POST | `/api/analysis/mars` | `{lat, lon, footprint_km, mission}` → Mars feature record or unavailable state |
| POST | `/api/analysis/analogs` | `{lat, lon, footprint_km, mission, limit}` → Mars record + tier 1 + tier 2 |
| GET | `/api/analysis/{id}` / `/evidence` | stored analysis and evidence |
| GET | `/api/analysis/tier1/candidates` | `site, mission, offset, limit, west, south, east, north` |
| GET | `/api/evidence` | method evidence and limitations |
| GET | `/api/earth/pool` | the 230 research-pool windows tier 2 examined (`windows`, `window_km`, `note`) |
| GET | `/api/earth/pool/{window_id}/relief` | elevation grid of one research-pool window, Earth as measured (3D relief) |
| GET | `/api/mars/relief?site=` | Mars elevation grid for an Exploration Zone; 503 with the reason until a MOLA mosaic reader is connected |
| POST | `/v1/compare` | G5 tier-2 adapter: `{site | lat+lon, mission, gate_mode?, representation, window_km}` |

## `/v1/compare` response (G5)

```json
{
  "target": {"site": "Jezero", "lat": 17.6756, "lon": 77.0127, "window_km": 50, "observed_fraction_native": 0.3001},
  "representation": "mars_observation_space",
  "operator": {"status": "ok", "provenance": "research_package_precomputed", "version": "oom-1.0", "...": "..."},
  "landcover_gate": {"mode": "exclude", "bare_min": 0.5, "veg_max": 0.2, "status": "hypothesis"},
  "decision": {"type": "named_leader", "members": ["Atacama Yungay"], "rotations_checked": 4},
  "candidates": [{"id": "Atacama Yungay", "lat": -24.09, "lon": -69.99, "S": 0.614, "coverage": 1.0,
                  "landcover": {"frac_bare_like": 0.9996, "gate": "pass"}, "...": "..."}],
  "as_measured_baseline": {"leader": "Atacama Yungay", "S": 0.755, "coverage": 1.0},
  "candidate_pool": {"scope": "fixed_research_pool", "n_windows": 230},
  "validation_status": "synthetic_twins_only",
  "live_refinement": {"status": "unavailable", "missing_inputs": ["..."]}
}
```

Unavailable example (`{"lat": 0, "lon": 0}`): `operator.status = "unavailable"`,
`decision.type = "insufficient_evidence"`, `candidates = []`, `as_measured_baseline = null`.

## Relief grids (`apps/api/terratwin_api/services/relief.py`)

Read-only: nothing here computes or changes a score or a decision. The grid re-expresses the elevation array
tier 2 already reads (`earth_pool_463m.npy`).

`GET /api/earth/pool/{window_id}/relief` — `window_id` is a research-pool window id from `/api/earth/pool`
(e.g. `rand_d0_0`).

```json
{
  "id": "rand_d0_0", "lat": -2.2626, "lon": -62.2126, "kind": "random", "planet": "earth",
  "rows": 108, "cols": 108, "cell_m": 463.0935415503709, "window_km": 50, "units": "m",
  "z_min": 23.4, "z_max": 59.2, "valid_fraction": 0.9947,
  "elevation": [54.4, 52.7, 49.7, 51.1, "…", null, "…"],
  "orientation": {"row0": "north", "col0": "west", "order": "row-major",
                  "frame": "local azimuthal-equidistant grid centred on the window (WGS84); grid north is true north at the centre"},
  "source": {"dataset": "earth_pool_463m", "title": "Tier-2 research pool: 230 Copernicus GLO-90 windows",
             "file": "earth_pool_463m.npy", "sha256": "…", "role": "230 Earth windows, 108x108 @ 463.09 m AEQD",
             "representation": "as_measured", "vertical_reference": "EGM2008 geoid (Copernicus DEM heights)",
             "nodata": "null = no elevation: water-masked cell (share equals the pool metadata's water fraction)",
             "note": "Copernicus DEM GLO-90 surface model (includes vegetation and buildings), aggregated to 463.09 m cells, the MOLA mosaic grid spacing, on a local azimuthal-equidistant grid. Earth as measured: the MOLA observation operator is not applied. One window of the fixed 230-window research pool, not a live extraction."}
}
```

- `elevation`: `rows × cols` values in metres, row-major and north-up (row 0 = northern edge, column 0 = western
  edge), rounded to 0.1 m; `null` where a cell has no elevation (water-masked), never 0. `z_min` / `z_max` are
  `null` when no cell is valid.
- `cell_m` is the research engine's pixel (`oom_worker.PIX`, 463.09 m); `window_km` is the nominal side that
  `/api/earth/pool` publishes (50). Clients take rows, cols, cell size and window size from the payload.
- **Earth as measured** (`source.representation = "as_measured"`): the MOLA observation operator is not applied,
  so a relief view is never labelled "as MOLA would observe it" (that describes the research comparison).
- Errors: `404 {"detail": "unknown research-pool window '<id>'"}`; `503 {"detail": {"status": "unavailable",
  "reason": "…"}}` when the research data is not imported.

`GET /api/mars/relief?site=<EZ id>` — same response shape once a MOLA reader exists. Today it never returns a
grid and never substitutes one:

- `503 {"detail": {"status": "unavailable", "reason": "MOLA mosaic not connected", "missing_inputs": ["USGS MOLA
  463 m mosaic (TERRATWIN_MOLA_MOSAIC)"], "owner": "GIS workstream", "site": "Jezero"}}`. With
  `TERRATWIN_MOLA_MOSAIC` set the reason becomes "MOLA mosaic connected, but the API has no reader for it (the
  research extraction aoi.mars_aoi needs GDAL)" with `missing_inputs: ["Mars AOI extraction service
  (aoi.mars_aoi, GDAL)"]`.
- `404 {"detail": "unknown site '<id>'"}` for a site outside the 39 Exploration Zones; `422` without `site`.

## What the GIS team provides

`get_mars_features(lat, lon, half_km)`, `refine_earth_candidates(target, shortlist, mission, window_km,
representation)` returning the response above, and dataset provenance records. Wire them via
`TERRATWIN_GIS_PROVIDER` without changing routes.

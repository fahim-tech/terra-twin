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

## What the GIS team provides

`get_mars_features(lat, lon, half_km)`, `refine_earth_candidates(target, shortlist, mission, window_km,
representation)` returning the response above, and dataset provenance records. Wire them via
`TERRATWIN_GIS_PROVIDER` without changing routes.

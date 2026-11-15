# GIS handoff status — additional Mars scientific layers

Contract: **`mars-factors-1.0`** (additive; no existing route changes). Owner of this file: the software session
(`fahim-tech/terra-twin`). The GIS session (`fahim-tech/terratwin-dataset`, `/srv/terratwin`) reads it; do not edit
the same files on both machines without reconciling branches.

## How factors reach the app

The GIS session owns the factor library: `terratwin_gis.factors.get_mars_context(lat, lon, season_ls, local_time)`
(`/srv/terratwin/src/terratwin_gis/factors/`, one module per factor, schema in `factors/schema.py`, docs in the GIS
repo's `docs/mars_factors.md`). The API calls it in-process on the host and **passes each record through
unchanged**, enforcing at the boundary only: no value unless `status == "available"`, unknown status → `error`,
non-finite → null. Where the library is absent every factor reads `not_integrated`.

Route: `GET /api/gis/mars/factors?lat=&lon=[&season_ls=0..360][&local_time=0..24]` (planetocentric latitude,
east-positive longitude). Response: `{record_type, contract_version, planet, coordinate, request, factors[], summary,
rules, provider}`; each factor record follows `factors/schema.py` (`factor_id, label, status, value, unit, state,
measurement_kind, source_id, source_url, product_version, citation, native_resolution(_m), pixel_center, coverage,
temporal_context, method, reason, explanation, quality_flags, limitations, components`). A new or changed factor
needs no API change; the API service picks it up on restart (`sudo systemctl restart terratwin-api`).

Factors are **Mars characterization**: never OOM similarity, rankings or a mission-suitability score.

## Factor ids and status verified on the host

| factor_id | label | verified at Jezero (18.4446, 77.4509) |
|---|---|---|
| `thermal_inertia` | Thermal inertia (TES, Putzig & Mellon 2007) | available: 311 J m-2 K-1 s-1/2 |
| `geologic_unit` | Geologic unit (SIM 3292) | available: HNt |
| `rock_abundance` | Rock abundance (TES) | available: 19 %; outside_coverage poleward of 60° |
| `surface_temperature` | Surface temperature | available: 216.47 K at Ls 90°, 14 h LTST |
| `water_ice` | Water-ice potential (SWIM consistency) | available: −0.2773; outside_coverage poleward of 60° |
| `solar_energy` | Solar-energy potential | available: 170.413 W m-2 at Ls 90°, 14 h LTST |

Verified 2026-11-15 on the host through `/api/gis/mars/factors` at Jezero, 75° N 0° E and Gusev (−14.64, 175.48).

## Conventions

- Coordinates: planetocentric latitude, east-positive longitude [-180, 180), Mars sphere R = 3,396,190 m.
- Values at the source's native resolution; state the resolution, never resample silently.
- Coverage gaps → `outside_coverage` with the reason (e.g. GRS valid ±60°, MEGDR counts ±88°).

## Tests

- API: `apps/api/tests/test_factors.py` (no GIS → all `not_integrated`; context mapping; a `terratwin_gis.factors`
  module is picked up and validated; bad statuses become `error`; unavailable factors never show a value).
- Handoff request: deliver **one tested factor at a time** (with its unit test in the GIS repo); the software session
  then verifies it on the host with `curl 'http://127.0.0.1:8710/api/gis/mars/factors?lat=18.4446&lon=77.4509'`.

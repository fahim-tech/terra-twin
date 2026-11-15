# GIS handoff status — additional Mars scientific layers

Contract: **`mars-factors-1.0`** (additive; no existing route changes). Owner of this file: the software session
(`fahim-tech/terra-twin`). The GIS session (`fahim-tech/terratwin-dataset`, `/srv/terratwin`) reads it; do not edit
the same files on both machines without reconciling branches.

## How a factor reaches the app

The API (on the same host as the GIS data) calls, in order, and the first provider that answers a factor wins:

1. **`terratwin_gis.factors.point(lat, lon) -> dict[factor_id, record]`** — add this module to the GIS library
   (`src/terratwin_gis/factors.py`). It is optional: the API picks it up on its next restart; nothing else changes.
   Return only the factors you have tested; omit the rest.
2. The context layers already delivered (`terratwin_gis.context_layers.point`), mapped to `thermal_inertia`
   (TES night, day value in a caveat) and `geologic_unit` (SIM 3292).
3. Otherwise the factor reads `not_integrated`.

Route: `GET /api/gis/mars/factors?lat=&lon=` (planetocentric latitude, east-positive longitude). Always `200`.

## Record schema (per factor)

```json
{
  "status": "available | not_integrated | outside_coverage | unavailable | unsupported_resolution | error",
  "value": 0.12,                       // number or string; null unless status == "available"
  "units": "fraction",
  "source": {"id": "tes_rock_abundance_nowicki2007", "product": "…", "citation": "…"},
  "spatial_resolution": "8 pixels/degree (~7.4 km)",
  "temporal_context": "MY24–26 TES mapping phase",   // season/epoch/model period, or null
  "state": "measurement-derived | modelled | interpreted",
  "caveats": ["…"],                    // scientific caveats shown beside the value
  "reason": null                       // why it is not available (required when status != "available")
}
```

The API enforces: an unknown status becomes `error`; any non-`available` factor shows no value; non-finite
numbers become null. Factors are **Mars characterization**: they never change OOM similarity, rankings or a
mission-suitability score (no reviewed specification exists for that).

## Known factor ids

| id | label | status in this build | provider |
|---|---|---|---|
| `rock_abundance` | Rock abundance | not_integrated | — |
| `thermal_inertia` | Thermal inertia | **available** (TES night/day, Putzig & Mellon 2007, 20 ppd) | gis.context_layers |
| `geologic_unit` | Geologic unit | **available** (SIM 3292, Tanaka et al. 2014, 1:20M; label only) | gis.context_layers |
| `surface_temperature` | Surface temperature | not_integrated | — |
| `swim_ice_potential` | Subsurface water-ice potential (SWIM) | not_integrated (SWIM host was down per GIS catalog) | — |
| `insolation` | Solar energy / insolation | not_integrated | — |

TES albedo, TES dust cover index and GRS H₂O are also delivered and shown under the point's context readout.

## Conventions

- Coordinates: planetocentric latitude, east-positive longitude [-180, 180), Mars sphere R = 3,396,190 m.
- Values at the source's native resolution; state the resolution, never resample silently.
- Coverage gaps → `outside_coverage` with the reason (e.g. GRS valid ±60°, MEGDR counts ±88°).

## Tests

- API: `apps/api/tests/test_factors.py` (no GIS → all `not_integrated`; context mapping; a `terratwin_gis.factors`
  module is picked up and validated; bad statuses become `error`; unavailable factors never show a value).
- Handoff request: deliver **one tested factor at a time** (with its unit test in the GIS repo); the software session
  then verifies it on the host with `curl 'http://127.0.0.1:8710/api/gis/mars/factors?lat=18.4446&lon=77.4509'`.

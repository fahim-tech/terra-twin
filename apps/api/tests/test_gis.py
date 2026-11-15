"""GIS routes against a fake terratwin_gis: pass-through, typed unavailable states, discovery jobs
(cache, de-duplication, cap, progress, errors), run records, grid legends and tiles, context layers."""
from __future__ import annotations

import hashlib
import json
import struct
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from terratwin_api.services import gis as GIS
from terratwin_api.services import gis_tiles as TILES

from .conftest import requires_data

PROCESSING = "terratwin-gis-0.1.0"


def _record(lat, lon):
    return {"record_type": "mars_feature_record", "contract_version": "gis-contract-1.0",
            "region_id": f"mars_{lat:+09.4f}_{lon:+010.4f}_h25km", "latitude": lat, "longitude": lon,
            "status": "ok", "reasons": [], "features": {"mean_slope_deg": 0.23, "hurst_H": float("nan")},
            "observation_support": {"available": True, "observed_fraction_native": 0.28},
            "operator": {"status": "ok", "version": "oom-1.0"},
            "notes": ["Computed from a 463 m MOLA grid built by binning laser returns. This is a grid spacing, "
                      "not an observation resolution."],
            "tier1": {"footprint_km": 200.0, "cell_km": 25.0, "features": {"mean_slope_deg": 0.27}}}


class FakeJobs:
    def __init__(self, q: Path):
        self.Q = q
        self.submitted = []

    def submit(self, kind, params, *, mem_estimate_mb=None, disk_estimate_gb=0.0, depends_on=None):
        jid = time.strftime("%Y%m%dT%H%M%S") + "-" + hashlib.sha1(json.dumps([params, len(self.submitted)]).encode()).hexdigest()[:8]
        self.submitted.append((kind, params))
        (self.Q / f"{jid}.json").write_text(json.dumps({"job_id": jid, "kind": kind, "params": params,
                                                        "status": "pending", "submitted": time.time()}))
        return jid

    def get(self, jid):
        p = self.Q / f"{jid}.json"
        if not p.exists():
            return {"job_id": jid, "status": "missing"}
        return json.loads(p.read_text())


def _fake(tmp: Path) -> SimpleNamespace:
    for d in ("jobs", "logs", "derived/runs", "cache"):
        (tmp / d).mkdir(parents=True, exist_ok=True)
    (tmp / "logs" / "resource_monitor.jsonl").write_text(json.dumps(
        {"t": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "running": 0, "paused": 0}) + "\n")
    prov = {
        "mars": {"product": "mars_grid_1km_v1", "created_utc": "2026-11-15T05:00:00Z",
                 "grid": {"geotransform": [-180.0, 0.015625, 0.0, 90.0, 0.0, -0.015625], "width": 23040, "height": 11520},
                 "layers": {"elevation_m": {"units": "m (areoid-referenced MOLA heights)", "nodata": "NaN", "file": "cog/e.tif"},
                            "mean_slope_deg": {"units": "deg", "nodata": "NaN", "file": "cog/s.tif"},
                            "obs_bins": {"units": "count (0-4)", "nodata": None, "file": "cog/o.tif"},
                            "flags": {"units": "bit field", "nodata": None, "file": "cog/f.tif"}},
                 "flags": {"1": "no observed MEGDR bin in cell (fully interpolated)"},
                 "use_rules": ["observation support is metadata: never a weight or confidence"]},
        "earth": {"product": "earth_grid_1km_v1", "created_utc": "2026-11-15T06:00:00Z",
                  "grid": {"geotransform": [-180.0, 1 / 120, 0.0, 90.0, 0.0, -1 / 120], "width": 43200, "height": 21600},
                  "layers": {"surface_class": {"units": "class", "nodata": None, "file": "cog/c.tif"}},
                  "flags": {}, "use_rules": []},
    }
    grids = SimpleNamespace(
        PRODUCTS={"mars": "mars_grid_1km_v1", "earth": "earth_grid_1km_v1"},
        info=lambda planet: {"provenance": prov[planet], "coverage": None},
        point=lambda planet, lat, lon, layers=None: {
            "planet": planet, "query": {"lat": lat, "lon": lon},
            "values": {"elevation_m": 0.0, "surface_class": 2, "mean_slope_deg": float("nan")} if planet == "earth"
            else {"elevation_m": -2561.5, "obs_bins": 0}, "flags_set": [], "use_rules": []})

    def mars_features(lat, lon, half_km=25.0):
        if not -90 <= lat <= 90:
            return {"status": "invalid_input", "error": {"type": "invalid_input", "message": f"latitude out of range: {lat}"}}
        return _record(lat, lon)

    def normalize_lon(lon, convention="east"):
        return ((lon + 180.0) % 360.0) - 180.0

    def validate_lat(lat):
        if not -90 <= lat <= 90:
            raise ValueError(f"latitude out of range: {lat}")
        return lat

    return SimpleNamespace(
        AD=SimpleNamespace(get_mars_features=mars_features,
                           search_earth_coarse=lambda rec, mission, footprint_km=25.0, top_n=50: {
                               "status": "ok", "mission": mission, "n_cells_scored": 249165,
                               "candidates": [{"rank": 1, "region_id": "e1_30S000E_r074_c0098", "similarity": 0.876}][:top_n]}),
        C=SimpleNamespace(CONTRACT_VERSION="gis-contract-1.0", PROCESSING_VERSION=PROCESSING, OOM_METHOD_VERSION="oom-1.0",
                          LOGS=tmp / "logs", DERIVED=tmp / "derived", CACHE=tmp / "cache"),
        CL=SimpleNamespace(point=lambda planet, lat, lon: {"planet": planet, "layers": {"aridity_index": {"value": 0.0, "feature_state": "modelled"}}},
                           catalog=lambda: {"layers": ["aridity_index"]}),
        EI=SimpleNamespace(MISSIONS=["landing_engineering", "rover_mobility", "permanent_base", "geological_exploration",
                                     "terrain_geometry_only"]),
        grids=grids, jobs=FakeJobs(tmp / "jobs"),
        MARS=SimpleNamespace(normalize_lon=normalize_lon, validate_lat=validate_lat), PL=None)


@pytest.fixture()
def fake(monkeypatch, tmp_path):
    L = _fake(tmp_path)
    monkeypatch.setattr(GIS, "lib", lambda: L)
    monkeypatch.setattr(GIS, "_SUBMISSIONS", __import__("collections").deque())
    GIS.clear_caches()
    TILES.clear_caches()
    yield L
    GIS.clear_caches()
    TILES.clear_caches()


def _unavailable():
    raise GIS.GisUnavailable("The GIS library is not installed on this server", ["terratwin_gis on PYTHONPATH"])


# ------------------------------------------------------------------------------------------ availability
def test_without_the_library_every_route_says_what_is_missing(client, monkeypatch):
    monkeypatch.setattr(GIS, "lib", _unavailable)
    GIS.clear_caches()
    st = client.get("/api/gis/status").json()
    assert st["status"] == "unavailable" and st["missing_inputs"] == ["terratwin_gis on PYTHONPATH"]
    assert st["discovery"]["status"] == "unavailable"
    for url in ("/api/gis/mars/features?lat=4.5&lon=135.6", "/api/gis/grid/mars/point?lat=1&lon=2",
                "/api/gis/context/earth/point?lat=1&lon=2", "/api/gis/runs", "/api/gis/grid/mars/info",
                "/api/gis/grid/mars/tile/0/0/0.png?layer=elevation_m"):
        r = client.get(url)
        assert r.status_code == 503, url
        assert r.json()["detail"]["reason"].startswith("The GIS library")
    r = client.post("/api/gis/discovery", json={"lat": 4.5, "lon": 135.6})
    assert r.status_code == 503


def test_status_reports_grids_and_a_live_worker(client, fake):
    st = client.get("/api/gis/status").json()
    assert st["status"] == "available" and st["contract_version"] == "gis-contract-1.0"
    assert st["grids"]["mars"] == {"available": True, "product": "mars_grid_1km_v1"}
    d = st["discovery"]
    assert d["status"] == "available" and d["worker"]["alive"] and d["max_active_runs"] == GIS.MAX_ACTIVE_DISCOVERY


def test_a_stale_worker_heartbeat_disables_discovery(client, fake):
    (Path(fake.C.LOGS) / "resource_monitor.jsonl").write_text(json.dumps({"t": "2026-01-01T00:00:00Z"}) + "\n")
    d = client.get("/api/gis/status").json()["discovery"]
    assert d["status"] == "unavailable" and "worker is not running" in d["reason"]
    r = client.post("/api/gis/discovery", json={"lat": 4.5, "lon": 135.6})
    assert r.status_code == 503 and r.json()["detail"]["missing_inputs"] == ["terratwin-worker service"]


# ------------------------------------------------------------------------------------------ Mars + tier 1
def test_mars_features_pass_through_with_missing_values_as_null(client, fake):
    r = client.get("/api/gis/mars/features?lat=4.502&lon=135.623")
    assert r.status_code == 200
    d = r.json()
    assert d["region_id"] == "mars_+004.5020_+0135.6230_h25km" and d["observation_support"]["observed_fraction_native"] == 0.28
    assert d["features"]["hurst_H"] is None and d["notes"][0].endswith("not an observation resolution.")


def test_invalid_mars_input_is_422(client, fake):
    assert client.get("/api/gis/mars/features?lat=91&lon=0").status_code == 422  # FastAPI bound
    fake.AD.get_mars_features = lambda lat, lon, half_km=25.0: {"status": "invalid_input",
                                                                "error": {"type": "invalid_input", "message": "bad"}}
    GIS.clear_caches()
    r = client.get("/api/gis/mars/features?lat=10&lon=0")
    assert r.status_code == 422 and r.json()["detail"]["reason"] == "bad"


def test_tier1_maps_the_app_mission_to_the_gis_mission(client, fake):
    d = client.get("/api/gis/tier1?lat=4.502&lon=135.623&mission=rover_mobility&top_n=1").json()
    assert d["mission"] == "rover_mobility" and d["n_cells_scored"] == 249165 and len(d["candidates"]) == 1
    assert client.get("/api/gis/tier1?lat=4&lon=1&mission=nope").status_code == 422


# ------------------------------------------------------------------------------------------ discovery
def _run_id(lat, lon, mission, n):
    return hashlib.sha1(json.dumps([lat, lon, mission, n, 600, 50, None, False, PROCESSING]).encode()).hexdigest()[:12]


def test_run_id_matches_the_gis_pipeline(fake):
    # InSight run on the production host: data/derived/runs/3e66a1ed234c.json
    p = GIS.discovery_params(4.502, 135.623, "rover_mobility", 40)
    assert GIS.run_id_for(p) == "3e66a1ed234c"


def test_a_cached_run_is_returned_without_queuing(client, fake):
    rid = _run_id(4.502, 135.623, "rover_mobility", 40)
    (Path(fake.C.DERIVED) / "runs" / f"{rid}.json").write_text(json.dumps({"run_id": rid, "status": "ok"}))
    d = client.post("/api/gis/discovery", json={"lat": 4.502, "lon": 135.623, "mission": "rover_mobility"}).json()
    assert d == {**d, "status": "done", "run_id": rid, "cached": True, "job_id": None}
    assert fake.jobs.submitted == []


def test_discovery_queues_once_and_caps_active_runs(client, fake):
    body = {"lat": 4.502, "lon": 135.623, "mission": "rover_mobility", "n_refine": 20}
    a = client.post("/api/gis/discovery", json=body).json()
    assert a["status"] == "pending" and a["state_label"] == "Queued" and a["queue_position"] == 1
    assert a["run_id"] == _run_id(4.502, 135.623, "rover_mobility", 20)
    b = client.post("/api/gis/discovery", json=body).json()
    assert b["job_id"] == a["job_id"] and len(fake.jobs.submitted) == 1  # same parameters: same job
    kind, params = fake.jobs.submitted[0]
    assert kind == "discovery" and params["window_km"] == 50 and params["gate_mode"] is None
    client.post("/api/gis/discovery", json={**body, "lat": 10.0})
    r = client.post("/api/gis/discovery", json={**body, "lat": 20.0})
    assert r.status_code == 429 and "already queued" in r.json()["detail"]["reason"]


def test_discovery_for_a_zone_uses_the_zone_centre(client, fake):
    from terratwin_api.services import research_store as RS

    try:
        fp = RS.mars_footprints().loc["Jezero"]
    except Exception:
        pytest.skip("research data not imported")
    d = client.post("/api/gis/discovery", json={"lat": 0, "lon": 0, "site": "Jezero"}).json()
    assert d["params"]["lat"] == float(fp.lat_c) and d["params"]["name"] == "Jezero"
    assert d["params"]["mission"] == "landing_engineering"  # app "landing_site" -> research key


def test_unavailable_missions_are_rejected(client, fake):
    from terratwin_api.services.catalog import MISSIONS

    off = next(m for m in MISSIONS if not m.available)
    assert client.post("/api/gis/discovery", json={"lat": 1, "lon": 2, "mission": off.id}).status_code == 422


def test_hourly_submission_guard(client, fake, monkeypatch):
    monkeypatch.setattr(GIS, "MAX_SUBMISSIONS_PER_HOUR", 1)
    monkeypatch.setattr(GIS, "MAX_ACTIVE_DISCOVERY", 10)
    assert client.post("/api/gis/discovery", json={"lat": 1, "lon": 2}).status_code == 200
    r = client.post("/api/gis/discovery", json={"lat": 3, "lon": 4})
    assert r.status_code == 429 and "in the last hour" in r.json()["detail"]["reason"]


def _write_job(fake, **over):
    jid = "20261115T120000-abcdef12"
    params = {"lat": 4.502, "lon": 135.623, "mission": "rover_mobility", "n_refine": 40, "window_km": 50, "gate_mode": None}
    j = {"job_id": jid, "kind": "discovery", "params": params, "status": "running", "submitted": time.time() - 90,
         "started": time.time() - 60, **over}
    (Path(fake.jobs.Q) / f"{jid}.json").write_text(json.dumps(j))
    return jid


def test_running_job_progress_comes_from_the_run_log(client, fake):
    jid = _write_job(fake)
    rid = _run_id(4.502, 135.623, "rover_mobility", 40)
    (Path(fake.C.DERIVED) / "runs" / f"{rid}.log").write_text("\n".join([
        f"00:59:00 run {rid}: target (4.5020, 135.6230) mission=rover_mobility gate=exclude",
        "00:59:01 decision named_leader members=['old'] refined=40 in 9s",  # an earlier run in the same log
        f"01:00:00 run {rid}: target (4.5020, 135.6230) mission=rover_mobility gate=exclude",
        "01:00:02 mars record ok; observed fraction 0.2766",
        "01:00:03 tier-1: 249165 cells scored, leader S=0.876",
        "01:00:09   window 12/40: e1_30N060E_r085_c0018 tier1 rank 3 S1=0.85 valid=1.000 flags=[]"]))
    d = client.get(f"/api/gis/jobs/{jid}").json()
    assert d["status"] == "running" and d["state_label"] == "Running" and d["elapsed_s"] >= 59
    p = d["progress"]
    assert (p["stage"], p["cells_scored"], p["windows_ready"], p["windows_target"]) == ("windows", 249165, 12, 40)


@pytest.mark.parametrize("state", ["paused", "blocked"])
def test_paused_and_blocked_read_as_queued_server_busy(client, fake, state):
    jid = _write_job(fake, status=state, error={"type": "DiskBudgetError", "message": "floor", "trace": "secret"})
    d = client.get(f"/api/gis/jobs/{jid}").json()
    assert d["state_label"] == "Queued — server busy"
    if state == "blocked":
        assert d["error"] == {"type": "DiskBudgetError", "message": "floor"}  # never the trace


def test_failed_job_reports_type_and_message_only(client, fake):
    jid = _write_job(fake, status="failed", finished=time.time(), error={"type": "RuntimeError", "message": "boom", "trace": "x"})
    d = client.get(f"/api/gis/jobs/{jid}").json()
    assert d["status"] == "failed" and d["error"] == {"type": "RuntimeError", "message": "boom"}


def test_job_ids_are_validated(client, fake):
    assert client.get("/api/gis/jobs/..%2F..%2Fetc").status_code in (404, 422)
    assert client.get("/api/gis/jobs/not-a-job").status_code == 422
    assert client.get("/api/gis/jobs/20261115T120000-00000000").status_code == 404


def test_runs_list_and_record_are_json_safe(client, fake):
    rid = "3e66a1ed234c"
    rec = {"run_id": rid, "status": "ok", "seconds": 187.2,
           "refinement": {"mission": "rover_mobility", "window_km": 50, "number_of_windows_refined": 40,
                          "candidate_pool_scope": "global_tier1_shortlist", "target": {"site": "InSight_Elysium", "lat": 4.502, "lon": 135.623},
                          "shortlist_selection": {"n_requested": 40}, "decision": {"type": "tied_set", "members": ["a", "b"]},
                          "candidates": [{"id": "a", "S": float("nan")}]}}
    (Path(fake.C.DERIVED) / "runs" / f"{rid}.json").write_text(json.dumps(rec))  # NaN written as the pipeline would
    runs = client.get("/api/gis/runs").json()["runs"]
    assert runs[0]["run_id"] == rid and runs[0]["decision"] == {"type": "tied_set", "members": ["a", "b"]}
    d = client.get(f"/api/gis/runs/{rid}").json()
    assert d["refinement"]["candidates"][0]["S"] is None
    assert client.get("/api/gis/runs/ffffffffffff").status_code == 404
    assert client.get("/api/gis/runs/nope").status_code == 422


# ------------------------------------------------------------------------------------------ grids + context
def test_grid_point_labels_earth_surface_class(client, fake):
    d = client.get("/api/gis/grid/earth/point?lat=0&lon=-140").json()
    assert d["surface_class_label"] == "ocean" and d["values"]["mean_slope_deg"] is None
    assert client.get("/api/gis/grid/venus/point?lat=0&lon=0").status_code == 422


def test_grid_info_lists_drawable_layers_with_their_stretch(client, fake, monkeypatch):
    monkeypatch.setattr(TILES, "sample_overview", lambda planet, layer: np.linspace(-8000, 20000, 1000))
    d = client.get("/api/gis/grid/mars/info").json()
    names = [l["name"] for l in d["layers"]]
    assert names == ["elevation_m", "mean_slope_deg", "obs_bins"]  # flags are described, not drawn
    elev = d["layers"][0]
    assert elev["units"] == "m (areoid-referenced MOLA heights)" and elev["stretch"]["min"] < elev["stretch"]["max"]
    assert "display stretch" in elev["stretch"]["basis"]
    assert d["layers"][2]["classes"][0] == {"value": 0, "label": "none (fully interpolated)", "color": "#2b2f36"}
    assert d["max_level"] == 6 and "{z}/{x}/{y}.png" in d["tile_url"] and d["version"] in d["tile_url"]
    assert d["flags"]["1"].startswith("no observed MEGDR bin")


def test_tile_bounds_follow_the_geographic_scheme():
    assert TILES.tile_bounds(0, 0, 0) == (-180.0, -90.0, 0.0, 90.0)
    assert TILES.tile_bounds(0, 1, 0) == (0.0, -90.0, 180.0, 90.0)
    assert TILES.tile_bounds(2, 3, 1) == (-45.0, 0.0, 0.0, 45.0)


def _decode_png(data: bytes) -> np.ndarray:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", data[16:24])
    i, idat = 8, b""
    while i < len(data):
        n = struct.unpack(">I", data[i:i + 4])[0]
        if data[i + 4:i + 8] == b"IDAT":
            idat += data[i + 8:i + 8 + n]
        i += 12 + n
    raw = zlib.decompress(idat)
    rows = [raw[r * (w * 4 + 1) + 1:(r + 1) * (w * 4 + 1)] for r in range(h)]
    return np.frombuffer(b"".join(rows), dtype=np.uint8).reshape(h, w, 4)


def test_tiles_are_transparent_where_the_grid_has_no_value(client, fake, monkeypatch):
    calls = []
    a = np.tile(np.linspace(0, 10, 256), (256, 1))
    a[:10] = np.nan

    def read(planet, layer, west, south, east, north, resample):
        calls.append((planet, layer, west, south, east, north, resample))
        return a.copy()

    monkeypatch.setattr(TILES, "read_window", read)
    monkeypatch.setattr(TILES, "sample_overview", lambda planet, layer: np.linspace(0, 10, 1000))
    r = client.get("/api/gis/grid/mars/tile/1/2/1.png?layer=mean_slope_deg&v=x")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and "immutable" in r.headers["cache-control"]
    px = _decode_png(r.content)
    assert (px[:10, :, 3] == 0).all() and (px[10:, :, 3] == 255).all()
    assert calls == [("mars", "mean_slope_deg", 0.0, -90.0, 90.0, 0.0, "average")]
    # second request is served from the tile cache
    assert client.get("/api/gis/grid/mars/tile/1/2/1.png?layer=mean_slope_deg").content == r.content and len(calls) == 1


def test_class_tiles_use_nearest_and_the_class_colours(client, fake, monkeypatch):
    monkeypatch.setattr(TILES, "read_window", lambda *a: np.full((256, 256), 2.0))
    px = _decode_png(client.get("/api/gis/grid/earth/tile/0/0/0.png?layer=surface_class").content)
    assert tuple(px[0, 0]) == (0x0D, 0x2F, 0x4A, 255)  # ocean


def test_tile_requests_outside_the_grid_are_rejected(client, fake):
    assert client.get("/api/gis/grid/mars/tile/7/0/0.png?layer=elevation_m").status_code == 422
    assert client.get("/api/gis/grid/mars/tile/1/4/0.png?layer=elevation_m").status_code == 422
    assert client.get("/api/gis/grid/mars/tile/0/0/0.png?layer=flags").status_code == 422
    assert client.get("/api/gis/grid/mars/tile/0/0/0.png?layer=nope").status_code == 422


def test_context_point_passes_through(client, fake):
    d = client.get("/api/gis/context/earth/point?lat=-24.09&lon=-69.99").json()
    assert d["layers"]["aridity_index"]["feature_state"] == "modelled"
    assert client.get("/api/gis/context/catalog").json() == {"layers": ["aridity_index"]}


@requires_data
def test_datasets_carry_the_gis_status(client, fake):
    assert client.get("/api/datasets").json()["gis"]["status"] == "available"


def test_earth_terrain_tiles_draw_land_only(client, fake, monkeypatch):
    fake.grids.info("earth")["provenance"]["layers"]["elevation_m"] = {"units": "m", "nodata": "NaN", "file": "cog/e.tif"}
    monkeypatch.setattr(TILES, "read_window", lambda planet, layer, *a: np.full((256, 256), 2.0 if layer == "surface_class" else 0.0) if layer == "surface_class" else np.zeros((256, 256)))
    monkeypatch.setattr(TILES, "sample_overview", lambda planet, layer: np.linspace(0, 10, 100))
    px = _decode_png(client.get("/api/gis/grid/earth/tile/0/0/0.png?layer=elevation_m").content)
    assert (px[..., 3] == 0).all()  # all ocean: transparent, never the colour of 0 m


def test_unreadable_gis_data_is_503_not_500(client, fake):
    def boom(*a, **k):
        raise OSError(30, "Read-only file system")
    fake.AD.get_mars_features = boom
    GIS.clear_caches()
    r = client.get("/api/gis/mars/features?lat=1&lon=2")
    assert r.status_code == 503 and "could not be read" in r.json()["detail"]["reason"]

"""API contract and honest-unavailability behaviour."""
from .conftest import requires_data

JEZERO = {"lat": 17.6756, "lon": 77.0127}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and "versions" in r.json()


def test_mission_profiles_mark_unconfigured_missions(client):
    ms = {m["id"]: m for m in client.get("/api/mission-profiles").json()["missions"]}
    assert ms["landing_site"]["available"] and ms["landing_site"]["gate_mode"] == "exclude"
    assert ms["terrain_geometry_only"]["gate_mode"] == "report"
    assert not ms["resource_exploration"]["available"] and ms["resource_exploration"]["tier1_weights"] is None


@requires_data
def test_jezero_gated_matches_g5_sample(client):
    """G5 §5 sample: gated Jezero -> named leader Atacama Yungay, S 0.614, cover 0.999 bare-like."""
    d = client.post("/v1/compare", json={"site": "Jezero", "mission": "landing_site"}).json()
    assert d["decision"]["type"] == "named_leader" and d["decision"]["members"] == ["Atacama Yungay"]
    c = d["candidates"][0]
    assert c["S"] == 0.614 and c["coverage"] == 1.0
    assert abs(c["landcover"]["frac_bare_like"] - 0.999) < 1e-3 and c["landcover"]["gate"] == "pass"
    assert d["representation"] == "mars_observation_space" and d["operator"]["status"] == "ok"
    assert d["as_measured_baseline"]["S"] == 0.755
    assert abs(d["target"]["observed_fraction_native"] - 0.30) < 0.005


@requires_data
def test_report_mode_returns_tied_set_without_forcing_winner(client):
    d = client.post("/v1/compare", json={"site": "Jezero", "mission": "terrain_geometry_only"}).json()
    assert d["decision"]["type"] == "tied_set" and len(d["decision"]["members"]) == 3
    assert all(c["landcover"]["gate"] in ("reported", "unknown") for c in d["candidates"])


@requires_data
def test_missing_operator_returns_no_score(client):
    """G5 test 8: no counts tiles -> operator unavailable, no S, no silent as-measured fallback."""
    d = client.post("/v1/compare", json={"lat": 0.0, "lon": 0.0}).json()
    assert d["operator"]["status"] == "unavailable"
    assert d["decision"]["type"] == "insufficient_evidence"
    assert d["candidates"] == [] and d["as_measured_baseline"] is None


@requires_data
def test_25km_window_is_not_substituted(client):
    d = client.post("/v1/compare", json={"site": "Jezero", "window_km": 25}).json()
    assert d["operator"]["status"] == "unavailable" and d["candidates"] == []


@requires_data
def test_no_score_without_coverage_anywhere(client):
    """G5 test 9 across every EZ and both gate modes."""
    from terratwin_api.schemas.requests import assert_score_contract
    sites = [s["id"] for s in client.get("/api/mars/sites").json()["sites"]]
    for site in sites:
        for m in ("landing_site", "terrain_geometry_only"):
            assert_score_contract(client.post("/v1/compare", json={"site": site, "mission": m}).json())


@requires_data
def test_arbitrary_mars_coordinate_is_unavailable_not_fabricated(client):
    d = client.post("/api/analysis/mars", json={"lat": -60.0, "lon": 10.0, "footprint_km": 25}).json()
    assert d["status"] == "unavailable" and d["tier1_features"] == []
    assert "GIS" in d["unavailable"]["owner"]


@requires_data
def test_small_footprint_warns(client):
    d = client.post("/api/analysis/mars", json={**JEZERO, "footprint_km": 1}).json()
    assert any(f["code"] == "footprint_below_observation_support" for f in d["quality_flags"])
    assert all(f["value"] is None for f in d["unavailable_factors"])


@requires_data
def test_analog_search_end_to_end(client):
    d = client.post("/api/analysis/analogs", json={**JEZERO, "mission": "landing_site", "limit": 20}).json()
    assert d["status"] == "available"
    t1 = d["tier1"]
    assert t1["candidate_pool"]["n_cells_searched"] == 249_165 and len(t1["candidates"]) == 20
    assert all(c["similarity"] is not None and c["coverage"] is not None for c in t1["candidates"])
    ranks = [c["rank"] for c in t1["candidates"]]
    assert ranks == sorted(ranks)
    ev = client.get(f"/api/analysis/{d['id']}/evidence").json()
    assert ev["synthetic_benchmark"]["validation_status"] == "synthetic"


@requires_data
def test_tier1_pagination_and_viewport(client):
    q = "/api/analysis/tier1/candidates?site=Gale&mission=permanent_base"
    a = client.get(q + "&offset=0&limit=10").json()
    b = client.get(q + "&offset=10&limit=10").json()
    assert a["candidates"][-1]["rank"] <= b["candidates"][0]["rank"]
    v = client.get(q + "&west=-80&south=-60&east=-60&north=-10&limit=5").json()
    assert all(-80 <= c["lon"] <= -60 and -60 <= c["lat"] <= -10 for c in v["candidates"])
    assert v["total"] < 249_165


@requires_data
def test_arbitrary_earth_coordinate_lookup(client):
    d = client.get("/api/earth/region?lat=-24.09&lon=-69.99").json()
    assert d["planet"] == "earth" and abs(d["lat"] + 24.09) < 0.3


@requires_data
def test_ranked_pool_size_reflects_gate(client):
    gated = client.post("/v1/compare", json={"site": "Jezero", "mission": "landing_site"}).json()
    report = client.post("/v1/compare", json={"site": "Jezero", "mission": "terrain_geometry_only"}).json()
    assert gated["candidate_pool"]["n_ranked"] == 50   # oom_gated_key_numbers.json n_pass
    assert report["candidate_pool"]["n_ranked"] == 230


@requires_data
def test_region_lookup_reports_distance_and_wraps_antimeridian(client):
    land = client.get("/api/earth/region?lat=-24.09&lon=-69.99").json()
    assert land["distance_km"] < 18 and land["describes_requested_point"] is True
    sea = client.get("/api/earth/region?lat=0&lon=-140").json()        # mid-Pacific
    assert sea["distance_km"] > 300 and sea["describes_requested_point"] is False
    fiji = client.get("/api/earth/region?lat=-16.5&lon=179.99").json()  # across the antimeridian
    assert fiji["distance_km"] < 120

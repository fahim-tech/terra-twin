from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response

from ..config import API_VERSION, CONTRACT_VERSION, OOM_METHOD_VERSION, RESEARCH_ENGINE_VERSION, TIER1_METHOD_VERSION
from ..schemas.common import EARTH_CONVENTION, MARS_CONVENTION
from ..schemas.requests import AnalogSearchRequest, CompareRequest, MarsAnalysisRequest, assert_score_contract
from ..services import analysis_store, evidence, mars, research_store as RS, tier1, tier2, visualization as VIS
from ..services.catalog import DATASETS, MISSION_BY_ID, MISSIONS

router = APIRouter()


def _data_or_503(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except RS.ResearchDataUnavailable as e:
        raise HTTPException(503, detail={"status": "unavailable", "reason": str(e)}) from e


def _mission(mid: str):
    m = MISSION_BY_ID.get(mid)
    if m is None:
        raise HTTPException(422, detail=f"unknown mission {mid!r}")
    return m


@router.get("/api/health")
def health():
    checks = RS.validate()
    return {"status": "ok" if all(c.ok for c in checks) else "degraded", "api_version": API_VERSION,
            "contract_version": CONTRACT_VERSION,
            "versions": {"research_engine": RESEARCH_ENGINE_VERSION, "tier1": TIER1_METHOD_VERSION, "oom": OOM_METHOD_VERSION},
            "research_data": all(c.ok for c in checks)}


@router.get("/api/datasets")
def datasets():
    checks = RS.validate()
    try:
        man = RS.manifest()
        imported = {"package": man["package"], "package_sha256": man["package_sha256"],
                    "imported_at": man["imported_at"], "n_files": len(man["files"])}
    except RS.ResearchDataUnavailable:
        imported = None
    return {"datasets": [d.model_dump() for d in DATASETS], "research_import": imported,
            "integrity_checks": [c.__dict__ for c in checks], "live_refinement": tier2.live_status(),
            "conventions": {"mars": MARS_CONVENTION.model_dump(), "earth": EARTH_CONVENTION.model_dump()}}


@router.get("/api/mission-profiles")
def mission_profiles():
    return {"missions": [m.model_dump() for m in MISSIONS],
            "note": "Weights are hypotheses from the research registry, not measured importances."}


@router.get("/api/mars/sites")
def mars_sites():
    return {"sites": _data_or_503(mars.site_list), "convention": MARS_CONVENTION.model_dump(),
            "note": "39 NASA human-landing Exploration Zones carried by the research package. Starting points only."}


@router.get("/api/earth/sites")
def earth_sites():
    def build():
        m = RS.pool_meta()
        lc = RS.pool_landcover()
        ref = m[m.kind != "random"]
        return [{"id": r.name, "name": r.name, "lat": float(r.lat), "lon": float(r.lon), "kind": r.kind,
                 "category": "negative_control" if "negative" in r.kind else
                             "prior_candidate" if "prior" in r.kind else "known_analog",
                 "landcover_gate_pass": bool(lc.loc[r.name, "gate_pass"]) if r.name in lc.index else None}
                for r in ref.itertuples()]
    return {"sites": _data_or_503(build), "convention": EARTH_CONVENTION.model_dump(),
            "note": "Reference / benchmark sites from the research pool. Discovery results come from /api/analysis/analogs."}


@router.get("/api/earth/region")
def earth_region(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)):
    """Tier-1 descriptors of the 25 km cell nearest to any Earth coordinate.

    `requested` and `distance_km` say how far the returned cell centre is from the asked-for point; beyond
    about one cell the values do not describe the requested location (e.g. at sea or in a coverage gap).
    """
    def build():
        row, km = tier1.nearest_cell_with_distance(lat, lon)
        rec = tier1.cell_record(row)
        rec["requested"] = {"lat": lat, "lon": lon}
        rec["distance_km"] = round(km, 1)
        rec["describes_requested_point"] = km <= 18.0
        return rec
    return _data_or_503(build)


@router.post("/api/analysis/mars")
def analysis_mars(req: MarsAnalysisRequest):
    _mission(req.mission)
    res = _data_or_503(mars.analyse, req.lat, req.lon, req.footprint_km)
    res["mission"] = req.mission
    res["id"] = analysis_store.put({"kind": "mars", "request": req.model_dump(), "mars": res})
    return res


@router.post("/api/analysis/analogs")
def analysis_analogs(req: AnalogSearchRequest):
    mission = _mission(req.mission)
    if not mission.available:
        raise HTTPException(422, detail={"status": "unsupported", "reason": mission.reason_unavailable})
    m = _data_or_503(mars.analyse, req.lat, req.lon, req.footprint_km)
    if m["status"] != "available":
        out = {"status": "unavailable", "mars": m, "tier1": None,
               "tier2": tier2.compare(lat=req.lat, lon=req.lon, mission_id=req.mission, window_km=50,
                                      representation="mars_observation_space"),
               "request": req.model_dump()}
    else:
        site = m["site"]
        out = {"status": "available", "mars": m, "request": req.model_dump(),
               "tier1": _data_or_503(tier1.search, site, req.mission, 0, req.limit),
               "tier2": _data_or_503(tier2.research_record, site, req.mission)}
    assert_score_contract(out["tier2"])
    out["id"] = analysis_store.put({"kind": "analogs", **out})
    return out


@router.get("/api/analysis/{aid}")
def analysis_get(aid: str):
    r = analysis_store.get(aid)
    if r is None:
        raise HTTPException(404, detail="analysis not found (results are kept in memory for this API process)")
    return r


@router.get("/api/analysis/{aid}/evidence")
def analysis_evidence(aid: str):
    r = analysis_store.get(aid)
    if r is None:
        raise HTTPException(404, detail="analysis not found")
    ev = _data_or_503(evidence.method_evidence)
    site = (r.get("mars") or {}).get("site")
    if site:
        ev["target_support"] = r["mars"]["observation_support"]
    return {"analysis_id": aid, **ev}


@router.get("/api/analysis/tier1/candidates")
def tier1_candidates(site: str, mission: str = "landing_site", offset: int = Query(0, ge=0),
                     limit: int = Query(50, ge=1, le=500), west: float | None = None, south: float | None = None,
                     east: float | None = None, north: float | None = None):
    """Paginated / viewport-filtered tier-1 results; never ships all 249,165 cells to the browser."""
    _mission(mission)
    bbox = (west, south, east, north) if None not in (west, south, east, north) else None
    if site not in _data_or_503(RS.mars_tier1).index:
        raise HTTPException(404, detail=f"no tier-1 fingerprint for {site!r}")
    return _data_or_503(tier1.search, site, mission, offset, limit, bbox)


@router.get("/api/evidence")
def evidence_all():
    return _data_or_503(evidence.method_evidence)


@router.post("/v1/compare")
def v1_compare(req: CompareRequest):
    """G5 tier-2 refinement contract (thin adapter over the research engine)."""
    m = _mission(req.mission)
    if not m.available:
        raise HTTPException(422, detail={"status": "unsupported", "reason": m.reason_unavailable})
    if req.site and req.site not in _data_or_503(RS.mars_footprints).index:
        raise HTTPException(404, detail=f"unknown site {req.site!r}")
    lat, lon = req.lat, req.lon
    if req.site:
        fp = RS.mars_footprints().loc[req.site]
        lat, lon = float(fp.lat_c), float(fp.lon_c)
    res = _data_or_503(tier2.compare, lat=lat, lon=lon, mission_id=req.mission, window_km=req.window_km,
                       representation=req.representation, site=req.site)
    if req.gate_mode and res.get("landcover_gate") and req.gate_mode != res["landcover_gate"]["mode"]:
        res["landcover_gate"]["override_requested"] = req.gate_mode
        res["landcover_gate"]["override_status"] = ("not applied: research records exist only for the mission's "
                                                    "default gate mode; choose a mission with that mode instead")
    assert_score_contract(res)
    return res


# ---------------------------------------------------------------- read-only visualization products
_PNG_HEADERS = {"Cache-Control": "public, max-age=3600"}


@router.get("/api/research/summary")
def research_summary():
    """Tier-2 research outcome per Exploration Zone in both land-cover gate modes."""
    return {"sites": _data_or_503(VIS.research_summary),
            "note": "Research records over the fixed 230-window pool (50 km windows). exclude = gate-then-rank "
                    "(field-test missions); report = terrain geometry only."}


@router.get("/api/earth/pool")
def earth_pool():
    """The 230 Earth windows that tier-2 OOM refinement actually examined."""
    return {"windows": _data_or_503(VIS.pool_windows), "window_km": 50,
            "note": "Fixed stratified research sample (213 random + 17 named controls). Not a global high-resolution search."}


@router.get("/api/visualization/legend")
def visualization_legend():
    return VIS.LEGEND


@router.get("/api/visualization/tier1-similarity.png")
def tier1_similarity_png(site: str, mission: str = "landing_site"):
    """Equirectangular 0.25° raster of tier-1 similarity for one Mars EZ (display product)."""
    m = _mission(mission)
    if not m.available:
        raise HTTPException(422, detail={"status": "unsupported", "reason": m.reason_unavailable})
    if site not in _data_or_503(RS.mars_tier1).index:
        raise HTTPException(404, detail=f"no tier-1 fingerprint for {site!r}")
    return Response(_data_or_503(VIS.similarity_png, site, mission), media_type="image/png", headers=_PNG_HEADERS)


@router.get("/api/visualization/tier1-coverage.png")
def tier1_coverage_png():
    """Equirectangular 0.25° raster of the land cells screened in tier 1 (display product)."""
    return Response(_data_or_503(VIS.coverage_png), media_type="image/png", headers=_PNG_HEADERS)

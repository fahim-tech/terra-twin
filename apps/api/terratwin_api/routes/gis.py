"""GIS workstream routes (``/api/gis``): Mars features and the global tier-1 screen for any coordinate,
discovery runs on the GIS worker, the ~1 km grids (point values and map tiles) and the context layers.

Every route answers 503 with what is missing when the GIS library, its data or its worker is not
connected on this server, and never substitutes a value.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from ..services import factors, gis, gis_tiles, research_store as RS
from ..services.catalog import MISSION_BY_ID

router = APIRouter(prefix="/api/gis", tags=["gis"])

TILE_HEADERS = {"Cache-Control": "public, max-age=604800, immutable"}


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except gis.GisUnavailable as e:
        raise HTTPException(503, detail=e.status) from None
    except gis.GisBusy as e:
        raise HTTPException(429, detail={"status": "busy", "reason": str(e)}) from None
    except ValueError as e:  # GisInputError and the GIS library's own input errors
        raise HTTPException(422, detail={"status": "invalid_input", "reason": str(e)}) from None
    except OSError as e:  # the GIS library could not read or write its data on this server
        raise HTTPException(503, detail={"status": "unavailable", "owner": gis.OWNER, "missing_inputs": [],
                                         "reason": f"The GIS data could not be read on this server ({type(e).__name__})"}) from None


def _gis_mission(app_mission: str) -> str:
    m = MISSION_BY_ID.get(app_mission)
    if m is None:
        raise HTTPException(422, detail={"status": "invalid_input", "reason": f"unknown mission {app_mission!r}"})
    if not m.available or not m.research_key:
        raise HTTPException(422, detail={"status": "unsupported", "reason": m.reason_unavailable})
    return m.research_key


Lat = Query(ge=-90, le=90)
Lon = Query(ge=-180, le=360, description="east-positive degrees")


@router.get("/status")
def gis_status():
    """What of the GIS contract this server can serve now: library, grids, context, discovery worker."""
    return gis.status()


@router.get("/mars/features")
def mars_features(lat: float = Lat, lon: float = Lon):
    """GIS Mars feature record (gis-contract-1.0 §6) of the 50 km window at any coordinate, with its tier-1
    200 km record, observation support (metadata only) and operator status."""
    return _call(gis.mars_features, lat, lon)


@router.get("/mars/factors")
def mars_factors(lat: float = Lat, lon: float = Lon):
    """Additional Mars scientific layers (mars-factors-1.0): characterization only, never similarity. Always 200;
    each factor carries its own status (available, not_integrated, outside_coverage, unavailable,
    unsupported_resolution, error)."""
    return factors.mars_factors(lat, lon)


@router.get("/tier1")
def tier1(lat: float = Lat, lon: float = Lon, mission: str = "landing_site", top_n: int = Query(50, ge=1, le=100)):
    """Global tier-1 screen of the 249,165 Earth cells (25 km) for any Mars coordinate: the top cells."""
    return _call(gis.tier1_search, lat, lon, _gis_mission(mission), top_n)


class DiscoveryRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=360)
    mission: str = "landing_site"
    n_refine: Literal[20, 30, 40] = 40
    include_research_pool: bool = False
    site: str | None = Field(default=None, description="Exploration Zone id: the run uses the zone's centre")


@router.post("/discovery")
def discovery(req: DiscoveryRequest):
    """Queue a discovery run (tier-1 shortlist, Copernicus GLO-90 windows, observation-operator comparison) on the
    GIS worker. Returns the cached run when these parameters already ran, the queued job when they are queued,
    429 when the server is busy."""
    mission = _gis_mission(req.mission)
    lat, lon, name = req.lat, req.lon, None
    if req.site is not None:
        fp = RS.mars_footprints()
        if req.site not in fp.index:
            raise HTTPException(404, detail=f"unknown site {req.site!r}")
        lat, lon, name = float(fp.loc[req.site].lat_c), float(fp.loc[req.site].lon_c), req.site
    return _call(gis.submit_discovery, lat, lon, mission, req.n_refine, name, req.include_research_pool)


@router.get("/jobs/{job_id}")
def discovery_job(job_id: str):
    """A discovery job: state (paused and blocked read 'Queued — server busy'), timing, queue place, progress
    read from the run log, and the run id once done."""
    j = _call(gis.job, job_id)
    if j is None:
        raise HTTPException(404, detail="no such discovery job")
    return j


@router.get("/runs")
def discovery_runs():
    """Cached discovery runs on this server, newest first."""
    return {"runs": _call(gis.runs)}


@router.get("/runs/{run_id}")
def discovery_run(run_id: str):
    """A discovery run record as the GIS pipeline wrote it: the Mars record, the refinement (G5 shape plus scope:
    candidate pool, shortlist selection, coarse index coverage, source quality) and the tier-1 gate log."""
    r = _call(gis.run, run_id)
    if r is None:
        raise HTTPException(404, detail="no such discovery run")
    return r


@router.get("/windows/relief")
def window_relief(lat: float = Lat, lon: float = Lon):
    """Elevation grid of a refined discovery window (GIS window cache; never extracted on request)."""
    rec = _call(gis.window_relief, lat, lon)
    if rec is None:
        raise HTTPException(404, detail="this window is not cached on the server (it was not refined by a discovery run)")
    return rec


@router.get("/grid/{planet}/info")
def grid_info(planet: Literal["mars", "earth"]):
    """Map layers of the planet's ~1 km grid with their legends, flags and use rules, and the tile URL."""
    return _call(gis_tiles.layer_info, planet)


@router.get("/grid/{planet}/point")
def grid_point(planet: Literal["mars", "earth"], lat: float = Lat, lon: float = Lon):
    """All ~1 km grid layers at the cell containing the point, with units, flags and use rules."""
    return _call(gis.grid_point, planet, lat, lon)


@router.get("/grid/{planet}/tile/{z}/{x}/{y}.png")
def grid_tile(planet: Literal["mars", "earth"], z: int, x: int, y: int, layer: str):
    """One 256 px map tile of a grid layer (geographic tiling scheme)."""
    png = _call(gis_tiles.tile_png, planet, layer, z, x, y)
    return Response(png, media_type="image/png", headers=TILE_HEADERS)


@router.get("/context/{planet}/point")
def context_point(planet: Literal["mars", "earth"], lat: float = Lat, lon: float = Lon):
    """Context layers at a point (native resolution, context only: never a similarity feature)."""
    return _call(gis.context_point, planet, lat, lon)


@router.get("/context/catalog")
def context_catalog():
    """Context layers acquired and catalogued, with sources and licences."""
    return _call(gis.context_catalog)

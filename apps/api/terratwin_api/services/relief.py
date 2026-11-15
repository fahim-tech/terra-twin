"""Read-only terrain relief grids for 3D viewers.

Nothing here computes or changes a score or a decision. It re-expresses the elevation arrays that
tier-2 already reads (``earth_pool_463m.npy``) as JSON a browser can draw, and states exactly what
the grid is:

* **What:** Copernicus DEM GLO-90 elevations of one 50 km research-pool window (catalogue entry
  ``earth_pool_463m``) on a local azimuthal-equidistant grid of 463.09 m cells centred on the window;
  the research engine aggregates Earth elevations by area averaging (``terrain.py`` rule 3,
  ``aoi.earth_aoi``). Earth *as measured*: the MOLA observation operator is NOT applied (its output
  exists only in the research pickles, which are never loaded).
* **Cell size:** ``oom_worker.PIX``, the pixel size the research engine uses for every descriptor
  of this array.
* **Orientation:** north-up, row-major: row 0 is the northern edge, column 0 the western edge.
  Verified in code (``obsop.TargetGeometry`` maps AEQD row = (half - y) / pix, col = (x + half) / pix;
  GDAL warps write north-up rasters) and in the data (Netherlands farmland: IJsselmeer water in the
  north-west, Veluwe high ground in the south-east; Mauna Kea: ocean in the north-east corner).
* **Nulls:** cells without elevation are ``null``; their share equals the pool metadata's water
  fraction (``earth_pool_meta.csv``), i.e. water-masked cells.

Mars grids (``mars_relief``) are the zone's 50 km window read from the USGS MOLA 463 m mosaic with the
research extraction (``aoi.mars_aoi``, bilinear) on the same 463.09 m local AEQD grid. They need the
mosaic (``TERRATWIN_MOLA_MOSAIC``) and GDAL, which the API server takes from the GIS environment.
"""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path

import numpy as np

from ..config import settings
from . import research_store as RS
from .catalog import DATASETS

POOL_FILE = "earth_pool_463m.npy"
POOL_DATASET_ID = "earth_pool_463m"

ORIENTATION = {
    "row0": "north",
    "col0": "west",
    "order": "row-major",
    "frame": "local azimuthal-equidistant grid centred on the window (WGS84); grid north is true north at the centre",
}


def _cell_m() -> float:
    from vendor.terratwin.oom_worker import PIX  # imports scipy / pyproj; lazy like tier2

    return float(PIX)


def _r1(v: float) -> float:
    return round(float(v), 1) + 0.0  # + 0.0 folds -0.0 into 0.0


def _source() -> dict:
    ds = next(d for d in DATASETS if d.id == POOL_DATASET_ID)
    f = RS.manifest()["files"][POOL_FILE]
    return {
        "dataset": ds.id,
        "title": ds.title,
        "file": POOL_FILE,
        "sha256": f["sha256"],
        "role": f["role"],
        "representation": "as_measured",
        "vertical_reference": "EGM2008 geoid (Copernicus DEM heights)",
        "nodata": "null = no elevation: water-masked cell (share equals the pool metadata's water fraction)",
        "note": ("Copernicus DEM GLO-90 surface model (includes vegetation and buildings), aggregated to "
                 "463.09 m cells, the MOLA mosaic grid spacing, on a local azimuthal-equidistant grid. "
                 "Earth as measured: the MOLA observation operator is not applied. One window of the fixed "
                 "230-window research pool, not a live extraction."),
    }


@lru_cache(maxsize=16)
def pool_relief(window_id: str, window_km: float) -> dict | None:
    """Elevation grid of one research-pool window, or None when the id is not in the pool."""
    meta = RS.pool_meta()
    hit = meta.index[meta.name == window_id]
    if len(hit) == 0:
        return None
    idx = int(hit[0])
    row = meta.loc[idx]
    z = np.asarray(RS.pool_windows()[idx], dtype=np.float64)
    return {
        "id": str(row["name"]),
        "lat": float(row["lat"]),
        "lon": float(row["lon"]),
        "kind": str(row["kind"]),
        "planet": "earth",
        **_grid_fields(z),
        "cell_m": _cell_m(),
        "window_km": window_km,
        "units": "m",
        "orientation": ORIENTATION,
        "source": _source(),
    }


def _grid_fields(z: np.ndarray) -> dict:
    """Shape, range, valid share and the row-major elevation list (0.1 m, null where not finite)."""
    rows, cols = (int(n) for n in z.shape)
    finite = np.isfinite(z)
    flat, ok = z.ravel(), finite.ravel()
    return {
        "rows": rows,
        "cols": cols,
        "z_min": _r1(np.nanmin(z)) if finite.any() else None,
        "z_max": _r1(np.nanmax(z)) if finite.any() else None,
        "valid_fraction": float(finite.mean()),
        "elevation": [_r1(v) if good else None for v, good in zip(flat.tolist(), ok.tolist())],
    }


# ------------------------------------------------------------------------------------------------
# Mars: a zone's 50 km window read from the USGS MOLA 463 m mosaic
# ------------------------------------------------------------------------------------------------
MARS_DATASET_ID = "mola_mosaic"
#: The research comparison's Mars window: 50 km square, centred on the zone (tier2.compare's target).
MARS_WINDOW_KM = 50.0
#: Mars sphere of the research AEQD grids (planetocentric, G2/D6).
R_MARS_M = 3_396_190.0

MARS_ORIENTATION = {
    **ORIENTATION,
    "frame": "local azimuthal-equidistant grid centred on the zone (Mars sphere R = 3,396,190 m); grid north is true north at the centre",
}


class MarsReliefUnavailable(Exception):
    """No Mars grid can be served; ``status`` says why (never a substitute grid)."""

    def __init__(self, status: dict):
        super().__init__(status["reason"])
        self.status = status


def _mola_reader():
    """The research extraction ``aoi.mars_aoi`` (GDAL warp of the mosaic onto the local AEQD grid), or None
    when GDAL is not installed: it is not an API dependency, and a server gets it from the GIS environment."""
    try:
        from vendor.terratwin.aoi import mars_aoi
    except ImportError:
        return None
    return mars_aoi


def crosses_antimeridian(lat: float, lon: float, half_km: float) -> bool:
    """Whether a window comes near the 180° meridian, where the research warp reads the wrong source
    window (fixed only in the GIS workstream's extractor, ``am-recentre-1``). The longitude half-extent
    is widened by half again to cover the window's poleward corners. None of the 39 zones comes near it."""
    dlon = math.degrees(half_km * 1000.0 / (R_MARS_M * max(math.cos(math.radians(lat)), 1e-6)))
    return lon - 1.5 * dlon <= -180.0 or lon + 1.5 * dlon >= 180.0


def mars_relief_status() -> dict:
    """Whether a Mars relief grid can be served, and if not, why."""
    path = settings.mola_mosaic
    if path is None or not path.is_file():
        return {"status": "unavailable", "reason": "MOLA mosaic not connected",
                "missing_inputs": ["USGS MOLA 463 m mosaic (TERRATWIN_MOLA_MOSAIC)"], "owner": "GIS workstream"}
    if _mola_reader() is None:
        return {"status": "unavailable",
                "reason": "MOLA mosaic connected, but this server has no reader for it (the research extraction aoi.mars_aoi needs GDAL)",
                "missing_inputs": ["GDAL Python bindings for aoi.mars_aoi"], "owner": "GIS workstream"}
    return {"status": "available", "reason": None, "missing_inputs": [], "owner": "GIS workstream"}


def _mars_source(path: Path) -> dict:
    ds = next(d for d in DATASETS if d.id == MARS_DATASET_ID)
    return {
        "dataset": ds.id,
        "title": ds.title,
        "file": path.name,
        "representation": "as_measured",
        "nodata": "null = no elevation (mosaic nodata cell)",
        "note": ("USGS MOLA 463 m global mosaic, a grid built by binning MOLA laser returns: most cells are "
                 "interpolated between returns, so the grid spacing is not an observation resolution. Warped "
                 "bilinearly with the research extraction (aoi.mars_aoi) to 463.09 m cells on a local "
                 "azimuthal-equidistant grid centred on the zone: the 50 km Mars window the research "
                 "comparison reads."),
    }


@lru_cache(maxsize=48)
def _mars_grid(site: str, lat: float, lon: float, path: str) -> np.ndarray:
    z, _meta = _mola_reader()(path, lat, lon, half_km=MARS_WINDOW_KM / 2, pix_m=_cell_m(), resample="bilinear")
    return np.asarray(z, dtype=np.float64)


def mars_relief(site: str, lat: float, lon: float) -> dict:
    """Elevation grid of a zone's 50 km window, read from the MOLA mosaic. Raises MarsReliefUnavailable
    with the reason when it cannot be read."""
    status = mars_relief_status()
    if status["status"] != "available":
        raise MarsReliefUnavailable(status)
    if crosses_antimeridian(lat, lon, MARS_WINDOW_KM / 2):
        raise MarsReliefUnavailable({
            "status": "unavailable", "owner": "GIS workstream",
            "reason": "This window reaches the 180° meridian, where the research warp is not reliable; the "
                      "GIS workstream's antimeridian-safe extractor is not connected to the API",
            "missing_inputs": ["Antimeridian-safe MOLA extraction (terratwin_gis.mars, am-recentre-1)"]})
    path = settings.mola_mosaic
    try:
        z = _mars_grid(site, lat, lon, str(path))
    except Exception as e:  # GDAL raises RuntimeError on unreadable input; report it, never substitute
        raise MarsReliefUnavailable({
            "status": "unavailable", "owner": "GIS workstream", "missing_inputs": [],
            "reason": f"The MOLA mosaic could not be read ({type(e).__name__})"}) from e
    return {
        "id": site,
        "lat": lat,
        "lon": lon,
        "kind": "nasa_exploration_zone",
        "planet": "mars",
        **_grid_fields(z),
        "cell_m": _cell_m(),
        "window_km": MARS_WINDOW_KM,
        "units": "m",
        "orientation": MARS_ORIENTATION,
        "source": _mars_source(path),
    }

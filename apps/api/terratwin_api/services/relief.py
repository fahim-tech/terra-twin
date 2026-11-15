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
"""
from __future__ import annotations

from functools import lru_cache

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
    rows, cols = (int(n) for n in z.shape)
    finite = np.isfinite(z)
    flat, ok = z.ravel(), finite.ravel()
    elevation = [_r1(v) if good else None for v, good in zip(flat.tolist(), ok.tolist())]
    return {
        "id": str(row["name"]),
        "lat": float(row["lat"]),
        "lon": float(row["lon"]),
        "kind": str(row["kind"]),
        "planet": "earth",
        "rows": rows,
        "cols": cols,
        "cell_m": _cell_m(),
        "window_km": window_km,
        "units": "m",
        "z_min": _r1(np.nanmin(z)) if finite.any() else None,
        "z_max": _r1(np.nanmax(z)) if finite.any() else None,
        "valid_fraction": float(finite.mean()),
        "elevation": elevation,
        "orientation": ORIENTATION,
        "source": _source(),
    }


def mars_relief_status() -> dict:
    """Why no Mars relief grid can be served. The API has no MOLA reader of its own: the research
    extraction (``aoi.mars_aoi``) needs GDAL, which is not an API dependency (GIS workstream)."""
    path = settings.mola_mosaic
    if path is None or not path.is_file():
        return {"status": "unavailable", "reason": "MOLA mosaic not connected",
                "missing_inputs": ["USGS MOLA 463 m mosaic (TERRATWIN_MOLA_MOSAIC)"], "owner": "GIS workstream"}
    return {"status": "unavailable",
            "reason": "MOLA mosaic connected, but the API has no reader for it (the research extraction aoi.mars_aoi needs GDAL)",
            "missing_inputs": ["Mars AOI extraction service (aoi.mars_aoi, GDAL)"], "owner": "GIS workstream"}

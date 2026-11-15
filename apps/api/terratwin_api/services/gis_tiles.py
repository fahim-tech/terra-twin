"""Map tiles of the GIS workstream's global ~1 km descriptor grids (``mars_grid_1km_v1``,
``earth_grid_1km_v1``, ``grid-contract-1.0``), for a globe imagery layer.

Tiles follow the geographic tiling scheme a Cesium ``GeographicTilingScheme`` requests: level ``z`` has
2^(z+1) x 2^z tiles of 180/2^z degrees, ``x`` eastwards from -180, ``y`` southwards from +90. Pixels are
read from the grid's cloud-optimised GeoTIFF (overviews below native resolution), averaged for continuous
layers and nearest-neighbour for classes, and coloured on a fixed per-layer display stretch so neighbouring
tiles agree. Cells without a value are transparent, never a colour for 0. Values are not changed; this is
display only, and the legend (``layer_info``) states the stretch.
"""
from __future__ import annotations

import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import gis
from .visualization import VIRIDIS, _png

TILE = 256
#: Deepest level served: one tile pixel per grid cell or finer (Mars 1/64°, Earth 1/120°). The globe
#: magnifies these beyond it instead of requesting more.
MAX_LEVEL = {"mars": 6, "earth": 7}
PALETTE_VERSION = "2"

# Display metadata per layer: label, group, kind, and a fixed stretch where the units define one.
# "support" layers are observation metadata (gis-contract-1.0: never a weight or a confidence).
LAYERS: dict[str, dict] = {
    "elevation_m": {"label": "Elevation", "group": "terrain", "kind": "continuous"},
    "slope_local_deg": {"label": "Local slope, cell", "group": "terrain", "kind": "continuous"},
    "mean_slope_deg": {"label": "Mean slope, 25 km window", "group": "terrain", "kind": "continuous"},
    "relative_relief_m": {"label": "Relative relief, 25 km window", "group": "terrain", "kind": "continuous"},
    "elev_std_m": {"label": "Elevation std. dev., 25 km window", "group": "terrain", "kind": "continuous"},
    "rmsdev_short": {"label": "RMS deviation, short baseline", "group": "terrain", "kind": "continuous"},
    "rmsdev_long": {"label": "RMS deviation, long baseline", "group": "terrain", "kind": "continuous"},
    "hurst_2pt": {"label": "Hurst exponent, two-point", "group": "terrain", "kind": "continuous"},
    "dist_to_observed_m": {"label": "Distance to an observed MOLA bin", "group": "support", "kind": "continuous"},
    "window_observed_pct": {"label": "Observed share of the 25 km window", "group": "support", "kind": "continuous",
                            "fixed": (0.0, 100.0)},
    "obs_bins": {"label": "Observed MEGDR bins in the cell", "group": "support", "kind": "categorical",
                 "classes": [(0, "none (fully interpolated)", "#2b2f36"), (1, "1 of 4", "#3e4a89"),
                             (2, "2 of 4", "#26828e"), (3, "3 of 4", "#35b779"), (4, "4 of 4", "#fde725")]},
    "surface_class": {"label": "Surface class (GSHHG)", "group": "surface", "kind": "categorical",
                      "classes": [(1, "land", "#c9b48a"), (2, "ocean", "#0d2f4a"), (3, "inland water", "#2c7fb8"),
                                  (4, "ice shelf", "#e8f1f5")]},
    "land_frac_pct": {"label": "Land share of the cell", "group": "surface", "kind": "continuous", "fixed": (0.0, 100.0)},
    "window_valid_pct": {"label": "Valid land share of the 25 km window", "group": "surface", "kind": "continuous",
                         "fixed": (0.0, 100.0)},
}
STRETCH_NOTE = "2nd to 98th percentile of the planet's cells with a value (Earth terrain: land cells only); display stretch, not a threshold"


def _hex(c: str) -> tuple[int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def _lut() -> np.ndarray:
    """256-entry RGB table interpolated through the viridis samples the tier-1 layer uses."""
    pts = np.array([_hex(c) for c in VIRIDIS], dtype=float)
    x = np.linspace(0, 1, len(pts))
    t = np.linspace(0, 1, 256)
    return np.stack([np.interp(t, x, pts[:, i]) for i in range(3)], axis=1).round().astype(np.uint8)


LUT = _lut()


# ------------------------------------------------------------------------------------------ sources
def _prov(planet: str) -> dict:
    with gis.GDAL_LOCK:
        return gis.lib().grids.info(planet)["provenance"]


@lru_cache(maxsize=64)
def _dataset(planet: str, layer: str, path: str):
    from osgeo import gdal

    gdal.UseExceptions()
    return gdal.Open(path)


def _layer_path(planet: str, layer: str) -> str:
    L = gis.lib()
    prov = _prov(planet)
    if layer not in prov["layers"]:
        raise gis.GisInputError(f"unknown layer {layer!r}; available: {sorted(prov['layers'])}")
    return str(Path(L.C.DERIVED) / L.grids.PRODUCTS[planet] / prov["layers"][layer]["file"])


def _nodata(planet: str, layer: str):
    nd = _prov(planet)["layers"][layer].get("nodata")
    return None if nd in (None, "NaN", "nan") else float(nd)


def read_window(planet: str, layer: str, west: float, south: float, east: float, north: float,
                resample: str) -> np.ndarray:
    """TILE x TILE float array for a lat/lon box (NaN where the grid has no value). Tests replace this."""
    from osgeo import gdal

    with gis.GDAL_LOCK:
        src = _dataset(planet, layer, _layer_path(planet, layer))
        out = gdal.Translate("", src, format="MEM", projWin=[west, north, east, south], width=TILE, height=TILE,
                             resampleAlg=resample, outputType=gdal.GDT_Float32)
        a = out.GetRasterBand(1).ReadAsArray().astype(np.float64)
    nd = _nodata(planet, layer)
    if nd is not None:
        a[a == nd] = np.nan
    return a


def sample_overview(planet: str, layer: str) -> np.ndarray:
    """A whole-planet overview (about 1,400 cells wide) for the display stretch. Tests replace this."""
    with gis.GDAL_LOCK:
        b = _dataset(planet, layer, _layer_path(planet, layer)).GetRasterBand(1)
        ov = b
        for i in range(b.GetOverviewCount()):
            o = b.GetOverview(i)
            if o.XSize >= 1200:
                ov = o
        a = ov.ReadAsArray().astype(np.float64)
    nd = _nodata(planet, layer)
    if nd is not None:
        a[a == nd] = np.nan
    return a


# ------------------------------------------------------------------------------------------ legend
def _meta(planet: str, layer: str) -> dict:
    prov = _prov(gis._planet(planet))
    if layer not in prov["layers"] or layer not in LAYERS:
        raise gis.GisInputError(f"not a map layer: {layer!r}")
    return LAYERS[layer]


@lru_cache(maxsize=64)
def _stretch(planet: str, layer: str) -> tuple[float, float]:
    m = LAYERS[layer]
    if "fixed" in m:
        return m["fixed"]
    a = sample_overview(planet, layer)
    if planet == "earth" and m["group"] == "terrain":
        land = sample_overview(planet, "surface_class")
        if land.shape == a.shape:
            a = np.where(np.rint(land) == 1, a, np.nan)
    v = a[np.isfinite(a)]
    if v.size == 0:
        raise gis.GisInputError(f"{layer} has no values on {planet}")
    lo, hi = (float(x) for x in np.percentile(v, [2, 98]))
    if hi <= lo:
        hi = lo + 1.0
    return lo, hi


def version(planet: str) -> str:
    """Changes when the grid is rebuilt or the colouring changes, so cached tiles never go stale."""
    prov = _prov(planet)
    key = json.dumps([prov.get("product"), prov.get("created_utc"), PALETTE_VERSION])
    return hashlib.sha1(key.encode()).hexdigest()[:10]


def layer_info(planet: str) -> dict:
    """Map layers of a planet's grid with their legends, plus the grid's own flags and use rules."""
    gis.lib()
    prov = _prov(gis._planet(planet))
    v = version(planet)
    layers = []
    for name, spec in prov["layers"].items():
        if name not in LAYERS:
            continue  # the flags bit field is described, not drawn
        m = LAYERS[name]
        entry = {"name": name, "label": m["label"], "group": m["group"], "kind": m["kind"],
                 "units": spec.get("units"), "dtype": spec.get("dtype")}
        if m["kind"] == "categorical":
            entry["classes"] = [{"value": val, "label": lab, "color": col} for val, lab, col in m["classes"]]
        else:
            lo, hi = _stretch(planet, name)
            entry["stretch"] = {"min": lo, "max": hi,
                                "basis": "fixed by the units" if "fixed" in m else STRETCH_NOTE}
            entry["palette"] = {"name": "viridis", "stops": [[round(i / (len(VIRIDIS) - 1), 4), c]
                                                              for i, c in enumerate(VIRIDIS)]}
        layers.append(entry)
    return {
        "planet": planet, "product": prov.get("product"), "contract_version": "grid-contract-1.0",
        "created_utc": prov.get("created_utc"), "grid": prov.get("grid"), "crs": prov.get("crs"),
        "flags": prov.get("flags"), "use_rules": prov.get("use_rules"), "parameters": prov.get("parameters"),
        "sources": prov.get("sources"), "layers": layers, "max_level": MAX_LEVEL[planet], "tile_size": TILE,
        "tiling": "geographic: level z has 2^(z+1) x 2^z tiles of 180/2^z degrees; x east from -180, y south from +90",
        "tile_url": f"/api/gis/grid/{planet}/tile/{{z}}/{{x}}/{{y}}.png?layer={{layer}}&v={v}", "version": v,
    }


# ------------------------------------------------------------------------------------------ tiles
def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """(west, south, east, north) degrees of a geographic tile."""
    d = 180.0 / 2 ** z
    west, north = -180.0 + x * d, 90.0 - y * d
    return west, north - d, west + d, north


def colorize(a: np.ndarray, layer: str, stretch: tuple[float, float] | None) -> np.ndarray:
    """RGBA uint8 (h, w, 4): the layer's palette where finite, transparent elsewhere."""
    m = LAYERS[layer]
    rgba = np.zeros(a.shape + (4,), dtype=np.uint8)
    ok = np.isfinite(a)
    if m["kind"] == "categorical":
        for val, _lab, col in m["classes"]:
            hit = ok & (np.rint(a) == val)
            rgba[hit, :3] = _hex(col)
            rgba[hit, 3] = 255
        return rgba
    lo, hi = stretch
    idx = np.clip(np.rint((np.where(ok, a, lo) - lo) / (hi - lo) * 255), 0, 255).astype(np.int64)
    rgba[..., :3] = LUT[idx]
    rgba[..., 3] = np.where(ok, 255, 0)
    return rgba


def _cache_path(planet: str, layer: str, z: int, x: int, y: int) -> Path | None:
    try:
        root = Path(gis.lib().C.CACHE) / "tiles"
    except Exception:
        return None
    return root / version(planet) / planet / layer / str(z) / str(x) / f"{y}.png"


def tile_png(planet: str, layer: str, z: int, x: int, y: int) -> bytes:
    gis.lib()
    m = _meta(planet, layer)
    if not (0 <= z <= MAX_LEVEL[planet] and 0 <= x < 2 ** (z + 1) and 0 <= y < 2 ** z):
        raise gis.GisInputError("tile outside the grid's levels")
    path = _cache_path(planet, layer, z, x, y)
    if path is not None and path.is_file():
        return path.read_bytes()
    west, south, east, north = tile_bounds(z, x, y)
    a = read_window(planet, layer, west, south, east, north, "nearest" if m["kind"] == "categorical" else "average")
    if planet == "earth" and m["group"] == "terrain":
        # The Earth grid stores ocean elevation as 0 (no bathymetry): draw terrain on land cells only.
        land = read_window(planet, "surface_class", west, south, east, north, "nearest")
        a = np.where(np.rint(land) == 1, a, np.nan)
    stretch = None if m["kind"] == "categorical" else _stretch(planet, layer)
    png = _png(colorize(a, layer, stretch).reshape(-1), a.shape[1], a.shape[0])
    if path is not None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_bytes(png)
            os.replace(tmp, path)
        except OSError:
            pass  # a read-only cache only costs a re-render
    return png


def clear_caches() -> None:
    _dataset.cache_clear()
    _stretch.cache_clear()


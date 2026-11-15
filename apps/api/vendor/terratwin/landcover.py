"""
Surface-cover gate (ESA WorldCover 10 m, v200/2021).

Why this exists. Tier-1 terrain matching answers "is the SHAPE of this Earth surface like that
Mars surface?". For a geomorphologically distinctive target that question is informative. For a
FLAT target it is nearly vacuous: every alluvial plain, wetland and rainforest floor on Earth is
flat, so the top of a terrain-only ranking fills with environments that no one would field-test
a Mars instrument in. Experiment 6 measured exactly this failure. The gate restores
discrimination using an independent, non-terrain observation.

This is a FILTER and a REPORTED QUANTITY, not a similarity term. Vegetation cover is not a
Martian variable, so it cannot sensibly enter a Mars-Earth similarity score; what it can do is
exclude candidates whose surface is not a bare-ground analog at all, and make that exclusion
explicit and auditable.

Classes (WorldCover v200): 10 tree, 20 shrub, 30 grass, 40 crop, 50 built, 60 bare/sparse,
70 snow/ice, 80 water, 90 herbaceous wetland, 95 mangrove, 100 moss/lichen.
"""
from __future__ import annotations
import numpy as np
from osgeo import gdal
from .terrain import local_aeqd

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
_B = "https://esa-worldcover.s3.eu-central-1.amazonaws.com"

CLASSES = {10:"tree",20:"shrubland",30:"grassland",40:"cropland",50:"built_up",
           60:"bare_sparse",70:"snow_ice",80:"water",90:"wetland",95:"mangrove",100:"moss_lichen"}
# Surfaces where the ground is actually exposed: the only ones where a Mars surface-process
# field analog is physically meaningful.
BARE_CLASSES = (60, 70, 100)
# Dense biological cover: disqualifying for a bare-regolith analog.
VEGETATED_CLASSES = (10, 40, 90, 95)


def tile_url(lat: float, lon: float, version="v200", year="2021") -> str:
    la = int(np.floor(lat/3.0)*3); lo = int(np.floor(lon/3.0)*3)
    ns = 'N' if la >= 0 else 'S'; ew = 'E' if lo >= 0 else 'W'
    n = f"ESA_WorldCover_10m_{year}_{version}_{ns}{abs(la):02d}{ew}{abs(lo):03d}_Map.tif"
    return f"/vsicurl/{_B}/{version}/{year}/map/{n}"


def cover_fractions(lat, lon, half_km=12.5, sample_m=100.0):
    """Class fractions over an AOI, from a ~`sample_m` nearest-neighbour subsample.

    Nearest-neighbour SUBSAMPLING (not majority resampling) is used deliberately: a subsample
    is an unbiased estimator of class proportions, whereas mode-resampling systematically
    erases minority classes -- which would hide exactly the sparse-vegetation detail that
    matters here. WorldCover covers roughly 60S-84N; outside that, fractions are undefined.
    """
    try:
        src = tile_url(lat, lon)
        half_m = half_km*1000.0
        n = max(8, int(round(2*half_m/sample_m)))
        ds = gdal.Warp("", src, format="MEM", dstSRS=local_aeqd(lat, lon, "earth"),
                       outputBounds=(-half_m,-half_m, half_m, half_m),
                       xRes=sample_m, yRes=sample_m, resampleAlg="near",
                       outputType=gdal.GDT_Byte, dstNodata=0)
        a = ds.GetRasterBand(1).ReadAsArray(); ds = None
    except Exception as e:
        return {"available": False, "error": f"{type(e).__name__}"}
    a = a[a > 0]
    if a.size == 0:
        return {"available": False, "error": "no valid pixels"}
    out = {"available": True, "n_samples": int(a.size)}
    for code, name in CLASSES.items():
        out[f"frac_{name}"] = float(np.mean(a == code))
    out["frac_bare_like"]  = float(np.mean(np.isin(a, BARE_CLASSES)))
    out["frac_vegetated"]  = float(np.mean(np.isin(a, VEGETATED_CLASSES)))
    return out


def gate(frac, bare_min=0.50, veg_max=0.20):
    """Pass/fail for 'is this a bare-ground surface analog at all?'.

    Returns (passed, reason). Unavailable cover data is NOT treated as a pass: an unobserved
    surface is unknown, and the brief is explicit that missing evidence must never be scored
    as agreement.
    """
    if not frac.get("available"):
        return False, f"land cover unavailable ({frac.get('error','unknown')})"
    if frac["frac_vegetated"] > veg_max:
        return False, (f"densely vegetated surface "
                       f"({100*frac['frac_vegetated']:.0f}% tree/crop/wetland/mangrove)")
    if frac["frac_bare_like"] < bare_min:
        return False, (f"insufficient exposed ground "
                       f"({100*frac['frac_bare_like']:.0f}% bare/snow/moss, need "
                       f"{100*bare_min:.0f}%)")
    return True, f"exposed ground {100*frac['frac_bare_like']:.0f}%"

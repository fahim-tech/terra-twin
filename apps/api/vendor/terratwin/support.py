"""
Observational support for Mars terrain descriptors, from the MOLA MEGDR per-cell COUNTS maps.

The problem this solves. TerraTwin's Mars descriptors come from a 463 m gridded DEM, and it is
tempting -- and wrong -- to treat that grid spacing as an observation resolution. MEGDRs are built
by BINNING MOLA PEDR laser returns into cells (PDS Geosciences MEGDR documentation); individual
footprints are ~75 m across (Neumann et al. 2003, doi:10.1029/2003GL017048) and spot geolocation is
good to ~100 m (Smith et al. 2001, doi:10.1029/2000JE001364). Cells therefore contain VARIABLE
numbers of real returns, and in places none at all -- those are interpolated.

Every MEGDR product set ships a counts map (`megc*`) alongside the topography (`megt*`) at the same
grid. Reading it turns "a 463 m grid is not a 463 m observation" from a caveat in prose into a
measured per-AOI number, which is what an evidence-weighted score actually needs.

Statistics are computed on the NATIVE MEGDR grid, not on a reprojected one. The question being
asked is "how many returns underlie these DEM cells", and the DEM cells in question are the native
cells; resampling them first would corrupt the count.

Tile geometry (read from the PDS labels): 128 pixels/degree, 0.463 km/pixel, UNSIGNED_INTEGER 8-bit
(so counts saturate at 255), 5632 lines x 11520 samples, pixel (0,0) at the north-west corner.
"""
from __future__ import annotations
import os, numpy as np

PPD = 128
TILE_LINES, TILE_SAMPLES = 5632, 11520
BANDS = [("88n", 88.0, 44.0), ("44n", 44.0, 0.0), ("00n", 0.0, -44.0), ("44s", -44.0, -88.0)]
LON0S = [0, 90, 180, 270]
R_MARS = 3396190.0


def tile_name(lat: float, lon360: float) -> str | None:
    for nm, hi, lo in BANDS:
        if lo <= lat <= hi:
            for L in LON0S:
                if L <= lon360 < L + 90:
                    return f"megc{nm}{L:03d}hb"
    return None


def _tile_origin(name: str):
    band = name[4:7]; lon0 = int(name[7:10])
    hi = dict((b, h) for b, h, _ in BANDS)[band]
    return hi, float(lon0)


def load_tile(name: str, root="data/mars/megdr_counts"):
    p = os.path.join(root, f"{name}.img")
    if not os.path.exists(p):
        return None
    a = np.fromfile(p, dtype=np.uint8)
    if a.size != TILE_LINES * TILE_SAMPLES:
        raise ValueError(f"{name}: {a.size} bytes, expected {TILE_LINES*TILE_SAMPLES}")
    return a.reshape(TILE_LINES, TILE_SAMPLES)


def aoi_bbox(lat, lon, half_km):
    dlat = np.degrees(half_km * 1000.0 / R_MARS)
    dlon = np.degrees(half_km * 1000.0 / (R_MARS * max(np.cos(np.radians(lat)), 1e-6)))
    return lat - dlat, lat + dlat, (lon - dlon) % 360.0, (lon + dlon) % 360.0


def counts_for_aoi(lat, lon, half_km, root="data/mars/megdr_counts", _cache={}):
    """Native-grid MEGDR counts covering the AOI. Returns (values_1d, meta)."""
    s, n, w, e = aoi_bbox(lat, lon, half_km)
    vals, tiles_used, missing = [], [], []
    for nm, hi, lo in BANDS:
        if n < lo or s > hi:
            continue
        for L in LON0S:
            spans = (w < L + 90 and e > L) if w <= e else (w < L + 90 or e > L)
            if not spans:
                continue
            name = f"megc{nm}{L:03d}hb"
            if name not in _cache:
                _cache[name] = load_tile(name, root)
            t = _cache[name]
            if t is None:
                missing.append(name); continue
            r0 = int(np.floor((hi - min(n, hi)) * PPD)); r1 = int(np.ceil((hi - max(s, lo)) * PPD))
            lo_w, lo_e = (w, e) if w <= e else (L, e) if w > L else (w, L + 90)
            c0 = int(np.floor((max(lo_w, L) - L) * PPD)); c1 = int(np.ceil((min(lo_e, L + 90) - L) * PPD))
            r0, r1 = max(0, r0), min(TILE_LINES, max(r0 + 1, r1))
            c0, c1 = max(0, c0), min(TILE_SAMPLES, max(c0 + 1, c1))
            sub = t[r0:r1, c0:c1]
            if sub.size:
                vals.append(sub.ravel()); tiles_used.append(name)
    if not vals:
        return np.array([], dtype=np.uint8), {"tiles": [], "missing": missing}
    return np.concatenate(vals), {"tiles": tiles_used, "missing": missing}


def observational_support(lat, lon, half_km, root="data/mars/megdr_counts"):
    """Measured support for the Mars DEM cells under an AOI.

    `observed_fraction` is the quantity TerraTwin should publish beside every Mars terrain number:
    the fraction of native 463 m DEM cells that contain at least one real MOLA return. The rest are
    interpolated. Counts saturate at 255 (8-bit), so `mean_counts` is a LOWER BOUND wherever
    `frac_saturated` > 0 -- true in the polar-converging tracks.
    """
    v, meta = counts_for_aoi(lat, lon, half_km, root)
    if v.size == 0:
        return {"available": False, **meta}
    vf = v.astype(np.float64)
    return {"available": True,
            "n_cells": int(v.size),
            "observed_fraction": float(np.mean(v > 0)),
            "mean_counts": float(vf.mean()),
            "median_counts": float(np.median(vf)),
            "p90_counts": float(np.percentile(vf, 90)),
            "max_counts": int(v.max()),
            "frac_saturated": float(np.mean(v == 255)),
            "tiles": meta["tiles"], "missing_tiles": meta["missing"]}


def evidence_weight(support: dict, floor: float = 0.05) -> float:
    """Map measured support to an evidence weight q_i in [floor, 1].

    Deliberately linear in `observed_fraction`: an AOI where half the DEM cells are interpolated
    carries half the evidential weight. The floor keeps a sparsely-sampled AOI in the comparison
    rather than silently removing it -- the brief requires that missing evidence be visible, not
    that it be discarded.
    """
    if not support.get("available"):
        return floor
    return float(max(floor, min(1.0, support["observed_fraction"])))

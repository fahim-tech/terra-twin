"""Read-only visualization products derived from existing research data.

Nothing here changes a score or a decision. It re-expresses results the API already computes
(tier-1 similarity, the tier-1 cell footprint, research decisions) in forms a globe can draw:
equirectangular PNG rasters and compact per-site summaries.
"""
from __future__ import annotations

import struct
import zlib
from functools import lru_cache

import numpy as np

from . import research_store as RS
from . import tier1 as T1

KM_PER_DEG = 111.195
RASTER_W, RASTER_H = 1440, 720  # 0.25° per pixel, plate carrée, lon -180..180, lat 90..-90

# Viridis (matplotlib), 10 evenly spaced samples: perceptually uniform, colour-blind safe,
# deliberately independent of the TerraTwin brand colours.
VIRIDIS = ["#440154", "#482878", "#3e4a89", "#31688e", "#26828e",
           "#1f9e89", "#35b779", "#6dcd59", "#b4de2c", "#fde725"]
# Similarity is drawn with opacity rising from S_FADE_LO (transparent) to S_FADE_HI (opaque) so that
# poor matches recede. These are display constants only, not analysis thresholds.
S_FADE_LO, S_FADE_HI, ALPHA_MAX = 0.30, 0.80, 0.88
COVERAGE_RGBA = (148, 163, 181, 70)

LEGEND = {
    "tier1_similarity": {
        "name": "viridis",
        "stops": [[round(i / (len(VIRIDIS) - 1), 4), c] for i, c in enumerate(VIRIDIS)],
        "domain": [0.0, 1.0],
        "opacity": {"transparent_below": S_FADE_LO, "opaque_above": S_FADE_HI, "max": ALPHA_MAX},
        "label": "Tier-1 terrain similarity S (0–1), 25 km cells, Earth as measured",
        "pixel_rule": "each 0.25° pixel shows the highest S among the cells it touches",
        "caveat": "Similarity index, not a probability. Terrain geometry only. Display opacity is not an analysis threshold.",
    },
    "tier1_coverage": {
        "rgba": list(COVERAGE_RGBA),
        "label": "Land cells screened in tier 1 (GMTED2010, ≈25 km, ≥60 % valid pixels)",
        "pixel_rule": "a pixel is shaded if any screened cell touches it",
    },
}


def _hex(c: str) -> tuple[int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


_VIR = np.array([_hex(c) for c in VIRIDIS], dtype=float)


def _colormap(v: np.ndarray) -> np.ndarray:
    """Values in [0,1] → RGB uint8 by linear interpolation between the viridis samples."""
    x = np.clip(v, 0, 1) * (len(VIRIDIS) - 1)
    i = np.clip(np.floor(x).astype(int), 0, len(VIRIDIS) - 2)
    f = (x - i)[:, None]
    return (_VIR[i] * (1 - f) + _VIR[i + 1] * f).round().astype(np.uint8)


def _rasterize_max(values: np.ndarray, w: int = RASTER_W, h: int = RASTER_H) -> np.ndarray:
    """Paint every tier-1 cell's approximate footprint onto an equirectangular grid (max per pixel).

    Cells are ≈25 km squares whose east-west width in degrees grows with latitude; the footprint is
    the same approximation used for /api/earth/region bboxes. Returns a flat float array with -inf
    where no cell touches the pixel.
    """
    e = RS.earth_screen()
    lat, lon = e.lat.to_numpy(), e.lon.to_numpy()
    res = 360.0 / w
    dlat = e.cell_km_ns.to_numpy() / 2 / KM_PER_DEG
    dlon = e.cell_km_ew.to_numpy() / 2 / (KM_PER_DEG * np.clip(np.cos(np.radians(lat)), 1e-3, None))
    dlon = np.minimum(dlon, 180.0)
    y0 = np.clip(np.floor((90 - (lat + dlat)) / res).astype(int), 0, h - 1)
    y1 = np.clip(np.floor((90 - (lat - dlat)) / res).astype(int), 0, h - 1)
    x0 = np.floor((lon - dlon + 180) / res).astype(int)
    x1 = np.floor((lon + dlon + 180) / res).astype(int)
    sy, sx = y1 - y0, np.clip(x1 - x0, 0, w - 1)
    ok = np.isfinite(values)
    out = np.full(h * w, -np.inf)
    for dy in range(int(sy[ok].max()) + 1 if ok.any() else 0):
        my = ok & (sy >= dy)
        for dx in range(int(sx[my].max()) + 1 if my.any() else 0):
            m = my & (sx >= dx)
            if not m.any():
                break
            idx = (y0[m] + dy) * w + (x0[m] + dx) % w
            np.maximum.at(out, idx, values[m])
    return out


def _png(rgba: np.ndarray, w: int, h: int) -> bytes:
    """Minimal RGBA PNG encoder (stdlib zlib), avoids adding an imaging dependency."""
    raw = b"".join(b"\x00" + rgba[y * w * 4:(y + 1) * w * 4].tobytes() for y in range(h))

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


@lru_cache(maxsize=16)
def similarity_png(site: str, mission_id: str) -> bytes:
    res = T1._scored(site, mission_id)
    s = res.similarity.reindex(RS.earth_screen().index).to_numpy(dtype=float)
    grid = _rasterize_max(s)
    have = np.isfinite(grid)
    rgba = np.zeros((grid.size, 4), dtype=np.uint8)
    rgba[have, :3] = _colormap(grid[have])
    a = np.clip((grid[have] - S_FADE_LO) / (S_FADE_HI - S_FADE_LO), 0, 1) ** 0.85 * ALPHA_MAX
    rgba[have, 3] = (a * 255).round().astype(np.uint8)
    return _png(rgba.reshape(-1), RASTER_W, RASTER_H)


@lru_cache(maxsize=1)
def coverage_png() -> bytes:
    grid = _rasterize_max(np.ones(len(RS.earth_screen())))
    rgba = np.zeros((grid.size, 4), dtype=np.uint8)
    rgba[np.isfinite(grid)] = COVERAGE_RGBA
    return _png(rgba.reshape(-1), RASTER_W, RASTER_H)


DECISION_MAP = {"named leader": "named_leader", "abstain: tied set": "tied_set"}


@lru_cache(maxsize=1)
def research_summary() -> list[dict]:
    """Per-EZ tier-2 research outcomes in both gate modes (from the decision tables)."""
    fp = RS.mars_footprints()
    sup = RS.mars_support()
    out = []
    for site, r in fp.iterrows():
        rec = {"site": site, "name": site.replace("_", " "), "lat": float(r.lat_c), "lon": float(r.lon_c),
               "observed_fraction": float(sup.loc[site, "observed_fraction"]) if site in sup.index else None}
        for mode, gated in (("exclude", True), ("report", False)):
            d = RS.oom_decisions(gated)
            d = d[d.site == site].sort_values("member")
            if d.empty:
                rec[mode] = {"type": "insufficient_evidence", "members": [], "leader_S": None}
                continue
            rec[mode] = {
                "type": DECISION_MAP.get(str(d.decision.iloc[0]), "insufficient_evidence"),
                "members": [str(x) for x in d.earth_window],
                "leader_S": float(d.sim_OOM_rot0.iloc[0]),
            }
        out.append(rec)
    return out


# Nominal side of every research-pool window (108 cells x 463.09 m = 50.01 km), as published by
# /api/earth/pool and repeated by the relief grids.
POOL_WINDOW_KM = 50


@lru_cache(maxsize=1)
def pool_windows() -> list[dict]:
    meta = RS.pool_meta()
    lc = RS.pool_landcover()
    out = []
    for r in meta.itertuples():
        row = lc.loc[r.name] if r.name in lc.index else None
        out.append({
            "id": r.name, "lat": float(r.lat), "lon": float(r.lon), "kind": r.kind,
            "landcover_available": bool(row.available) if row is not None and row.available == row.available else False,
            "gate_pass": bool(row.gate_pass) if row is not None else None,
            "frac_bare_like": float(row.frac_bare_like) if row is not None and row.frac_bare_like == row.frac_bare_like else None,
        })
    return out

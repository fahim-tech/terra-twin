"""Tier-1 global coarse screen: a Mars EZ fingerprint against all 249,165 Earth land cells.

Uses the research kernel unchanged (``similarity.score`` with ``TIER1_FEATURES`` and the mission
weight table, default ``min_coverage=0.6``). Verified to reproduce ``tier1_match_specificity.csv``
exactly (see tests/test_regression.py).
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
import pandas as pd

from vendor.terratwin import similarity as SIM

from ..config import TIER1_METHOD_VERSION
from . import research_store as RS
from .catalog import MISSION_BY_ID

KM_PER_DEG = 111.195
DOCUMENTED_KINDS = ("documented", "positive")


@lru_cache(maxsize=32)
def _scored(site: str, mission_id: str) -> pd.DataFrame:
    mission = MISSION_BY_ID[mission_id]
    mars = RS.mars_tier1().loc[site].to_dict()
    earth = RS.earth_screen()
    res = SIM.score(mars, earth, feature_specs=SIM.TIER1_FEATURES, weights=mission.tier1_weights)
    res["verdict"] = SIM.verdict(res)
    res["rank"] = res["similarity"].rank(ascending=False, method="min", na_option="bottom").astype(int)
    return res.sort_values("rank", kind="stable")


@lru_cache(maxsize=1)
def _known_sites() -> pd.DataFrame:
    m = RS.pool_meta()
    return m[m.kind.str.contains("|".join(DOCUMENTED_KINDS))].reset_index(drop=True)


def _near_known(lat: float, lon: float, radius_km: float = 25.0) -> str | None:
    k = _known_sites()
    dlat = np.radians(k.lat - lat)
    dlon = np.radians(k.lon - lon)
    a = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat)) * np.cos(np.radians(k.lat)) * np.sin(dlon / 2) ** 2
    d = 2 * 6371.0 * np.arcsin(np.sqrt(a))
    i = int(np.argmin(d))
    return str(k.name[i]) if d[i] <= radius_km else None


def _f(v) -> float | None:
    v = float(v)
    return None if math.isnan(v) else v


def cell_record(row: int, scored: pd.Series | None = None) -> dict:
    e = RS.earth_screen().loc[row]
    lat, lon = float(e.lat), float(e.lon)
    dlat = float(e.cell_km_ns) / 2 / KM_PER_DEG
    dlon = float(e.cell_km_ew) / 2 / (KM_PER_DEG * max(math.cos(math.radians(lat)), 1e-6))
    flags = []
    if e.frac_exact_zero > 0:
        flags.append({"code": "elevation_exact_zero", "severity": "warning" if e.frac_exact_zero >= 0.5 else "info",
                      "message": f"{100 * e.frac_exact_zero:.0f}% of GMTED pixels are exactly 0 m; may include "
                                 "sea-level water. No source water mask was applied in this table."})
    if not np.isfinite(e.hurst_2pt):
        flags.append({"code": "hurst_undefined", "severity": "info",
                      "message": "Two-point Hurst exponent undefined (zero roughness at a baseline)."})
    near = _near_known(lat, lon)
    rec = {
        "region_id": f"gmted25k:{row}", "planet": "earth", "lat": lat, "lon": lon,
        "footprint": {"kind": "approx_cell", "cell_km_ns": float(e.cell_km_ns), "cell_km_ew": float(e.cell_km_ew),
                      "bbox": [lon - dlon, lat - dlat, lon + dlon, lat + dlat]},
        "features": {k: _f(e[k]) for k in SIM.TIER1_FEATURES} | {"mean_elev_m": _f(e.mean_elev_m)},
        "baselines_m": {"short": float(e.baseline_short_m), "long": float(e.baseline_long_m)},
        "valid_data_fraction": float(e.valid_data_fraction),
        "source_id": "earth_global_screen", "quality_flags": flags,
        "known_analog": {"status": "near_documented_analog", "name": near} if near else
                        {"status": "not_in_reference_set", "name": None},
        "novelty_claim": "not_assessed",
        "place_name": None, "country": None,
    }
    if scored is not None:
        rec |= {
            "rank": int(scored["rank"]),
            "similarity": _f(scored.similarity), "coverage": float(scored.coverage),
            "n_features_used": int(scored.n_features_used), "verdict": str(scored.verdict),
            "per_feature": {k: _f(scored[f"s_{k}"]) for k in SIM.TIER1_FEATURES if f"s_{k}" in scored},
            "representation": "as_measured",
        }
    return rec


def search(site: str, mission_id: str, offset: int = 0, limit: int = 50,
           bbox: tuple[float, float, float, float] | None = None) -> dict:
    res = _scored(site, mission_id)
    s = res.similarity.to_numpy()
    lead = float(np.nanmax(s))
    view = res
    if bbox:
        e = RS.earth_screen().loc[res.index]
        w, so, ea, n = bbox
        inlon = (e.lon >= w) & (e.lon <= ea) if w <= ea else (e.lon >= w) | (e.lon <= ea)
        view = res[((e.lat >= so) & (e.lat <= n) & inlon).to_numpy()]
    page = view.iloc[offset: offset + limit]
    mission = MISSION_BY_ID[mission_id]
    e = RS.earth_screen()
    return {
        "tier": 1, "method_version": TIER1_METHOD_VERSION, "site": site, "mission": mission_id,
        "representation": "as_measured",
        "kernel": "similarity.score(log_ratio, TIER1_FEATURES), min_coverage 0.6",
        "weights": mission.tier1_weights, "weights_source": mission.tier1_weights_source, "weights_status": "hypothesis",
        "candidate_pool": {
            "scope": "global_coarse_index", "n_cells_searched": int(len(res)),
            "cell_size_km": 25, "source": "GMTED2010 30″ mean elevation, research tier-1 screen",
            "lat_range": [float(e.lat.min()), float(e.lat.max())],
            "coverage_note": "All land cells with ≥60 % valid GMTED pixels. Coarse 25 km cells can miss smaller sites; "
                             "no water mask was applied in the source table.",
        },
        "summary": {
            "leader_similarity": lead,
            "n_within_0p05_of_leader": int((s >= lead - 0.05).sum()),
            "n_strong_ge_0p75": int(np.nansum(s >= 0.75)), "n_partial_ge_0p55": int(np.nansum(s >= 0.55)),
            "n_insufficient_evidence": int((~res.evidence_ok).sum()),
            "verdict_thresholds": {"strong": 0.75, "partial": 0.55, "status": "hypothesis"},
        },
        "total": int(len(view)), "offset": offset, "limit": limit,
        "candidates": [cell_record(int(i), r) for i, r in page.iterrows()],
        "disclaimer": "Ranked candidate set at a stated footprint. The single top-ranked site is not robust to "
                      "analysis footprint, weight choice or resolution matching. Terrain similarity only.",
    }


def nearest_cell_with_distance(lat: float, lon: float) -> tuple[int, float]:
    """Great-circle nearest tier-1 cell centre (handles the antimeridian), with its distance in km."""
    e = RS.earth_screen()
    p1, p2 = np.radians(lat), np.radians(e.lat.to_numpy())
    dl = np.radians(e.lon.to_numpy() - lon)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    d = 2 * 6371.0088 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    i = int(np.argmin(d))
    return int(e.index[i]), float(d[i])


def nearest_cell(lat: float, lon: float) -> int:
    return nearest_cell_with_distance(lat, lon)[0]


def score_cell(site: str, mission_id: str, row: int) -> pd.Series:
    return _scored(site, mission_id).loc[row]

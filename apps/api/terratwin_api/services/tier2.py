"""Tier-2 Observation-Operator Matching (G2/G5) adapter.

Two sources of tier-2 results, never mixed silently:

* ``research_record`` -- the G-series real-Mars decisions for the 39 EZs over the fixed
  230-window research pool, read from the package CSVs (50 km windows, equal weights).
* ``live`` -- a GIS-provided refinement (``TERRATWIN_GIS_PROVIDER``) that runs ``obsop`` with the
  target's own MEGDR counts mask. Without it, ``operator.status = "unavailable"`` and no score is
  returned. There is no fallback to the as-measured comparison.

Earth-window descriptors *as measured* are computed live from the pool array with the research
``oom_worker.features`` (same function and constants as the experiment).
"""
from __future__ import annotations

import importlib
import math
from functools import lru_cache

import numpy as np
import pandas as pd

from vendor.terratwin import similarity as SIM

from ..config import OOM_METHOD_VERSION, settings
from . import research_store as RS
from . import tier1 as T1
from .catalog import MISSION_BY_ID

FEATS = ["mean_slope_deg", "slope_p90_deg", "relative_relief_m", "detrended_rms_m",
         "rmsdev_926m", "rmsdev_2315m", "rmsdev_9262m", "hurst_H"]
DISCLAIMERS = ["terrain_only", "synthetic_validation_only", "footprint_dependent",
               "no_gravity_atmosphere_radiation", "fixed_230_window_research_pool"]
OPERATOR_META = {
    "version": OOM_METHOD_VERSION,
    "mask": "MEGDR 128 ppd counts > 0 (target-specific)",
    "interpolator": "linear (Delaunay), nearest outside hull",
    "half_pixel_blend": True,
    "registration": "+0.5 native column (measured on 39/39 EZs; not yet confirmed by USGS metadata)",
    "surrogate": True,
    "selection_stats": {"rho_ns_mars": 0.863, "kap_ew_mars": 0.625, "paired_error": 0.097,
                        "source": "G2 §4.1 / oom_fidelity_selection.csv"},
}
DECISION_MAP = {"named leader": "named_leader", "abstain: tied set": "tied_set"}
LABEL_LEADER = "Leader is stable under all four orientations of the Earth window relative to MOLA tracks"
LABEL_TIED = ("Tied: the leader is not determined by the MOLA observation geometry. "
              "These candidates are equivalent at this resolution")


def _f(v) -> float | None:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) else v


@lru_cache(maxsize=None)
def window_features_as_measured(name: str) -> dict[str, float | None]:
    """The 8 tier-2 descriptors of a pool window, Earth as measured (no operator applied)."""
    from vendor.terratwin import oom_worker  # imports obsop -> pyproj/scipy; lazy

    meta = RS.pool_meta()
    idx = int(meta.index[meta.name == name][0])
    vals = oom_worker.features(np.asarray(RS.pool_windows()[idx], dtype=float))
    return {k: _f(v) for k, v in zip(oom_worker.FEATS, vals)}


def _landcover(name: str, gate_mode: str) -> dict:
    lc = RS.pool_landcover()
    if name not in lc.index:
        return {"available": False, "gate": "unknown" if gate_mode == "report" else "fail"}
    r = lc.loc[name]
    avail = bool(r.available) if pd.notna(r.available) else False
    if gate_mode == "report":
        gate = "reported" if avail else "unknown"
    else:
        gate = "pass" if bool(r.gate_pass) else "fail"
    return {"available": avail, "frac_bare_like": _f(r.frac_bare_like), "frac_vegetated": _f(r.frac_vegetated),
            "frac_water": _f(r.frac_water), "gate": gate, "reason": str(r.gate_reason),
            "source": "ESA WorldCover 10 m 2021 v200, 50 km window, 100 m subsample"}


def _tier1_context(site: str, mission_id: str, lat: float, lon: float) -> dict:
    """Same-operator tier-1 comparison of the Mars EZ and the Earth 25 km cell under the window centre."""
    row = T1.nearest_cell(lat, lon)
    s = T1.score_cell(site, mission_id, row)
    cell = T1.cell_record(row, s)
    mars = RS.mars_tier1().loc[site]
    return {"region_id": cell["region_id"], "cell_lat": cell["lat"], "cell_lon": cell["lon"],
            "similarity": cell["similarity"], "coverage": cell["coverage"], "representation": "as_measured",
            "rows": [{"key": k, "unit": SIM.TIER1_FEATURES[k]["unit"], "mars": _f(mars[k]),
                      "earth": cell["features"][k], "s": cell["per_feature"].get(k)} for k in SIM.TIER1_FEATURES]}


def research_record(site: str, mission_id: str) -> dict:
    mission = MISSION_BY_ID[mission_id]
    gate_mode = mission.gate_mode or "report"
    gated = gate_mode == "exclude"
    dec = RS.oom_decisions(gated)
    d = dec[dec.site == site].sort_values("member")
    per = RS.oom_per_ez().loc[site]
    reg = RS.mars_registration()
    meta = RS.pool_meta().set_index("name")
    fp = RS.mars_footprints().loc[site]
    dtype = DECISION_MAP.get(str(d.decision.iloc[0]), "insufficient_evidence") if len(d) else "insufficient_evidence"
    baseline_leader = str(d.baseline_leader.iloc[0]) if "baseline_leader" in d else str(d.baseline_gated_leader.iloc[0])
    baseline_sim = _f(d.baseline_leader_sim.iloc[0]) if "baseline_leader_sim" in d else _f(d.baseline_gated_leader_sim.iloc[0])
    candidates = []
    for _, r in d.iterrows():
        name = str(r.earth_window)
        em = window_features_as_measured(name)
        cov = sum(v is not None for v in em.values()) / len(FEATS)
        kind = str(meta.loc[name, "kind"]) if name in meta.index else "unknown"
        candidates.append({
            "id": name, "lat": float(r.earth_lat), "lon": float(r.earth_lon), "kind": kind,
            "window_km": 50,
            "S": float(r.sim_OOM_rot0), "S_basis": "rotation 0°, equal weights, research record",
            "S_range_over_rotations": None,
            "S_range_note": "Per-rotation scores are not in the published research tables, so no range over orientations is shown.",
            "coverage": cov, "coverage_basis": "fraction of the 8 descriptors finite for this Earth window",
            "verdict": "strong candidate analog" if r.sim_OOM_rot0 >= 0.75 else
                       "partial analog" if r.sim_OOM_rot0 >= 0.55 else "no convincing analog",
            "verdict_thresholds_status": "hypothesis",
            "features": {"mars": None, "earth_as_mola_would_see": None, "earth_as_measured": em,
                         "mars_reason": "Mars 50 km window descriptors are not in the published research tables; they are not shown for research records.",
                         "earth_oom_reason": "Operator output arrays are not part of the published research record, so they are not shown here."},
            "landcover": _landcover(name, gate_mode),
            "as_measured_comparison": {"leader": baseline_leader, "leader_S": baseline_sim,
                                       "this_is_leader": name == baseline_leader},
            "tier1_context": _tier1_context(site, mission_id, float(r.earth_lat), float(r.earth_lon)),
            "known_analog": {"status": "documented" if any(t in kind for t in ("documented", "positive")) else
                             "control" if "control" in kind else "not_in_reference_set"},
            "novelty_claim": "not_assessed",
        })
    bl_row = meta.loc[baseline_leader] if baseline_leader in meta.index else None
    bl_feats = window_features_as_measured(baseline_leader) if bl_row is not None else {}
    bl_cov = sum(v is not None for v in bl_feats.values()) / len(FEATS) if bl_feats else None
    return {
        "tier": 2, "source": "research_record",
        "target": {"site": site, "lat": float(fp.lat_c), "lon": float(fp.lon_c), "window_km": 50,
                   "observed_fraction_native": _f(reg.loc[site, "obs_frac_native"]) if site in reg.index else None},
        "representation": "mars_observation_space",
        "operator": {"status": "ok", "provenance": "research_package_precomputed"} | OPERATOR_META,
        "landcover_gate": {"mode": gate_mode, "bare_min": 0.5, "veg_max": 0.2, "status": "hypothesis",
                           "applied": "before ranking" if gated else "reported only, never excludes"},
        "decision": {"type": dtype, "members": [c["id"] for c in candidates], "rotations_checked": 4,
                     "label": LABEL_LEADER if dtype == "named_leader" else LABEL_TIED if dtype == "tied_set" else None},
        "candidates": candidates,
        "as_measured_baseline": {"representation": "as_measured", "leader": baseline_leader, "S": baseline_sim if bl_cov is not None else None,
                                 "coverage": bl_cov, "lat": _f(bl_row.lat) if bl_row is not None else None,
                                 "lon": _f(bl_row.lon) if bl_row is not None else None,
                                 "label": "Uncorrected comparator (Earth as measured). Not a fallback."},
        "diagnostics": {
            "spearman_baseline_vs_oom": _f(per.spearman_M0_OOM), "top10_overlap_baseline_vs_oom": int(per.top10_overlap_M0_OOM),
            "leader_changed_vs_baseline": bool(per.leader_changed_M0_OOM),
            "footprint_leader_same_50_vs_25km": bool(per.footprint_leader_same_OOM),
            "footprint_spearman_50_vs_25km": _f(per.footprint_spearman_OOM),
            "note": "Ungated diagnostics from oom_real_mars_per_ez.csv; leaders change between 50 km and 25 km windows.",
            # The diagnostics describe the terrain-only ranking of all pool windows, before any land-cover
            # exclusion; they are not statements about a gated record's leader or about a tied set.
            "scope": "ungated",
            "basis": "terrain-only research ranking of all pool windows, before any land-cover exclusion",
        },
        "candidate_pool": {"scope": "fixed_research_pool", "n_windows": 230, "n_random_stratified": 213,
                           "n_named_controls": 17, "window_km": 50,
                           "n_ranked": _n_ranked(gated),
                           "ranked_basis": ("windows passing the land-cover gate (bare-like ≥ 0.50, vegetated ≤ 0.20; "
                                            "working assumptions)") if gated else "all pool windows (land cover reported, not used)",
                           "note": "Stratified research sample. Demonstrates the method; not a worldwide high-resolution search."},
        "weights": "equal (mission-neutral) — mission affects only the land-cover gate mode at tier 2",
        "method_version": OOM_METHOD_VERSION,
        "validation_status": "synthetic_twins_only",
        "disclaimers": DISCLAIMERS,
        "live_refinement": live_status(),
    }


def _n_ranked(gated: bool) -> int:
    lc = RS.pool_landcover()
    return int(lc.gate_pass.fillna(False).astype(bool).sum()) if gated else int(len(RS.pool_meta()))


def live_status() -> dict:
    missing = []
    if not settings.megdr_counts_dir or not settings.megdr_counts_dir.is_dir():
        missing.append("MEGDR 128 ppd counts tiles (TERRATWIN_MEGDR_COUNTS_DIR)")
    if not settings.mola_mosaic or not settings.mola_mosaic.is_file():
        missing.append("USGS MOLA 463 m mosaic (TERRATWIN_MOLA_MOSAIC)")
    if not settings.gis_provider:
        missing.append("GIS refinement provider (TERRATWIN_GIS_PROVIDER)")
    return {"status": "available" if not missing else "unavailable", "missing_inputs": missing, "owner": "GIS workstream"}


def _unavailable(lat, lon, window_km, reason, missing, representation="mars_observation_space", site=None) -> dict:
    return {
        "tier": 2, "source": "none",
        "target": {"site": site, "lat": lat, "lon": lon, "window_km": window_km, "observed_fraction_native": None},
        "representation": representation,
        "operator": {"status": "unavailable", "reason": reason, "missing_inputs": missing} | {"version": OOM_METHOD_VERSION},
        "landcover_gate": None,
        "decision": {"type": "insufficient_evidence", "members": [], "rotations_checked": 0, "label": reason},
        "candidates": [],
        "as_measured_baseline": None,
        "candidate_pool": None,
        "method_version": OOM_METHOD_VERSION,
        "validation_status": "synthetic_twins_only",
        "disclaimers": DISCLAIMERS,
        "live_refinement": live_status(),
    }


def compare(*, lat: float, lon: float, mission_id: str, window_km: int, representation: str,
            site: str | None = None) -> dict:
    """G5 ``POST /v1/compare`` semantics."""
    from .mars import containing_site

    site = site or containing_site(lat, lon)
    if window_km != 50:
        return _unavailable(lat, lon, window_km, "No 25 km tier-2 research record is published; live refinement "
                            "at 25 km needs the GIS service. Scores are not comparable across window sizes.",
                            ["25 km OOM refinement"], representation, site)
    if site is None:
        st = live_status()
        if st["status"] == "available":
            mod, fn = settings.gis_provider.split(":")
            return getattr(importlib.import_module(mod), fn)(lat=lat, lon=lon, mission=mission_id,
                                                             window_km=window_km, representation=representation)
        return _unavailable(lat, lon, window_km, "Target-specific MOLA observation operator unavailable at this "
                            "coordinate (outside the research EZs and no counts tiles connected). No comparison is made.",
                            st["missing_inputs"], representation)
    rec = research_record(site, mission_id)
    if representation == "as_measured":
        b = rec["as_measured_baseline"]
        em = window_features_as_measured(b["leader"])
        rec = {**rec, "representation": "as_measured",
               "decision": {"type": "insufficient_evidence", "members": [], "rotations_checked": 0,
                            "label": "As-measured view is a comparator only; no decision is made in this representation."},
               "candidates": [{"id": b["leader"], "lat": b["lat"], "lon": b["lon"], "S": b["S"],
                               "coverage": sum(v is not None for v in em.values()) / len(FEATS),
                               "coverage_basis": "fraction of the 8 descriptors finite for this Earth window",
                               "features": {"earth_as_measured": em},
                               "window_km": 50, "label": "uncorrected (Earth as measured)"}]}
    return rec

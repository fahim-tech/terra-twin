"""Scientific evidence: method description, synthetic benchmark, falsification and controls.

All numbers are read from the research package tables; nothing is recomputed or rounded into
new claims. Every block carries its validation status.
"""
from __future__ import annotations

from . import research_store as RS

LIMITATIONS = [
    {"code": "synthetic_validation_only", "text": "Benefit shown on synthetic terrain twins (exact-twin recovery 0.30 → 0.97). Not validated against field data or expert review."},
    {"code": "operator_is_surrogate", "text": "The MEGDR gridding algorithm is undocumented. If the true chain were cubic, OOM would rank twins worse than no correction (MRR 0.539 vs 0.652)."},
    {"code": "terrain_only", "text": "Similarity is terrain geometry only — not geology, formation process, habitability, gravity, atmosphere or radiation."},
    {"code": "footprint_dependent", "text": "Rankings depend on the analysis window (50 km vs 25 km); compare only within one window size. The leader changed between window sizes at every one of the 39 EZs."},
    {"code": "small_pool", "text": "Tier-2 results use a 230-window stratified Earth sample. Named leaders demonstrate the method; they are not global recommendations."},
    {"code": "assumed_thresholds", "text": "Similarity verdict thresholds (0.75 / 0.55) and land-cover thresholds (bare ≥ 0.50, vegetated ≤ 0.20) are working assumptions."},
    {"code": "binary_bins", "text": "A bin with one laser shot counts as fully observed; shot positions, footprint size and ranging noise are not modelled."},
    {"code": "earth_dem_is_observation", "text": "Copernicus GLO-90 is a radar surface model including vegetation and buildings, not bare-earth truth."},
    {"code": "no_planetary_environment", "text": "Earth reproduces none of Mars' gravity, atmospheric pressure, composition or radiation environment."},
    {"code": "positive_control_miss", "text": "The verified volcanic analog Holuhraun (Iceland) is not recovered for Elysium Planitia (Cerberus) at 50 km; Mauna Kea ranks last there."},
]

OPERATOR_NOTE = ("Mars elevations are a binned-altimetry grid: about 31% of 463 m cells contain a laser return; the rest "
                 "are interpolated. Earth candidates are passed through the same sampling and interpolation before comparison")


def method_evidence() -> dict:
    k = RS.key_numbers("oom_key_numbers.json")
    g = RS.key_numbers("oom_gated_key_numbers.json")
    mrr = RS.table("oom_twin_mrr_ci.csv").to_dict(orient="records")
    mis = RS.table("oom_misspecification_matrix.csv").to_dict(orient="records")
    fid = RS.table("oom_fidelity_selection.csv").to_dict(orient="records")
    r = RS.table("oom_robustness.csv")
    rob = r.astype(object).where(r.notna(), None).to_dict(orient="records")
    ctrl = RS.table("oom_controls.csv")
    sup = RS.mars_support().reset_index()[["site", "observed_fraction"]].to_dict(orient="records")
    return {
        "method": {
            "name": "Observation-Operator Matching (OOM)", "version": "oom-1.0", "tier": 2,
            "summary": "Each shortlisted Earth window is passed through the selected Mars site's own MOLA sampling, "
                       "interpolation and registration chain, then compared on 8 terrain descriptors with an unchanged "
                       "log-ratio kernel. A leader is named only if it is identical under all four window orientations.",
            "operator_note": OPERATOR_NOTE,
            "chain": ["S — sampling: MEGDR bins with ≥1 shot", "I — linear Delaunay interpolation of empty bins",
                      "B — half-pixel column blend (measured)", "W — bilinear warp to 463 m AEQD window"],
            "features": ["mean_slope_deg", "slope_p90_deg", "relative_relief_m", "detrended_rms_m", "rmsdev_926m",
                         "rmsdev_2315m", "rmsdev_9262m", "hurst_H"],
        },
        "synthetic_benchmark": {
            "validation_status": "synthetic",
            "label": "Synthetic terrain twins (213 Earth windows, each degraded through a different EZ's chain)",
            "mrr_ci": mrr, "twin": k["twin"],
            "abstention": k["abstention_twin"],
        },
        "falsification": {
            "label": "Wrong observation operator (rows = true chain used to make twins, columns = operator assumed)",
            "misspecification_mrr": mis,
            "headline": "True chain cubic → OOM primary MRR 0.539 < uncorrected baseline 0.652",
        },
        "interpolator_selection": {"label": "Selected from Mars-observable statistics only (no leakage into the benchmark)",
                                   "mars_medians": {"rho_ns": 0.863, "kap_ew": 0.625}, "rows": fid},
        "robustness": rob,
        "hurst_bias": k["hurst"], "descriptor_bias_T0": k["T0"],
        "real_mars": {"ungated": k["real_mars"], "gated": g,
                      "label": "Real MOLA targets × fixed 230-window Earth pool. No ground truth exists for these rankings."},
        "controls": {"summary": k["controls"], "rows": ctrl.to_dict(orient="records")},
        "observation_support": {"label": "Fraction of native MEGDR bins with ≥1 laser shot (EZ footprint)", "rows": sup},
        "retired": {"q_weights": "Observed-fraction confidence weights (D4 Exp. 9) were retired: twin ΔMRR +0.003 (CI −0.004..0.009).",
                    "values": k["q_weights"]},
        "limitations": LIMITATIONS,
        "coverage": {
            "tier1": {"n_cells": 249_165, "cell_km": 25, "source": "GMTED2010 30″", "scope": "global land, coarse"},
            "tier2": {"n_windows": 230, "window_km": 50, "source": "Copernicus GLO-90", "scope": "fixed research sample"},
            "mars": {"n_targets": 39, "scope": "NASA human-landing Exploration Zones"},
        },
        "novelty": {"wording": "We did not find observation-operator matching applied to Mars–Earth analog search in our "
                               "literature search.", "status": "literature search, not proof of priority",
                    "site_novelty": "No candidate site is claimed to be previously unrecognized; such a claim requires literature verification."},
    }

"""
TerraTwin similarity scoring.

Separation of concerns that the brief insists on and that this module enforces structurally:
  * SIMILARITY (is this Earth place like that Mars place?) is computed here.
  * MARS SUITABILITY (could you land/build there?) is NOT computed here. A Mars site can be a
    fine scientific analog target and a terrible landing site; mixing the two produces a number
    that answers neither question.
  * COVERAGE (how much of the required evidence actually exists?) is returned ALONGSIDE the
    score and is never folded into it. A candidate matching 2 of 6 required features scores
    high on those 2 and must still be reported as poorly evidenced.

Feature transforms. Slope, relief and roughness are strictly positive and heavy-tailed, so a
fixed absolute tolerance ("within 2 m of roughness") means something different at 10 m and at
1000 m. Those features are compared as RATIOS. Bounded dimensionless features (the Hurst
exponent) are compared as absolute differences, because a ratio of exponents is not meaningful.
Every tolerance is floored at the measurement uncertainty estimated empirically in Experiment 1:
a difference the instruments cannot resolve must score as agreement, not as a fine distinction.
"""
from __future__ import annotations
import numpy as np, pandas as pd

# --- feature registry -------------------------------------------------------
# tol: 'log' features -> acceptable FRACTIONAL difference; 'linear' -> absolute, in the unit.
# All tolerances are HYPOTHESES until Experiment 1 supplies the resolution-induced floor.
FEATURES = {
    "mean_slope_deg":      dict(transform="log",    tol=0.30, unit="deg",  floor=0.062),
    "slope_p90_deg":       dict(transform="log",    tol=0.30, unit="deg",  floor=0.062),
    "relative_relief_m":   dict(transform="log",    tol=0.40, unit="m",    floor=1.0),
    "detrended_rms_m":     dict(transform="log",    tol=0.35, unit="m",    floor=0.5),
    "rmsdev_2315m":        dict(transform="log",    tol=0.35, unit="m",    floor=1.0),
    "rmsdev_9262m":        dict(transform="log",    tol=0.35, unit="m",    floor=1.0),
    "hurst_H":             dict(transform="linear", tol=0.08, unit="-"),
}

# Tier-1 (global screen) registry: the descriptors that BOTH planets carry at ~25 km cells.
TIER1_FEATURES = {
    "mean_slope_deg":      dict(transform="log",    tol=0.30, unit="deg",  floor=0.062),
    "slope_p90_deg":       dict(transform="log",    tol=0.30, unit="deg",  floor=0.062),
    "relative_relief_m":   dict(transform="log",    tol=0.40, unit="m",    floor=1.0),
    "elev_std_m":          dict(transform="log",    tol=0.35, unit="m",    floor=0.5),
    "rmsdev_short":        dict(transform="log",    tol=0.35, unit="m",    floor=1.0),
    "rmsdev_long":         dict(transform="log",    tol=0.35, unit="m",    floor=1.0),
    "hurst_2pt":           dict(transform="linear", tol=0.08, unit="-"),
}

TIER1_MISSION_WEIGHTS = {
    "landing_engineering":    {"mean_slope_deg":1.0,"slope_p90_deg":1.5,"relative_relief_m":0.8,
                               "elev_std_m":1.2,"rmsdev_short":1.0,"rmsdev_long":0.4,"hurst_2pt":0.3},
    "permanent_base":         {"mean_slope_deg":1.2,"slope_p90_deg":1.0,"relative_relief_m":1.0,
                               "elev_std_m":1.0,"rmsdev_short":0.8,"rmsdev_long":0.8,"hurst_2pt":0.5},
    "rover_mobility":         {"mean_slope_deg":1.0,"slope_p90_deg":1.5,"relative_relief_m":0.5,
                               "elev_std_m":1.5,"rmsdev_short":1.2,"rmsdev_long":0.3,"hurst_2pt":0.5},
    "geological_exploration": {"mean_slope_deg":0.8,"slope_p90_deg":0.8,"relative_relief_m":1.0,
                               "elev_std_m":1.0,"rmsdev_short":1.0,"rmsdev_long":1.0,"hurst_2pt":1.5},
}

# Mission weight profiles. These are HYPOTHESES pending the literature track; they encode
# which descriptors a given activity actually cares about, not measured importances.
MISSION_WEIGHTS = {
    "landing_engineering":    {"mean_slope_deg":1.0, "slope_p90_deg":1.5, "relative_relief_m":0.8,
                               "detrended_rms_m":1.2, "rmsdev_2315m":1.0, "rmsdev_9262m":0.4,
                               "hurst_H":0.3},
    "permanent_base":         {"mean_slope_deg":1.2, "slope_p90_deg":1.0, "relative_relief_m":1.0,
                               "detrended_rms_m":1.0, "rmsdev_2315m":0.8, "rmsdev_9262m":0.8,
                               "hurst_H":0.5},
    "rover_mobility":         {"mean_slope_deg":1.0, "slope_p90_deg":1.5, "relative_relief_m":0.5,
                               "detrended_rms_m":1.5, "rmsdev_2315m":1.2, "rmsdev_9262m":0.3,
                               "hurst_H":0.5},
    "geological_exploration": {"mean_slope_deg":0.8, "slope_p90_deg":0.8, "relative_relief_m":1.0,
                               "detrended_rms_m":1.0, "rmsdev_2315m":1.0, "rmsdev_9262m":1.0,
                               "hurst_H":1.5},
}

# Evidence reliability q_i in [0,1]: measured > derived > modelled > proxy.
DEFAULT_QUALITY = {k: 1.0 for k in FEATURES}


def _per_feature_similarity(m, e, spec, method, pop_scale=None):
    """s in [0,1] for one feature. m scalar (Mars), e array (Earth candidates).

    Values are floored at the measurement resolution before any ratio is taken. Both source
    DEMs (MOLA MEGDR-derived mosaic, GMTED2010) store elevation as INTEGER METRES, so the
    vertical quantum is 1 m; over a ~926 m baseline that is a slope of 0.062 deg. A ratio
    taken between two numbers below that floor is an artefact of quantisation, and an exactly
    flat cell would otherwise produce log(0) and be silently dropped from coverage.
    """
    e = np.asarray(e, dtype="float64")
    fl = spec.get("floor")
    if fl is not None:
        e = np.where(np.isfinite(e), np.maximum(e, fl), e)
        m = max(m, fl) if np.isfinite(m) else m
    ok = np.isfinite(e) & np.isfinite(m)
    s = np.full(e.shape, np.nan)
    if not ok.any():
        return s
    tol = spec["tol"]
    if method == "log_ratio":
        if spec["transform"] == "log":
            good = ok & (e > 0) & (m > 0)
            d = np.abs(np.log(e[good]) - np.log(m))
            s[good] = np.exp(-d / np.log1p(tol))
        else:
            s[ok] = np.exp(-np.abs(e[ok] - m) / tol)
    elif method == "linear_exp":                      # the formulation in the brief
        scale = tol*abs(m) if spec["transform"] == "log" else tol
        scale = scale if scale > 0 else np.nan
        s[ok] = np.exp(-np.abs(e[ok] - m) / scale)
    elif method == "std_euclid":                      # standardized difference -> kernel
        sc = pop_scale if (pop_scale and np.isfinite(pop_scale) and pop_scale > 0) else np.nan
        s[ok] = np.exp(-((e[ok] - m)/sc)**2 / 2.0)
    elif method == "robust_manhattan":                # MAD-standardized absolute difference
        sc = pop_scale if (pop_scale and np.isfinite(pop_scale) and pop_scale > 0) else np.nan
        s[ok] = np.exp(-np.abs(e[ok] - m)/sc)
    else:
        raise ValueError(f"unknown method {method!r}")
    return s


def population_scales(earth: pd.DataFrame, features):
    """Robust spread of each feature over the candidate population (1.4826 * MAD)."""
    out = {}
    for f in features:
        if f not in earth:
            out[f] = np.nan; continue
        v = earth[f].to_numpy(dtype="float64")
        v = v[np.isfinite(v)]
        out[f] = float(1.4826*np.median(np.abs(v - np.median(v)))) if v.size else np.nan
    return out


def score(mars: dict, earth: pd.DataFrame, mission="permanent_base", method="log_ratio",
          quality=None, feature_specs=None, min_coverage=0.6, pop_scales=None,
          weights=None, weight_table=None):
    """Score every row of `earth` against the Mars fingerprint `mars`.

    Returns a DataFrame with per-feature similarities, the aggregate score, coverage, and a
    boolean `evidence_ok`. Rows failing the coverage gate keep their score for inspection but
    are flagged -- the caller must not present them as analogs.
    """
    specs = feature_specs or FEATURES
    w_all = weights or (weight_table or MISSION_WEIGHTS)[mission]
    q = {**DEFAULT_QUALITY, **(quality or {})}
    feats = [f for f in specs if f in w_all]
    if method in ("std_euclid", "robust_manhattan") and pop_scales is None:
        pop_scales = population_scales(earth, feats)

    res = pd.DataFrame(index=earth.index)
    num = np.zeros(len(earth)); den = np.zeros(len(earth))
    cov_num = np.zeros(len(earth)); cov_den = 0.0
    for f in feats:
        w, spec = w_all[f], specs[f]
        cov_den += w
        if f not in earth or f not in mars or not np.isfinite(mars.get(f, np.nan)):
            res[f"s_{f}"] = np.nan
            continue
        s = _per_feature_similarity(mars[f], earth[f].to_numpy(dtype="float64"), spec, method,
                                    (pop_scales or {}).get(f))
        res[f"s_{f}"] = s
        valid = np.isfinite(s)
        wq = w*q.get(f, 1.0)
        num += np.where(valid, wq*np.nan_to_num(s), 0.0)
        den += np.where(valid, wq, 0.0)
        cov_num += np.where(valid, w, 0.0)

    with np.errstate(invalid="ignore", divide="ignore"):
        res["similarity"] = np.where(den > 0, num/den, np.nan)
        res["coverage"]   = cov_num/cov_den if cov_den > 0 else np.nan
    res["n_features_used"] = np.isfinite(res[[f"s_{f}" for f in feats]].to_numpy()).sum(axis=1)
    res["evidence_ok"] = res["coverage"] >= min_coverage
    res["mission"] = mission
    res["method"]  = method
    return res


def verdict(res: pd.DataFrame, strong=0.75, weak=0.55):
    """Label each candidate. The method MUST be able to say 'no convincing analog'."""
    s, ok = res["similarity"], res["evidence_ok"]
    out = pd.Series("no convincing analog", index=res.index, dtype=object)
    out[(s >= weak)  & ok] = "partial analog"
    out[(s >= strong) & ok] = "strong candidate analog"
    out[~ok] = "insufficient evidence"
    return out

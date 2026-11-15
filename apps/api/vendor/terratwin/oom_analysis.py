"""Pre-specified analysis for the observation-operator-matching (OOM) experiments.

Everything that could be tuned is fixed here BEFORE results are inspected:
  features   : the 8 tier-2 descriptors in oom_worker.FEATS
  similarity : log-ratio kernel, registry tolerances/floors (rmsdev_926m added with tol 0.35, floor 1 m)
  weights    : equal (mission-neutral) for the primary analysis
  twin design: target i = window i through EZ a(i) = i mod 39; OOM candidates through EZ b(i) = (a(i)+7) mod 39
"""
from __future__ import annotations
import numpy as np, pandas as pd
from scipy.stats import wilcoxon, spearmanr
from . import similarity as SIM

FEATS = ["mean_slope_deg", "slope_p90_deg", "relative_relief_m", "detrended_rms_m",
         "rmsdev_926m", "rmsdev_2315m", "rmsdev_9262m", "hurst_H"]
SPECS = {k: v for k, v in SIM.FEATURES.items() if k in FEATS}
SPECS["rmsdev_926m"] = dict(transform="log", tol=0.35, unit="m", floor=1.0)
EQUAL_W = {k: 1.0 for k in FEATS}


def sim_matrix(target_vec, cand_mat, weights=None, method="log_ratio", pop_scales=None):
    m = dict(zip(FEATS, target_vec)); E = pd.DataFrame(cand_mat, columns=FEATS)
    r = SIM.score(m, E, method=method, weights=weights or EQUAL_W, feature_specs=SPECS,
                  min_coverage=0.0, pop_scales=pop_scales)
    return r["similarity"].to_numpy()


def rank_of(sims, idx):
    """1-based rank of candidate idx (ties share the mean rank; NaN similarity ranks last)."""
    s = np.where(np.isfinite(sims), sims, -np.inf)
    better = np.sum(s > s[idx]); ties = np.sum(s == s[idx]) - 1
    return 1 + better + ties / 2.0


def summarise(ranks):
    r = np.asarray(ranks, float)
    return dict(MRR=float(np.mean(1 / r)), top1=float(np.mean(r <= 1)), top5=float(np.mean(r <= 5)),
                top10=float(np.mean(r <= 10)), median_rank=float(np.median(r)))


def paired(r_base, r_new, n_boot=2000, seed=0):
    rb, rn = 1 / np.asarray(r_base, float), 1 / np.asarray(r_new, float)
    rng = np.random.default_rng(seed); n = len(rb); d = rn - rb
    boots = [d[rng.integers(0, n, n)].mean() for _ in range(n_boot)]
    t5 = (np.asarray(r_new) <= 5).astype(float) - (np.asarray(r_base) <= 5).astype(float)
    boots5 = [t5[rng.integers(0, n, n)].mean() for _ in range(n_boot)]
    try:
        p = float(wilcoxon(rn, rb, zero_method="wilcox").pvalue)
    except ValueError:
        p = float("nan")
    return dict(dMRR=float(d.mean()), dMRR_lo=float(np.percentile(boots, 2.5)), dMRR_hi=float(np.percentile(boots, 97.5)),
                dTop5=float(t5.mean()), dTop5_lo=float(np.percentile(boots5, 2.5)), dTop5_hi=float(np.percentile(boots5, 97.5)),
                wilcoxon_p=p, n_improved=int((np.asarray(r_new) < np.asarray(r_base)).sum()),
                n_worse=int((np.asarray(r_new) > np.asarray(r_base)).sum()))

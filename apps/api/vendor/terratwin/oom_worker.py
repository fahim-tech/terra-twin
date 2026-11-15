"""Process-pool worker for observation-operator matching experiments (picklable, no pyproj state)."""
from __future__ import annotations
import numpy as np
from scipy.ndimage import map_coordinates
from .obsop import interpolate_native
from . import terrain as T

PIX = 463.0935415503709
BASELINES = (926.19, 2315.47, 9261.87)
FEATS = ["mean_slope_deg", "slope_p90_deg", "relative_relief_m", "detrended_rms_m",
         "rmsdev_926m", "rmsdev_2315m", "rmsdev_9262m", "hurst_H"]
_POOL = None


def geom_to_dict(g):
    return dict(nat_in_aeqd=g.nat_in_aeqd, aeqd_in_nat=g.aeqd_in_nat, observed=g.observed_native,
                shape=g.observed_native.shape, n=g.n)


def _transplant(z, gd):
    ok = np.isfinite(z)
    v = map_coordinates(np.where(ok, z, 0.0), gd["nat_in_aeqd"], order=1, mode="constant", cval=np.nan)
    w = map_coordinates(ok.astype(float), gd["nat_in_aeqd"], order=1, mode="constant", cval=0.0)
    v[w < 0.999] = np.nan
    return v


def _warp(zn, gd):
    ok = np.isfinite(zn)
    v = map_coordinates(np.where(ok, zn, 0.0), gd["aeqd_in_nat"], order=1, mode="nearest")
    w = map_coordinates(ok.astype(float), gd["aeqd_in_nat"], order=1, mode="nearest")
    v[w < 0.999] = np.nan
    return v


def apply_dict(z, gd, method="linear", halfshift=True, observed=None):
    nat = _transplant(np.asarray(z, float), gd)
    obs = (gd["observed"] if observed is None else observed) & np.isfinite(nat)
    f = interpolate_native(nat, obs, method)
    f[~np.isfinite(nat)] = np.nan
    if halfshift:
        b = f.copy(); b[:, :-1] = 0.5 * (f[:, :-1] + f[:, 1:]); f = b
    return _warp(f, gd)


def features(z, crop=None):
    z = np.asarray(z, float)
    if crop:
        n = z.shape[0]; c0 = (n - crop) // 2; z = z[c0:c0 + crop, c0:c0 + crop]
    f = T.terrain_features(z, PIX, baselines_m=BASELINES, slope_baseline_m=926.19)
    return [f.get(k, np.nan) for k in FEATS]


def _init(pool_path):
    global _POOL
    _POOL = np.load(pool_path, mmap_mode="r")


def run_ez(args):
    """All pool windows through one EZ's observation operator. Returns (key, features[, arrays])."""
    key, gd, method, halfshift, mask_mode, seed, keep_arrays, crops = args
    obs = None
    if mask_mode == "random":          # same observed fraction, track geometry destroyed
        rng = np.random.default_rng(seed)
        obs = rng.random(gd["shape"]) < gd["observed"].mean()
    feats, arrs, crop_feats = [], [], {c: [] for c in (crops or [])}
    for i in range(_POOL.shape[0]):
        h = apply_dict(_POOL[i], gd, method, halfshift, obs)
        feats.append(features(h))
        for c in crop_feats:
            crop_feats[c].append(features(h, crop=c))
        if keep_arrays:
            arrs.append(h.astype("float32"))
    return key, np.array(feats), (np.stack(arrs) if keep_arrays else None), {c: np.array(v) for c, v in crop_feats.items()}


def run_ez_rot(args):
    """Registration realisations: every pool window rotated by k*90 deg, then the target EZ's
    own (primary) observation operator. Orientation of an Earth window relative to the
    N-S MOLA track pattern is arbitrary, so each k is an equally valid observation of the
    same candidate; the (isotropic) truth features are unchanged by the rotation."""
    key, gd, k = args
    feats = [features(apply_dict(np.rot90(np.asarray(_POOL[i], float), k), gd, "linear", True))
             for i in range(_POOL.shape[0])]
    return key, np.array(feats)

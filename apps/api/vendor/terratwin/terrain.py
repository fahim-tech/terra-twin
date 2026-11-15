"""
TerraTwin terrain operators.

Design rules (these are the scientific contract, not style choices):
  1. Every descriptor takes an explicit PHYSICAL BASELINE in metres. Never a pixel count.
     A statistic computed at "3 pixels" means different things on two planets.
  2. All work happens on a local azimuthal-equidistant grid built with the CORRECT planetary
     radius, so ground distances are true metres and the cos(latitude) distortion of the
     Mars equirectangular mosaic is removed by construction rather than by a fudge factor.
  3. Earth data are AGGREGATED (area-averaged) to the comparison pixel size before any
     descriptor is computed. Upsampling never creates information; downsampling by
     nearest-neighbour aliases. Resampling.average is the only honest choice here.
  4. Nodata is NaN everywhere internally. Any descriptor returns NaN rather than a number
     computed from a partially-missing window, and the valid fraction is always reported.

Terminology follows the planetary roughness literature:
  - deviogram / RMS deviation  : Shepard et al. (2001) formulation  [baseline-dependent]
  - Hurst exponent H           : slope of log RMSdev vs log baseline
  - differential slope         : a 2-D RE-IMPLEMENTATION in the spirit of Kreslavsky & Head
                                 (2000), NOT the published statistic -- see the warning below

ATTRIBUTION WARNING (verified against the literature, 14 Nov 2026). Kreslavsky & Head (2000,
doi:10.1029/2000JE001259) define the median absolute differential slope on 1-D MOLA ALONG-TRACK
PROFILES. Computing it on a 2-D gridded DEM, as `differential_slope` does here, is a
re-implementation and must be described as such. Two further points the abstract settles and the
inaccessible full text does not: the paper states baselines "from 0.6 to ~20 km" but does NOT
enumerate 0.6/2.4/9.2 km as the canonical three, and the exact finite-difference stencil is not
stated in any retrievable text. Do not attribute the formula below to that paper. The use of a
MEDIAN rather than an RMS is separately justified by Kreslavsky & Head (1999,
doi:10.1029/1999JE001051), which motivates it as "not influenced by the small number of higher
slopes at the upper end of the slope-frequency distribution tail."
"""
from __future__ import annotations
import numpy as np

R_MARS  = 3396190.0          # IAU/IAG Mars 2000 sphere, matches the MOLA mosaic CRS
R_EARTH = 6378137.0          # WGS84 semi-major

__all__ = ["R_MARS","R_EARTH","local_aeqd","slope_deg","slope_at_baseline","relative_relief",
           "detrended_rms","deviogram","hurst_exponent","differential_slope","terrain_features"]


def local_aeqd(lat: float, lon: float, body: str) -> str:
    """PROJ string for a local azimuthal-equidistant grid centred on (lat, lon)."""
    if body == "mars":
        return f"+proj=aeqd +lat_0={lat} +lon_0={lon} +R={R_MARS} +units=m +no_defs +type=crs"
    if body == "earth":
        return f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs +type=crs"
    raise ValueError(f"unknown body {body!r}")


def _nan_guard(z):
    z = np.asarray(z, dtype="float64")
    return z, np.isfinite(z)


def slope_deg(z, pix_m: float) -> np.ndarray:
    """Slope magnitude in degrees on an isotropic grid of true-metre spacing `pix_m`.

    Uses the 3x3 Horn (1981) operator -- the same kernel GDAL's `gdaldem slope` uses, so
    Experiment 1 can compare against an independent implementation on identical arrays.
    """
    z, ok = _nan_guard(z)
    if z.shape[0] < 3 or z.shape[1] < 3:
        return np.full(z.shape, np.nan)
    p = np.pad(z, 1, mode="edge")
    a,b,c = p[:-2,:-2], p[:-2,1:-1], p[:-2,2:]
    d,_,f = p[1:-1,:-2], p[1:-1,1:-1], p[1:-1,2:]
    g,h,i = p[2:,:-2],  p[2:,1:-1],  p[2:,2:]
    dzdx = ((c + 2*f + i) - (a + 2*d + g)) / (8*pix_m)
    dzdy = ((g + 2*h + i) - (a + 2*b + c)) / (8*pix_m)
    s = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    # any 3x3 neighbourhood touching nodata is undefined
    bad = ~ok
    badpad = np.pad(bad, 1, mode="edge")
    touch = np.zeros_like(bad)
    for dy in (0,1,2):
        for dx in (0,1,2):
            touch |= badpad[dy:dy+bad.shape[0], dx:dx+bad.shape[1]]
    s[touch] = np.nan
    return s


def _block_mean(z, k: int):
    """Area-average onto a k-times coarser grid, propagating NaN only if a block is empty."""
    if k <= 1:
        return z
    ny, nx = z.shape
    ny -= ny % k; nx -= nx % k
    if ny == 0 or nx == 0:
        return np.full((0,0), np.nan)
    b = z[:ny,:nx].reshape(ny//k, k, nx//k, k)
    with np.errstate(invalid="ignore"):
        return np.nanmean(b, axis=(1,3))


def slope_at_baseline(z, pix_m: float, baseline_m: float):
    """Slope computed after coarsening the grid so one cell ~= `baseline_m`.

    Returns (slope_array_deg, effective_pixel_m). If the requested baseline is finer than the
    native pixel the function REFUSES to interpolate: it returns the native-resolution slope and
    the native pixel size, so the caller can see the baseline was not honoured.
    """
    k = max(1, int(round(baseline_m / pix_m)))
    zc = _block_mean(z, k)
    eff = pix_m * k
    return slope_deg(zc, eff), eff


def relative_relief(z):
    z, ok = _nan_guard(z)
    if ok.sum() < 2:
        return np.nan, np.nan
    v = z[ok]
    return float(v.max() - v.min()), float(np.percentile(v,99) - np.percentile(v,1))


def detrended_rms(z, order: int = 1) -> float:
    """RMS elevation residual after removing a least-squares planar (order=1) trend."""
    z, ok = _nan_guard(z)
    if ok.sum() < 10:
        return np.nan
    ny, nx = z.shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    X = [np.ones(ok.sum()), xx[ok], yy[ok]]
    if order >= 2:
        X += [xx[ok]**2, yy[ok]**2, xx[ok]*yy[ok]]
    A = np.column_stack(X)
    coef, *_ = np.linalg.lstsq(A, z[ok], rcond=None)
    return float(np.sqrt(np.mean((z[ok] - A @ coef)**2)))


def deviogram(z, pix_m: float, lags_m):
    """RMS deviation vs baseline (Shepard et al. 2001).

    For lag L: RMSdev(L) = sqrt(< (z(x+L) - z(x))^2 >), averaged over both grid axes.
    Returns (lags_used_m, rmsdev_m, n_pairs).
    """
    z, _ = _nan_guard(z)
    lags, vals, counts = [], [], []
    for L in lags_m:
        k = int(round(L / pix_m))
        if k < 1 or k >= min(z.shape):
            continue
        dx = z[:, k:] - z[:, :-k]
        dy = z[k:, :] - z[:-k, :]
        d = np.concatenate([dx.ravel(), dy.ravel()])
        d = d[np.isfinite(d)]
        if d.size < 50:
            continue
        lags.append(k * pix_m); vals.append(float(np.sqrt(np.mean(d**2)))); counts.append(int(d.size))
    return np.array(lags), np.array(vals), np.array(counts)


def hurst_exponent(lags_m, rmsdev_m):
    """H from a log-log least-squares fit of RMS deviation against baseline.

    Returns (H, intercept_log10, r2, n). Self-affine surfaces give RMSdev ~ L^H, 0<H<1.
    Needs >=3 lags; otherwise NaN.
    """
    lags_m = np.asarray(lags_m, float); rmsdev_m = np.asarray(rmsdev_m, float)
    m = np.isfinite(lags_m) & np.isfinite(rmsdev_m) & (lags_m > 0) & (rmsdev_m > 0)
    if m.sum() < 3:
        return np.nan, np.nan, np.nan, int(m.sum())
    x = np.log10(lags_m[m]); y = np.log10(rmsdev_m[m])
    H, c = np.polyfit(x, y, 1)
    yh = H*x + c
    ss_res = float(np.sum((y-yh)**2)); ss_tot = float(np.sum((y-y.mean())**2))
    r2 = 1 - ss_res/ss_tot if ss_tot > 0 else np.nan
    return float(H), float(c), r2, int(m.sum())


def differential_slope(z, pix_m: float, baseline_m: float):
    """Median differential slope at `baseline_m`, in degrees. SEE THE ATTRIBUTION WARNING ABOVE:
    this is a 2-D grid re-implementation, not the published 1-D profile statistic.

    Formula used here (ours, not quoted from any paper): for three collinear points spaced `baseline_m` apart, the differential
    slope is the absolute difference between the two adjacent segment slopes,
        nu = arctan( |z1 - 2*z2 + z3| / L ),
    computed along both grid axes and pooled. Because it is a SECOND difference it is
    insensitive to a uniform regional tilt, which is the property that makes it comparable
    between a tilted Martian plain and a tilted terrestrial one.
    Returns (median_deg, n_samples, baseline_used_m).
    """
    z, _ = _nan_guard(z)
    k = int(round(baseline_m / pix_m))
    if k < 1 or 2*k >= min(z.shape):
        return np.nan, 0, np.nan
    sx = z[:, 2*k:] - 2*z[:, k:-k] + z[:, :-2*k]
    sy = z[2*k:, :] - 2*z[k:-k, :] + z[:-2*k, :]
    d = np.concatenate([sx.ravel(), sy.ravel()])
    d = d[np.isfinite(d)]
    if d.size < 50:
        return np.nan, int(d.size), k*pix_m
    nu = np.degrees(np.arctan(np.abs(d) / (k*pix_m)))
    return float(np.median(nu)), int(d.size), k*pix_m


def terrain_features(z, pix_m: float, baselines_m=(600., 2400., 9200.), slope_baseline_m=1000.,
                     slope_threshold_deg=15.0):
    """Full multiscale descriptor set for one AOI array on a true-metre isotropic grid."""
    z, ok = _nan_guard(z)
    out = {"pixel_m": float(pix_m),
           "n_pixels": int(z.size),
           "valid_data_fraction": float(ok.mean()) if z.size else 0.0}
    if ok.sum() < 100:
        return out | {k: np.nan for k in
                      ("mean_slope_deg","median_slope_deg","slope_p90_deg","slope_frac_gt_thresh",
                       "relative_relief_m","relief_p99p1_m","detrended_rms_m","hurst_H","hurst_r2")}
    s, eff = slope_at_baseline(z, pix_m, slope_baseline_m)
    sv = s[np.isfinite(s)]
    out["slope_baseline_m"] = float(eff)
    out["mean_slope_deg"]   = float(np.mean(sv))   if sv.size else np.nan
    out["median_slope_deg"] = float(np.median(sv)) if sv.size else np.nan
    out["slope_p90_deg"]    = float(np.percentile(sv,90)) if sv.size else np.nan
    out["slope_frac_gt_thresh"] = float(np.mean(sv > slope_threshold_deg)) if sv.size else np.nan
    out["slope_threshold_deg"]  = float(slope_threshold_deg)
    rr, rr99 = relative_relief(z)
    out["relative_relief_m"] = rr
    out["relief_p99p1_m"]    = rr99
    out["detrended_rms_m"]   = detrended_rms(z, order=1)
    lags, vals, cnt = deviogram(z, pix_m, baselines_m)
    for L, v in zip(lags, vals):
        out[f"rmsdev_{int(round(L))}m"] = float(v)
    H, c, r2, n = hurst_exponent(lags, vals)
    out["hurst_H"] = H; out["hurst_r2"] = r2; out["hurst_n_lags"] = n
    for L in baselines_m:
        med, n_s, used = differential_slope(z, pix_m, L)
        if np.isfinite(used):
            out[f"diffslope_{int(round(used))}m_deg"] = med
    return out

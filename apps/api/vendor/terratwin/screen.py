"""
Tier-1 global Earth terrain screen from GMTED2010 30 arc-second mean-elevation tiles.

Why this tier exists: computing the full multiscale fingerprint for every square kilometre of
land is not feasible (and the brief explicitly does not require it). The screen produces cheap,
metric-correct descriptors for ~25 km land cells worldwide so that a Mars target can be matched
against ALL land rather than against a hand-picked shortlist. Shortlisted cells are then
re-measured properly in tier 2 from Copernicus GLO-90.

Three correctness points that are easy to get wrong and are handled explicitly here:

  1. GMTED is on a geographic grid, so a pixel's EAST-WEST ground length is
     dx = dy * cos(latitude). Slope computed with a single pixel size would be wrong by exactly
     the same cos(phi) factor that afflicts the Mars equirectangular mosaic. dx is recomputed
     per row from a geodesic.
  2. Cells are sized in PIXELS PER BAND so that their ground footprint stays ~square and
     ~constant-area with latitude: n_cols = round(block_m / dx(phi)). Equal-degree cells are
     never treated as equal-area.
  3. The deviogram here uses NORTH-SOUTH differences only, because meridional pixel spacing is
     constant everywhere while zonal spacing is latitude-dependent. This makes the screen's
     roughness baselines exactly comparable between cells at different latitudes. It is a
     directional statistic and is labelled as such; tier 2 uses the full 2-D operators.
"""
from __future__ import annotations
import numpy as np, pandas as pd
from osgeo import gdal
from pyproj import Geod

gdal.UseExceptions()
_GEOD = Geod(ellps="WGS84")
GMTED_NODATA = -32768


def _spacing_m(lat_deg: float, step_deg: float):
    """True ground length of one `step_deg` step in latitude and in longitude at `lat_deg`."""
    _,_, dy = _GEOD.inv(0.0, lat_deg - step_deg/2, 0.0, lat_deg + step_deg/2)
    _,_, dx = _GEOD.inv(-step_deg/2, lat_deg, step_deg/2, lat_deg)
    return dx, dy


def screen_tile(path: str, block_m: float = 25000.0, lags_px=(2, 8), min_valid: float = 0.6):
    """Tier-1 descriptors for one GMTED tile, via the shared `cell_descriptors` core."""
    ds = gdal.Open(path)
    gt = ds.GetGeoTransform()
    z = ds.GetRasterBand(1).ReadAsArray().astype("float64")
    ds = None
    z[z == GMTED_NODATA] = np.nan
    ny = z.shape[0]
    step = abs(gt[5])
    lat_rows = gt[3] + (np.arange(ny) + 0.5) * gt[5]
    _, dy_m = _spacing_m(float(np.clip(lat_rows.mean(), -89.9, 89.9)), step)
    dx_rows = np.array([_spacing_m(float(np.clip(la, -89.9, 89.9)), step)[0] for la in lat_rows])
    return cell_descriptors(z, dx_rows, dy_m, block_m, lags_px, min_valid,
                            lat_rows=lat_rows, lon_left=gt[0], px_deg=gt[1])


def two_point_hurst(df, short_col, long_col, short_m, long_m):
    """H from two RMS-deviation baselines: H = log(v_long/v_short)/log(L_long/L_short).

    Two points cannot test whether the surface is actually self-affine, so this value is a
    SCREEN statistic only; tier 2 fits >=3 baselines and reports the goodness of fit.
    """
    v_s = np.asarray(df[short_col], dtype="float64")
    v_l = np.asarray(df[long_col],  dtype="float64")
    Ls  = np.asarray(short_m, dtype="float64")
    Ll  = np.asarray(long_m,  dtype="float64")
    ok = np.isfinite(v_s) & np.isfinite(v_l) & (v_s > 0) & (v_l > 0) & (Ll > Ls)
    out = np.full(v_s.shape, np.nan)
    with np.errstate(all="ignore"):
        out[ok] = np.log(v_l[ok]/v_s[ok]) / np.log(Ll[ok]/Ls[ok])
    return out


# ---------------------------------------------------------------------------
# Shared descriptor core
# ---------------------------------------------------------------------------
def cell_descriptors(z, dx, dy_m, cell_m, lags_px=(2, 8), min_valid=0.6, lat_rows=None,
                     lon_left=None, px_deg=None):
    """Tile an elevation array into ~`cell_m` square cells and describe each one.

    THIS IS THE ONLY PLACE the tier-1 descriptors are defined, and BOTH planets go through it.
    That is the point: a cross-planet comparison is only meaningful if the two numbers were
    produced by the same operator at the same physical baseline, so the operator is written
    once rather than twice.

    `dx` may be a scalar (isotropic grid, e.g. a Mars local AEQD patch) or one value per row
    (geographic grid, where east-west spacing shrinks as cos(latitude)). `dy_m` is constant.
    Cell width in pixels is chosen per row-band so the ground footprint stays ~square.
    """
    z = np.asarray(z, dtype="float64")
    ny, nx = z.shape
    dx_rows = np.full(ny, float(dx)) if np.isscalar(dx) else np.asarray(dx, dtype="float64")

    gy = np.full_like(z, np.nan); gx = np.full_like(z, np.nan)
    gy[1:-1, :] = (z[2:, :] - z[:-2, :]) / (2*dy_m)
    gx[:, 1:-1] = (z[:, 2:] - z[:, :-2]) / (2*dx_rows[:, None])
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))

    dev = {}
    for k in lags_px:
        d = np.full_like(z, np.nan)
        d[:-k, :] = z[k:, :] - z[:-k, :]
        dev[k] = d**2

    n_block_rows = max(1, int(round(cell_m / dy_m)))
    out = []
    for r0 in range(0, ny - n_block_rows + 1, n_block_rows):
        rs = slice(r0, r0 + n_block_rows)
        dx_band = float(np.nanmean(dx_rows[r0:r0 + n_block_rows]))
        n_block_cols = max(1, int(round(cell_m / dx_band)))
        nb = nx // n_block_cols
        if nb == 0:
            continue
        cs = slice(0, nb * n_block_cols)
        def blk(a):
            return a[rs, cs].reshape(n_block_rows, nb, n_block_cols)\
                   .transpose(1, 0, 2).reshape(nb, -1)
        zb, sb = blk(z), blk(slope)
        with np.errstate(all="ignore"):
            rec = dict(
                n_rows=n_block_rows, n_cols=n_block_cols,
                cell_km_ns=n_block_rows*dy_m/1000.0, cell_km_ew=n_block_cols*dx_band/1000.0,
                valid_data_fraction=np.isfinite(zb).mean(axis=1),
                mean_elev_m=np.nanmean(zb, axis=1),
                mean_slope_deg=np.nanmean(sb, axis=1),
                slope_p90_deg=np.nanpercentile(sb, 90, axis=1),
                relative_relief_m=np.nanmax(zb, axis=1) - np.nanmin(zb, axis=1),
                elev_std_m=np.nanstd(zb, axis=1),
                frac_exact_zero=np.mean(zb == 0.0, axis=1),
            )
            for name, k in zip(("rmsdev_short", "rmsdev_long"), lags_px):
                rec[name] = np.sqrt(np.nanmean(blk(dev[k]), axis=1))
        rec["baseline_short_m"] = lags_px[0]*dy_m
        rec["baseline_long_m"]  = lags_px[1]*dy_m
        if lat_rows is not None:
            rec["lat"] = float(lat_rows[r0:r0 + n_block_rows].mean())
            rec["lon"] = lon_left + (np.arange(nb) + 0.5) * n_block_cols * px_deg
        else:
            rec["row_block"] = r0 // n_block_rows
            rec["col_block"] = np.arange(nb)
        df = pd.DataFrame(rec)
        out.append(df[df.valid_data_fraction >= min_valid])
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def isotropic_cells(z, pix_m, cell_m=25000.0, lags_px=(2, 8), min_valid=0.6):
    """Tier-1 descriptors for an isotropic true-metre grid (a Mars local AEQD patch).

    Calls the identical `cell_descriptors` core used for Earth, with dx == dy.
    """
    return cell_descriptors(z, pix_m, pix_m, cell_m, lags_px, min_valid)

"""
Observation-operator matching (OOM) for cross-planet terrain comparison.

Problem. The Mars DEM is not a measurement field: it is the output of an observation chain
    z_M = W( I( S_M( z_true ) ) )
  S_M  sampling: MOLA shots binned into 1/128-deg cells; ~31% of cells hold >=1 shot (measured),
  I    gridding: empty cells receive "an interpolated value" (PDS MEGDR label; method unstated),
  W    warp onto the analysis grid (local azimuthal-equidistant, bilinear).
A fully observed Earth DEM z_E has no such chain. Any terrain descriptor D that is nonlinear in
the surface (slope percentiles, RMS deviation at short lags, Hurst exponent) then satisfies
    E[ D(z_M) ] = E[ D(z_true) ] + b(D, S_M, I)
so comparing D(z_M) with D(z_E) compares a biased quantity with an unbiased one.

Method. Do not try to invert the chain on Mars (ill-posed). Apply the SAME chain to Earth:
    z~_E = W( I( S_M( T(z_E) ) ) )
where T transplants the Earth window onto the native MOLA bin grid at the Mars target's own
location, and S_M is that target's own measured observation mask. Then D(z_M) and D(z~_E) carry
the same bias by construction, and no confidence weight or tuning constant is introduced. This is
the standard "compare in observation space" principle of data assimilation, applied here to a
cross-planet geomorphometric comparison.

Free choices, both handled empirically rather than assumed:
  - the interpolator I (the PDS documentation does not state it): selected by matching statistics
    that are OBSERVABLE on Mars itself (`fidelity_stats`);
  - the native-pixel registration of the mosaic relative to the counts maps: checked by offset scan.
"""
from __future__ import annotations
import numpy as np
from pyproj import CRS, Transformer
from scipy.ndimage import map_coordinates
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator, CloughTocher2DInterpolator
from .terrain import R_MARS, local_aeqd
from . import support as SUP

PPD = 128
_GEO = CRS.from_proj4(f"+proj=longlat +R={R_MARS} +no_defs +type=crs")
_TILE_CACHE: dict = {}


def _tile(name):
    if name not in _TILE_CACHE:
        _TILE_CACHE[name] = SUP.load_tile(name)
    return _TILE_CACHE[name]


def counts_at_global(grow, gcol):
    """Native 128-ppd MOLA counts at global (row, col): row 0 = 90N edge, col 0 = 0E. -1 if no tile."""
    grow = np.asarray(grow); gcol = np.asarray(gcol) % (360 * PPD)
    out = np.full(grow.shape, -1, dtype=np.int16)
    lat_c = 90.0 - (grow + 0.5) / PPD
    for nm, hi, lo in SUP.BANDS:
        for L in SUP.LON0S:
            sel = (lat_c <= hi) & (lat_c > lo) & (gcol >= L * PPD) & (gcol < (L + 90) * PPD)
            if not sel.any():
                continue
            t = _tile(f"megc{nm}{L:03d}hb")
            if t is None:
                continue
            r = grow[sel] - int(round((90 - hi) * PPD)); c = gcol[sel] - L * PPD
            okk = (r >= 0) & (r < SUP.TILE_LINES) & (c >= 0) & (c < SUP.TILE_SAMPLES)
            vals = np.full(r.shape, -1, dtype=np.int16)
            vals[okk] = t[r[okk], c[okk]]
            out[sel] = vals
    return out


class TargetGeometry:
    """Native MOLA bin grid around a Mars target, plus its mapping to the AEQD analysis grid."""

    def __init__(self, lat0, lon0, half_km=25.0, pix_m=463.0935415503709, margin_px=4):
        self.lat0, self.lon0, self.pix = float(lat0), float(lon0), float(pix_m)
        self.n = int(round(2 * half_km * 1000.0 / pix_m))
        self.half_m = self.n * pix_m / 2.0
        aeqd = CRS.from_proj4(local_aeqd(lat0, lon0, "mars"))
        self._fwd = Transformer.from_crs(_GEO, aeqd, always_xy=True)
        self._inv = Transformer.from_crs(aeqd, _GEO, always_xy=True)
        s, nlat, w, e = SUP.aoi_bbox(lat0, lon0, half_km * 1.05)
        r0 = int(np.floor((90 - nlat) * PPD)) - margin_px; r1 = int(np.ceil((90 - s) * PPD)) + margin_px
        lon360 = lon0 % 360.0
        dlon = (e - w) % 360.0
        c0 = int(np.floor((lon360 - dlon / 2) * PPD)) - margin_px
        c1 = int(np.ceil((lon360 + dlon / 2) * PPD)) + margin_px
        self.grow = np.arange(r0, r1); self.gcol = np.arange(c0, c1)
        GR, GC = np.meshgrid(self.grow, self.gcol, indexing="ij")
        self.counts = counts_at_global(GR, GC)
        self.observed_native = self.counts > 0
        lat_n = 90.0 - (GR + 0.5) / PPD
        lon_n = ((GC + 0.5) / PPD + 180.0) % 360.0 - 180.0
        x, y = self._fwd.transform(lon_n, lat_n)
        # native bin centre -> fractional AEQD pixel index (row, col)
        self.nat_in_aeqd = (np.asarray((self.half_m - y) / pix_m - 0.5), np.asarray((x + self.half_m) / pix_m - 0.5))
        # AEQD cell centre -> fractional native index (row, col), for the warp W
        xs = -self.half_m + (np.arange(self.n) + 0.5) * pix_m
        X, Y = np.meshgrid(xs, -xs)
        lon_a, lat_a = self._inv.transform(X, Y)
        self.aeqd_in_nat = (np.asarray((90.0 - lat_a) * PPD - 0.5 - r0),
                            np.asarray(((np.asarray(lon_a) % 360.0) * PPD - 0.5 - c0)))

    # ---- the chain ------------------------------------------------------------
    def transplant(self, z_aeqd):
        """T: sample an AEQD-grid surface at the native MOLA bin centres (bilinear)."""
        z = np.asarray(z_aeqd, float)
        ok = np.isfinite(z)
        zf = np.where(ok, z, 0.0)
        v = map_coordinates(zf, self.nat_in_aeqd, order=1, mode="constant", cval=np.nan)
        w = map_coordinates(ok.astype(float), self.nat_in_aeqd, order=1, mode="constant", cval=0.0)
        v[w < 0.999] = np.nan
        return v

    def warp(self, z_native):
        """W: bilinear resample of a native-grid surface onto the AEQD analysis grid."""
        z = np.asarray(z_native, float)
        ok = np.isfinite(z)
        v = map_coordinates(np.where(ok, z, 0.0), self.aeqd_in_nat, order=1, mode="nearest")
        w = map_coordinates(ok.astype(float), self.aeqd_in_nat, order=1, mode="nearest")
        v[w < 0.999] = np.nan
        return v

    def observed_aeqd(self, supersample=4):
        """Boolean AEQD mask: True where >=1 observed native bin falls inside the AEQD cell."""
        n, p = self.n, self.pix
        offs = (np.arange(supersample) + 0.5) / supersample - 0.5
        out = np.zeros((n, n), bool)
        xs = -self.half_m + (np.arange(n) + 0.5) * p
        for dy in offs:
            for dx in offs:
                X, Y = np.meshgrid(xs + dx * p, -(xs + dy * p))
                lon_a, lat_a = self._inv.transform(X, Y)
                gr = np.floor((90.0 - lat_a) * PPD).astype(int)
                gc = np.floor((np.asarray(lon_a) % 360.0) * PPD).astype(int)
                out |= counts_at_global(gr, gc) > 0
        return out

    def native_chain(self, z_aeqd, method="linear", halfshift=True, observed=None):
        """S . T then I, then (optionally) the mosaic's half-pixel east-west blend; native grid output.

        `halfshift`: the USGS 463 m mosaic's columns sit half a MEGDR bin east of the counts grid
        (offset test, 39/39 EZs: contrast at dc=0 equals dc=+1 and the profile is symmetric about
        +0.5), consistent with each mosaic pixel averaging two native columns.
        """
        nat = self.transplant(z_aeqd)
        obs = (self.observed_native if observed is None else observed) & np.isfinite(nat)
        filled = interpolate_native(nat, obs, method)
        filled[~np.isfinite(nat)] = np.nan
        if halfshift:
            b = filled.copy(); b[:, :-1] = 0.5 * (filled[:, :-1] + filled[:, 1:]); filled = b
        return filled

    def apply(self, z_aeqd, method="linear", halfshift=True, observed=None):
        """Full observation operator H = W . I . S . T applied to an Earth (or any) AEQD surface."""
        return self.warp(self.native_chain(z_aeqd, method, halfshift, observed))


def interpolate_native(z, observed, method="linear"):
    """I: fill unobserved native bins from observed ones, in native index space."""
    z = np.asarray(z, float)
    rr, cc = np.nonzero(observed)
    if rr.size < 10:
        return np.full(z.shape, np.nan)
    pts = np.column_stack([rr, cc]).astype(float); vals = z[observed]
    gy, gx = np.mgrid[0:z.shape[0], 0:z.shape[1]]
    q = np.column_stack([gy.ravel(), gx.ravel()]).astype(float)
    if method == "nearest":
        out = NearestNDInterpolator(pts, vals)(q)
    elif method == "linear":
        out = LinearNDInterpolator(pts, vals)(q)
    elif method == "cubic":
        out = CloughTocher2DInterpolator(pts, vals)(q)
    else:
        raise ValueError(method)
    out = out.reshape(z.shape)
    bad = ~np.isfinite(out)
    if bad.any():                                    # outside the convex hull of the data
        out[bad] = NearestNDInterpolator(pts, vals)(q[bad.ravel()])
    out[observed] = vals                             # observed bins keep their values
    return out


def fidelity_stats(z_native, observed):
    """Mars-observable statistics that discriminate interpolators.

    rho_ns : RMS of north-south lag-1 differences between two UNOBSERVED bins, divided by the same
             quantity between two OBSERVED bins (observed bins lie along N-S ground tracks).
             Nearest-neighbour filling copies tracks (rho ~ 1); linear blending of independent
             tracks lowers it; it is directly measurable on the real MOLA grid.
    kap_ew : RMS of east-west second differences centred on unobserved bins, divided by the same
             centred on observed bins. Piecewise-linear filling drives it towards 0.
    """
    z = np.asarray(z_native, float); o = np.asarray(observed, bool)
    d = z[1:, :] - z[:-1, :]; both_o = o[1:, :] & o[:-1, :]; both_u = ~o[1:, :] & ~o[:-1, :]
    fin = np.isfinite(d)
    rho = np.sqrt(np.nanmean(d[both_u & fin] ** 2)) / np.sqrt(np.nanmean(d[both_o & fin] ** 2))
    c2 = z[:, 2:] - 2 * z[:, 1:-1] + z[:, :-2]; mid = o[:, 1:-1]; fin2 = np.isfinite(c2)
    kap = np.sqrt(np.nanmean(c2[~mid & fin2] ** 2)) / np.sqrt(np.nanmean(c2[mid & fin2] ** 2))
    return float(rho), float(kap)

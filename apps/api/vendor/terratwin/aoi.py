"""
AOI extraction for TerraTwin.

Both planets are resampled onto a LOCAL AZIMUTHAL-EQUIDISTANT grid centred on the AOI, built
with that body's own radius. Consequences, all of them deliberate:
  * ground distances in the analysis grid are true metres on both planets;
  * the cos(latitude) stretch of the Mars equirectangular mosaic is removed by the warp itself;
  * the two planets' arrays can be handed to identical operators with identical pixel sizes.

Earth is downsampled with `average` (area aggregation). Using `near` would alias; using
`bilinear` to go 90 m -> 463 m would discard most of the input cells. Mars is warped with
`bilinear` because source and target pixel sizes are nearly equal.
"""
from __future__ import annotations
import os, numpy as np
from osgeo import gdal
from .terrain import R_MARS, R_EARTH, local_aeqd

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
gdal.SetConfigOption("VSI_CACHE", "TRUE")
gdal.SetConfigOption("GDAL_HTTP_MULTIPLEX", "YES")

GLO90_BUCKET = "https://copernicus-dem-90m.s3.amazonaws.com"
GMTED_BASE   = ("https://edcintl.cr.usgs.gov/downloads/sciweb1/shared/topo/downloads/GMTED/"
                "Global_tiles_GMTED/300darcsec/mea")


def glo90_tile_name(lat_sw: int, lon_sw: int) -> str:
    ns = "N" if lat_sw >= 0 else "S"
    ew = "E" if lon_sw >= 0 else "W"
    return f"Copernicus_DSM_COG_30_{ns}{abs(lat_sw):02d}_00_{ew}{abs(lon_sw):03d}_00_DEM"


def glo90_tile_url(lat_sw: int, lon_sw: int) -> str:
    name = glo90_tile_name(lat_sw, lon_sw)
    return f"/vsicurl/{GLO90_BUCKET}/{name}/{name}.tif"


def glo90_wbm_url(lat_sw: int, lon_sw: int) -> str:
    """Copernicus Water Body Mask for the same tile.

    Copernicus DEM encodes ocean and inland water as ELEVATION 0, not as nodata. Leaving that
    in place silently inflates relative relief and depresses slope for any coastal AOI, so the
    WBM is not optional for a method that reports relief. Classes per the Copernicus DEM product
    specification: 0 land, 1 ocean, 2 lake, 3 river. Only classes 0 and 1 were observed in the
    single coastal tile inspected here (S25/W071: 771,079 land / 668,921 ocean pixels); the lake
    and river classes are taken from the specification and were NOT empirically confirmed.
    """
    name = glo90_tile_name(lat_sw, lon_sw)
    stem = name[:-4]                       # strip the trailing '_DEM'
    return f"/vsicurl/{GLO90_BUCKET}/{name}/AUXFILES/{stem}_WBM.tif"


def _aoi_degree_bbox(lat, lon, half_km, R):
    """Lat/lon half-extents for a square AOI of 2*half_km on a side, on a sphere of radius R."""
    dlat = np.degrees(half_km*1000.0 / R)
    dlon = np.degrees(half_km*1000.0 / (R*max(np.cos(np.radians(lat)), 1e-6)))
    return lat-dlat, lat+dlat, lon-dlon, lon+dlon


def warp_to_local(src, lat, lon, half_km, pix_m, body, resample, src_nodata=None):
    """Warp any GDAL-openable source onto the local AEQD grid. Returns (array, meta)."""
    dst_crs = local_aeqd(lat, lon, body)
    # snap the half-extent to a whole number of pixels so the grid is exactly square
    n = int(round(2*half_km*1000.0/pix_m))
    half_m = n*pix_m/2.0
    ds = gdal.Warp(
        "", src, format="MEM", dstSRS=dst_crs, outputType=gdal.GDT_Float32,
        outputBounds=(-half_m, -half_m, half_m, half_m),
        xRes=pix_m, yRes=pix_m,
        resampleAlg=resample, srcNodata=src_nodata, dstNodata=np.nan,
        errorThreshold=0.0, multithread=True)
    arr = ds.GetRasterBand(1).ReadAsArray().astype("float64")
    meta = {"pix_m": pix_m, "shape": arr.shape, "crs": dst_crs,
            "resample": resample, "half_km": half_km}
    ds = None
    return arr, meta


def mars_aoi(dem_path, lat, lon, half_km, pix_m=463.0935415503709, resample="bilinear"):
    """Mars AOI from the MOLA (or HRSC/MOLA blend) mosaic, on a local AEQD grid in true metres."""
    return warp_to_local(dem_path, lat, lon, half_km, pix_m, "mars", resample, src_nodata=-32768)


def earth_aoi(lat, lon, half_km, pix_m, resample="average", source="glo90", mask_water=True):
    """Earth AOI from Copernicus GLO-90 tiles, area-averaged onto the local AEQD grid.

    With `mask_water=True` (the default) any cell whose Copernicus Water Body Mask class is
    non-zero is set to NaN BEFORE any descriptor is computed, and the water fraction is
    reported in the metadata so a coastal candidate cannot masquerade as flat dry terrain.
    """
    s, n, w, e = _aoi_degree_bbox(lat, lon, half_km, R_EARTH)
    corners = []
    for la in range(int(np.floor(s)), int(np.floor(n))+1):
        for lo in range(int(np.floor(w)), int(np.floor(e))+1):
            corners.append((la, ((lo + 180) % 360) - 180))     # wrap antimeridian
    ok, ok_wbm = [], []
    for la, lo in corners:
        try:
            d = gdal.Open(glo90_tile_url(la, lo)); d = None
            ok.append(glo90_tile_url(la, lo))
            try:
                d = gdal.Open(glo90_wbm_url(la, lo)); d = None
                ok_wbm.append(glo90_wbm_url(la, lo))
            except Exception:
                pass
        except Exception:
            pass                                     # ocean / absent tile: GLO-90 is land-only
    if not ok:
        raise FileNotFoundError(f"no GLO-90 tiles cover ({lat:.4f},{lon:.4f}) +/- {half_km} km "
                                f"(ocean, or outside land coverage)")
    vrt = gdal.BuildVRT("", ok, resolution="highest", resampleAlg="nearest")
    arr, meta = warp_to_local(vrt, lat, lon, half_km, pix_m, "earth", resample)
    vrt = None
    meta["n_tiles"] = len(ok); meta["source"] = source; meta["water_masked"] = False
    meta["water_fraction"] = float("nan")
    if mask_water and ok_wbm:
        wvrt = gdal.BuildVRT("", ok_wbm, resolution="highest", resampleAlg="nearest")
        wm, _ = warp_to_local(wvrt, lat, lon, half_km, pix_m, "earth", "max")
        wvrt = None
        if wm.shape == arr.shape:
            water = np.isfinite(wm) & (wm > 0)
            meta["water_fraction"] = float(water.mean())
            meta["water_masked"] = True
            arr = arr.copy(); arr[water] = np.nan
    return arr, meta


def gmted_tile_url(lat_sw: int, lon_sw: int) -> str:
    """GMTED2010 30 arc-second mean-elevation tile (20 deg lat x 30 deg lon, named by SW corner)."""
    ns = "N" if lat_sw >= 0 else "S"
    ew = "E" if lon_sw >= 0 else "W"
    sub = f"{ew}{abs(lon_sw):03d}"
    name = f"{abs(lat_sw):02d}{ns}{abs(lon_sw):03d}{ew}_20101117_gmted_mea300.tif"
    return f"/vsicurl/{GMTED_BASE}/{sub}/{name}"

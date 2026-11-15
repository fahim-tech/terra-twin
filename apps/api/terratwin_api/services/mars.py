"""Mars target analysis: research Exploration Zones (real descriptors) or arbitrary coordinates
(explicitly unavailable until the GIS MOLA extraction service is connected)."""
from __future__ import annotations

import math

import pandas as pd

from ..schemas.common import FeatureValue, QualityFlag, Unavailable
from . import research_store as RS

R_MARS_KM = 3396.19
MOLA_GRID_M = 463.0935415503709

TIER1_LABELS = {
    "mean_slope_deg": ("Mean slope", "deg"),
    "slope_p90_deg": ("Slope, 90th percentile", "deg"),
    "relative_relief_m": ("Relative relief", "m"),
    "elev_std_m": ("Elevation std. dev.", "m"),
    "rmsdev_short": ("RMS deviation, short baseline", "m"),
    "rmsdev_long": ("RMS deviation, long baseline", "m"),
    "hurst_2pt": ("Hurst exponent (2-point)", "-"),
}
TIER2_LABELS = {
    "mean_slope_deg": ("Mean slope", "deg"),
    "slope_p90_deg": ("Slope, 90th percentile", "deg"),
    "relative_relief_m": ("Relative relief", "m"),
    "detrended_rms_m": ("Detrended RMS height", "m"),
    "rmsdev_926m": ("RMS deviation @ 926 m", "m"),
    "rmsdev_2315m": ("RMS deviation @ 2.3 km", "m"),
    "rmsdev_9262m": ("RMS deviation @ 9.3 km", "m"),
    "hurst_H": ("Hurst exponent", "-"),
}
EXPLAIN = {
    "mean_slope_deg": "Average terrain inclination at the stated baseline.",
    "slope_p90_deg": "Steep-slope tail: 10 % of the area is steeper than this.",
    "relative_relief_m": "Maximum minus minimum elevation inside the analysis unit.",
    "elev_std_m": "Spread of elevations inside the 25 km cell.",
    "rmsdev_short": "Height change between points ~1.85 km apart (N-S, directional screen statistic).",
    "rmsdev_long": "Height change between points ~7.4 km apart (N-S, directional screen statistic).",
    "hurst_2pt": "How roughness scales with distance, from two baselines only (screen statistic).",
}
# Factors the brief asks for that no connected dataset provides.
# Factors the research record does not carry. Where the GIS factor library is installed (the production host)
# all six are served by GET /api/gis/mars/factors and the app shows those records instead of these entries.
_NO_GIS = "not served by this API process: needs the GIS factor library (terratwin_gis.factors)"
UNAVAILABLE_FACTORS = [
    ("rock_abundance", "Rock abundance", "%", f"TES rock abundance {_NO_GIS}"),
    ("thermal_inertia", "Thermal inertia", "J m⁻² K⁻¹ s⁻½", f"TES thermal inertia {_NO_GIS}"),
    ("geologic_unit", "Geologic unit", "class", f"USGS SIM 3292 geologic unit {_NO_GIS}"),
    ("surface_temperature", "Surface temperature", "K", f"Modelled surface temperature {_NO_GIS}"),
    ("water_ice", "Water-ice potential", "index", f"SWIM ice consistency {_NO_GIS}"),
    ("solar_energy", "Solar-energy potential", "W m⁻²", f"Solar-energy potential {_NO_GIS}"),
]


def _nan(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def site_list() -> list[dict]:
    fp = RS.mars_footprints()
    sup = RS.mars_support()
    out = []
    for site, r in fp.iterrows():
        out.append({
            "id": site, "name": site.replace("_", " "), "lat": float(r.lat_c), "lon": float(r.lon_c),
            "bbox": {"lon_min": float(r.lon_min), "lon_max": float(r.lon_max),
                     "lat_min": float(r.lat_min), "lat_max": float(r.lat_max)},
            "observed_fraction": _nan(sup.loc[site, "observed_fraction"]) if site in sup.index else None,
            "category": "nasa_exploration_zone",
            "source": "NASA First Landing Site / Exploration Zone Workshop (2015) footprints, via research package",
        })
    return out


def containing_site(lat: float, lon: float) -> str | None:
    fp = RS.mars_footprints()
    hit = fp[(fp.lat_min <= lat) & (lat <= fp.lat_max) & (fp.lon_min <= lon) & (lon <= fp.lon_max)]
    if hit.empty:
        return None
    d = (hit.lat_c - lat) ** 2 + (hit.lon_c - lon) ** 2
    return str(d.idxmin())


def footprint_flags(footprint_km: float) -> list[QualityFlag]:
    flags = [QualityFlag(code="mola_grid_not_resolution", severity="info",
                         message="Computed from a 463 m MOLA grid built by binning laser returns. "
                                 "This is a grid spacing, not an observation resolution.")]
    px = footprint_km * 1000 / MOLA_GRID_M
    if footprint_km < 5:
        flags.append(QualityFlag(code="footprint_below_observation_support", severity="critical",
                                 message=f"A {footprint_km:g} km footprint spans ~{px:.0f} MOLA grid cells, of which only "
                                         "about one in three contains a laser return. Terrain statistics are not "
                                         "meaningful at this size."))
    elif footprint_km < 25:
        flags.append(QualityFlag(code="footprint_smaller_than_analysis_unit", severity="warning",
                                 message=f"Requested {footprint_km:g} km is smaller than the analysis units available "
                                         "(25 km tier-1 cells, 50 km tier-2 windows). Results describe those units, "
                                         "not the requested footprint."))
    return flags


def analyse(lat: float, lon: float, footprint_km: float) -> dict:
    site = containing_site(lat, lon)
    flags = footprint_flags(footprint_km)
    unavailable = [FeatureValue(key=k, label=l, value=None, unit=u, state="unavailable", reason=why)
                   for k, l, u, why in UNAVAILABLE_FACTORS]
    if site is None:
        return {
            "status": "unavailable",
            "site": None,
            "coordinate": {"lat": lat, "lon": lon},
            "footprint_km": footprint_km,
            "tier1_features": [], "ez_features": [], "unavailable_factors": unavailable,
            "observation_support": None,
            "quality_flags": [f.model_dump() for f in flags],
            "unavailable": Unavailable(
                status="unavailable",
                reason="This coordinate lies outside the 39 research Exploration Zones. Source-backed Mars "
                       "features for arbitrary coordinates require the MOLA mosaic and MEGDR counts extraction "
                       "service, which is not yet connected.",
                missing_inputs=["USGS MOLA 463 m mosaic", "MEGDR 128 ppd counts tiles", "GIS get_mars_features()"],
                owner="GIS workstream").model_dump(),
        }

    t1 = RS.mars_tier1().loc[site]
    t1_feats = [FeatureValue(
        key=k, label=TIER1_LABELS[k][0], value=_nan(t1[k]), unit=TIER1_LABELS[k][1], state="derived",
        source_id="Mars_MGS_MOLA_DEM_mosaic_global_463m", native_resolution_m=MOLA_GRID_M,
        footprint="median over 25 km cells inside the EZ footprint",
        method="screen.isotropic_cells (shared Mars/Earth tier-1 operator)", explanation=EXPLAIN.get(k))
        for k in TIER1_LABELS]
    t2 = RS.mars_tier2_ez().loc[site]
    ez_feats = [FeatureValue(
        key=k, label=TIER2_LABELS[k][0], value=_nan(t2.get(k)), unit=TIER2_LABELS[k][1], state="derived",
        source_id=str(t2.source), native_resolution_m=float(t2.native_res_m),
        footprint=f"{2 * float(t2.half_km):g} × {2 * float(t2.half_km):g} km local AEQD AOI",
        baseline_m=float(t2.slope_baseline_m) if k.endswith("slope_deg") else None,
        method="terrain.terrain_features") for k in TIER2_LABELS if k in t2]
    sup = RS.mars_support().loc[site]
    reg = RS.mars_registration()
    support = {
        "observed_fraction": _nan(sup.observed_fraction),
        "observed_fraction_native_50km": _nan(reg.loc[site, "obs_frac_native"]) if site in reg.index else None,
        "mean_counts": _nan(sup.mean_counts), "p90_counts": _nan(sup.p90_counts), "max_counts": _nan(sup.max_counts),
        "n_cells": int(sup.n_cells),
        "interpolation_dependence": None if pd.isna(sup.observed_fraction) else 1 - float(sup.observed_fraction),
        "source_grid": "MEGDR 128 pixels/degree counts (~463 m bins)",
        "note": "Fraction of native bins with ≥1 laser shot. Observation support metadata, not a confidence probability.",
    }
    fp = RS.mars_footprints().loc[site]
    return {
        "status": "available", "site": site, "site_name": site.replace("_", " "),
        "coordinate": {"lat": lat, "lon": lon},
        "site_centre": {"lat": float(fp.lat_c), "lon": float(fp.lon_c)},
        "footprint_km": footprint_km,
        "tier1_features": [f.model_dump() for f in t1_feats],
        "ez_features": [f.model_dump() for f in ez_feats],
        "unavailable_factors": [f.model_dump() for f in unavailable],
        "observation_support": support,
        "quality_flags": [f.model_dump() for f in flags],
        "unavailable": None,
    }

"""Additional Mars scientific layers (``mars-factors-1.0``, owned by the GIS workstream:
``terratwin_gis.factors``; see its docs/mars_factors.md and this repo's docs/gis-handoff-status.md).

Mars *characterization* at a coordinate. These records never enter OOM similarity, a ranking or a
mission-suitability score. The GIS library's records are passed through unchanged (one record per factor,
each with its own status); this module only enforces the contract's honesty rules at the boundary (no value
unless ``status == "available"``, unknown statuses become ``error``, non-finite numbers become null) and
reports every factor as ``not_integrated`` where the GIS library is not connected.
"""
from __future__ import annotations

import importlib

from . import gis

CONTRACT_VERSION = "mars-factors-1.0"
STATUSES = ("available", "unavailable", "outside_coverage", "not_integrated", "unsupported_resolution", "error")
#: factor_id -> (label, default unit), as in terratwin_gis.factors.schema.FACTORS.
FACTORS = {
    "thermal_inertia": ("Thermal inertia", "J m-2 K-1 s-1/2"),
    "geologic_unit": ("Geologic unit", "class"),
    "rock_abundance": ("Rock abundance", "%"),
    "surface_temperature": ("Surface temperature", "K"),
    "water_ice": ("Water-ice potential", "consistency index (-1..1)"),
    "solar_energy": ("Solar-energy potential", "W m-2"),
}
RULES = ["Mars location characterisation only: never an OOM/tier-1 similarity feature, weight or confidence",
         "not a mission-suitability score; no mission feasibility is implied",
         "missing values are null with a reason, never zero",
         "values are at each product's native resolution; footprints differ between factors"]


def _blank(fid: str, status: str, reason: str) -> dict:
    label, unit = FACTORS.get(fid, (fid, None))
    return {"factor_id": fid, "key": fid, "label": label, "status": status, "value": None, "unit": unit,
            "state": "unavailable", "source_id": None, "reason": reason, "limitations": [], "components": []}


def _guard(rec: dict) -> dict:
    rec = gis.finite(dict(rec))
    if rec.get("status") not in STATUSES:
        rec.update(status="error", reason=rec.get("reason") or f"unknown status {rec.get('status')!r}")
    if rec["status"] != "available":
        rec["value"] = None  # never a number for a factor that is not available
        rec.setdefault("reason", "not available")
    elif rec.get("value") is None and not any(c.get("value") is not None for c in rec.get("components", [])):
        rec.update(status="unavailable", reason=rec.get("reason") or "the provider returned no value")
    return rec


def mars_factors(lat: float, lon: float, season_ls: float | None = None, local_time: float | None = None) -> dict:
    base = {"record_type": "mars_planetary_context", "contract_version": CONTRACT_VERSION, "planet": "mars",
            "coordinate": {"lat": lat, "lon": lon},
            "request": {"season_ls": season_ls, "local_time_ltst_h": local_time}, "rules": RULES}
    try:
        gis.lib()
        mod = importlib.import_module("terratwin_gis.factors")
    except (gis.GisUnavailable, ImportError):
        reason = "The GIS factor library is not connected on this server"
        recs = [_blank(f, "not_integrated", reason) for f in FACTORS]
        return {**base, "factors": recs, "summary": {r["factor_id"]: r["status"] for r in recs}, "provider": None}
    with gis.GDAL_LOCK:
        ctx = mod.get_mars_context(lat, lon, season_ls=season_ls, local_time=local_time)  # ValueError -> 422
    recs = [_guard(r) for r in ctx.get("factors", [])]
    got = {r.get("factor_id") for r in recs}
    recs += [_blank(f, "not_integrated", "not returned by the GIS factor library") for f in FACTORS if f not in got]
    return {**base, **{k: v for k, v in ctx.items() if k not in ("factors", "summary")}, "factors": recs,
            "summary": {r["factor_id"]: r["status"] for r in recs}, "provider": "terratwin_gis.factors"}

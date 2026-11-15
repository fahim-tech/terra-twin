"""Additional Mars scientific layers (``mars-factors-1.0``): Mars *characterization* at a coordinate.

These factors never enter OOM similarity, a ranking or a mission-suitability score. Each one is reported
with its status, so a factor the GIS workstream has not delivered reads ``not_integrated`` instead of a
number. Providers, in order (the first one that answers a factor wins):

1. ``terratwin_gis.factors.point(lat, lon) -> {factor_id: record}`` when the GIS library ships that module
   (the handoff point for new factors; see docs/gis-handoff-status.md);
2. the GIS context layers already delivered (``terratwin_gis.context_layers.point``);
3. otherwise ``not_integrated``.
"""
from __future__ import annotations

import importlib

from . import gis

CONTRACT_VERSION = "mars-factors-1.0"
STATUSES = ("available", "not_integrated", "outside_coverage", "unavailable", "unsupported_resolution", "error")

#: The six factors the GIS workstream is investigating, in display order.
FACTORS = {
    "rock_abundance": "Rock abundance",
    "thermal_inertia": "Thermal inertia",
    "geologic_unit": "Geologic unit",
    "surface_temperature": "Surface temperature",
    "swim_ice_potential": "Subsurface water-ice potential (SWIM)",
    "insolation": "Solar energy / insolation",
}
NOTE = ("Mars characterization only: these layers never change OOM similarity, a ranking or a mission-suitability "
        "score. Each value is reported at its own source resolution.")
_FIELDS = ("value", "units", "source", "spatial_resolution", "temporal_context", "state", "caveats", "reason")


def _blank(fid: str, status: str, reason: str, provider: str | None = None) -> dict:
    return {"id": fid, "label": FACTORS[fid], "status": status, "value": None, "units": None, "source": None,
            "spatial_resolution": None, "temporal_context": None, "state": None, "caveats": [], "reason": reason,
            "provider": provider}


def _normalize(fid: str, rec: dict, provider: str) -> dict:
    out = _blank(fid, "error", "provider returned an unknown status", provider)
    out.update({k: rec.get(k, out[k]) for k in _FIELDS})
    st = rec.get("status")
    out["status"] = st if st in STATUSES else "error"
    if out["status"] == "available" and out["value"] is None:
        out.update(status="unavailable", reason=out["reason"] or "provider returned no value")
    if out["status"] != "available":
        out["value"] = None  # never a number for a factor that is not available
    out["caveats"] = list(out["caveats"] or [])
    return gis.finite(out)


def _from_context(layer: dict, fid: str, extra_caveat: str | None = None) -> dict:
    missing = layer.get("missing_reason")
    if layer.get("value") is None:
        status = "outside_coverage" if missing and "coverage" in missing.lower() else "unavailable"
    else:
        status = "available"
    caveats = [c for c in (layer.get("comparability"), extra_caveat) if c]
    return _normalize(fid, {
        "status": status, "value": layer.get("value"), "units": layer.get("units"),
        "source": {"id": layer.get("source_id"), "product": layer.get("layer")},
        "spatial_resolution": layer.get("native_resolution"), "temporal_context": layer.get("temporal_context"),
        "state": layer.get("feature_state"), "caveats": caveats, "reason": missing,
    }, "gis.context_layers")


def mars_factors(lat: float, lon: float) -> dict:
    found: dict[str, dict] = {}
    try:
        gis.lib()
        connected = True
    except gis.GisUnavailable:
        connected = False
    if connected:
        try:  # 1. dedicated GIS factor module (optional; added by the GIS workstream)
            mod = importlib.import_module("terratwin_gis.factors")
            with gis.GDAL_LOCK:
                recs = mod.point(float(lat), float(lon)) or {}
            for fid, rec in recs.items():
                if fid in FACTORS and isinstance(rec, dict):
                    found[fid] = _normalize(fid, rec, "gis.factors")
        except ImportError:
            pass
        except Exception as e:  # a provider fault is reported per factor, never as a value
            for fid in FACTORS:
                found.setdefault(fid, _blank(fid, "error", f"GIS factor provider failed ({type(e).__name__})", "gis.factors"))
        try:  # 2. delivered context layers
            layers = gis.context_point("mars", lat, lon)["layers"]
            if "thermal_inertia" not in found and "tes_thermal_inertia_night" in layers:
                ti = dict(layers["tes_thermal_inertia_night"])
                day = (layers.get("tes_thermal_inertia_day") or {}).get("value")
                found["thermal_inertia"] = _from_context(ti, "thermal_inertia",
                                                         f"Night-time value; day-time map gives {day}" if day is not None else None)
            if "geologic_unit" not in found and "geologic_unit" in layers:
                g = dict(layers["geologic_unit"])
                if g.get("unit_description") and g.get("value") is not None:
                    g["value"] = f"{g['value']} · {g['unit_description']}"
                found["geologic_unit"] = _from_context(g, "geologic_unit")
        except (gis.GisUnavailable, OSError, ValueError, KeyError):
            pass
    reason = ("Not yet delivered by the GIS workstream (docs/gis-handoff-status.md)" if connected
              else "The GIS library is not connected on this server")
    factors = [found.get(fid) or _blank(fid, "not_integrated", reason) for fid in FACTORS]
    return {"contract_version": CONTRACT_VERSION, "query": {"lat": lat, "lon": lon}, "factors": factors, "note": NOTE}

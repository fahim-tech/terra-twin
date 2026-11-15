"""mars-factors-1.0 at the API boundary: GIS records passed through, honesty rules enforced, no GIS -> not_integrated."""
import sys
from types import ModuleType

from terratwin_api.services import factors as F
from terratwin_api.services import gis as GIS

from .test_gis import fake  # noqa: F401  (fixture)


def test_without_gis_every_factor_is_not_integrated(client, monkeypatch):
    def unavailable():
        raise GIS.GisUnavailable("no", ["x"])
    monkeypatch.setattr(GIS, "lib", unavailable)
    d = client.get("/api/gis/mars/factors?lat=18.4&lon=77.5").json()
    assert d["contract_version"] == "mars-factors-1.0" and [f["factor_id"] for f in d["factors"]] == list(F.FACTORS)
    assert all(f["status"] == "not_integrated" and f["value"] is None and f["reason"] for f in d["factors"])


def _module(records, seen):
    mod = ModuleType("terratwin_gis.factors")

    def get_mars_context(lat, lon, season_ls=None, local_time=None):
        if not -90 <= lat <= 90:
            raise ValueError("latitude out of range")
        seen.append((lat, lon, season_ls, local_time))
        return {"record_type": "mars_planetary_context", "factors": records, "request": {"season_ls": season_ls}}
    mod.get_mars_context = get_mars_context
    return mod


def test_gis_records_pass_through_with_the_honesty_rules(client, fake, monkeypatch):  # noqa: F811
    seen = []
    recs = [
        {"factor_id": "thermal_inertia", "status": "available", "value": 311, "unit": "J m-2 K-1 s-1/2", "source_id": "tes",
         "citation": "Putzig & Mellon 2007", "limitations": ["apparent TI"]},
        {"factor_id": "water_ice", "status": "outside_coverage", "value": 0.4, "reason": "outside SWIM coverage"},
        {"factor_id": "solar_energy", "status": "weird", "value": 1.0},
        {"factor_id": "rock_abundance", "status": "available", "value": float("nan"), "source_id": "x"},
    ]
    monkeypatch.setitem(sys.modules, "terratwin_gis.factors", _module(recs, seen))
    d = client.get("/api/gis/mars/factors?lat=18.4&lon=77.5&season_ls=90&local_time=14").json()
    by = {f["factor_id"]: f for f in d["factors"]}
    assert seen == [(18.4, 77.5, 90.0, 14.0)] and d["provider"] == "terratwin_gis.factors"
    assert by["thermal_inertia"]["value"] == 311 and by["thermal_inertia"]["citation"] == "Putzig & Mellon 2007"
    assert by["water_ice"]["value"] is None and by["water_ice"]["reason"] == "outside SWIM coverage"
    assert by["solar_energy"]["status"] == "error" and by["solar_energy"]["value"] is None
    assert by["rock_abundance"]["status"] == "unavailable"  # NaN is not a value
    assert by["geologic_unit"]["status"] == "not_integrated" and d["summary"]["geologic_unit"] == "not_integrated"
    assert client.get("/api/gis/mars/factors?lat=18&lon=77&season_ls=400").status_code == 422

"""mars-factors-1.0: every factor reported with a status, values only when available, providers additive."""
import sys
from types import ModuleType, SimpleNamespace

from terratwin_api.services import factors as F
from terratwin_api.services import gis as GIS

from .test_gis import fake  # noqa: F401  (fixture)


def test_without_gis_every_factor_is_not_integrated(client, monkeypatch):
    def unavailable():
        raise GIS.GisUnavailable("no", ["x"])
    monkeypatch.setattr(GIS, "lib", unavailable)
    d = client.get("/api/gis/mars/factors?lat=18.4&lon=77.5").json()
    assert d["contract_version"] == "mars-factors-1.0" and [f["id"] for f in d["factors"]] == list(F.FACTORS)
    assert all(f["status"] == "not_integrated" and f["value"] is None for f in d["factors"])


def test_delivered_context_layers_fill_thermal_inertia_and_geology(client, fake):  # noqa: F811
    fake.CL.point = lambda planet, lat, lon: {"layers": {
        "tes_thermal_inertia_night": {"layer": "tes_thermal_inertia_night", "source_id": "mars_tes_ti_putzig2007", "value": 311,
                                      "units": "J m-2 K-1 s-1/2", "feature_state": "measurement-derived", "missing_reason": None,
                                      "native_resolution": "20 pixels/degree (~2.96 km)", "comparability": "Mars-only context"},
        "tes_thermal_inertia_day": {"value": 298},
        "geologic_unit": {"layer": "geologic_unit", "source_id": "mars_geology_sim3292", "value": "HNt", "unit_description": "Hesperian and Noachian transition unit",
                          "units": "unit symbol", "feature_state": "interpreted", "missing_reason": None, "native_resolution": "1:20,000,000", "comparability": "label only"}}}
    d = {f["id"]: f for f in client.get("/api/gis/mars/factors?lat=18.4&lon=77.5").json()["factors"]}
    ti = d["thermal_inertia"]
    assert ti["status"] == "available" and ti["value"] == 311 and ti["source"]["id"] == "mars_tes_ti_putzig2007"
    assert any("298" in c for c in ti["caveats"])
    assert d["geologic_unit"]["value"].startswith("HNt") and d["rock_abundance"]["status"] == "not_integrated"


def test_a_gis_factor_module_is_picked_up_and_validated(client, fake, monkeypatch):  # noqa: F811
    mod = ModuleType("terratwin_gis.factors")
    mod.point = lambda lat, lon: {
        "rock_abundance": {"status": "available", "value": 0.12, "units": "fraction", "source": {"id": "tes_rock"}, "caveats": ["8 ppd"]},
        "insolation": {"status": "outside_coverage", "value": 5.0, "reason": "polar night"},
        "swim_ice_potential": {"status": "bogus", "value": 1}}
    monkeypatch.setitem(sys.modules, "terratwin_gis.factors", mod)
    d = {f["id"]: f for f in client.get("/api/gis/mars/factors?lat=40&lon=-150").json()["factors"]}
    assert d["rock_abundance"]["value"] == 0.12 and d["rock_abundance"]["provider"] == "gis.factors"
    assert d["insolation"]["status"] == "outside_coverage" and d["insolation"]["value"] is None  # never a number
    assert d["swim_ice_potential"]["status"] == "error" and d["swim_ice_potential"]["value"] is None

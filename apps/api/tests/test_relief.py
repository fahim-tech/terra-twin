"""Relief grids: the real pool array, labelled exactly; nulls for missing cells; honest 404 / 503."""
import json
from urllib.parse import quote

import numpy as np
import pytest

from terratwin_api.config import Settings
from terratwin_api.services import relief as RELIEF
from terratwin_api.services import research_store as RS

from .conftest import requires_data


def _url(window_id: str) -> str:
    return f"/api/earth/pool/{quote(window_id, safe='')}/relief"


def _grid(window_id: str) -> np.ndarray:
    meta = RS.pool_meta()
    return np.asarray(RS.pool_windows()[int(meta.index[meta.name == window_id][0])], dtype=float)


@requires_data
def test_relief_shape_and_labels_come_from_the_data(client):
    r = client.get(_url("Atacama Yungay"))
    assert r.status_code == 200
    d = r.json()
    from vendor.terratwin.oom_worker import PIX

    z = _grid("Atacama Yungay")
    assert (d["rows"], d["cols"]) == z.shape == (108, 108)
    assert len(d["elevation"]) == d["rows"] * d["cols"]
    assert d["cell_m"] == PIX and d["units"] == "m"
    # Window size is the one the pool payload publishes, and agrees with rows x cell size.
    assert d["window_km"] == client.get("/api/earth/pool").json()["window_km"]
    assert abs(d["rows"] * d["cell_m"] / 1000 - d["window_km"]) < 0.5
    meta = RS.pool_meta().set_index("name").loc["Atacama Yungay"]
    assert (d["lat"], d["lon"], d["kind"]) == (float(meta.lat), float(meta.lon), str(meta.kind))
    assert d["z_min"] == round(float(np.nanmin(z)), 1) and d["z_max"] == round(float(np.nanmax(z)), 1)
    assert d["orientation"]["row0"] == "north" and d["orientation"]["col0"] == "west"
    assert d["source"]["representation"] == "as_measured"
    assert d["source"]["sha256"] == RS.manifest()["files"]["earth_pool_463m.npy"]["sha256"]
    # Row-major, 0.1 m precision: spot-check against the array.
    for i, j in ((0, 0), (0, 107), (53, 54), (107, 0)):
        assert d["elevation"][i * d["cols"] + j] == pytest.approx(round(float(z[i, j]), 1), abs=1e-9)


@requires_data
def test_missing_cells_are_null_never_zero(client):
    r = client.get(_url("Netherlands farmland"))
    assert r.status_code == 200
    json.loads(r.text, parse_constant=lambda c: pytest.fail(f"non-JSON constant {c}"))  # no NaN/Infinity
    d = r.json()
    z = _grid("Netherlands farmland")
    nulls = np.array([v is None for v in d["elevation"]])
    assert nulls.sum() == np.isnan(z).sum() > 0
    assert (nulls == np.isnan(z).ravel()).all()
    meta = RS.pool_meta().set_index("name").loc["Netherlands farmland"]
    assert abs((1 - d["valid_fraction"]) - float(meta.water)) < 1e-9


@requires_data
def test_relief_is_north_up_west_left(client):
    """Geography check of the orientation claim (row 0 = north, column 0 = west)."""
    nl = np.array([np.nan if v is None else v for v in client.get(_url("Netherlands farmland")).json()["elevation"]]).reshape(108, 108)
    rows, cols = np.nonzero(np.isnan(nl))
    assert rows.mean() < 54 and cols.mean() < 54          # IJsselmeer / Markermeer water lies to the north-west
    assert np.nanmean(nl[54:, 54:]) > np.nanmean(nl[:54, :54])  # Veluwe high ground lies to the south-east
    mk = np.array([np.nan if v is None else v for v in client.get(_url("Mauna Kea")).json()["elevation"]]).reshape(108, 108)
    rows, cols = np.nonzero(np.isnan(mk))
    assert rows.mean() < 20 and cols.mean() > 88          # Pacific off the Hamakua coast: north-east corner


@requires_data
def test_window_ids_with_reserved_characters(client):
    d = client.get(_url("Arcadia gated #1")).json()
    assert d["id"] == "Arcadia gated #1" and len(d["elevation"]) == 108 * 108


@requires_data
def test_unknown_window_is_404(client):
    r = client.get(_url("not a pool window"))
    assert r.status_code == 404


@requires_data
def test_existing_pool_payload_unchanged(client):
    d = client.get("/api/earth/pool").json()
    assert d["window_km"] == 50 and set(d) == {"windows", "window_km", "note"}


@requires_data
def test_mars_relief_is_503_without_mosaic(client, monkeypatch):
    monkeypatch.setattr(RELIEF, "settings", Settings(mola_mosaic=None))
    r = client.get("/api/mars/relief?site=Jezero")
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert detail["reason"] == "MOLA mosaic not connected" and detail["status"] == "unavailable"
    assert detail["site"] == "Jezero" and "elevation" not in detail


@requires_data
def test_mars_relief_without_reader_stays_503(client, monkeypatch, tmp_path):
    mosaic = tmp_path / "Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
    mosaic.write_bytes(b"")
    monkeypatch.setattr(RELIEF, "settings", Settings(mola_mosaic=mosaic))
    monkeypatch.setattr(RELIEF, "_mola_reader", lambda: None)  # no GDAL on this server
    r = client.get("/api/mars/relief?site=Jezero")
    assert r.status_code == 503 and "no reader" in r.json()["detail"]["reason"]


def _fake_mosaic(monkeypatch, tmp_path, reader):
    mosaic = tmp_path / "Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
    mosaic.write_bytes(b"")
    monkeypatch.setattr(RELIEF, "settings", Settings(mola_mosaic=mosaic))
    monkeypatch.setattr(RELIEF, "_mola_reader", lambda: reader)
    RELIEF._mars_grid.cache_clear()
    return mosaic


@requires_data
def test_mars_relief_reads_the_zone_window_from_the_mosaic(client, monkeypatch, tmp_path):
    from vendor.terratwin.oom_worker import PIX

    calls = []
    z = np.add.outer(np.arange(108.0) * -2.0, np.arange(108.0)) - 1500.0  # north-west high, south low
    z[5, 7] = np.nan

    def reader(path, lat, lon, half_km, pix_m, resample):
        calls.append((path, lat, lon, half_km, pix_m, resample))
        return z.copy(), {"pix_m": pix_m}

    mosaic = _fake_mosaic(monkeypatch, tmp_path, reader)
    r = client.get("/api/mars/relief?site=Jezero")
    assert r.status_code == 200
    d = r.json()
    fp = RS.mars_footprints().loc["Jezero"]
    # The research comparison's window: 50 km centred on the zone, bilinear, the engine's pixel.
    assert calls == [(str(mosaic), float(fp.lat_c), float(fp.lon_c), 25.0, PIX, "bilinear")]
    assert (d["id"], d["planet"], d["lat"], d["lon"]) == ("Jezero", "mars", float(fp.lat_c), float(fp.lon_c))
    assert (d["rows"], d["cols"], d["window_km"], d["cell_m"], d["units"]) == (108, 108, 50.0, PIX, "m")
    assert len(d["elevation"]) == 108 * 108 and d["elevation"][5 * 108 + 7] is None
    assert d["elevation"][0] == round(float(z[0, 0]), 1) and d["elevation"][-1] == round(float(z[-1, -1]), 1)
    assert d["z_min"] == round(float(np.nanmin(z)), 1) and d["z_max"] == round(float(np.nanmax(z)), 1)
    assert d["valid_fraction"] == pytest.approx(1 - 1 / (108 * 108))
    assert d["orientation"]["row0"] == "north" and d["orientation"]["col0"] == "west" and "Mars" in d["orientation"]["frame"]
    assert d["source"]["dataset"] == "mola_mosaic" and d["source"]["representation"] == "as_measured"
    assert "not an observation resolution" in d["source"]["note"]
    # Read once per zone, then cached.
    assert client.get("/api/mars/relief?site=Jezero").status_code == 200 and len(calls) == 1


@requires_data
def test_mars_relief_read_failure_is_503_never_a_substitute(client, monkeypatch, tmp_path):
    def reader(*_a, **_k):
        raise RuntimeError("cannot open")

    _fake_mosaic(monkeypatch, tmp_path, reader)
    r = client.get("/api/mars/relief?site=Jezero")
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert detail["reason"].startswith("The MOLA mosaic could not be read") and "elevation" not in detail


@requires_data
def test_no_zone_window_comes_near_the_antimeridian():
    fp = RS.mars_footprints()
    assert len(fp) == 39
    assert not any(RELIEF.crosses_antimeridian(float(r.lat_c), float(r.lon_c), 25.0) for r in fp.itertuples())
    assert RELIEF.crosses_antimeridian(10.0, 179.8, 25.0) and RELIEF.crosses_antimeridian(-40.0, -179.5, 25.0)


@requires_data
def test_datasets_say_connected_only_when_the_rasters_exist(client, monkeypatch, tmp_path):
    from terratwin_api import config as CONFIG

    def status(ds_id):
        return next(d for d in client.get("/api/datasets").json()["datasets"] if d["id"] == ds_id)

    monkeypatch.setattr(CONFIG, "settings", Settings(mola_mosaic=None, megdr_counts_dir=None))
    assert status("mola_mosaic")["status"] == "missing" and status("mola_counts_tiles")["status"] == "missing"
    mosaic = tmp_path / "mosaic.tif"
    mosaic.write_bytes(b"")
    counts = tmp_path / "counts"
    counts.mkdir()
    for t in ("megc00n000hb.img", "megc44n000hb.img"):
        (counts / t).write_bytes(b"")
    monkeypatch.setattr(CONFIG, "settings", Settings(mola_mosaic=mosaic, megdr_counts_dir=counts))
    assert status("mola_mosaic")["status"] == "connected"
    tiles = status("mola_counts_tiles")
    assert tiles["status"] == "connected" and tiles["coverage"].startswith("2 of 16 tiles connected")


@requires_data
def test_mars_relief_unknown_site_is_404(client):
    assert client.get("/api/mars/relief?site=Atlantis").status_code == 404

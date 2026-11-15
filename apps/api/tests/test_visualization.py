"""Read-only visualization endpoints: real data only, valid images, counts match the research tables."""
import struct
import zlib

import numpy as np

from .conftest import requires_data


def _decode(png: bytes):
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", png[16:24])
    i, idat = 8, b""
    while i < len(png):
        n = struct.unpack(">I", png[i:i + 4])[0]
        t = png[i + 4:i + 8]
        if t == b"IDAT":
            idat += png[i + 8:i + 8 + n]
        i += 12 + n
    raw = zlib.decompress(idat)
    rows = np.frombuffer(raw, dtype=np.uint8).reshape(h, 1 + w * 4)
    assert (rows[:, 0] == 0).all()
    return w, h, rows[:, 1:].reshape(h, w, 4)


@requires_data
def test_research_summary_matches_key_numbers(client):
    sites = client.get("/api/research/summary").json()["sites"]
    assert len(sites) == 39
    assert sum(s["exclude"]["type"] == "named_leader" for s in sites) == 29
    assert sum(s["report"]["type"] == "named_leader" for s in sites) == 16
    jz = next(s for s in sites if s["site"] == "Jezero")
    assert jz["exclude"]["members"] == ["Atacama Yungay"] and jz["exclude"]["leader_S"] == 0.614
    assert jz["report"]["type"] == "tied_set" and len(jz["report"]["members"]) == 3


@requires_data
def test_pool_has_230_windows(client):
    w = client.get("/api/earth/pool").json()["windows"]
    assert len(w) == 230
    assert sum(x["kind"] == "negative control" for x in w) == 6
    assert not any(x["gate_pass"] for x in w if x["kind"] == "negative control")


@requires_data
def test_similarity_raster_is_valid_and_land_only(client):
    r = client.get("/api/visualization/tier1-similarity.png?site=Jezero&mission=landing_site")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    w, h, px = _decode(r.content)
    assert (w, h) == (1440, 720)
    alpha = px[..., 3]
    assert alpha.any()
    # Mid-Pacific (0°, -140°E) has no land cells: fully transparent
    assert alpha[360, (180 - 140) * 4] == 0


@requires_data
def test_coverage_raster_marks_land(client):
    _, _, px = _decode(client.get("/api/visualization/tier1-coverage.png").content)
    # Sahara (~23°N, 10°E) covered; mid-Atlantic (0°, -30°E) not
    assert px[int((90 - 23) * 4), int((180 + 10) * 4), 3] > 0
    assert px[360, int((180 - 30) * 4), 3] == 0


def test_legend_is_documented(client):
    lg = client.get("/api/visualization/legend").json()
    assert lg["tier1_similarity"]["name"] == "viridis" and len(lg["tier1_similarity"]["stops"]) == 10
    assert "not a probability" in lg["tier1_similarity"]["caveat"].lower()


@requires_data
def test_unknown_site_raster_404(client):
    assert client.get("/api/visualization/tier1-similarity.png?site=Nowhere").status_code == 404

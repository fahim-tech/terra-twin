"""Research-package ingestion: hashes, row counts, schema, coverage."""
import hashlib
from pathlib import Path

from terratwin_api.services import research_store as RS

from .conftest import requires_data

VENDOR = Path(__file__).resolve().parents[1] / "vendor" / "terratwin"


def test_vendored_engine_is_unmodified():
    for line in (VENDOR / "SHA256SUMS").read_text().splitlines():
        digest, name = line.split()
        assert hashlib.sha256((VENDOR / name).read_bytes()).hexdigest() == digest, name


@requires_data
def test_all_integrity_checks_pass():
    failed = [c for c in RS.validate() if not c.ok]
    assert not failed, failed


@requires_data
def test_reported_counts():
    assert len(RS.earth_screen()) == 249_165
    assert len(RS.mars_footprints()) == 39
    assert RS.pool_windows().shape == (230, 108, 108)
    assert len(RS.pool_meta()) == 230


@requires_data
def test_no_pickles_imported():
    assert not list(RS.settings.data_dir.glob("*.pkl"))


@requires_data
def test_mars_longitudes_are_east_positive():
    fp = RS.mars_footprints()
    assert fp.lon_c.between(-180, 180).all()
    assert abs(fp.loc["Jezero", "lon_c"] - 77.01) < 0.05      # Jezero is ~77.5°E
    assert abs(fp.loc["Gale", "lon_c"] - 137.21) < 0.05

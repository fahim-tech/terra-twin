"""Loads and validates the imported research artefacts (see scripts/import_research_package.py).

Nothing here computes science; it only reads files, checks their integrity against the import
manifest and the counts reported by the research package, and exposes typed accessors.
If the data directory is missing, every accessor raises ``ResearchDataUnavailable`` and the API
reports an explicit unavailable state instead of falling back to anything.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import settings

# Counts stated by the research package README / G-series documents.
EXPECTED = {
    "earth_global_screen_rows": 249_165,
    "mars_ez_count": 39,
    "earth_pool_windows": 230,
    "earth_pool_window_shape": (108, 108),
}
TIER1_COLUMNS = {
    "lat", "lon", "cell_km_ns", "cell_km_ew", "valid_data_fraction", "mean_elev_m", "mean_slope_deg",
    "slope_p90_deg", "relative_relief_m", "elev_std_m", "frac_exact_zero", "rmsdev_short", "rmsdev_long",
    "baseline_short_m", "baseline_long_m", "hurst_2pt",
}


class ResearchDataUnavailable(RuntimeError):
    pass


def _dir() -> Path:
    d = settings.data_dir
    if not (d / "manifest.json").is_file():
        raise ResearchDataUnavailable(
            f"research data not imported (expected {d}/manifest.json); run scripts/import_research_package.py")
    return d


def _csv(name: str) -> pd.DataFrame:
    return pd.read_csv(_dir() / name)


@lru_cache(maxsize=1)
def manifest() -> dict:
    return json.loads((_dir() / "manifest.json").read_text())


@lru_cache(maxsize=1)
def earth_screen() -> pd.DataFrame:
    df = pd.read_parquet(_dir() / "earth_global_screen.parquet")
    df.index.name = "row"
    return df


@lru_cache(maxsize=1)
def mars_footprints() -> pd.DataFrame:
    return _csv("mars_ez_footprints.csv").dropna(subset=["lat_c"]).set_index("site")


@lru_cache(maxsize=1)
def mars_tier1() -> pd.DataFrame:
    return _csv("mars_ez_tier1_median.csv").set_index("site")


@lru_cache(maxsize=1)
def mars_tier2_ez() -> pd.DataFrame:
    return _csv("mars_ez_features.csv").set_index("site")


@lru_cache(maxsize=1)
def mars_support() -> pd.DataFrame:
    return _csv("mars_ez_observational_support.csv").set_index("site")


@lru_cache(maxsize=1)
def mars_registration() -> pd.DataFrame:
    return _csv("oom_registration_check.csv").set_index("site")


@lru_cache(maxsize=1)
def pool_meta() -> pd.DataFrame:
    return _csv("earth_pool_meta.csv")


@lru_cache(maxsize=1)
def pool_landcover() -> pd.DataFrame:
    return _csv("oom_pool_landcover.csv").set_index("name")


@lru_cache(maxsize=1)
def pool_windows() -> np.ndarray:
    return np.load(_dir() / "earth_pool_463m.npy", mmap_mode="r", allow_pickle=False)


@lru_cache(maxsize=None)
def oom_decisions(gated: bool) -> pd.DataFrame:
    """Gate-then-rank decisions (exclude mode) or ungated decisions (report mode).

    Naming trap in the package: ``oom_real_mars_decisions_gated.csv`` is the UNGATED ranking
    annotated with land cover (rank-then-gate); the gate-then-rank result of G3 §8b / G5 is
    ``oom_real_mars_gated_decisions.csv`` (written by oom_gated.py).
    """
    return _csv("oom_real_mars_gated_decisions.csv" if gated else "oom_real_mars_decisions.csv")


@lru_cache(maxsize=1)
def oom_per_ez() -> pd.DataFrame:
    return _csv("oom_real_mars_per_ez.csv").set_index("site")


@lru_cache(maxsize=None)
def table(name: str) -> pd.DataFrame:
    return _csv(name)


@lru_cache(maxsize=None)
def key_numbers(name: str) -> dict:
    return json.loads((_dir() / name).read_text())


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


def _sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@lru_cache(maxsize=1)
def validate() -> tuple[Check, ...]:
    """Integrity + schema checks run once at start-up and exposed via /api/datasets."""
    out: list[Check] = []
    try:
        d = _dir()
    except ResearchDataUnavailable as e:
        return (Check("research_data_present", False, str(e)),)
    m = manifest()
    bad = [n for n, f in m["files"].items() if not (d / n).is_file() or _sha(d / n) != f["sha256"]]
    out.append(Check("file_hashes_match_manifest", not bad, "all match" if not bad else f"mismatch: {bad}"))
    e = earth_screen()
    out.append(Check("earth_screen_row_count", len(e) == EXPECTED["earth_global_screen_rows"], f"{len(e):,} rows"))
    miss = TIER1_COLUMNS - set(e.columns)
    out.append(Check("earth_screen_columns", not miss, "all tier-1 columns present" if not miss else f"missing {miss}"))
    lat_ok = e.lat.between(-90, 90).all() and e.lon.between(-180, 180).all()
    out.append(Check("earth_screen_coordinates_in_range", bool(lat_ok),
                     f"lat {e.lat.min():.2f}..{e.lat.max():.2f}, lon {e.lon.min():.2f}..{e.lon.max():.2f}"))
    out.append(Check("earth_screen_valid_fraction", bool((e.valid_data_fraction >= 0.6).all()),
                     f"min valid_data_fraction {e.valid_data_fraction.min():.3f}"))
    n_ez = len(mars_footprints())
    out.append(Check("mars_ez_count", n_ez == EXPECTED["mars_ez_count"], f"{n_ez} exploration zones"))
    pw = pool_windows()
    shape_ok = pw.shape == (EXPECTED["earth_pool_windows"], *EXPECTED["earth_pool_window_shape"])
    out.append(Check("earth_pool_shape", shape_ok, f"{pw.shape} {pw.dtype}"))
    out.append(Check("earth_pool_meta_rows", len(pool_meta()) == pw.shape[0], f"{len(pool_meta())} metadata rows"))
    return tuple(out)

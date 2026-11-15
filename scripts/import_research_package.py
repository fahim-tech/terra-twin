#!/usr/bin/env python3
"""Import the research artefacts the API needs from TerraTwin_AstroSUST_research_package.zip.

Only an explicit allow-list of CSV / JSON / Parquet / NumPy files is extracted. Pickles are never
extracted or loaded (untrusted archive). Every imported file is hashed and a manifest is written
next to the data so the API can report exactly which research release it is serving.

Usage:
    python3 scripts/import_research_package.py /path/to/TerraTwin_AstroSUST_research_package.zip
"""
from __future__ import annotations

import hashlib
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = "TerraTwin_AstroSUST_research_package/"
DEST = Path(__file__).resolve().parents[1] / "apps" / "api" / "data" / "research"

# (path inside package, short role description)
ALLOW = {
    "07_results_earlier_phases/mars_ez_footprints.csv": "39 Mars Exploration Zone footprints",
    "07_results_earlier_phases/mars_ez_features.csv": "Mars EZ tier-2 descriptors (200 km AOI)",
    "07_results_earlier_phases/mars_ez_tier1_median.csv": "Mars EZ tier-1 fingerprints",
    "07_results_earlier_phases/mars_ez_observational_support.csv": "MEGDR observed-bin fractions",
    "07_results_earlier_phases/earth_pool_meta.csv": "230-window tier-2 research pool metadata",
    "06_results_observation_operator/oom_real_mars_decisions.csv": "OOM decisions, report-only",
    "06_results_observation_operator/oom_real_mars_decisions_gated.csv": "OOM decisions, gate-then-rank",
    "06_results_observation_operator/oom_real_mars_per_ez.csv": "OOM per-EZ diagnostics",
    "06_results_observation_operator/oom_pool_landcover.csv": "WorldCover fractions, 230 pool windows",
    "06_results_observation_operator/oom_key_numbers.json": "OOM headline numbers",
    "06_results_observation_operator/oom_gated_key_numbers.json": "Gated OOM headline numbers",
    "06_results_observation_operator/oom_misspecification_matrix.csv": "Operator misspecification MRR",
    "06_results_observation_operator/oom_twin_mrr_ci.csv": "Twin MRR with bootstrap CI",
    "06_results_observation_operator/oom_fidelity_selection.csv": "Interpolator selection statistics",
    "06_results_observation_operator/oom_controls.csv": "Positive / negative control ranks",
    "06_results_observation_operator/oom_robustness.csv": "Robustness tests",
    "06_results_observation_operator/oom_registration_check.csv": "Half-pixel registration scan",
    "06_results_observation_operator/tier1_match_specificity.csv": "Tier-1 leader specificity",
    "08_data_products/earth_global_screen.parquet": "Tier-1 global Earth screen (GMTED2010)",
    "08_data_products/earth_pool_463m.npy": "230 Earth windows, 108x108 @ 463.09 m AEQD",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(zip_path: str) -> int:
    zp = Path(zip_path).expanduser().resolve()
    if not zp.is_file():
        print(f"error: {zp} not found", file=sys.stderr)
        return 2
    DEST.mkdir(parents=True, exist_ok=True)
    files = {}
    with zipfile.ZipFile(zp) as z:
        names = set(z.namelist())
        missing = [p for p in ALLOW if ROOT + p not in names]
        if missing:
            print("error: package is missing expected files:\n  " + "\n  ".join(missing), file=sys.stderr)
            return 3
        for rel, role in ALLOW.items():
            out = DEST / Path(rel).name           # flat layout, no path components from the archive
            with z.open(ROOT + rel) as src, out.open("wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
            files[out.name] = {"source_path": rel, "role": role, "bytes": out.stat().st_size, "sha256": sha256(out)}
            print(f"  {out.name:42s} {out.stat().st_size:>11,d} B")
    manifest = {
        "package": zp.name,
        "package_sha256": sha256(zp),
        "imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "research_phase": "G-series (OOM)",
        "excluded": "*.pkl (untrusted pickles are never loaded), figures, literature JSON",
        "files": files,
    }
    (DEST / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"imported {len(files)} files into {DEST}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))

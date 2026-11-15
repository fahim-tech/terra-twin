"""Runtime configuration. Every value can be overridden with an environment variable."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]

API_VERSION = "0.1.0"
# Version tags for the scientific components. Bump when the vendored engine or a contract changes.
RESEARCH_ENGINE_VERSION = "terratwin-research-G (09_code/terratwin, unmodified)"
TIER1_METHOD_VERSION = "mosaic-tier1-screen-0.1"
OOM_METHOD_VERSION = "oom-1.0"
CONTRACT_VERSION = "2026-11-15"


def _path(name: str, default: Path | None) -> Path | None:
    v = os.environ.get(name)
    return Path(v).expanduser() if v else default


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: _path("TERRATWIN_DATA_DIR", API_ROOT / "data" / "research"))
    # Raw rasters owned by the GIS workstream. Unset = not connected.
    megdr_counts_dir: Path | None = field(default_factory=lambda: _path("TERRATWIN_MEGDR_COUNTS_DIR", None))
    mola_mosaic: Path | None = field(default_factory=lambda: _path("TERRATWIN_MOLA_MOSAIC", None))
    # Optional GIS refinement provider, "package.module:function" (see docs/research-integration.md).
    gis_provider: str | None = field(default_factory=lambda: os.environ.get("TERRATWIN_GIS_PROVIDER") or None)
    cors_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        o.strip() for o in os.environ.get("TERRATWIN_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()))


settings = Settings()

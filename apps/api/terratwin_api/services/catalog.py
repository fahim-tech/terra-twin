"""Mission profiles and dataset catalogue.

Mission profiles map the product's mission vocabulary onto the research configuration that
actually exists. Nothing here invents a weight or threshold: tier-1 weights come from
``similarity.TIER1_MISSION_WEIGHTS`` (or equal weights, as used in the research specificity
table), and the tier-2 land-cover gate mode follows G5 section 4.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from vendor.terratwin import similarity as SIM

GateMode = Literal["exclude", "report"]


class MissionProfile(BaseModel):
    id: str
    label: str
    description: str
    available: bool
    research_key: str | None
    tier1_weights: dict[str, float] | None
    tier1_weights_source: str | None
    gate_mode: GateMode | None
    weights_status: str = "hypothesis"
    reason_unavailable: str | None = None


def _w(key: str) -> dict[str, float]:
    return dict(SIM.TIER1_MISSION_WEIGHTS[key])


EQUAL = {k: 1.0 for k in SIM.TIER1_FEATURES}

MISSIONS: list[MissionProfile] = [
    MissionProfile(
        id="landing_site", label="Landing Site",
        description="Landing hazard and touchdown terrain: slope tails and short-baseline roughness weighted up.",
        available=True, research_key="landing_engineering", tier1_weights=_w("landing_engineering"),
        tier1_weights_source="similarity.TIER1_MISSION_WEIGHTS['landing_engineering']", gate_mode="exclude"),
    MissionProfile(
        id="permanent_base", label="Permanent Base",
        description="Long-duration surface operations: balanced slope, relief and roughness.",
        available=True, research_key="permanent_base", tier1_weights=_w("permanent_base"),
        tier1_weights_source="similarity.TIER1_MISSION_WEIGHTS['permanent_base']", gate_mode="exclude"),
    MissionProfile(
        id="rover_mobility", label="Rover Mobility",
        description="Traverse planning and navigation: slope tails and roughness emphasised.",
        available=True, research_key="rover_mobility", tier1_weights=_w("rover_mobility"),
        tier1_weights_source="similarity.TIER1_MISSION_WEIGHTS['rover_mobility']", gate_mode="exclude"),
    MissionProfile(
        id="geological_exploration", label="Geological Exploration",
        description="Terrain texture across scales; Hurst exponent weighted up.",
        available=True, research_key="geological_exploration", tier1_weights=_w("geological_exploration"),
        tier1_weights_source="similarity.TIER1_MISSION_WEIGHTS['geological_exploration']", gate_mode="exclude"),
    MissionProfile(
        id="terrain_geometry_only", label="Terrain Geometry Only",
        description="DEM / remote-sensing algorithm testing. Equal weights; land cover reported, never used to exclude.",
        available=True, research_key="terrain_geometry_only", tier1_weights=EQUAL,
        tier1_weights_source="equal weights (as in tier1_match_specificity.csv)", gate_mode="report"),
    MissionProfile(
        id="surface_construction", label="Construction & Excavation",
        description="Regolith handling and excavation analogs.", available=False, research_key=None,
        tier1_weights=None, tier1_weights_source=None, gate_mode=None,
        reason_unavailable="No research-supplied configuration. Requires material/geotechnical datasets not in the package."),
    MissionProfile(
        id="resource_exploration", label="Resource Exploration",
        description="Water-ice and mineral resource analogs.", available=False, research_key=None,
        tier1_weights=None, tier1_weights_source=None, gate_mode=None,
        reason_unavailable="No research-supplied configuration. Ice / mineralogy layers are not connected."),
]

MISSION_BY_ID = {m.id: m for m in MISSIONS}


class Dataset(BaseModel):
    id: str
    title: str
    planet: Literal["mars", "earth", "both"]
    role: str
    status: Literal["imported", "connected", "visualization_only", "missing", "partial"]
    native_resolution: str | None = None
    coverage: str | None = None
    version: str | None = None
    url: str | None = None
    citation: str | None = None
    notes: str | None = None
    owner: str | None = None


DATASETS: list[Dataset] = [
    Dataset(id="earth_global_screen", title="TerraTwin tier-1 Earth screen (from GMTED2010 30″ mean)", planet="earth",
            role="Coarse global candidate retrieval (tier 1)", status="imported",
            native_resolution="~25 km cells; descriptors at ~1.85 km and ~7.4 km N-S baselines",
            coverage="249,165 land cells, lat -89.5..83.6; cells need >=60 % valid GMTED pixels",
            version="research package 08_data_products", url="https://data.nasa.gov/dataset/global-multi-resolution-terrain-elevation-data-2010-gmted2010",
            notes="Directional (N-S) screen statistics, not full 2-D tier-2 descriptors. Coarse cells can miss sub-25 km sites."),
    Dataset(id="mars_ez_tier1", title="Mars Exploration Zone tier-1 fingerprints", planet="mars",
            role="Mars target descriptors for tier 1", status="imported", native_resolution="463 m MOLA grid, 25 km cells, median over EZ",
            coverage="39 NASA human-landing Exploration Zones only",
            notes="Arbitrary Mars coordinates need the MOLA mosaic extraction service (GIS workstream)."),
    Dataset(id="mars_ez_support", title="MOLA MEGDR 128 ppd observation counts (per-EZ summary)", planet="mars",
            role="Observation support metadata", status="partial", native_resolution="1/128° bins (~463 m)",
            coverage="39 EZ summaries; raw counts tiles not imported",
            url="https://pds-geosciences.wustl.edu/missions/mgs/megdr.html",
            citation="MGS-M-MOLA-5-MEGDR-L3-V1.0", owner="GIS workstream",
            notes="Observed fraction is metadata, never a confidence or a score weight."),
    Dataset(id="mola_counts_tiles", title="MEGDR counts tiles megc*hb.img", planet="mars",
            role="Target-specific observation operator (OOM tier 2)", status="missing",
            coverage="10 of 16 tiles cover the 39 EZs; all 16 needed for global latitude bands",
            url="https://pds-geosciences.wustl.edu/missions/mgs/megdr.html", owner="GIS workstream"),
    Dataset(id="mola_mosaic", title="USGS Mars MGS MOLA DEM global mosaic 463 m", planet="mars",
            role="Mars elevation for arbitrary-coordinate features", status="missing", native_resolution="463 m grid (binned altimetry)",
            url="https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif", owner="GIS workstream",
            notes="~2.1 GB striped TIFF. Grid spacing is not observation resolution."),
    Dataset(id="earth_pool_463m", title="Tier-2 research pool: 230 Copernicus GLO-90 windows", planet="earth",
            role="Fixed tier-2 research sample (OOM experiment)", status="imported",
            native_resolution="108 × 108 px @ 463.09 m local AEQD (50 km)",
            coverage="230 windows: 213 stratified random + 17 named controls. Not a global high-resolution search.",
            url="https://registry.opendata.aws/copernicus-dem/"),
    Dataset(id="copernicus_glo90_live", title="Copernicus DEM GLO-90 on-demand windows", planet="earth",
            role="Refinement of new shortlisted candidates", status="missing", url="https://registry.opendata.aws/copernicus-dem/",
            owner="GIS workstream", notes="Surface model (includes vegetation/buildings), not bare earth."),
    Dataset(id="worldcover_2021", title="ESA WorldCover 10 m 2021 v200", planet="earth",
            role="Mission-conditional exposed-ground gate", status="partial",
            coverage="Precomputed fractions for the 230 pool windows; ~60°S-84°N", version="v200",
            notes="Thresholds bare-like ≥ 0.50, vegetated ≤ 0.20 are working hypotheses."),
    Dataset(id="mars_trek_viking", title="Mars Viking MDIM 2.1 colour mosaic (NASA Mars Trek WMTS)", planet="mars",
            role="Globe imagery", status="visualization_only", native_resolution="232 m",
            url="https://trek.nasa.gov/mars/", notes="Visualization only; never used to compute scientific features."),
    Dataset(id="mars_trek_mola_shade", title="MOLA colour shaded relief (NASA Mars Trek WMTS)", planet="mars",
            role="Globe overlay", status="visualization_only", native_resolution="463 m", url="https://trek.nasa.gov/mars/"),
    Dataset(id="gibs_blue_marble", title="NASA Blue Marble shaded relief (GIBS)", planet="earth", role="Globe imagery",
            status="visualization_only", native_resolution="500 m", url="https://gibs.earthdata.nasa.gov/"),
]


def datasets_now() -> list[dict]:
    """The catalogue as this server sees it: the GIS rasters read ``connected`` when their configured paths
    exist (``TERRATWIN_MOLA_MOSAIC``, ``TERRATWIN_MEGDR_COUNTS_DIR``), otherwise the static status above."""
    from ..config import settings

    out = []
    for d in DATASETS:
        rec = d.model_dump()
        if d.id == "mola_mosaic" and settings.mola_mosaic is not None and settings.mola_mosaic.is_file():
            rec["status"] = "connected"
        elif d.id == "mola_counts_tiles" and settings.megdr_counts_dir is not None and settings.megdr_counts_dir.is_dir():
            n = len(list(settings.megdr_counts_dir.glob("megc*hb.img")))
            if n:
                rec["status"] = "connected"
                rec["coverage"] = f"{n} of 16 tiles connected on this server; 10 of 16 cover the 39 EZs"
        out.append(rec)
    return out

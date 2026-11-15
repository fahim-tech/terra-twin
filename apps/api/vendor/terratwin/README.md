# Vendored research engine (`terratwin`)

Unmodified copy of `09_code/terratwin/` from `TerraTwin_AstroSUST_research_package.zip`
(Claude Science, G-series). `SHA256SUMS` records the hashes of the files as delivered; the
API test-suite checks them so that any local edit is caught.

Do **not** edit these files to change scientific behaviour. Replace the whole directory with a
new research release and bump `RESEARCH_ENGINE_VERSION` in `terratwin_api/config.py`.

Import status inside the API:

| Module | Imported by API | Notes |
|---|---|---|
| `similarity.py` | yes | tier-1 log-ratio kernel, `TIER1_FEATURES`, `TIER1_MISSION_WEIGHTS`, `verdict` |
| `terrain.py` | yes | tier-2 descriptors for the 230-window research pool (as measured) |
| `oom_analysis.py` | yes | `FEATS`, `SPECS`, `EQUAL_W` |
| `oom_worker.py`, `obsop.py`, `support.py` | yes (lazy) | used only when MEGDR counts tiles + MOLA mosaic are configured |
| `landcover.py`, `screen.py`, `aoi.py` | no | require GDAL (`osgeo`) and network rasters; owned by the GIS workstream |

# TerraTwin — Data, software and literature references

For the "NASA Data" and "Space Agency Partner Data & Other References" fields. Each row names the provider, the
product, the source URL, its native resolution and the feature it supports in TerraTwin.

## NASA data

| # | Product | Provider / ID | URL | Native resolution | Supports |
|---|---|---|---|---|---|
| 1 | MGS MOLA MEGDR shot-count products, 128 pixel/degree (`megc*hb.img`) | NASA PDS Geosciences Node, MGS-M-MOLA-5-MEGDR-L3-V1.0 | https://pds-geosciences.wustl.edu/missions/mgs/megdr.html | 1/128° (≈ 463 m) bins | The per-target observation mask of the operator; observed-fraction metadata shown beside every Mars number |
| 2 | Mars MGS MOLA DEM global mosaic, 463 m | USGS Astrogeology, from NASA MOLA | https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif | 463.09 m/px | All Mars terrain descriptors; Mars 3D relief; Mars feature records at any coordinate |
| 3 | MGS TES apparent thermal inertia (Putzig & Mellon 2007) | NASA PDS | https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/ | ~3 km | Mars context factor |
| 4 | MGS TES rock abundance (Nowicki & Christensen 2007) | ASU Mars Space Flight Facility (NASA) | http://ms-mars.mars.asu.edu/ | ~8 km | Mars context factor |
| 5 | Mars Odyssey GRS water-equivalent hydrogen | NASA PDS | https://pds-geosciences.wustl.edu/missions/odyssey/grs.html | 5° bins | Mars context layer |
| 6 | SWIM subsurface water-ice consistency (Morgan et al. 2021) | NASA-funded Subsurface Water Ice Mapping project (PSI) | https://swim.psi.edu/SWIM4MIMProducts.php | ~3 km | Mars context factor |
| 7 | JMARS yearly Mars surface temperature (KRC 2.3.2) | ASU Mars Space Flight Facility (NASA) | https://jmars.asu.edu/ | modelled | Mars context factor |
| 8 | NASA Mars Trek WMTS: Viking MDIM 2.1 colour mosaic; MOLA colour shaded relief | NASA JPL | https://trek.nasa.gov/mars/ | 232 m; 463 m | Mars globe imagery, visualization only |
| 9 | NASA GIBS Blue Marble shaded relief | NASA EOSDIS | https://gibs.earthdata.nasa.gov/ | 500 m | Earth globe imagery, visualization only |
| 10 | GMTED2010 30-arc-second mean elevation | USGS/NGA, catalogued on data.nasa.gov | https://data.nasa.gov/dataset/global-multi-resolution-terrain-elevation-data-2010-gmted2010 | 30″ (≈ 926 m) | Tier-1 screen of 249,165 Earth land cells |
| 11 | Exploration Zone footprints, First Landing Site / EZ Workshop (2015); Bussey & Hoffman (2016) | NASA; USGS CTX EZ mosaics; NTRS 20160001040 | https://ntrs.nasa.gov/citations/20160001040 | ~100 km zones | The 39 Mars targets |
| 12 | NSSDCA planetary fact sheets (Mars, Earth) | NASA GSFC | https://nssdc.gsfc.nasa.gov/planetary/factsheet/ | — | Planetary-differences table (gravity, pressure, atmosphere, temperature) |

## Space agency partner and other data

| Product | Provider | URL | Native resolution | Supports |
|---|---|---|---|---|
| Copernicus DEM GLO-90 (surface model) | ESA, via AWS Open Data | https://registry.opendata.aws/copernicus-dem/ | 3″ (≈ 90 m), aggregated to 463.09 m | Tier-2 50 km Earth windows (230 research windows and on-demand windows); Earth 3D relief |
| WorldCover 10 m 2021 v200 | ESA | https://esa-worldcover.org/ | 10 m | Mission-conditional exposed-ground gate |
| Geologic Map of Mars, SIM 3292 (Tanaka et al. 2014) | USGS | https://pubs.usgs.gov/sim/3292/ | 1:20,000,000 | Mars context factor (geologic unit) |
| Global aridity index v3 | CGIAR-CSI (Zomer et al.) | https://cgiarcsi.community/data/global-aridity-and-pet-database/ | 30″ | Earth context |
| Köppen–Geiger 1991–2020 (Beck et al. 2023) | open | https://www.gloh2o.org/koppen/ | 1 km | Earth context |
| Permafrost probability (Obu et al. 2019) | open | https://doi.org/10.1594/PANGAEA.888600 | 1 km | Earth context |
| Cesium Mars 3D Tiles (asset 3644333) | Cesium ion (optional) | https://cesium.com/ | — | Visualization only, when a token is set |

## Software (open source)

CesiumJS (Apache-2.0) · React · Vite · TypeScript · Tailwind CSS · Zustand · TanStack Query · Zod · Motion ·
lucide-react · FastAPI · Pydantic · uvicorn · NumPy · SciPy · pandas · pyarrow · GDAL · pyproj · rasterio ·
Playwright · uv · nginx · Vercel · AWS Lightsail. Fonts: Barlow, Barlow Semi Condensed, IBM Plex Mono, Noto Sans
(SIL Open Font License, Google Fonts).

## Literature

- Bodas-Salcedo, A. et al. (2011). COSP: Satellite simulation software for model assessment. *Bull. Amer. Meteor. Soc.* doi:10.1175/2011BAMS2856.1
- Swales, D. J., Pincus, R., Bodas-Salcedo, A. (2018). COSP version 2. *Geosci. Model Dev.* 11, 77. doi:10.5194/gmd-11-77-2018
- Janjić, T. et al. (2017). On the representation error in data assimilation. *Q. J. R. Meteorol. Soc.* doi:10.1002/qj.3130
- Carrassi, A., Bocquet, M., Bertino, L., Evensen, G. (2018). Data assimilation in the geosciences. *WIREs Climate Change.* doi:10.1002/wcc.535
- Gotway, C. A., Young, L. J. (2002). Combining incompatible spatial data. *J. Amer. Stat. Assoc.* doi:10.1198/016214502760047140
- Chow, C. (1970). On optimum recognition error and reject tradeoff. *IEEE Trans. Inf. Theory.* doi:10.1109/TIT.1970.1054406
- Kreslavsky, M. A., Head, J. W. (1999). Kilometer-scale slopes on Mars. *J. Geophys. Res.* 104(E9). doi:10.1029/1999JE001051
- Kreslavsky, M. A., Head, J. W. (2000). Kilometer-scale roughness of Mars. *J. Geophys. Res.* 105(E11). doi:10.1029/2000JE001259
- Shepard, M. K. et al. (2001). The roughness of natural terrain. *J. Geophys. Res.* doi:10.1029/2000JE001429
- Golombek, M. P. et al. (2003). Selection of the Mars Exploration Rover landing sites. *J. Geophys. Res.* doi:10.1029/2003JE002074
- Bussey, B., Hoffman, S. J. (2016). Human Mars landing site and impacts on Mars surface operations. NASA NTRS 20160001040
- Tanaka, K. L. et al. (2014). Geologic Map of Mars. USGS SIM 3292. doi:10.3133/sim3292
- Putzig, N. E., Mellon, M. T. (2007). Apparent thermal inertia and the surface heterogeneity of Mars. *Icarus* 191
- Nowicki, S. A., Christensen, P. R. (2007). Rock abundance on Mars from the Thermal Emission Spectrometer. *J. Geophys. Res.* 112
- Morgan, G. A. et al. (2021). Availability of subsurface water-ice resources in the northern mid-latitudes of Mars. *Nature Astronomy* 5
- Beck, H. E. et al. (2023). High-resolution (1 km) Köppen-Geiger maps for 1901–2099. *Scientific Data* 10
- Obu, J. et al. (2019). Northern Hemisphere permafrost map. *Earth-Science Reviews* 193
- Xiao, L. et al. (2017). A new terrestrial analogue site for Mars research: the Qaidam Basin. *Earth-Science Reviews* 164
- Mashal, Y., El-Maarry, M. R., Pajola, M., Kourakis, I. (2025). *Planet. Sci. J.* 6, 166. doi:10.3847/PSJ/ade30e
- Meng et al. (2024). Mars–Earth image similarity, Qaidam Basin. arXiv:2501.08584
- Voigt et al. (2025). Holuhraun–Elysium Planitia analog. *Planet. Sci. J.* doi:10.3847/PSJ/adb5f1
- Ryan et al. (2024). *Geosphere.* doi:10.1130/GES02712.1
- Azúa-Bustos, A. et al. (2022). The Atacama Desert as a Mars analog (dryness, oxidising soils)
- MacRobbie et al. (2025). *Analog Astronaut Research Journal.* doi:10.64889/k559ke75

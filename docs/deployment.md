# Deployment

## Production

| Part | Where | What |
|---|---|---|
| Frontend | Vercel project `terratwin`, https://terratwin-five.vercel.app | Static Vite build of `apps/web`. `apps/web/vercel.json` rewrites `/api/*` and `/v1/*` to the API host, so the browser only ever talks to the Vercel origin (no CORS, no mixed content). |
| API | us-east-1 Lightsail host `100.27.159.94` (SSH alias `trade-1`, user `ubuntu`), shared with other production services | systemd `terratwin-api` (`deploy/terratwin-api.service`): uvicorn on `127.0.0.1:8710` as the `terratwin` account, one worker, memory bounded. nginx site `deploy/nginx/terratwin-api.conf` serves it only for requests addressed to the host's IP. Code in `/srv/terratwin-app/api`, venv `/srv/terratwin-app/venv` built on the GIS conda env (so GDAL, numpy, pandas, scipy and pyarrow are the GIS versions). |
| Data | `/srv/terratwin` on the same host (the GIS workstream, repo `fahim-tech/terratwin-dataset`) | The USGS MOLA 463 m mosaic and the MEGDR counts tiles are connected read-only (`TERRATWIN_MOLA_MOSAIC`, `TERRATWIN_MEGDR_COUNTS_DIR`): Mars relief is served and `/api/datasets` reports them as connected. The research package tables ship with the API (`apps/api/data/research`). Nothing is downloaded to a laptop. |

Caveats: the Vercel-to-host hop is plain HTTP (the API serves public research data only and holds no secrets);
the API has no authentication or rate limit. The GIS live refinement (`TERRATWIN_GIS_PROVIDER`), discovery jobs,
the global ~1 km grids and the context layers are not wired yet; the app says so where they would appear.

### Redeploy

```bash
scripts/deploy-api.sh    # rsync apps/api (working tree, incl. apps/api/data/research) and deploy/, restart, health check
scripts/deploy-web.sh    # Vercel production build of the committed apps/web (HEAD), from a clean export
```

`deploy-web.sh` exports `HEAD` outside git before deploying, so Vercel builds exactly what is committed and no
Git integration is created. It needs `vercel login` on the machine that runs it.

### Server checks

```bash
ssh trade-1 'systemctl status terratwin-api --no-pager; journalctl -u terratwin-api -n 50 --no-pager'
curl -s http://100.27.159.94/api/health
curl -s 'https://terratwin-five.vercel.app/api/mars/relief?site=Jezero' | head -c 200
```

Undo on the host: `sudo systemctl disable --now terratwin-api`, remove `/etc/systemd/system/terratwin-api.service`
and `/etc/nginx/sites-enabled/terratwin-api` (then `sudo nginx -t && sudo systemctl reload nginx`), and delete
`/srv/terratwin-app`. The GIS workspace `/srv/terratwin` is not modified by the API.

## Any other host

Frontend: `cd apps/web && npm run build` and serve `apps/web/dist/` from any static host. A production build calls
the API on its own origin unless `VITE_API_BASE_URL` is set, so either proxy `/api` and `/v1` to the API (as
`vercel.json` does) or build with `VITE_API_BASE_URL=https://api.example.org` and allow that origin in the API's
`TERRATWIN_CORS_ORIGINS`. `base: "./"` makes the build path-agnostic. `dist/cesium/` holds Cesium workers and
assets and must be served with the app. `globe.html` must be same-origin with `index.html`, because the globe
iframes only accept messages from their parent origin.

API:

```bash
cd apps/api && uv sync --no-dev
TERRATWIN_CORS_LOCALHOST=0 TERRATWIN_CORS_ORIGINS=https://app.example.org \
  uv run uvicorn terratwin_api.main:app --host 0.0.0.0 --port 8000 --workers 1
```

- Import the research package on the server first (`scripts/import_research_package.py`). Data stays outside the
  static frontend.
- Mars relief needs the MOLA mosaic (`TERRATWIN_MOLA_MOSAIC`) and GDAL's Python bindings, which are not an API
  dependency; without them `GET /api/mars/relief` answers 503 with the reason.
- Memory: the tier-1 table is ~17 MB on disk. Each cached (site, mission) score adds ~10 MB. Expect ~400 MB RSS.
- Analyses are kept in process memory (last 256). Run a single worker, or accept that `/api/analysis/{id}` only
  resolves on the worker that created it.
- Expensive live refinement (GIS) should run in a bounded background job. The research records answer in < 1 s.

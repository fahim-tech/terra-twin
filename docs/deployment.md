# Deployment

## Frontend (static)

```bash
cd apps/web && VITE_API_BASE_URL=https://api.example.org npm run build
```

Deploy `apps/web/dist/` to any static host (Netlify, Cloudflare Pages, S3 + CloudFront, GitHub Pages).
`base: "./"` makes the build path-agnostic. `dist/cesium/` holds Cesium workers and assets and must be served with
the app. `globe.html` must be same-origin with `index.html`, because the globe iframes only accept messages from
their parent origin.

## API

```bash
cd apps/api && uv sync --no-dev
TERRATWIN_CORS_LOCALHOST=0 TERRATWIN_CORS_ORIGINS=https://app.example.org \
  uv run uvicorn terratwin_api.main:app --host 0.0.0.0 --port 8000 --workers 1
```

- Import the research package on the server first (`scripts/import_research_package.py`). Data stays outside the
  static frontend.
- Memory: the tier-1 table is ~17 MB on disk. Each cached (site, mission) score adds ~10 MB. Expect ~400 MB RSS.
- Analyses are kept in process memory (last 256). Run a single worker, or accept that `/api/analysis/{id}` only
  resolves on the worker that created it.
- Expensive live refinement (GIS) should run in a bounded background job. The research records answer in < 1 s.

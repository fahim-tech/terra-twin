"""TerraTwin API entry point: ``uvicorn terratwin_api.main:app``."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .config import API_VERSION, settings
from .routes.api import router

app = FastAPI(title="TerraTwin API", version=API_VERSION,
              description="Mars–Earth analog discovery. Tier-1 global screen + G-series OOM research records.")
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type"])
app.include_router(router)

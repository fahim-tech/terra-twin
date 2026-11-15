from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class MarsAnalysisRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180, description="east-positive")
    footprint_km: float = Field(25, gt=0, le=500)
    mission: str = "landing_site"


class AnalogSearchRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    footprint_km: float = Field(25, gt=0, le=500)
    mission: str = "landing_site"
    limit: int = Field(50, ge=1, le=500)


class CompareRequest(BaseModel):
    """G5 ``POST /v1/compare`` request."""
    site: str | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    mission: str = "landing_site"
    gate_mode: Literal["exclude", "report"] | None = None
    representation: Literal["mars_observation_space", "as_measured"] = "mars_observation_space"
    window_km: Literal[50, 25] = 50

    @model_validator(mode="after")
    def _target(self):
        if self.site is None and (self.lat is None or self.lon is None):
            raise ValueError("provide either site or lat+lon")
        return self


def assert_score_contract(obj) -> None:
    """G5 contract rule: never return S without coverage, representation and operator.status."""
    def walk(o, ctx):
        if isinstance(o, dict):
            if o.get("S") is not None and o.get("coverage") is None:
                raise AssertionError(f"S without coverage at {ctx}")
            for k, v in o.items():
                walk(v, f"{ctx}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{ctx}[{i}]")
    walk(obj, "$")
    if isinstance(obj, dict) and obj.get("candidates"):
        if any(c.get("S") is not None for c in obj["candidates"]):
            if not obj.get("representation") or not (obj.get("operator") or {}).get("status"):
                raise AssertionError("S returned without representation / operator.status")

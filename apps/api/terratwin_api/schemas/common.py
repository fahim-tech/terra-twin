"""Shared scientific data contract (mirrored by Zod schemas in apps/web/src/types/contracts.ts).

Rules enforced here:
  * missing data is ``None`` with an explicit ``state`` and ``reason`` -- never zero;
  * every numeric value carries a unit, a source and a measurement state;
  * a similarity score is never emitted without its coverage and representation.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Planet = Literal["mars", "earth"]

# How a value came to exist. "unavailable" / "insufficient_resolution" carry value=None.
MeasurementState = Literal[
    "measured", "derived", "modelled", "proxy", "unavailable", "insufficient_resolution",
]

# Status of a whole analysis or data product.
AvailabilityStatus = Literal[
    "available",          # real numbers are present
    "research_record",    # precomputed by the research package (fixed candidate pool)
    "unavailable",        # required inputs are not connected
    "unsupported",        # comparison is not scientifically valid as requested
    "pending",            # queued / running
    "failed",             # computation error
]

Representation = Literal["mars_observation_space", "as_measured"]
DecisionType = Literal["named_leader", "tied_set", "no_convincing_analog", "insufficient_evidence"]


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90, description="degrees")
    lon: float = Field(ge=-180, le=180, description="degrees, east-positive")


class CoordinateConvention(BaseModel):
    body: Planet
    latitude: str
    longitude: str
    reference: str


MARS_CONVENTION = CoordinateConvention(
    body="mars", latitude="planetocentric", longitude="east-positive, -180..180",
    reference="Mars sphere R = 3,396,190 m (IAU 2000; MOLA mosaic CRS)")
EARTH_CONVENTION = CoordinateConvention(
    body="earth", latitude="geodetic", longitude="east-positive, -180..180", reference="WGS84")


class FeatureValue(BaseModel):
    key: str
    label: str
    value: float | None
    unit: str
    state: MeasurementState
    source_id: str | None = None
    native_resolution_m: float | None = None
    baseline_m: float | None = None
    footprint: str | None = Field(None, description="spatial support the value was computed over")
    method: str | None = None
    reason: str | None = Field(None, description="why the value is missing or qualified")
    explanation: str | None = None


class QualityFlag(BaseModel):
    code: str
    severity: Literal["info", "warning", "critical"] = "info"
    message: str


class Provenance(BaseModel):
    source_id: str
    title: str
    version: str | None = None
    url: str | None = None
    citation: str | None = None


class Unavailable(BaseModel):
    status: AvailabilityStatus
    reason: str
    missing_inputs: list[str] = []
    owner: str | None = Field(None, description="workstream able to resolve this")

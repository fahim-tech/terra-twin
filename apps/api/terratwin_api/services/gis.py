"""Bridge to the GIS workstream's library, ``terratwin_gis`` (repo fahim-tech/terratwin-dataset, contract
``gis-contract-1.0``; see that repo's docs/INTEGRATION.md).

Where the library is installed (production: ``PYTHONPATH=/srv/terratwin/src`` inside the GIS conda
environment, data under ``TERRATWIN_DATA=/srv/terratwin/data``) the API calls it in-process and passes its
payloads through without dropping scientific metadata. This module adds only what a browser needs:

* discovery runs submitted to the GIS worker's file queue (the worker does the work), with polling,
  de-duplication, a cap on active runs and progress read from the run's own log;
* the cached run records the pipeline writes;
* point queries of the ~1 km grids and the context layers (tiles live in ``gis_tiles``);
* a typed ``unavailable`` state, with what is missing, when the library, its data or its worker is not
  connected. Nothing here computes or changes a score.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
import time
from collections import deque
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace

OWNER = "GIS workstream"

#: Discovery runs the worker may hold at once (pending, running or paused). The host also serves other
#: production sites, and the worker runs at most one job per CPU.
MAX_ACTIVE_DISCOVERY = 2
#: New discovery submissions accepted per hour from all clients: a guard for an unauthenticated API.
MAX_SUBMISSIONS_PER_HOUR = 12
#: The worker logs a resource sample every minute; older than this means it is not running.
HEARTBEAT_MAX_AGE_S = 180
#: Windows a discovery run refines. 40 is the GIS default; 20 halves the run time.
N_REFINE_CHOICES = (20, 40)
#: Fixed by terratwin_gis.pipeline.run_discovery (tier-1 candidates considered, refinement window).
TIER1_TOP_N = 600
WINDOW_KM = 50

JOB_ID = re.compile(r"^\d{8}T\d{6}-[0-9a-f]{8}$")
RUN_ID = re.compile(r"^[0-9a-f]{12}$")

#: GDAL datasets are not safe to share between threads; FastAPI runs sync routes in a thread pool.
GDAL_LOCK = threading.RLock()
_SUBMIT_LOCK = threading.Lock()
_SUBMISSIONS: deque[float] = deque()

#: How a job state reads in the UI (gis-contract-1.0: paused and blocked read as "queued — server busy",
#: never as a failure).
STATE_LABELS = {
    "pending": "Queued",
    "running": "Running",
    "paused": "Queued — server busy",
    "blocked": "Queued — server busy",
    "done": "Done",
    "failed": "Failed",
}


class GisUnavailable(Exception):
    """The library, its data or its worker is not connected; ``status`` says what is missing."""

    def __init__(self, reason: str, missing_inputs: list[str]):
        super().__init__(reason)
        self.status = {"status": "unavailable", "reason": reason, "missing_inputs": missing_inputs, "owner": OWNER}


class GisBusy(Exception):
    """The server will not take another discovery run now."""


class GisInputError(ValueError):
    """A request the GIS contract rejects (invalid_input)."""


# ------------------------------------------------------------------------------------------ library
@lru_cache(maxsize=1)
def _load() -> SimpleNamespace:
    try:
        from osgeo import gdal  # noqa: F401  (the GIS modules need it; fail with a clear reason)
    except ImportError as e:
        raise GisUnavailable("GDAL is not installed on this server", ["GDAL Python bindings (osgeo)"]) from e
    try:
        from terratwin_gis import (adapters, config, context_layers, earth_index, grids, jobs, mars,
                                   pipeline)
    except ImportError as e:
        raise GisUnavailable("The GIS library is not installed on this server",
                             ["terratwin_gis on PYTHONPATH (repo fahim-tech/terratwin-dataset)"]) from e
    return SimpleNamespace(AD=adapters, C=config, CL=context_layers, EI=earth_index, grids=grids, jobs=jobs,
                           MARS=mars, PL=pipeline)


def lib() -> SimpleNamespace:
    """The GIS modules, or GisUnavailable. Tests replace this function."""
    return _load()


def finite(obj):
    """JSON-safe copy: non-finite floats become null (missing values are never shown as numbers)."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: finite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [finite(v) for v in obj]
    if hasattr(obj, "item") and callable(obj.item):  # numpy scalar
        return finite(obj.item())
    return obj


def _iso(t: float | None) -> str | None:
    return None if t is None else datetime.fromtimestamp(float(t), tz=timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------------------------------------------ status
def worker_heartbeat(L: SimpleNamespace) -> dict:
    """The GIS worker's latest resource sample (it writes one a minute while it runs)."""
    path = Path(L.C.LOGS) / "resource_monitor.jsonl"
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            f.seek(max(0, f.tell() - 4096))
            last = [ln for ln in f.read().decode("utf-8", "replace").splitlines() if ln.strip()][-1]
        rec = json.loads(last)
        t = datetime.fromisoformat(rec["t"].replace("Z", "+00:00")).timestamp()
    except (OSError, ValueError, KeyError, IndexError):
        return {"alive": False, "age_s": None, "running": None, "paused": None}
    age = max(0.0, time.time() - t)
    return {"alive": age <= HEARTBEAT_MAX_AGE_S, "age_s": round(age), "running": rec.get("running"),
            "paused": rec.get("paused")}


def _job_files(L: SimpleNamespace):
    q = Path(L.jobs.Q)
    return sorted(q.glob("*.json")) if q.is_dir() else []


def _active_discovery(L: SimpleNamespace) -> list[dict]:
    out = []
    for p in _job_files(L):
        try:
            j = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        if j.get("kind") == "discovery" and j.get("status") in ("pending", "running"):
            out.append(L.jobs.get(j["job_id"]))  # resolves "paused" from the guard events
    return out


def discovery_status(L: SimpleNamespace) -> dict:
    hb = worker_heartbeat(L)
    q = Path(L.jobs.Q)
    active = _active_discovery(L)
    base = {"worker": hb, "active_runs": len(active), "max_active_runs": MAX_ACTIVE_DISCOVERY,
            "n_refine_choices": list(N_REFINE_CHOICES), "window_km": WINDOW_KM}
    if not hb["alive"]:
        return {"status": "unavailable", "reason": "The GIS worker is not running, so a discovery run would wait "
                "indefinitely", "missing_inputs": ["terratwin-worker service"], **base}
    if not (q.is_dir() and os.access(q, os.W_OK)):
        return {"status": "unavailable", "reason": "The API cannot write to the GIS job queue",
                "missing_inputs": [f"write access to {q}"], **base}
    return {"status": "available", "reason": None, "missing_inputs": [], **base}


def status() -> dict:
    """What of the GIS contract this server can serve right now."""
    try:
        L = lib()
    except GisUnavailable as e:
        return {**e.status, "contract_version": None, "grids": {}, "context": {"available": False},
                "discovery": {"status": "unavailable", "reason": e.status["reason"],
                              "missing_inputs": e.status["missing_inputs"]}}
    grids = {}
    for planet in ("mars", "earth"):
        try:
            with GDAL_LOCK:
                prov = L.grids.info(planet)["provenance"]
            grids[planet] = {"available": True, "product": prov["product"]}
        except Exception as e:  # GridUnavailable when a product is not built
            grids[planet] = {"available": False, "reason": str(e)}
    return {"status": "available", "reason": None, "missing_inputs": [], "owner": OWNER,
            "contract_version": L.C.CONTRACT_VERSION, "processing_version": L.C.PROCESSING_VERSION,
            "method_version": L.C.OOM_METHOD_VERSION, "grids": grids, "context": {"available": True},
            "discovery": discovery_status(L)}


# ------------------------------------------------------------------------------------------ Mars + tier 1
def _check(rec: dict) -> dict:
    if rec.get("status") == "invalid_input":
        raise GisInputError((rec.get("error") or {}).get("message", "invalid input"))
    return finite(rec)


@lru_cache(maxsize=256)
def _mars_features(lat: float, lon: float) -> dict:
    with GDAL_LOCK:
        return lib().AD.get_mars_features(lat, lon, 25.0)


def mars_features(lat: float, lon: float) -> dict:
    """The GIS Mars feature record for any coordinate (planetocentric, east-positive), 50 km window."""
    lib()
    return _check(_mars_features(round(float(lat), 4), round(float(lon), 4)))


@lru_cache(maxsize=64)
def _tier1(lat: float, lon: float, mission: str, top_n: int) -> dict:
    rec = _mars_features(lat, lon)
    if rec.get("status") != "ok" or not rec.get("tier1"):
        return {"status": rec.get("status", "unavailable"), "reasons": rec.get("reasons", []), "candidates": [],
                "mars_region_id": rec.get("region_id")}
    with GDAL_LOCK:
        return lib().AD.search_earth_coarse(rec, mission, footprint_km=25.0, top_n=top_n)


def tier1_search(lat: float, lon: float, mission: str, top_n: int = 50) -> dict:
    """Global tier-1 screen (249,165 cells, server-side) for any Mars coordinate: the top ``top_n`` cells."""
    L = lib()
    if mission not in L.EI.MISSIONS:
        raise GisInputError(f"mission must be one of {list(L.EI.MISSIONS)}")
    return _check(_tier1(round(float(lat), 4), round(float(lon), 4), mission, int(top_n)))


# ------------------------------------------------------------------------------------------ discovery
def discovery_params(lat: float, lon: float, mission: str, n_refine: int) -> dict:
    """The job parameters, normalised exactly as terratwin_gis.pipeline.run_discovery normalises them."""
    L = lib()
    try:
        lat = float(L.MARS.validate_lat(float(lat)))
        lon = float(L.MARS.normalize_lon(float(lon)))
    except ValueError as e:
        raise GisInputError(str(e)) from e
    if mission not in L.EI.MISSIONS:
        raise GisInputError(f"mission must be one of {list(L.EI.MISSIONS)}")
    if n_refine not in N_REFINE_CHOICES:
        raise GisInputError(f"n_refine must be one of {list(N_REFINE_CHOICES)}")
    return {"lat": lat, "lon": lon, "mission": mission, "n_refine": int(n_refine), "window_km": WINDOW_KM,
            "gate_mode": None}


def run_id_for(p: dict) -> str:
    """The run id terratwin_gis.pipeline.run_discovery gives these parameters (same hash, same order)."""
    L = lib()
    key = [p["lat"], p["lon"], p["mission"], p["n_refine"], TIER1_TOP_N, p["window_km"], p["gate_mode"], False,
           L.C.PROCESSING_VERSION]
    return hashlib.sha1(json.dumps(key).encode()).hexdigest()[:12]


def _runs_dir(L: SimpleNamespace) -> Path:
    return Path(L.C.DERIVED) / "runs"


def _same(a: dict, b: dict) -> bool:
    keys = ("lat", "lon", "mission", "n_refine", "window_km", "gate_mode")
    return all(a.get(k) == b.get(k) for k in keys)


def _rate_check() -> None:
    now = time.time()
    while _SUBMISSIONS and now - _SUBMISSIONS[0] > 3600:
        _SUBMISSIONS.popleft()
    if len(_SUBMISSIONS) >= MAX_SUBMISSIONS_PER_HOUR:
        raise GisBusy(f"This server has accepted {MAX_SUBMISSIONS_PER_HOUR} discovery runs in the last hour; "
                      "try again later")


def submit_discovery(lat: float, lon: float, mission: str, n_refine: int = 40, name: str | None = None) -> dict:
    """Return the cached run for these parameters, the run already queued for them, or a new queued job."""
    L = lib()
    p = discovery_params(lat, lon, mission, n_refine)
    rid = run_id_for(p)
    if (_runs_dir(L) / f"{rid}.json").is_file():
        return {"job_id": None, "status": "done", "state_label": STATE_LABELS["done"], "run_id": rid,
                "cached": True, "params": {**p, "name": name}}
    ds = discovery_status(L)
    if ds["status"] != "available":
        raise GisUnavailable(ds["reason"], ds["missing_inputs"])
    with _SUBMIT_LOCK:
        active = _active_discovery(L)
        for j in active:
            if _same(j.get("params", {}), p):
                return job_view(L, j)
        if len(active) >= MAX_ACTIVE_DISCOVERY:
            raise GisBusy(f"{len(active)} discovery runs are already queued or running on this server; "
                          "try again when one finishes")
        _rate_check()
        jid = L.jobs.submit("discovery", {**p, "name": name}, mem_estimate_mb=1500, disk_estimate_gb=1.0)
        _SUBMISSIONS.append(time.time())
    return job_view(L, L.jobs.get(jid))


def _progress(L: SimpleNamespace, rid: str) -> dict | None:
    """Where the run is, read from the pipeline's own log (data/derived/runs/<run_id>.log)."""
    path = _runs_dir(L) / f"{rid}.log"
    try:
        lines = path.read_text(errors="replace").splitlines()
    except OSError:
        return None
    start = max((i for i, ln in enumerate(lines) if f"run {rid}: target" in ln), default=None)
    if start is None:
        return None
    out = {"stage": "mars", "stage_label": "Reading the Mars target", "cells_scored": None,
           "windows_ready": None, "windows_target": None, "last_line": lines[-1].strip()[:200]}
    for ln in lines[start + 1:]:
        if m := re.search(r"tier-1: (\d+) cells scored", ln):
            out.update(stage="tier1", stage_label="Global tier-1 screen", cells_scored=int(m.group(1)))
        elif m := re.search(r"window (\d+)/(\d+):", ln):
            k, n = int(m.group(1)), int(m.group(2))
            out.update(stage="windows", stage_label="Extracting Copernicus GLO-90 windows", windows_ready=k,
                       windows_target=n)
            if k == n:
                out.update(stage="refine", stage_label="Comparing windows in Mars observation space")
        elif ln.split(" ", 1)[-1].startswith("decision "):
            out.update(stage="decision", stage_label="Decision made")
    return out


def job_view(L: SimpleNamespace, j: dict) -> dict:
    """A discovery job as the browser sees it: state, its words, timing, queue place, progress, error."""
    st = j.get("status", "missing")
    prm = j.get("params", {})
    p = {k: prm.get(k) for k in ("lat", "lon", "mission", "n_refine", "window_km", "gate_mode")}
    rid = run_id_for(p) if None not in (p["lat"], p["lon"], p["mission"], p["n_refine"], p["window_km"]) else None
    now = time.time()
    started, finished = j.get("started"), j.get("finished")
    view = {
        "job_id": j.get("job_id"), "kind": j.get("kind"), "status": st, "state_label": STATE_LABELS.get(st, st),
        "run_id": rid, "cached": False, "params": {**p, "name": prm.get("name")},
        "submitted": _iso(j.get("submitted")), "started": _iso(started), "finished": _iso(finished),
        "elapsed_s": round((finished or now) - started) if started else None,
        "queue_position": None, "progress": None, "error": None,
    }
    if st == "pending":
        mine = j.get("submitted") or now
        ahead = 0
        for f in _job_files(L):
            try:
                o = json.loads(f.read_text())
            except (OSError, ValueError):
                continue
            if o.get("status") == "pending" and (o.get("submitted") or 0) < mine:
                ahead += 1
        view["queue_position"] = ahead + 1
    if st in ("running", "paused", "done") and rid:
        view["progress"] = _progress(L, rid)
    if st in ("failed", "blocked"):
        err = j.get("error") or {}
        view["error"] = {"type": err.get("type"), "message": err.get("message")}  # never the trace
    if st == "done":
        res = j.get("result") or {}
        view["result_status"] = res.get("status")
        view["run_available"] = bool(rid and (_runs_dir(L) / f"{rid}.json").is_file())
    return view


def job(job_id: str) -> dict | None:
    if not JOB_ID.match(job_id):
        raise GisInputError("not a job id")
    L = lib()
    j = L.jobs.get(job_id)
    if j.get("status") == "missing" or j.get("kind") != "discovery":
        return None
    return job_view(L, j)


@lru_cache(maxsize=32)
def _run_file(path: str, mtime: float) -> dict:
    with open(path) as f:
        return finite(json.load(f))


def run(run_id: str) -> dict | None:
    """A discovery run record as the pipeline wrote it (data/derived/runs/<run_id>.json)."""
    if not RUN_ID.match(run_id):
        raise GisInputError("not a run id")
    L = lib()
    p = _runs_dir(L) / f"{run_id}.json"
    if not p.is_file():
        return None
    return _run_file(str(p), p.stat().st_mtime)


def runs() -> list[dict]:
    """Summaries of the cached discovery runs, newest first."""
    L = lib()
    d = _runs_dir(L)
    out = []
    for p in sorted(d.glob("*.json")) if d.is_dir() else []:
        if not RUN_ID.match(p.stem):
            continue
        try:
            r = _run_file(str(p), p.stat().st_mtime)
        except (OSError, ValueError):
            continue
        ref = r.get("refinement") or {}
        dec = ref.get("decision") or {}
        tgt = ref.get("target") or {}
        out.append({
            "run_id": p.stem, "status": r.get("status"),
            "target": {"site": tgt.get("site"), "lat": tgt.get("lat"), "lon": tgt.get("lon")},
            "mission": ref.get("mission"), "window_km": ref.get("window_km"),
            "n_refine": (ref.get("shortlist_selection") or {}).get("n_requested"),
            "decision": {"type": dec.get("type"), "members": dec.get("members", [])},
            "number_of_windows_refined": ref.get("number_of_windows_refined"),
            "candidate_pool_scope": ref.get("candidate_pool_scope"),
            "seconds": r.get("seconds"), "finished": _iso(p.stat().st_mtime),
        })
    return sorted(out, key=lambda r: r["finished"] or "", reverse=True)


# ------------------------------------------------------------------------------------------ grids + context
PLANETS = ("mars", "earth")


def _planet(planet: str) -> str:
    if planet not in PLANETS:
        raise GisInputError("planet must be mars or earth")
    return planet


#: Earth surface classes of earth_grid_1km_v1 (GSHHG 2.3.7; gis-contract-1.0 §8.2).
SURFACE_CLASS = {1: "land", 2: "ocean", 3: "inland water", 4: "ice shelf"}


def grid_point(planet: str, lat: float, lon: float) -> dict:
    L = lib()
    with GDAL_LOCK:
        rec = L.grids.point(_planet(planet), float(lat), float(lon))
    rec = finite(rec)
    if planet == "earth":
        sc = (rec.get("values") or {}).get("surface_class")
        rec["surface_class_label"] = SURFACE_CLASS.get(sc) if sc is not None else None
    return rec


def context_point(planet: str, lat: float, lon: float) -> dict:
    L = lib()
    with GDAL_LOCK:
        return finite(L.CL.point(_planet(planet), float(lat), float(lon)))


def context_catalog() -> dict:
    return finite(lib().CL.catalog())


def clear_caches() -> None:
    """Forget cached GIS answers (tests, or after the GIS data is rebuilt)."""
    _mars_features.cache_clear()
    _tier1.cache_clear()
    _run_file.cache_clear()

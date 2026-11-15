"""Analysis registry. Analyses are fast (< 1 s), so they run synchronously; the id lets the frontend and the
report view re-fetch a result and its evidence without recomputation.

Recent analyses stay in memory. When ``TERRATWIN_ANALYSIS_DIR`` is set, each one is also written there as
JSON, so an id still resolves after the API restarts (the newest ``_MAX_FILES`` are kept)."""
from __future__ import annotations

import json
import os
import re
import threading
import uuid
from collections import OrderedDict
from pathlib import Path

_MAX = 256
_MAX_FILES = 5000
_ID = re.compile(r"^[0-9a-f]{12}$")
_lock = threading.Lock()
_items: OrderedDict[str, dict] = OrderedDict()


def _dir() -> Path | None:
    d = os.environ.get("TERRATWIN_ANALYSIS_DIR")
    return Path(d) if d else None


def _persist(aid: str, rec: dict) -> None:
    d = _dir()
    if d is None:
        return
    try:
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / f".{aid}.{os.getpid()}.tmp"
        tmp.write_text(json.dumps(rec, default=str))
        os.replace(tmp, d / f"{aid}.json")
        files = sorted(d.glob("*.json"), key=lambda p: p.stat().st_mtime)
        for p in files[:-_MAX_FILES]:
            p.unlink(missing_ok=True)
    except OSError:
        pass  # memory still serves it


def put(record: dict) -> str:
    aid = uuid.uuid4().hex[:12]
    rec = record | {"id": aid}
    with _lock:
        _items[aid] = rec
        while len(_items) > _MAX:
            _items.popitem(last=False)
    _persist(aid, rec)
    return aid


def get(aid: str) -> dict | None:
    with _lock:
        if aid in _items:
            return _items[aid]
    d = _dir()
    if d is None or not _ID.match(aid):
        return None
    try:
        return json.loads((d / f"{aid}.json").read_text())
    except (OSError, ValueError):
        return None

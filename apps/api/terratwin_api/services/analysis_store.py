"""In-memory analysis registry. Analyses are fast (< 1 s), so they run synchronously; the id lets the
frontend and the report view re-fetch a result and its evidence without recomputation."""
from __future__ import annotations

import threading
import uuid
from collections import OrderedDict

_MAX = 256
_lock = threading.Lock()
_items: OrderedDict[str, dict] = OrderedDict()


def put(record: dict) -> str:
    aid = uuid.uuid4().hex[:12]
    with _lock:
        _items[aid] = record | {"id": aid}
        while len(_items) > _MAX:
            _items.popitem(last=False)
    return aid


def get(aid: str) -> dict | None:
    with _lock:
        return _items.get(aid)

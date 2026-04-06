from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from time import monotonic
from typing import Generic, TypeVar

from app.core.config import settings
from app.core.schemas import SearchSource, SourceContent


T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class CacheItem(Generic[T]):
    value: T
    expires_at: float


class TTLCache(Generic[T]):
    def __init__(self, ttl_seconds: int, max_entries: int) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds 必须大于 0")
        if max_entries <= 0:
            raise ValueError("max_entries 必须大于 0")
        self._ttl_seconds = float(ttl_seconds)
        self._max_entries = int(max_entries)
        self._items: "OrderedDict[str, CacheItem[T]]" = OrderedDict()

    def get(self, key: str) -> T | None:
        now = monotonic()
        item = self._items.get(key)
        if item is None:
            return None
        if item.expires_at <= now:
            self._items.pop(key, None)
            return None
        self._items.move_to_end(key)
        return item.value

    def set(self, key: str, value: T) -> None:
        now = monotonic()
        self._items[key] = CacheItem(value=value, expires_at=now + self._ttl_seconds)
        self._items.move_to_end(key)
        self._evict()

    def _evict(self) -> None:
        now = monotonic()
        expired_keys: list[str] = []
        for key, item in self._items.items():
            if item.expires_at <= now:
                expired_keys.append(key)
        for key in expired_keys:
            self._items.pop(key, None)

        while len(self._items) > self._max_entries:
            self._items.popitem(last=False)


source_cache = TTLCache[SourceContent](
    ttl_seconds=settings.cache_ttl_seconds,
    max_entries=settings.cache_max_entries,
)


discover_sources_cache = TTLCache[list[SearchSource]](
    ttl_seconds=settings.discover_cache_ttl_seconds,
    max_entries=settings.discover_cache_max_entries,
)

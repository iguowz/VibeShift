from __future__ import annotations

import asyncio

from app.core.schemas import SourceContent
from app.services.cache_service import source_cache
from app.services.content_cleaner import extract_main_content
from app.services.content_fetcher import fetch_html


class SourceResolver:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._tasks: dict[str, asyncio.Task[SourceContent]] = {}

    async def _fetch_and_extract(self, url: str, cache_key: str) -> SourceContent:
        html = await fetch_html(url)
        source = extract_main_content(html, source_url=url)
        source_cache.set(cache_key, source)
        return source

    async def resolve_url(self, url: str, use_cache: bool) -> tuple[SourceContent, bool]:
        if not use_cache:
            html = await fetch_html(url)
            return extract_main_content(html, source_url=url), False

        cache_key = f"source:{url}"
        cached = source_cache.get(cache_key)
        if cached is not None:
            return cached, True

        owner = False
        async with self._lock:
            cached = source_cache.get(cache_key)
            if cached is not None:
                return cached, True

            task = self._tasks.get(cache_key)
            if task is None:
                task = asyncio.create_task(self._fetch_and_extract(url, cache_key))
                self._tasks[cache_key] = task
                owner = True

        try:
            source = await task
            return source, False
        finally:
            if owner:
                async with self._lock:
                    self._tasks.pop(cache_key, None)


source_resolver = SourceResolver()

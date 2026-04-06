import asyncio
from uuid import uuid4

from app.core.schemas import SourceContent
from app.services.cache_service import source_cache
from app.services.source_resolver import SourceResolver


def test_source_resolver_deduplicates_concurrent_fetches(monkeypatch) -> None:
    resolver = SourceResolver()
    url = f"https://example.com/resolver-{uuid4().hex}"
    fetch_calls = 0

    async def fake_fetch_html(_: str) -> str:
        nonlocal fetch_calls
        fetch_calls += 1
        await asyncio.sleep(0.01)
        return "<html></html>"

    def fake_extract_main_content(_: str, source_url: str | None = None):
        return SourceContent(
            title="共享标题",
            source_url=source_url,
            raw_excerpt="共享摘要",
            full_text="共享正文",
        )

    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)

    async def run_scenario():
        first_batch = await asyncio.gather(
            resolver.resolve_url(url, use_cache=True),
            resolver.resolve_url(url, use_cache=True),
        )
        cached = await resolver.resolve_url(url, use_cache=True)
        return first_batch, cached

    first_batch, cached = asyncio.run(run_scenario())

    assert fetch_calls == 1
    assert all(used_cache is False for _, used_cache in first_batch)
    assert cached[1] is True
    assert source_cache.get(f"source:{url}") is not None

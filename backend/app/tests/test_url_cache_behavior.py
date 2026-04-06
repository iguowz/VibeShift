import asyncio
from uuid import uuid4

from app.core.schemas import CacheOptions, ImageConfig, InputType, LLMConfig, SourceContent, TransformRequest
from app.services.cache_service import source_cache
from app.services.transform_service import TransformService


def test_transform_uses_cached_source_for_url(monkeypatch) -> None:
    service = TransformService()
    url = "https://example.com/cached"

    source_cache.set(
        f"source:{url}",
        SourceContent(
            title="缓存标题",
            source_url=url,
            raw_excerpt="缓存摘要",
            full_text="缓存正文内容" * 50,
        ),
    )

    async def fake_fetch_html(_: str) -> str:
        raise AssertionError("fetch_html should not be called when cache hits")

    def fake_extract_main_content(_: str, source_url: str | None = None):
        raise AssertionError("extract_main_content should not be called when cache hits")

    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)

    async def fake_rewrite(messages, config):
        return "转换完成"

    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)

    payload = TransformRequest(
        input_type=InputType.URL,
        input=url,
        style_prompt="请改写。",
        llm=LLMConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-4o-mini",
            temperature=0.7,
            max_tokens=256,
            top_p=1,
        ),
        image=ImageConfig(enabled=False),
        cache=CacheOptions(enabled=True),
    )

    result = asyncio.run(service.transform(payload))
    assert result.title == "缓存标题"
    assert result.meta.used_cache is True


def test_transform_fetches_when_cache_disabled(monkeypatch) -> None:
    service = TransformService()
    url = "https://example.com/nocache"

    async def fake_fetch_html(_: str) -> str:
        return "<html><title>T</title><body><article>hello world " + ("x" * 200) + "</article></body></html>"

    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)

    async def fake_rewrite(messages, config):
        return "转换完成"

    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)

    payload = TransformRequest(
        input_type=InputType.URL,
        input=url,
        style_prompt="请改写。",
        llm=LLMConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-4o-mini",
            temperature=0.7,
            max_tokens=256,
            top_p=1,
        ),
        image=ImageConfig(enabled=False),
        cache=CacheOptions(enabled=False),
    )

    result = asyncio.run(service.transform(payload))
    assert result.meta.used_cache is False


def test_transform_deduplicates_concurrent_fetch_for_same_url(monkeypatch) -> None:
    service = TransformService()
    url = f"https://example.com/singleflight-{uuid4().hex}"
    fetch_calls = 0

    async def fake_fetch_html(_: str) -> str:
        nonlocal fetch_calls
        fetch_calls += 1
        await asyncio.sleep(0.01)
        return "<html></html>"

    def fake_extract_main_content(_: str, source_url: str | None = None):
        return SourceContent(
            title="并发标题",
            source_url=source_url,
            raw_excerpt="摘要",
            full_text="正文内容" * 80,
        )

    async def fake_rewrite(messages, config):
        return "转换完成"

    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)
    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)

    payload = TransformRequest(
        input_type=InputType.URL,
        input=url,
        style_prompt="请改写。",
        llm=LLMConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-4o-mini",
            temperature=0.7,
            max_tokens=256,
            top_p=1,
        ),
        image=ImageConfig(enabled=False),
        cache=CacheOptions(enabled=True),
    )

    async def run_scenario():
        concurrent_results = await asyncio.gather(service.transform(payload), service.transform(payload))
        cached_result = await service.transform(payload)
        return concurrent_results, cached_result

    concurrent_results, cached_result = asyncio.run(run_scenario())

    assert fetch_calls == 1
    assert all(result.meta.used_cache is False for result in concurrent_results)
    assert cached_result.meta.used_cache is True
    assert source_cache.get(f"source:{url}") is not None

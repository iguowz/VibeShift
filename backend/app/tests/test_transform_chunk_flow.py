import asyncio

from app.core.schemas import ImageConfig, InputType, LLMConfig, TransformRequest
from app.services.transform_service import TransformService


def test_transform_service_uses_chunk_pipeline_for_long_text(monkeypatch) -> None:
    service = TransformService()
    long_text = "这是一个较长的段落。" * 1200
    payload = TransformRequest(
        input_type=InputType.TEXT,
        input=long_text,
        style_prompt="请整理成流畅的中文文章。",
        llm=LLMConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-4o-mini",
            temperature=0.6,
            max_tokens=800,
            top_p=0.9,
        ),
        image=ImageConfig(enabled=False),
    )

    calls: list[list[dict[str, str]]] = []

    async def fake_rewrite(messages, config):
        calls.append(messages)
        user_content = messages[-1]["content"]
        if "请先规划整篇文章的结构" in user_content:
            return "# 推荐标题\n\n## TL;DR\n- 要点一"
        if "当前是第 1/2 个分块" in user_content:
            return "分块一"
        if "当前是第 2/2 个分块" in user_content:
            return "分块二"
        if "请检查下面这篇改写稿" in user_content:
            return "最终校验结果"
        return "最终合并结果"

    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)
    monkeypatch.setattr(
        service.chunking_service,
        "split_text",
        lambda text, chunk_size, overlap: [
            type("Chunk", (), {"index": 1, "content": "第一块"})(),
            type("Chunk", (), {"index": 2, "content": "第二块"})(),
        ],
    )

    result = asyncio.run(service.transform(payload))

    assert result.transformed_text == "最终校验结果"
    assert len(calls) == 5
    assert any(artifact.label == "rewrite-outline" for artifact in result.run.artifacts)
    assert any(artifact.label == "rewrite-verified" for artifact in result.run.artifacts)


def test_transform_service_rewrites_chunks_concurrently(monkeypatch) -> None:
    service = TransformService()
    long_text = "这是一个较长的段落。" * 1200
    payload = TransformRequest(
        input_type=InputType.TEXT,
        input=long_text,
        style_prompt="请整理成流畅的中文文章。",
        llm=LLMConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-4o-mini",
            temperature=0.6,
            max_tokens=800,
            top_p=0.9,
        ),
        image=ImageConfig(enabled=False),
    )

    in_flight = 0
    max_in_flight = 0

    async def fake_rewrite(messages, config):
        nonlocal in_flight, max_in_flight
        user_content = messages[-1]["content"]
        if "请先规划整篇文章的结构" in user_content:
            return "# 推荐标题\n\n## TL;DR\n- 要点一"
        if "当前是第" in user_content:
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
            try:
                await asyncio.sleep(0.01)
                return user_content.split("当前是第 ", 1)[1].split(" 个分块", 1)[0]
            finally:
                in_flight -= 1
        if "请检查下面这篇改写稿" in user_content:
            return "最终校验结果"
        return "最终合并结果"

    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)
    monkeypatch.setattr(
        service.chunking_service,
        "split_text",
        lambda text, chunk_size, overlap: [
            type("Chunk", (), {"index": 1, "content": "第一块"})(),
            type("Chunk", (), {"index": 2, "content": "第二块"})(),
            type("Chunk", (), {"index": 3, "content": "第三块"})(),
        ],
    )

    result = asyncio.run(service.transform(payload))

    assert result.transformed_text == "最终校验结果"
    assert max_in_flight >= 2


def test_transform_service_serializes_chunks_for_ollama(monkeypatch) -> None:
    service = TransformService()
    long_text = "这是一个较长的段落。" * 1200
    payload = TransformRequest(
        input_type=InputType.TEXT,
        input=long_text,
        style_prompt="请整理成流畅的中文文章。",
        llm=LLMConfig(
            provider="ollama",
            base_url="http://host.docker.internal:11434/v1",
            api_key="ollama",
            model="qwen3.5:4b",
            temperature=0.6,
            max_tokens=3000,
            top_p=0.9,
        ),
        image=ImageConfig(enabled=False),
    )

    in_flight = 0
    max_in_flight = 0
    max_tokens_used: list[int] = []

    async def fake_rewrite(messages, config):
        nonlocal in_flight, max_in_flight
        user_content = messages[-1]["content"]
        max_tokens_used.append(config.max_tokens)
        if "请先规划整篇文章的结构" in user_content:
            return "# 推荐标题\n\n## TL;DR\n- 要点一"
        if "当前是第" in user_content:
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
            try:
                await asyncio.sleep(0.01)
                return user_content.split("当前是第 ", 1)[1].split(" 个分块", 1)[0]
            finally:
                in_flight -= 1
        return "最终合并结果"

    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)
    monkeypatch.setattr(
        service.chunking_service,
        "split_text",
        lambda text, chunk_size, overlap: [
            type("Chunk", (), {"index": 1, "content": "第一块"})(),
            type("Chunk", (), {"index": 2, "content": "第二块"})(),
            type("Chunk", (), {"index": 3, "content": "第三块"})(),
        ],
    )

    result = asyncio.run(service.transform(payload))

    assert result.transformed_text == "最终合并结果"
    assert max_in_flight == 1
    assert max_tokens_used == [900, 1200, 1200, 1200, 2200]
    assert any(artifact.label == "rewrite-outline" for artifact in result.run.artifacts)
    assert not any(artifact.label == "rewrite-verified" for artifact in result.run.artifacts)


def test_transform_service_supports_multiple_urls(monkeypatch) -> None:
    service = TransformService()
    payload = TransformRequest(
        input_type=InputType.URL,
        input="https://example.com/a\nhttps://example.com/b",
        style_prompt="请整理成简洁清晰的中文稿件。",
        llm=LLMConfig(
            provider="ollama",
            base_url="http://localhost:11434/v1",
            api_key="ollama",
            model="qwen3.5:4b",
            temperature=0.6,
            max_tokens=800,
            top_p=0.9,
        ),
        image=ImageConfig(enabled=False),
    )

    async def fake_resolve_url(url: str, use_cache: bool):
        return (
            type(
                "Source",
                (),
                {
                    "title": f"标题-{url[-1]}",
                    "source_url": url,
                    "raw_excerpt": f"摘要-{url[-1]}",
                    "full_text": f"正文-{url[-1]} " * 80,
                },
            )(),
            False,
        )

    async def fake_rewrite(messages, config):
        return "合并后的改写结果"

    monkeypatch.setattr("app.services.transform_service.source_resolver.resolve_url", fake_resolve_url)
    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)

    result = asyncio.run(service.transform(payload))

    assert result.title == "标题-a 等 2 篇内容整理"
    assert "来源 1" in result.raw_excerpt or result.raw_excerpt
    assert result.transformed_text == "合并后的改写结果"

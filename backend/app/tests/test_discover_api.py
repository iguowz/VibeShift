import asyncio

from fastapi.testclient import TestClient

from app.core.schemas import SearchSource, SourceContent
from app.main import app
from app.services.cache_service import discover_sources_cache
from app.services.discover_service import DiscoverService
from app.services.llm_service import LLMService
from app.services.search_service import SearchResult, SearchService


client = TestClient(app)


def test_discover_returns_sources_and_report(monkeypatch) -> None:
    monkeypatch.setattr("app.services.discover_service.settings.discover_followup_enabled", False)

    async def fake_search(self, query: str, max_results: int):  # noqa: ANN001
        return [
            SearchResult(title="Example A", url="https://example.com/a", snippet="snippet a"),
            SearchResult(title="Example B", url="https://example.com/b", snippet="snippet b"),
        ]

    async def fake_fetch_html(url: str) -> str:
        return f"<html><title>{url}</title><body>content {url}</body></html>"

    def fake_extract_main_content(html: str, source_url: str | None = None):  # noqa: ANN001
        return SourceContent(
            title="示例标题",
            source_url=source_url,
            raw_excerpt="摘要",
            full_text="正文内容",
        )

    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        content = "\n".join(message["content"] for message in messages)
        if "请先抽取可复用的证据项" in content:
            return """
            {
              "evidence": [
                {
                  "source_id": 1,
                  "title": "示例标题",
                  "url": "https://example.com/a",
                  "quote": "正文内容",
                  "evidence": "FastAPI 适合需要高开发效率的 API 服务",
                  "relevance": "可支撑对框架定位的判断"
                },
                {
                  "source_id": 2,
                  "title": "示例标题",
                  "url": "https://example.com/b",
                  "quote": "正文内容",
                  "evidence": "类型提示与异步能力是主要优势",
                  "relevance": "可支撑技术优势判断"
                }
              ]
            }
            """
        if "请先做证据优先的研究简报" in content:
            return """
            {
              "summary": "已整理出初步研究简报",
              "conclusion": "FastAPI 适合需要高开发效率和类型提示的 API 服务 [1]",
              "key_findings": ["异步能力与类型提示是主要优势"],
              "evidence": [
                {
                  "source_id": 1,
                  "title": "示例标题",
                  "url": "https://example.com/a",
                  "evidence": "正文内容",
                  "relevance": "可支撑对框架定位的判断"
                }
              ],
              "uncertainties": ["缺少真实生产压测数据"],
              "draft_outline": ["结论", "证据", "建议"]
            }
            """
        if "整理成一份可转写草稿" in content:
            return "## 调研目标\n- FastAPI 最佳实践\n\n## 关键证据\n- 正文内容 [1]"
        return "## 结论 / TL;DR\n- 测试结论 [1]\n\n## 参考链接\n- [1] 示例标题 - https://example.com/a"

    monkeypatch.setattr(SearchService, "search", fake_search)
    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)
    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/discover",
        json={
            "query": "fastapi 最佳实践",
            "style_prompt": "用简洁条目输出",
            "cache": {"enabled": False},
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "fastapi 最佳实践"
    assert "TL;DR" in data["transformed_text"]
    assert data["brief"]["conclusion"].startswith("FastAPI")
    assert data["brief"]["evidence"][0]["source_id"] == 1
    assert len(data["sources"]) >= 1
    assert data["meta"]["sources"] == len(data["sources"])
    assert data["meta"]["evidence_items"] == 1
    assert data["meta"]["uncertainties"] == 1
    assert data["run"]["mode"] == "discover"
    assert len(data["run"]["steps"]) >= 5
    assert any(item["label"] == "抽取证据" for item in data["run"]["steps"])
    assert any(item["label"] == "证据简报" for item in data["run"]["steps"])
    assert any(item["label"] == "生成草稿" for item in data["run"]["steps"])
    assert any(item["label"] == "discover-evidence" for item in data["run"]["artifacts"])
    assert data["brief"]["evidence"][0]["quote"] == "正文内容"
    assert data["sources"][0]["relevance_score"] >= 0
    assert data["sources"][0]["credibility_score"] >= 0
    assert data["sources"][0]["overall_score"] >= 0
    assert data["sources"][0]["source_type"]
    assert data["sources"][0]["capture_mode"] in {"full", "snippet"}


def test_discover_uses_cache_for_sources(monkeypatch) -> None:
    # Clear cache between tests
    discover_sources_cache._items.clear()  # type: ignore[attr-defined]
    monkeypatch.setattr("app.services.discover_service.settings.discover_followup_enabled", False)

    counter = {"calls": 0}

    async def fake_search(self, query: str, max_results: int):  # noqa: ANN001
        counter["calls"] += 1
        return [
            SearchResult(title="Example A", url="https://example.com/a", snippet="snippet a"),
        ]

    async def fake_fetch_html(url: str) -> str:
        return "<html><body>content</body></html>"

    def fake_extract_main_content(html: str, source_url: str | None = None):  # noqa: ANN001
        return SourceContent(
            title="示例标题",
            source_url=source_url,
            raw_excerpt="摘要",
            full_text="正文内容",
        )

    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        content = "\n".join(message["content"] for message in messages)
        if "请先抽取可复用的证据项" in content:
            return """
            {
              "evidence": [
                {
                  "source_id": 1,
                  "title": "示例标题",
                  "url": "https://example.com/a",
                  "quote": "content",
                  "evidence": "content",
                  "relevance": "enough"
                }
              ]
            }
            """
        return "## 结论 / TL;DR\n- OK [1]\n\n## 参考链接\n- [1] 示例标题 - https://example.com/a"

    monkeypatch.setattr(SearchService, "search", fake_search)
    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)
    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    payload = {
        "query": "cache test query",
        "style_prompt": "用简洁条目输出",
        "cache": {"enabled": True},
        "llm": {
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-demo",
            "model": "gpt-4o-mini",
            "temperature": 0.7,
            "max_tokens": 1200,
            "top_p": 1,
        },
    }

    first = client.post("/api/discover", json=payload)
    assert first.status_code == 200
    assert counter["calls"] == 1

    second = client.post("/api/discover", json=payload)
    assert second.status_code == 200
    assert counter["calls"] == 1


def test_discover_prefers_relevant_search_results(monkeypatch) -> None:
    monkeypatch.setattr("app.services.discover_service.settings.discover_followup_enabled", False)

    async def fake_search(self, query: str, max_results: int):  # noqa: ANN001
        return [
            SearchResult(title="无关结果", url="https://example.com/low", snippet="无关", relevance_score=0.2),
            SearchResult(title="FastAPI 最佳实践", url="https://example.com/high", snippet="高相关", relevance_score=7.8),
        ]

    async def fake_fetch_html(url: str) -> str:
        return f"<html><body>{url}</body></html>"

    def fake_extract_main_content(html: str, source_url: str | None = None):  # noqa: ANN001
        return SourceContent(
            title="示例标题",
            source_url=source_url,
            raw_excerpt="摘要",
            full_text="正文内容",
        )

    monkeypatch.setattr(SearchService, "search", fake_search)
    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)

    sources = asyncio.run(DiscoverService()._build_sources("FastAPI 最佳实践"))

    assert len(sources) == 1
    assert str(sources[0].url) == "https://example.com/high"
    assert sources[0].relevance_score == 7.8


def test_discover_keeps_snippet_only_sources_when_page_fetch_fails(monkeypatch) -> None:
    monkeypatch.setattr("app.services.discover_service.settings.discover_followup_enabled", False)

    async def fake_search(self, query: str, max_results: int):  # noqa: ANN001
        return [
            SearchResult(
                title="知乎回答",
                url="https://www.zhihu.com/question/123",
                snippet="这是搜索摘要",
                source_type="qa",
                relevance_score=5.4,
                credibility_score=5.2,
                overall_score=5.32,
            ),
        ]

    async def fake_resolve(url: str, use_cache: bool):  # noqa: ANN001
        raise RuntimeError("blocked")

    monkeypatch.setattr(SearchService, "search", fake_search)
    monkeypatch.setattr("app.services.discover_service.source_resolver.resolve_url", fake_resolve)

    sources = asyncio.run(DiscoverService()._build_sources("FastAPI 最佳实践"))

    assert len(sources) == 1
    assert sources[0].capture_mode == "snippet"
    assert "仅基于搜索摘要保留" in sources[0].excerpt
    assert sources[0].source_type == "qa"


def test_discover_falls_back_when_brief_json_is_invalid(monkeypatch) -> None:
    monkeypatch.setattr("app.services.discover_service.settings.discover_followup_enabled", False)

    async def fake_search(self, query: str, max_results: int):  # noqa: ANN001
        return [
            SearchResult(title="Example A", url="https://example.com/a", snippet="snippet a"),
            SearchResult(title="Example B", url="https://example.com/b", snippet="snippet b"),
        ]

    async def fake_fetch_html(url: str) -> str:
        return "<html><body>content</body></html>"

    def fake_extract_main_content(html: str, source_url: str | None = None):  # noqa: ANN001
        return SourceContent(
            title="示例标题",
            source_url=source_url,
            raw_excerpt="摘要",
            full_text="这里是比较完整的正文内容，用于支撑后续调研整理。",
        )

    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        content = "\n".join(message["content"] for message in messages)
        if "请先抽取可复用的证据项" in content:
            return """
            {
              "evidence": [
                {
                  "source_id": 1,
                  "title": "示例标题",
                  "url": "https://example.com/a",
                  "quote": "这里是比较完整的正文内容",
                  "evidence": "可支撑后续调研整理",
                  "relevance": "足以进入简报阶段"
                }
              ]
            }
            """
        if "请先做证据优先的研究简报" in content:
            return "这不是 JSON"
        if "整理成一份可转写草稿" in content:
            return "## 调研目标\n- fallback\n\n## 关键证据\n- 内容 [1]"
        return "## 结论 / TL;DR\n- fallback [1]\n\n## 参考链接\n- [1] 示例标题 - https://example.com/a"

    monkeypatch.setattr(SearchService, "search", fake_search)
    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)
    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/discover",
        json={
            "query": "fallback query",
            "style_prompt": "简洁输出",
            "cache": {"enabled": False},
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["brief"]["summary"]
    assert len(data["brief"]["evidence"]) >= 1


def test_discover_can_resume_from_brief_artifacts(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr("app.services.discover_service.settings.discover_followup_enabled", False)
    monkeypatch.setattr("app.services.discover_service.settings.runs_directory", str(tmp_path))
    monkeypatch.setattr("app.services.workflow_service.settings.runs_directory", str(tmp_path))

    counters = {
        "search_calls": 0,
        "rewrite_calls": 0,
    }

    async def fake_search(self, query: str, max_results: int):  # noqa: ANN001
        counters["search_calls"] += 1
        return [
            SearchResult(title="Example A", url="https://example.com/a", snippet="snippet a"),
            SearchResult(title="Example B", url="https://example.com/b", snippet="snippet b"),
        ]

    async def fake_fetch_html(url: str) -> str:
        return f"<html><title>{url}</title><body>content {url}</body></html>"

    def fake_extract_main_content(html: str, source_url: str | None = None):  # noqa: ANN001
        return SourceContent(
            title="示例标题",
            source_url=source_url,
            raw_excerpt="摘要",
            full_text="正文内容",
        )

    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        counters["rewrite_calls"] += 1
        content = "\n".join(message["content"] for message in messages)
        if "请先抽取可复用的证据项" in content:
            return """
            {
              "evidence": [
                {
                  "source_id": 1,
                  "title": "示例标题",
                  "url": "https://example.com/a",
                  "quote": "正文内容",
                  "evidence": "第一次证据项",
                  "relevance": "第一次证据"
                }
              ]
            }
            """
        if "请先做证据优先的研究简报" in content:
            return """
            {
              "summary": "第一次简报",
              "conclusion": "第一次结论 [1]",
              "key_findings": ["第一次发现"],
              "evidence": [{"source_id": 1, "title": "示例标题", "url": "https://example.com/a", "quote": "正文内容", "evidence": "正文内容", "relevance": "第一次证据"}],
              "uncertainties": [],
              "draft_outline": ["第一次提纲"]
            }
            """
        if "整理成一份可转写草稿" in content and "换一种表达" not in content:
            return "## 调研目标\n- 第一次草稿 [1]"
        if "正式调研报告" in content and "换一种表达" not in content:
            return "## 结论 / TL;DR\n- 第一次报告 [1]"
        if "整理成一份可转写草稿" in content:
            return "## 调研目标\n- 重跑草稿 [1]"
        return "## 结论 / TL;DR\n- 重跑报告 [1]"

    monkeypatch.setattr(SearchService, "search", fake_search)
    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)
    monkeypatch.setattr("app.services.source_resolver.extract_main_content", fake_extract_main_content)
    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    first = client.post(
        "/api/discover",
        json={
            "query": "resume query",
            "style_prompt": "简洁输出",
            "cache": {"enabled": False},
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert first.status_code == 200
    first_data = first.json()
    assert counters["search_calls"] == 1
    assert counters["rewrite_calls"] == 4

    second = client.post(
        "/api/discover",
        json={
            "query": "resume query",
            "style_prompt": "换一种表达",
            "cache": {"enabled": False},
            "resume": {
                "run_id": first_data["run"]["id"],
                "stage": "brief",
            },
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
        },
    )

    assert second.status_code == 200
    data = second.json()
    assert counters["search_calls"] == 1
    assert counters["rewrite_calls"] == 6
    assert data["transformed_text"].endswith("重跑报告 [1]")
    assert data["meta"]["resumed"] is True
    assert data["meta"]["resume_stage"] == "brief"
    assert any(step["label"] == "恢复检查点" for step in data["run"]["steps"])
    assert not any(step["label"] == "检索来源" for step in data["run"]["steps"])
    assert not any(step["label"] == "抽取证据" for step in data["run"]["steps"])
    context_artifact = next(item for item in data["run"]["artifacts"] if item["label"] == "compressed-context")
    assert "换一种表达" in context_artifact["preview"]


def test_followup_sources_runs_searches_concurrently_and_ignores_partial_failure(monkeypatch) -> None:
    service = DiscoverService()
    in_flight = 0
    max_in_flight = 0

    async def fake_generate_followup_queries(query, sources, llm_config):  # noqa: ANN001
        return ["q1", "q2", "q3"]

    async def fake_search(query: str, max_results: int):  # noqa: ANN001
        nonlocal in_flight, max_in_flight
        in_flight += 1
        max_in_flight = max(max_in_flight, in_flight)
        try:
            await asyncio.sleep(0.01)
            if query == "q2":
                raise RuntimeError("search failed")
            return [SearchResult(title=f"title-{query}", url=f"https://example.com/{query}", snippet=f"snippet-{query}")]
        finally:
            in_flight -= 1

    async def fake_fetch_sources(results, urls):  # noqa: ANN001
        assert {item.url for item in results} == {"https://example.com/q1", "https://example.com/q3"}
        assert urls == ["https://example.com/q1", "https://example.com/q3"]
        return [
            SearchSource(
                id=1,
                title="Q1",
                url="https://example.com/q1",
                snippet="snippet-q1",
                excerpt="excerpt-q1",
            )
        ]

    monkeypatch.setattr(service, "_generate_followup_queries", fake_generate_followup_queries)
    monkeypatch.setattr(service.search_service, "search", fake_search)
    monkeypatch.setattr(service, "_fetch_sources", fake_fetch_sources)
    monkeypatch.setattr("app.services.discover_service.settings.discover_fetch_top_k", 3)

    result = asyncio.run(
        service._followup_sources(
            query="fastapi best practice",
            existing_sources=[],
            llm_config=object(),
        )
    )

    assert max_in_flight >= 2
    assert len(result) == 1

import asyncio

from app.services.search_service import SearchResult, SearchService


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, *, payloads_by_engine, calls, failing_engines=None, **kwargs):  # noqa: ANN003
        self._payloads_by_engine = payloads_by_engine
        self._calls = calls
        self._failing_engines = failing_engines or set()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):  # noqa: ANN001
        return False

    async def get(self, url, params, headers):  # noqa: ANN001
        engines = str(params.get("engines") or "")
        self._calls.append(
            {
                "url": url,
                "query": params.get("q"),
                "engines": engines,
                "headers": headers,
            }
        )
        if engines in self._failing_engines:
            raise RuntimeError(f"engine failure: {engines}")
        return _FakeResponse(self._payloads_by_engine.get(engines, {"results": []}))


def test_search_service_splits_baidu_and_github_queries(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, str]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu,github")
    monkeypatch.setattr(service, "_build_source_specific_queries", lambda query: [])

    payloads = {
        "baidu": {
            "results": [
                {
                    "title": "FastAPI 中文实践",
                    "url": "https://example.com/fastapi-cn",
                    "content": "中文最佳实践",
                }
            ]
        },
        "github": {
            "results": [
                {
                    "title": "fastapi best practices repo",
                    "url": "https://github.com/example/fastapi-best-practices",
                    "content": "GitHub result",
                }
            ]
        },
    }

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(payloads_by_engine=payloads, calls=calls, **kwargs)

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    results = asyncio.run(service.search("FastAPI 最佳实践", max_results=5))

    assert {call["engines"] for call in calls} == {"baidu", "github"}
    queries_by_engine = {call["engines"]: call["query"] for call in calls}
    assert queries_by_engine["baidu"] == "FastAPI 最佳实践"
    assert queries_by_engine["github"] == "FastAPI"
    assert {item.url for item in results} == {
        "https://example.com/fastapi-cn",
        "https://github.com/example/fastapi-best-practices",
    }
    assert results[0].overall_score >= results[1].overall_score


def test_search_service_keeps_github_results_when_baidu_branch_fails(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, str]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu,github")
    monkeypatch.setattr(service, "_build_source_specific_queries", lambda query: [])

    payloads = {
        "github": {
            "results": [
                {
                    "title": "fastapi best practices repo",
                    "url": "https://github.com/example/fastapi-best-practices",
                    "content": "GitHub result",
                }
            ]
        },
    }

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(
            payloads_by_engine=payloads,
            calls=calls,
            failing_engines={"baidu"},
            **kwargs,
        )

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    results = asyncio.run(service.search("FastAPI 最佳实践", max_results=5))

    assert {call["engines"] for call in calls} == {"baidu", "github"}
    assert [item.url for item in results] == ["https://github.com/example/fastapi-best-practices"]


def test_search_service_falls_back_to_duckduckgo_when_all_searxng_branches_fail(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, str]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu,github")
    monkeypatch.setattr(service, "_build_source_specific_queries", lambda query: [])

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(
            payloads_by_engine={},
            calls=calls,
            failing_engines={"baidu", "github"},
            **kwargs,
        )

    async def fake_duckduckgo(query: str, max_results: int) -> list[SearchResult]:
        return [
            SearchResult(
                title="fallback",
                url="https://fallback.example.com",
                snippet=f"{query}:{max_results}",
            )
        ]

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)
    monkeypatch.setattr(service, "_search_duckduckgo", fake_duckduckgo)

    results = asyncio.run(service.search("FastAPI 最佳实践", max_results=5))

    assert {call["engines"] for call in calls} == {"baidu", "github"}
    assert [item.url for item in results] == ["https://fallback.example.com"]


def test_search_service_skips_github_for_non_technical_queries(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, str]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu,github")
    monkeypatch.setattr(service, "_build_source_specific_queries", lambda query: [])

    payloads = {
        "baidu": {
            "results": [
                {
                    "title": "杭州周末去哪玩",
                    "url": "https://example.com/hangzhou-weekend",
                    "content": "周末出行建议",
                }
            ]
        },
    }

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(payloads_by_engine=payloads, calls=calls, **kwargs)

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    results = asyncio.run(service.search("杭州周末去哪玩", max_results=5))

    assert [call["engines"] for call in calls] == ["baidu"]
    assert [item.url for item in results] == ["https://example.com/hangzhou-weekend"]


def test_search_service_sorts_results_by_relevance(monkeypatch) -> None:
    service = SearchService()

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu")
    monkeypatch.setattr(service, "_build_source_specific_queries", lambda query: [])

    payload = {
        "results": [
            {
                "title": "通用文章",
                "url": "https://example.com/generic",
                "content": "一些不相关的内容",
            },
            {
                "title": "FastAPI 最佳实践指南",
                "url": "https://example.com/fastapi-guide",
                "content": "FastAPI 最佳实践与部署建议",
            },
        ]
    }

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(payloads_by_engine={"baidu": payload}, calls=[], **kwargs)

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    results = asyncio.run(service.search("FastAPI 最佳实践", max_results=5))

    assert [item.url for item in results] == [
        "https://example.com/fastapi-guide",
        "https://example.com/generic",
    ]
    assert results[0].relevance_score >= results[1].relevance_score
    assert results[0].overall_score >= results[1].overall_score


def test_search_service_adds_source_specific_queries(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, str]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu")

    payloads = {
        "baidu": {
            "results": [
                {
                    "title": "FastAPI 总览",
                    "url": "https://example.com/general",
                    "content": "常规搜索结果",
                }
            ]
        }
    }

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(payloads_by_engine=payloads, calls=calls, **kwargs)

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    asyncio.run(service.search("FastAPI 最佳实践", max_results=6))

    queries = [call["query"] for call in calls]
    assert "FastAPI 最佳实践" in queries
    assert any("site:baike.baidu.com" in query for query in queries)
    assert any("site:zhihu.com" in query for query in queries)
    assert any("site:arxiv.org" in query for query in queries)
    assert not any("site:xiaohongshu.com" in query for query in queries)
    assert not any("site:archive.org" in query for query in queries)


def test_search_service_uses_book_and_social_queries_for_experience_topics(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, str]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu")

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(payloads_by_engine={"baidu": {"results": []}}, calls=calls, **kwargs)

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    asyncio.run(service.search("AI 产品经理推荐书单和使用感受", max_results=6))

    queries = [call["query"] for call in calls]
    assert any("site:archive.org" in query for query in queries)
    assert any("site:xiaohongshu.com" in query for query in queries)


def test_search_service_exposes_source_type_and_scores(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, str]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu")
    monkeypatch.setattr(service, "_build_source_specific_queries", lambda query: [])

    payload = {
        "results": [
            {
                "title": "FastAPI 论文综述",
                "url": "https://arxiv.org/abs/2501.12345",
                "content": "研究论文",
            },
            {
                "title": "FastAPI 经验贴",
                "url": "https://www.xiaohongshu.com/explore/123",
                "content": "实践经验",
            },
        ]
    }

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(payloads_by_engine={"baidu": payload}, calls=calls, **kwargs)

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    results = asyncio.run(service.search("FastAPI 最佳实践", max_results=5))

    assert results[0].source_type == "paper"
    assert results[0].credibility_score > results[1].credibility_score
    assert results[0].overall_score >= results[1].overall_score


def test_search_service_sends_forwarded_ip_headers_to_searxng(monkeypatch) -> None:
    service = SearchService()
    calls: list[dict[str, object]] = []

    monkeypatch.setattr("app.services.search_service.settings.searxng_url", "http://searxng.test")
    monkeypatch.setattr("app.services.search_service.settings.searxng_engines", "baidu")
    monkeypatch.setattr("app.services.search_service.settings.searxng_forwarded_ip", "172.25.0.1")
    monkeypatch.setattr(service, "_build_source_specific_queries", lambda query: [])

    def fake_async_client(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeAsyncClient(
            payloads_by_engine={
                "baidu": {
                    "results": [
                        {
                            "title": "FastAPI 指南",
                            "url": "https://example.com/guide",
                            "content": "指南",
                        }
                    ]
                }
            },
            calls=calls,
            **kwargs,
        )

    monkeypatch.setattr("app.services.search_service.httpx.AsyncClient", fake_async_client)

    asyncio.run(service.search("FastAPI 指南", max_results=3))

    headers = calls[0]["headers"]
    assert headers["X-Forwarded-For"] == "172.25.0.1"
    assert headers["X-Real-IP"] == "172.25.0.1"

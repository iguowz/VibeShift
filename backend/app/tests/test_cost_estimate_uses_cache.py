from fastapi.testclient import TestClient

from app.core.schemas import SourceContent
from app.main import app
from app.services.cache_service import source_cache


client = TestClient(app)


def test_cost_estimate_uses_cached_source_for_url(monkeypatch) -> None:
    url = "https://example.com/cost-cache"
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

    monkeypatch.setattr("app.services.source_resolver.fetch_html", fake_fetch_html)

    response = client.post(
        "/api/cost/estimate",
        json={
            "input_type": "url",
            "input": url,
            "style_prompt": "请整理为重点摘要。",
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1,
            },
            "image": {
                "enabled": False,
                "count": 1,
                "placement": "header",
            },
            "cache": {"enabled": True},
        },
    )

    assert response.status_code == 200
    assert response.json()["prompt_tokens"] > 0

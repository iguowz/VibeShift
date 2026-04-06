from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_cost_estimate_returns_tokens_and_cost() -> None:
    response = client.post(
        "/api/cost/estimate",
        json={
            "input_type": "text",
            "input": "这是一段用于估算费用的正文内容，长度足够触发后端对文本输入的基础校验。",
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
                "style_preset": "",
                "custom_prompt": "",
                "placement": "header",
            },
            "pricing": {
                "prompt_usd_per_1k": 0.5,
                "completion_usd_per_1k": 1.5,
                "image_usd_each": 0.02,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["prompt_tokens"] > 0
    assert data["completion_tokens_max"] == 1200
    assert data["total_tokens_max"] == data["prompt_tokens"] + data["completion_tokens_max"]
    assert data["chunking"]["rewrite_calls"] == 1
    assert data["chunking"]["merge_calls"] == 0
    assert data["images"]["enabled"] is False
    assert data["cost_usd"]["total_max"] > 0

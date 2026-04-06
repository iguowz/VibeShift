from fastapi.testclient import TestClient

from app.main import app
from app.services.llm_service import LLMService


client = TestClient(app)


def test_style_prompt_optimize_returns_optimized_prompt(monkeypatch) -> None:
    async def fake_rewrite(self, messages, config):  # noqa: ANN001
        return (
            '{"optimized_prompt":"请用结构化要点输出，少空话，保留事实。",'
            '"notes":["added structure"],'
            '"profile_suggestion":{"audience":"产品经理","tone":"克制、直接","structure_template":"TL;DR -> 拆解 -> 建议",'
            '"emphasis_points":["关键事实","行动建议"],"citation_policy":"minimal","title_policy":"rewrite","image_focus":"diagram",'
            '"layout_format":"poster","visual_mode":"enhanced"}}'
        )

    monkeypatch.setattr(LLMService, "rewrite", fake_rewrite)

    response = client.post(
        "/api/style-prompts/optimize",
        json={
            "prompt": "写得更像公众号解读",
            "target": "rewrite",
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
    assert "optimized_prompt" in data
    assert "结构化" in data["optimized_prompt"]
    assert data["notes"] == ["added structure"]
    assert data["profile_suggestion"]["audience"] == "产品经理"
    assert data["profile_suggestion"]["title_policy"] == "rewrite"
    assert data["profile_suggestion"]["layout_format"] == "poster"

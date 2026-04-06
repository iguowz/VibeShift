from fastapi.testclient import TestClient

from app.main import app
from app.services.transform_service import TransformService


client = TestClient(app)


def test_transform_text_flow(monkeypatch) -> None:
    async def fake_transform(self, payload):
        from app.core.schemas import InputType, TransformMeta, TransformResponse

        return TransformResponse(
            request_id="req_test",
            title="测试标题",
            raw_excerpt="摘要",
            transformed_text="转换完成",
            images=[],
            meta=TransformMeta(
                input_type=InputType.TEXT,
                provider=payload.llm.provider,
                model=payload.llm.model,
                duration_ms=123,
                used_cache=False,
            ),
        )

    monkeypatch.setattr(TransformService, "transform", fake_transform)

    response = client.post(
        "/api/transform",
        json={
            "input_type": "text",
            "input": "这是一段用于接口测试的正文内容，长度足够完成后端校验。",
            "style_prompt": "请整理为重点摘要。",
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1
            },
            "image": {
                "enabled": False,
                "count": 1,
                "style_preset": "",
                "custom_prompt": "",
                "placement": "header"
            },
            "cache": {"enabled": False}
        },
    )

    assert response.status_code == 200
    assert response.json()["transformed_text"] == "转换完成"


def test_transform_rejects_invalid_url_payload() -> None:
    response = client.post(
        "/api/transform",
        json={
            "input_type": "url",
            "input": "notaurl",
            "style_prompt": "请改写。",
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1
            },
            "image": {
                "enabled": False,
                "count": 1,
                "style_preset": "",
                "custom_prompt": "",
                "placement": "header"
            },
            "cache": {"enabled": False}
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_url"


def test_transform_rejects_discover_input_type() -> None:
    response = client.post(
        "/api/transform",
        json={
            "input_type": "discover",
            "input": "人工智能趋势",
            "style_prompt": "请改写。",
            "llm": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1200,
                "top_p": 1
            },
            "image": {
                "enabled": False,
                "count": 1,
                "style_preset": "",
                "custom_prompt": "",
                "placement": "header"
            },
            "cache": {"enabled": False}
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"

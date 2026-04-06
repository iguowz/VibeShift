from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_validation_error_returns_error_schema() -> None:
    response = client.post(
        "/api/transform",
        json={
            "input_type": "text",
            "input": "hello",
            "style_prompt": "请改写。",
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
                "enabled": True,
                "count": 1,
                "style_preset": "",
                "custom_prompt": "",
                "placement": "header",
            },
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "validation_error"


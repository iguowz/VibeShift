import app.api.routes.images as images_route
from fastapi.testclient import TestClient

from app.core.schemas import GeneratedImage
from app.main import app


client = TestClient(app)


def test_regenerate_image_endpoint(monkeypatch) -> None:
    async def fake_regenerate_image(prompt: str, config, image_id: str) -> GeneratedImage:
        return GeneratedImage(id=image_id, url="data:image/png;base64,xxx", prompt=prompt)

    monkeypatch.setattr(images_route.service, "regenerate_image", fake_regenerate_image)

    response = client.post(
        "/api/images/regenerate",
        json={
            "image_id": "img_1",
            "prompt": "一只戴着耳机的猫",
            "image": {
                "enabled": True,
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-demo",
                "model": "gpt-image-1",
                "count": 1,
                "style_preset": "",
                "custom_prompt": "",
                "placement": "header",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == "img_1"
    assert response.json()["prompt"] == "一只戴着耳机的猫"


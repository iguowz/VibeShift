import asyncio

import app.services.image_service as image_service_module
from app.core.schemas import ImageConfig
from app.services.image_service import ImageService


def test_image_service_retries_with_simplified_prompt(monkeypatch) -> None:
    calls: list[dict[str, str]] = []

    class DummyAdapter:
        def __init__(self, _config: ImageConfig) -> None:
            self.failed_once = False

        async def generate(self, prompt: str, image_id: str):
            calls.append({"prompt": prompt, "image_id": image_id})
            if not self.failed_once:
                self.failed_once = True
                raise RuntimeError("boom")
            from app.core.schemas import GeneratedImage

            return GeneratedImage(id=image_id, url="data:image/png;base64,xxx", prompt=prompt)

    monkeypatch.setattr(image_service_module, "OpenAICompatibleImageAdapter", DummyAdapter)

    service = ImageService()
    config = ImageConfig(
        enabled=True,
        provider="openai",
        base_url="https://api.openai.com/v1",
        api_key="sk-demo",
        model="gpt-image-1",
        count=1,
        style_preset="",
        custom_prompt="",
        placement="header",
    )

    image = asyncio.run(service.regenerate_image(prompt="原始提示词", config=config, image_id="img_1"))

    assert image.id == "img_1"
    assert len(calls) == 2
    assert calls[0]["prompt"] == "原始提示词"
    assert "主题描述" in calls[1]["prompt"]


def test_image_service_retries_with_fallback_model(monkeypatch) -> None:
    calls: list[dict[str, str]] = []
    init_models: list[str | None] = []

    class DummyAdapter:
        def __init__(self, config: ImageConfig) -> None:
            self.model = config.model
            init_models.append(self.model)

        async def generate(self, prompt: str, image_id: str):
            calls.append({"prompt": prompt, "image_id": image_id, "model": self.model or ""})
            if self.model == "gpt-image-primary":
                raise RuntimeError("boom")
            from app.core.schemas import GeneratedImage

            return GeneratedImage(id=image_id, url="data:image/png;base64,xxx", prompt=prompt)

    monkeypatch.setattr(image_service_module, "OpenAICompatibleImageAdapter", DummyAdapter)

    service = ImageService()
    config = ImageConfig(
        enabled=True,
        provider="openai",
        base_url="https://api.openai.com/v1",
        api_key="sk-demo",
        model="gpt-image-primary",
        fallback_model="gpt-image-backup",
        retry_strategy="fallback_model",
        count=1,
        style_preset="",
        custom_prompt="",
        placement="header",
    )

    image = asyncio.run(service.regenerate_image(prompt="原始提示词", config=config, image_id="img_1"))

    assert image.id == "img_1"
    assert init_models == ["gpt-image-primary", "gpt-image-backup"]
    assert len(calls) == 2
    assert calls[0]["model"] == "gpt-image-primary"
    assert calls[1]["model"] == "gpt-image-backup"
    assert calls[1]["prompt"] == "原始提示词"

import asyncio

import app.services.transform_service as transform_service_module
from app.core.schemas import ImageConfig, InputType, LLMConfig, TransformRequest
from app.services.transform_service import TransformService


def test_transform_service_returns_image_prompts_when_async_generation(monkeypatch) -> None:
    service = TransformService()
    payload = TransformRequest(
        input_type=InputType.TEXT,
        input="这是一段用于测试的正文内容，长度足够触发后端校验。",
        style_prompt="请改写为更易读的中文文章。",
        llm=LLMConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-4o-mini",
            temperature=0.6,
            max_tokens=800,
            top_p=0.9,
        ),
        image=ImageConfig(
            enabled=True,
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-image-1",
            count=2,
            style_preset="科技感",
            custom_prompt="",
            placement="header",
            async_generation=True,
        ),
    )

    monkeypatch.setattr(service.chunking_service, "split_text", lambda text, chunk_size, overlap: [type("Chunk", (), {"index": 1, "content": text})()])

    async def fake_rewrite(messages, config):
        return "改写后的正文"

    monkeypatch.setattr(service.llm_service, "rewrite", fake_rewrite)
    monkeypatch.setattr(
        transform_service_module,
        "build_image_prompts",
        lambda source, transformed_text, image, style_profile=None: ["p1", "p2"],
    )

    async def fail_generate_images(prompts, config):
        raise AssertionError("async_generation=true 时不应直接生成图片")

    monkeypatch.setattr(service.image_service, "generate_images", fail_generate_images)

    result = asyncio.run(service.transform(payload))

    assert result.transformed_text == "改写后的正文"
    assert result.images == []
    assert result.image_prompts == ["p1", "p2"]
    assert result.run is not None
    assert any(artifact.kind == "image_prompts" for artifact in result.run.artifacts)

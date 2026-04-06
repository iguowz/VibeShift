from app.core.errors import AppError
from app.core.provider_adapters.openai_compatible import OpenAICompatibleImageAdapter
from app.core.schemas import GeneratedImage, ImageConfig, ImageRetryStrategy


class ImageService:
    def _simplify_prompt(self, prompt: str) -> str:
        simplified = prompt.strip()
        if len(simplified) > 1200:
            simplified = simplified[:1200]
        return (
            "生成一张高质量插画配图。"
            "要求：无文字水印、主体清晰、构图简洁、不要出现可读文字。"
            f"主题描述：{simplified}"
        )

    async def _generate_with_retry(
        self,
        adapter: OpenAICompatibleImageAdapter,
        prompt: str,
        image_id: str,
        config: ImageConfig,
    ) -> GeneratedImage:
        try:
            return await adapter.generate(prompt=prompt, image_id=image_id)
        except Exception as exc:
            if not config.retry_on_failure:
                raise

            if config.retry_strategy is ImageRetryStrategy.FALLBACK_MODEL:
                fallback_model = (config.fallback_model or "").strip()
                if not fallback_model:
                    raise
                fallback_config = config.model_copy(update={"model": fallback_model})
                fallback_adapter = OpenAICompatibleImageAdapter(fallback_config)
                try:
                    return await fallback_adapter.generate(prompt=prompt, image_id=image_id)
                except Exception:
                    raise exc

            simplified = self._simplify_prompt(prompt)
            try:
                return await adapter.generate(prompt=simplified, image_id=image_id)
            except Exception:
                raise exc

    async def generate_images(self, prompts: list[str], config: ImageConfig) -> list[GeneratedImage]:
        if not config.enabled:
            return []

        adapter = OpenAICompatibleImageAdapter(config)
        images: list[GeneratedImage] = []
        for index, prompt in enumerate(prompts, start=1):
            try:
                image = await self._generate_with_retry(adapter, prompt=prompt, image_id=f"img_{index}", config=config)
            except Exception as exc:
                raise AppError(
                    code="image_generation_failed",
                    message=f"第 {index} 张图片生成失败。",
                    suggestion="请检查图像模型配置，或先关闭插图生成功能后完成文字转换。",
                    status_code=424,
                ) from exc
            images.append(image)
        return images

    async def regenerate_image(self, prompt: str, config: ImageConfig, image_id: str) -> GeneratedImage:
        if not config.enabled:
            raise AppError(
                code="image_not_enabled",
                message="插图生成未启用，无法重新生成图片。",
                suggestion="请先开启插图生成，并补全图像模型配置。",
                status_code=422,
            )

        adapter = OpenAICompatibleImageAdapter(config)
        try:
            return await self._generate_with_retry(adapter, prompt=prompt, image_id=image_id, config=config)
        except Exception as exc:
            raise AppError(
                code="image_generation_failed",
                message="图片重新生成失败。",
                suggestion="请检查图像模型配置，或稍后重试。",
                status_code=424,
            ) from exc

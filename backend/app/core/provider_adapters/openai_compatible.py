from collections.abc import Sequence
from urllib.parse import urlparse, urlunparse

import httpx
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.schemas import GeneratedImage, ImageConfig, LLMConfig


class OpenAICompatibleAdapter:
    def __init__(self, config: LLMConfig):
        self.config = config
        self.client = AsyncOpenAI(
            api_key=config.api_key.get_secret_value(),
            base_url=str(config.base_url),
        )

    def _request_timeout(self) -> float:
        if self.config.provider.lower() == "ollama":
            return settings.local_llm_request_timeout_seconds
        return settings.request_timeout_seconds

    def _ollama_base_url(self) -> str:
        parsed = urlparse(str(self.config.base_url))
        path = parsed.path.rstrip("/")
        if path.endswith("/v1"):
            path = path[:-3]
        if not path:
            path = ""
        return urlunparse(parsed._replace(path=path, params="", query="", fragment=""))

    async def _complete_with_ollama_native_api(self, messages: Sequence[dict[str, str]]) -> str:
        payload = {
            "model": self.config.model,
            "messages": list(messages),
            "stream": False,
            "think": False,
            "options": {
                "temperature": self.config.temperature,
                "top_p": self.config.top_p,
                "num_predict": self.config.max_tokens,
            },
        }
        async with httpx.AsyncClient(timeout=self._request_timeout()) as client:
            response = await client.post(
                f"{self._ollama_base_url()}/api/chat",
                json=payload,
                headers={"Authorization": f"Bearer {self.config.api_key.get_secret_value()}"},
            )
            response.raise_for_status()
            data = response.json()
        return (data.get("message") or {}).get("content", "").strip()

    async def complete(self, messages: Sequence[dict[str, str]]) -> str:
        if self.config.provider.lower() == "ollama":
            return await self._complete_with_ollama_native_api(messages)

        request_kwargs = {
            "model": self.config.model,
            "messages": list(messages),
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "top_p": self.config.top_p,
        }
        response = await self.client.chat.completions.create(
            **request_kwargs,
        )
        content = response.choices[0].message.content or ""
        return content.strip()

    async def list_models(self) -> list[str]:
        if self.config.provider.lower() == "ollama":
            async with httpx.AsyncClient(timeout=self._request_timeout()) as client:
                response = await client.get(
                    f"{self._ollama_base_url()}/api/tags",
                    headers={"Authorization": f"Bearer {self.config.api_key.get_secret_value()}"},
                )
                response.raise_for_status()
                data = response.json()
            models = data.get("models") if isinstance(data, dict) else None
            if isinstance(models, list):
                names: list[str] = []
                for item in models:
                    if isinstance(item, dict) and isinstance(item.get("name"), str):
                        names.append(item["name"])
                return names
            return []

        models = await self.client.models.list()
        return [item.id for item in models.data]


class OpenAICompatibleImageAdapter:
    def __init__(self, config: ImageConfig):
        self.config = config
        self.client = AsyncOpenAI(
            api_key=(config.api_key.get_secret_value() if config.api_key else ""),
            base_url=str(config.base_url),
        )

    async def generate(self, prompt: str, image_id: str) -> GeneratedImage:
        response = await self.client.images.generate(
            model=self.config.model,
            prompt=prompt,
            size="1024x1024",
        )
        image_url = response.data[0].url
        if not image_url:
            image_b64 = response.data[0].b64_json
            image_url = f"data:image/png;base64,{image_b64}"
        return GeneratedImage(id=image_id, url=image_url, prompt=prompt)

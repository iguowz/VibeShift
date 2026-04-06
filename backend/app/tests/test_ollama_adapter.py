import asyncio

import httpx

from app.core.config import settings
from app.core.errors import AppError
from app.services.llm_service import LLMService
from app.core.provider_adapters.openai_compatible import OpenAICompatibleAdapter
from app.core.schemas import LLMConfig


def test_ollama_adapter_disables_think_mode(monkeypatch) -> None:
    class DummyResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "message": {
                    "content": "正常输出",
                }
            }

    captured: dict[str, object] = {}

    class DummyAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url: str, json: dict[str, object], headers: dict[str, str]):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return DummyResponse()

    monkeypatch.setattr(
        "app.core.provider_adapters.openai_compatible.httpx.AsyncClient",
        lambda timeout: DummyAsyncClient(),
    )

    config = LLMConfig(
        provider="ollama",
        base_url="http://localhost:11434/v1",
        api_key="ollama",
        model="qwen3.5:4b",
        temperature=0.3,
        max_tokens=256,
        top_p=0.9,
    )

    adapter = OpenAICompatibleAdapter(config)

    result = asyncio.run(adapter.complete([{"role": "user", "content": "hello"}]))

    assert result == "正常输出"
    assert captured["url"] == "http://localhost:11434/api/chat"
    assert captured["json"]["think"] is False
    assert captured["json"]["stream"] is False
    assert captured["json"]["options"]["num_predict"] == 256


def test_ollama_adapter_lists_models_via_tags(monkeypatch) -> None:
    class DummyResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "models": [
                    {"name": "qwen3.5:4b"},
                    {"name": "llama3:latest"},
                ]
            }

    captured: dict[str, object] = {}

    class DummyAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url: str, headers: dict[str, str]):
            captured["url"] = url
            captured["headers"] = headers
            return DummyResponse()

    monkeypatch.setattr(
        "app.core.provider_adapters.openai_compatible.httpx.AsyncClient",
        lambda timeout: DummyAsyncClient(),
    )

    config = LLMConfig(
        provider="ollama",
        base_url="http://localhost:11434/v1",
        api_key="ollama",
        model="qwen3.5:4b",
        temperature=0.3,
        max_tokens=256,
        top_p=0.9,
    )

    adapter = OpenAICompatibleAdapter(config)

    models = asyncio.run(adapter.list_models())

    assert captured["url"] == "http://localhost:11434/api/tags"
    assert "Authorization" in (captured["headers"] or {})
    assert models == ["qwen3.5:4b", "llama3:latest"]


def test_ollama_adapter_uses_local_timeout_budget() -> None:
    config = LLMConfig(
        provider="ollama",
        base_url="http://localhost:11434/v1",
        api_key="ollama",
        model="qwen3.5:4b",
        temperature=0.3,
        max_tokens=256,
        top_p=0.9,
    )

    adapter = OpenAICompatibleAdapter(config)

    assert adapter._request_timeout() == settings.local_llm_request_timeout_seconds


def test_llm_service_maps_ollama_timeout_to_specific_app_error(monkeypatch) -> None:
    service = LLMService()

    async def fake_complete(self, messages):  # noqa: ANN001
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(OpenAICompatibleAdapter, "complete", fake_complete)

    config = LLMConfig(
        provider="ollama",
        base_url="http://localhost:11434/v1",
        api_key="ollama",
        model="qwen3.5:4b",
        temperature=0.3,
        max_tokens=256,
        top_p=0.9,
    )

    try:
        asyncio.run(service.rewrite([{"role": "user", "content": "hello"}], config))
    except AppError as exc:
        assert exc.code == "llm_timeout"
        assert "模型响应超时" in exc.message
    else:
        raise AssertionError("expected AppError")

import asyncio

from app.core.schemas import CostEstimateRequest, CostPricing, ImageEstimateConfig, InputType, LLMConfig
from app.services.cost_estimator import CostEstimatorService


def test_cost_estimator_uses_chunking_for_long_text() -> None:
    service = CostEstimatorService()
    long_text = "a" * 14000
    payload = CostEstimateRequest(
        input_type=InputType.TEXT,
        input=long_text,
        style_prompt="请改写成结构清晰的中文文章，保留关键信息。",
        llm=LLMConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-demo",
            model="gpt-4o-mini",
            temperature=0.7,
            max_tokens=500,
            top_p=1,
        ),
        image=ImageEstimateConfig(enabled=False),
        pricing=CostPricing(prompt_usd_per_1k=0.3, completion_usd_per_1k=0.6),
    )

    result = asyncio.run(service.estimate(payload))

    assert result.chunking.enabled is True
    assert result.chunking.chunks > 1
    assert result.chunking.rewrite_calls == result.chunking.chunks
    assert result.chunking.merge_calls == 1
    assert result.completion_tokens_max == payload.llm.max_tokens * (result.chunking.rewrite_calls + 1)
    assert result.cost_usd is not None
    assert result.cost_usd.total_max > 0

import math
import re

from app.core.config import settings
from app.core.errors import AppError
from app.core.schemas import (
    CostEstimateCostUSD,
    CostEstimateRequest,
    CostEstimateResponse,
    InputType,
)
from app.services.chunking_service import ChunkingService
from app.services.content_cleaner import build_text_source
from app.services.prompt_builder import (
    build_chunk_rewrite_messages,
    build_merge_messages,
    build_rewrite_messages,
    compose_style_instruction,
    render_style_prompt,
)
from app.services.source_resolver import source_resolver


_CJK_PATTERN = re.compile(r"[\u4e00-\u9fff]")


def estimate_text_tokens(text: str) -> int:
    if not text:
        return 0
    cjk_count = len(_CJK_PATTERN.findall(text))
    other_count = max(0, len(text) - cjk_count)
    return cjk_count + math.ceil(other_count / 4)


def estimate_messages_tokens(messages: list[dict[str, str]]) -> int:
    total = 0
    for message in messages:
        total += 4
        total += estimate_text_tokens(message.get("role", ""))
        total += estimate_text_tokens(message.get("content", ""))
    total += 2
    return total


class CostEstimatorService:
    def __init__(self) -> None:
        self.chunking_service = ChunkingService()

    async def estimate(self, payload: CostEstimateRequest) -> CostEstimateResponse:
        if len(payload.input) > settings.max_input_characters:
            raise AppError(
                code="input_too_long",
                message="输入内容过长，当前版本暂不支持直接处理该长度。",
                suggestion="请缩短内容，或等待后续长文本分块版本。",
                status_code=422,
            )

        if payload.input_type is InputType.URL:
            source, _ = await source_resolver.resolve_url(payload.input, use_cache=payload.cache.enabled)
        else:
            source = build_text_source(payload.input)

        rendered_style_prompt = render_style_prompt(payload.style_prompt, source)
        style_prompt = compose_style_instruction(rendered_style_prompt, payload.style_profile)

        chunks = self.chunking_service.split_text(
            source.full_text,
            chunk_size=settings.rewrite_chunk_size_characters,
            overlap=settings.rewrite_chunk_overlap_characters,
        )

        prompt_tokens = 0
        rewrite_calls = 0
        merge_calls = 0

        if len(chunks) == 1:
            rewrite_calls = 1
            messages = build_rewrite_messages(source, style_prompt)
            prompt_tokens += estimate_messages_tokens(messages)
        else:
            rewrite_calls = len(chunks)
            merge_calls = 1
            total_chunks = len(chunks)
            for chunk in chunks:
                chunk_messages = build_chunk_rewrite_messages(
                    source=source,
                    style_prompt=style_prompt,
                    chunk_content=chunk.content,
                    chunk_index=chunk.index,
                    total_chunks=total_chunks,
                )
                prompt_tokens += estimate_messages_tokens(chunk_messages)

            merge_messages = build_merge_messages(source, style_prompt, ["(chunk result)"] * total_chunks)
            prompt_tokens += estimate_messages_tokens(merge_messages)

        completion_tokens_max = payload.llm.max_tokens * (rewrite_calls + merge_calls)
        total_tokens_max = prompt_tokens + completion_tokens_max

        image_calls = payload.image.count if payload.image.enabled else 0

        cost_usd: CostEstimateCostUSD | None = None
        if payload.pricing is not None:
            prompt_cost = (prompt_tokens / 1000.0) * payload.pricing.prompt_usd_per_1k
            completion_cost = (completion_tokens_max / 1000.0) * payload.pricing.completion_usd_per_1k
            images_cost = 0.0
            if payload.image.enabled and payload.pricing.image_usd_each is not None:
                images_cost = float(image_calls) * float(payload.pricing.image_usd_each)
            cost_usd = CostEstimateCostUSD(
                prompt=round(prompt_cost, 6),
                completion_max=round(completion_cost, 6),
                images=round(images_cost, 6),
                total_max=round(prompt_cost + completion_cost + images_cost, 6),
            )

        notes = [
            "Token 数为启发式估算：中文按字符、其它按 4 字符≈1 token，并包含少量对话开销。",
            "completion_tokens_max 基于 max_tokens 估算，实际输出可能显著低于上限。",
        ]
        if len(chunks) > 1:
            notes.append("检测到长文本将走分块流程：费用/耗时约等于分块次数 + 1 次合并。")
        if payload.image.enabled:
            notes.append("图片费用与延迟与图像模型相关；如填写 image_usd_each 将按张数线性估算。")

        return CostEstimateResponse(
            prompt_tokens=int(prompt_tokens),
            completion_tokens_max=int(completion_tokens_max),
            total_tokens_max=int(total_tokens_max),
            chunking={
                "enabled": len(chunks) > 1,
                "chunks": len(chunks),
                "rewrite_calls": rewrite_calls,
                "merge_calls": merge_calls,
            },
            images={
                "enabled": payload.image.enabled,
                "calls": image_calls,
            },
            cost_usd=cost_usd,
            notes=notes,
        )

from fastapi import APIRouter

from app.core.schemas import (
    StylePreviewItem,
    StylePreviewRequest,
    StylePreviewResponse,
    StylePromptOptimizeRequest,
    StylePromptOptimizeResponse,
    StyleRecommendMatch,
    StyleRecommendRequest,
    StyleRecommendResponse,
)
from app.services.style_prompt_optimizer import StylePromptOptimizerService


router = APIRouter(tags=["style-prompts"])
service = StylePromptOptimizerService()


@router.post("/style-prompts/optimize", response_model=StylePromptOptimizeResponse)
async def optimize_style_prompt(payload: StylePromptOptimizeRequest) -> StylePromptOptimizeResponse:
    optimized, notes, profile_suggestion = await service.optimize(
        prompt=payload.prompt,
        target=payload.target,
        llm_config=payload.llm,
        current_profile=payload.current_profile,
        memory_hints=payload.memory_hints,
    )
    return StylePromptOptimizeResponse(
        optimized_prompt=optimized,
        notes=notes,
        profile_suggestion=profile_suggestion,
    )


@router.post("/style-prompts/recommend", response_model=StyleRecommendResponse)
async def recommend_style(payload: StyleRecommendRequest) -> StyleRecommendResponse:
    style_id, reason, confidence, candidates = await service.recommend(
        input_text=payload.input_text,
        target=payload.target,
        llm_config=payload.llm,
        styles=payload.styles,
        top_k=payload.top_k,
    )
    return StyleRecommendResponse(
        style_id=style_id,
        reason=reason,
        confidence=confidence,
        candidates=[
            StyleRecommendMatch(style_id=item_style_id, reason=item_reason, confidence=item_confidence)
            for item_style_id, item_reason, item_confidence in candidates
        ],
    )


@router.post("/style-prompts/preview", response_model=StylePreviewResponse)
async def preview_style_candidates(payload: StylePreviewRequest) -> StylePreviewResponse:
    previews = await service.preview(
        input_text=payload.input_text,
        target=payload.target,
        llm_config=payload.llm,
        styles=payload.styles,
        style_ids=payload.style_ids,
        max_items=payload.max_items,
    )
    return StylePreviewResponse(
        previews=[
            StylePreviewItem(style_id=style_id, preview_text=preview_text, focus_points=focus_points)
            for style_id, preview_text, focus_points in previews
        ]
    )

from fastapi import APIRouter

from app.core.schemas import StylePromptOptimizeRequest, StylePromptOptimizeResponse
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

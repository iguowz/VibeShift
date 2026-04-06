from fastapi import APIRouter

from app.core.schemas import ProviderTestRequest, ProviderTestResponse
from app.services.llm_service import LLMService

router = APIRouter(tags=["providers"])
service = LLMService()


@router.post("/providers/test", response_model=ProviderTestResponse)
async def test_provider(payload: ProviderTestRequest) -> ProviderTestResponse:
    models = await service.test_connection(payload.llm)
    hint = "连接成功。"
    if payload.llm.model not in models:
        hint = "连接成功，但当前模型不在返回列表中，请确认模型名称是否正确。"
    return ProviderTestResponse(
        ok=True,
        provider=payload.llm.provider,
        model=payload.llm.model,
        message=hint,
    )


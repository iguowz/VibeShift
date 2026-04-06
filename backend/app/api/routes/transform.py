from fastapi import APIRouter

from app.core.schemas import TransformRequest, TransformResponse
from app.services.transform_service import TransformService

router = APIRouter(tags=["transform"])
service = TransformService()


@router.post("/transform", response_model=TransformResponse)
async def transform(payload: TransformRequest) -> TransformResponse:
    return await service.transform(payload)


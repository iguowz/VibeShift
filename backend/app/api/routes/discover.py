from fastapi import APIRouter

from app.core.schemas import DiscoverRequest, DiscoverResponse
from app.services.discover_service import DiscoverService


router = APIRouter(tags=["discover"])
service = DiscoverService()


@router.post("/discover", response_model=DiscoverResponse)
async def discover(payload: DiscoverRequest) -> DiscoverResponse:
    return await service.discover(payload)


from fastapi import APIRouter

from app.core.schemas import CostEstimateRequest, CostEstimateResponse
from app.services.cost_estimator import CostEstimatorService

router = APIRouter(tags=["cost"])
service = CostEstimatorService()


@router.post("/cost/estimate", response_model=CostEstimateResponse)
async def estimate_cost(payload: CostEstimateRequest) -> CostEstimateResponse:
    return await service.estimate(payload)


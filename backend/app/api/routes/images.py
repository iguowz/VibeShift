from fastapi import APIRouter

from app.core.schemas import GeneratedImage, ImageRegenerateRequest
from app.services.image_service import ImageService

router = APIRouter(tags=["images"])
service = ImageService()


@router.post("/images/regenerate", response_model=GeneratedImage)
async def regenerate_image(payload: ImageRegenerateRequest) -> GeneratedImage:
    return await service.regenerate_image(prompt=payload.prompt, config=payload.image, image_id=payload.image_id)


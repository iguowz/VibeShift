import logging
import time
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.cost import router as cost_router
from app.api.routes.discover import router as discover_router
from app.api.routes.images import router as images_router
from app.api.routes.providers import router as providers_router
from app.api.routes.style_prompts import router as style_prompts_router
from app.api.routes.transform import router as transform_router
from app.core.config import settings
from app.core.errors import register_exception_handlers


def configure_logging() -> None:
    logging.Formatter.converter = time.localtime
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        )
    logging.getLogger("vibeshift").setLevel(logging.INFO)


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(
        title="VibeShift API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    @app.middleware("http")
    async def request_logging_middleware(request, call_next):  # type: ignore[no-untyped-def]
        logger = logging.getLogger("vibeshift.request")
        request_id = f"reqlog_{uuid4().hex[:8]}"
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request_id=%s method=%s path=%s status=%s duration_ms=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(transform_router, prefix="/api")
    app.include_router(discover_router, prefix="/api")
    app.include_router(providers_router, prefix="/api")
    app.include_router(style_prompts_router, prefix="/api")
    app.include_router(images_router, prefix="/api")
    app.include_router(cost_router, prefix="/api")
    return app


app = create_app()

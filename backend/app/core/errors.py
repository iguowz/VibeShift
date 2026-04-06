import logging
import re
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import settings


_SK_LIKE_PATTERN = re.compile(r"sk-[A-Za-z0-9_-]{20,}")
_BEARER_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9._\-]{8,}", re.IGNORECASE)
_API_KEY_JSON_PATTERN = re.compile(r'("api_key"\s*:\s*")([^"]+)(")', re.IGNORECASE)
_API_KEY_KV_PATTERN = re.compile(r"\b(api_key|token|authorization)\s*=\s*([^\s,;]+)", re.IGNORECASE)


def _redact(text: str) -> str:
    redacted = text
    redacted = _API_KEY_JSON_PATTERN.sub(r"\1***\3", redacted)
    redacted = _API_KEY_KV_PATTERN.sub(r"\1=***", redacted)
    redacted = _BEARER_PATTERN.sub("Bearer ***", redacted)
    redacted = _SK_LIKE_PATTERN.sub("***", redacted)
    return redacted


class AppError(Exception):
    def __init__(self, code: str, message: str, suggestion: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.suggestion = suggestion
        self.status_code = status_code
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        logger = logging.getLogger("vibeshift")
        logger.warning(
            "AppError method=%s path=%s status=%s code=%s message=%s suggestion=%s",
            request.method,
            request.url.path,
            exc.status_code,
            exc.code,
            _redact(exc.message),
            _redact(exc.suggestion),
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "suggestion": exc.suggestion,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details: list[dict[str, object]] | None = None
        if settings.app_env.lower() == "development":
            details = [
                {
                    "loc": list(error.get("loc", [])),
                    "msg": str(error.get("msg", "")),
                    "type": str(error.get("type", "")),
                }
                for error in exc.errors()
            ]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "请求参数不合法。",
                    "suggestion": "请检查必填字段、字段类型与格式要求。",
                    **({"details": details} if details is not None else {}),
                }
            },
        )

    @app.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = f"err_{uuid4().hex[:12]}"
        logger = logging.getLogger("vibeshift")
        logger.exception(
            "Unhandled error request_id=%s method=%s path=%s message=%s",
            request_id,
            request.method,
            request.url.path,
            _redact(str(exc)),
        )

        error_payload: dict[str, object] = {
            "code": "internal_error",
            "message": "服务出现未预期错误。",
            "suggestion": "请稍后重试，或检查模型配置与输入内容。",
            "request_id": request_id,
        }
        if settings.app_env.lower() == "development":
            error_payload["details"] = _redact(str(exc))

        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    **error_payload,
                }
            },
        )

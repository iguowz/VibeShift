import re

import httpx

from app.core.config import settings
from app.core.errors import AppError


URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)
URL_EXTRACT_PATTERN = re.compile(r"https?://[^\s,，;；]+", re.IGNORECASE)


def is_probably_url(value: str) -> bool:
    return bool(URL_PATTERN.match(value.strip()))


def extract_urls(value: str) -> list[str]:
    matches = [match.rstrip(").,，；;]}>\"'") for match in URL_EXTRACT_PATTERN.findall(value or "")]
    deduped: list[str] = []
    seen: set[str] = set()
    for item in matches:
        cleaned = item.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return deduped


async def fetch_html(url: str) -> str:
    if not is_probably_url(url):
        raise AppError(
            code="invalid_url",
            message="请输入合法的 http/https 链接。",
            suggestion="请检查链接是否以 http:// 或 https:// 开头。",
            status_code=422,
        )

    timeout = httpx.Timeout(settings.fetch_timeout_seconds)
    headers = {
        "User-Agent": settings.user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text
    except httpx.HTTPStatusError as exc:
        raise AppError(
            code="fetch_failed",
            message=f"网页抓取失败，目标站点返回状态码 {exc.response.status_code}。",
            suggestion="请确认链接可公开访问，或尝试复制正文后使用文本模式。",
            status_code=424,
        ) from exc
    except httpx.RequestError as exc:
        raise AppError(
            code="network_error",
            message="网页抓取失败，无法连接到目标站点。",
            suggestion="请检查网络环境、目标站点可访问性，或改用文本模式。",
            status_code=424,
        ) from exc

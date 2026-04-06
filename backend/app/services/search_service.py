from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import anyio
import httpx

from app.core.config import settings
from app.core.errors import AppError


@dataclass(frozen=True, slots=True)
class SearchResult:
    title: str
    url: str
    snippet: str
    source_type: str = "article"
    relevance_score: float = 0.0
    credibility_score: float = 0.0
    overall_score: float = 0.0
    capture_mode: str = "full"


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\u00a0", " ").strip()


_ASCII_KEYWORDS_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_\-.:/]{1,}")
_TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9][A-Za-z0-9_\-.:/#\+]{1,}")
_TECH_QUERY_PATTERN = re.compile(
    r"(api|sdk|框架|代码|开发|编程|后端|前端|数据库|部署|docker|python|java|golang|go\b|rust|node|react|vue|next\.?js|fastapi|django|flask|spring|sql|k8s|kubernetes|算法|模型|工程|开源|repo|github)",
    re.IGNORECASE,
)
_ACADEMIC_QUERY_PATTERN = re.compile(r"(论文|paper|research|study|实验|学术|期刊|benchmark|arxiv|pubmed|doi)", re.IGNORECASE)
_BOOK_QUERY_PATTERN = re.compile(r"(图书|书籍|电子书|book|教材|读物|阅读清单|推荐书单)", re.IGNORECASE)
_KNOWLEDGE_QUERY_PATTERN = re.compile(r"(百科|是什么|概念|定义|历史|人物|公司|品牌|介绍|科普)", re.IGNORECASE)
_COMMUNITY_QUERY_PATTERN = re.compile(r"(经验|踩坑|评价|推荐|使用感受|怎么选|避坑|口碑|测评|实测)", re.IGNORECASE)
_NEWS_HOST_PATTERN = re.compile(r"(news|36kr|huxiu|ifanr|techcrunch|theverge|wired|reuters|bloomberg)", re.IGNORECASE)
_OFFICIAL_HOST_PATTERN = re.compile(r"(^|\.)((gov)|(edu)|openai|anthropic|google|docs|developer|platform)\.", re.IGNORECASE)

_SOURCE_QUERY_TEMPLATES: tuple[tuple[str, str], ...] = (
    ("wiki", "site:baike.baidu.com {query}"),
    ("qa", "site:zhihu.com {query}"),
    ("social", "site:xiaohongshu.com {query}"),
    ("book", "site:archive.org {query}"),
    ("paper", "site:arxiv.org {query}"),
)


def _tokenize(value: str) -> list[str]:
    return [item.lower() for item in _TOKEN_PATTERN.findall(value or "")]


def _extract_ascii_keywords(query: str) -> str:
    tokens = _ASCII_KEYWORDS_PATTERN.findall(query or "")
    if not tokens:
        return ""
    seen: set[str] = set()
    cleaned: list[str] = []
    for token in tokens:
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(token)
    return " ".join(cleaned[:6])


def _looks_technical_query(query: str) -> bool:
    if _TECH_QUERY_PATTERN.search(query or ""):
        return True
    ascii_keywords = _extract_ascii_keywords(query)
    if not ascii_keywords:
        return False
    return any(re.search(r"[\d_/\-.:+#]", token) for token in ascii_keywords.split())


def _compute_relevance_score(query: str, *, title: str, snippet: str, url: str) -> float:
    query_tokens = _tokenize(query)
    if not query_tokens:
        return 0.0

    title_tokens = set(_tokenize(title))
    snippet_tokens = set(_tokenize(snippet))
    url_tokens = set(_tokenize(url))
    title_overlap = len([token for token in query_tokens if token in title_tokens])
    snippet_overlap = len([token for token in query_tokens if token in snippet_tokens])
    url_overlap = len([token for token in query_tokens if token in url_tokens])
    exact_match_bonus = 3.0 if (query or "").strip().lower() in f"{title} {snippet}".lower() else 0.0
    return round(title_overlap * 3 + snippet_overlap * 1.8 + url_overlap * 0.9 + exact_match_bonus, 2)


def _classify_source_type(url: str, title: str = "") -> str:
    host = (urlparse(url).netloc or "").lower()
    title_text = (title or "").lower()
    if "wikipedia.org" in host or "baike.baidu.com" in host:
        return "wiki"
    if "zhihu.com" in host:
        return "qa"
    if "xiaohongshu.com" in host:
        return "social"
    if any(domain in host for domain in ("archive.org", "openlibrary.org", "books.google.", "gutenberg.org")):
        return "book"
    if any(domain in host for domain in ("arxiv.org", "pubmed.ncbi.nlm.nih.gov", "openreview.net", "aclanthology.org")):
        return "paper"
    if "github.com" in host:
        return "code"
    if _OFFICIAL_HOST_PATTERN.search(host) or host.endswith(".gov") or host.endswith(".edu") or "/docs" in url:
        return "official"
    if _NEWS_HOST_PATTERN.search(host) or _NEWS_HOST_PATTERN.search(title_text):
        return "news"
    return "article"


def _compute_credibility_score(query: str, *, url: str, title: str, snippet: str, source_type: str, capture_mode: str) -> float:
    base_scores = {
        "official": 9.5,
        "paper": 9.2,
        "book": 8.8,
        "wiki": 7.7,
        "code": 7.6 if _looks_technical_query(query) else 5.4,
        "news": 6.8,
        "qa": 5.8,
        "social": 4.7,
        "article": 6.2,
    }
    score = base_scores.get(source_type, 6.0)
    parsed = urlparse(url)
    if parsed.scheme == "https":
        score += 0.2
    if len((title or "").strip()) >= 8:
        score += 0.2
    if len((snippet or "").strip()) < 24:
        score -= 0.3
    if capture_mode == "snippet":
        score -= 0.8
    if _ACADEMIC_QUERY_PATTERN.search(query or "") and source_type in {"paper", "official", "book"}:
        score += 0.4
    if _BOOK_QUERY_PATTERN.search(query or "") and source_type == "book":
        score += 0.4
    return round(max(0.0, min(score, 10.0)), 2)


def _compute_overall_score(relevance_score: float, credibility_score: float) -> float:
    normalized_relevance = min(10.0, max(0.0, relevance_score * 1.15))
    return round(normalized_relevance * 0.62 + credibility_score * 0.38, 2)


def _build_search_result(
    *,
    original_query: str,
    title: str,
    url: str,
    snippet: str,
    capture_mode: str = "full",
) -> SearchResult:
    source_type = _classify_source_type(url, title)
    relevance_score = _compute_relevance_score(
        original_query,
        title=title,
        snippet=snippet,
        url=url,
    )
    credibility_score = _compute_credibility_score(
        original_query,
        url=url,
        title=title,
        snippet=snippet,
        source_type=source_type,
        capture_mode=capture_mode,
    )
    return SearchResult(
        title=title,
        url=url,
        snippet=snippet,
        source_type=source_type,
        relevance_score=relevance_score,
        credibility_score=credibility_score,
        overall_score=_compute_overall_score(relevance_score, credibility_score),
        capture_mode=capture_mode,
    )


class SearchService:
    async def search(self, query: str, max_results: int) -> list[SearchResult]:
        if settings.searxng_url:
            try:
                return await self._search_searxng(query=query, max_results=max_results)
            except AppError:
                pass
            except Exception:
                pass
        return await self._search_duckduckgo(query=query, max_results=max_results)

    async def _search_searxng(self, query: str, max_results: int) -> list[SearchResult]:
        limit = max(1, int(max_results))
        configured_engines = self._parse_engines(settings.searxng_engines)
        general_task = asyncio.create_task(self._search_general_results(query=query, max_results=limit, configured_engines=configured_engines))

        source_tasks: list[asyncio.Task[list[SearchResult]]] = []
        non_github_engines = [engine for engine in configured_engines if engine != "github"]
        if non_github_engines:
            per_query_limit = 2 if limit >= 5 else 1
            for source_type, source_query in self._build_source_specific_queries(query):
                source_tasks.append(
                    asyncio.create_task(
                        self._search_searxng_request(
                            query=source_query,
                            max_results=per_query_limit,
                            engines=non_github_engines,
                            original_query=query,
                        )
                    )
                )

        batches = await asyncio.gather(general_task, *source_tasks, return_exceptions=True)
        merged = self._merge_results([batch for batch in batches if isinstance(batch, list)], limit=limit)
        if merged:
            return merged

        first_error = next((item for item in batches if isinstance(item, Exception)), None)
        if isinstance(first_error, Exception):
            raise AppError(
                code="search_failed",
                message="搜索失败，未能获取检索结果。",
                suggestion="如果你启用了搜索增强（SearXNG），请确认地址可访问；也可以稍后再试。",
                status_code=424,
            ) from first_error
        return []

    async def _search_general_results(self, *, query: str, max_results: int, configured_engines: list[str]) -> list[SearchResult]:
        limit = max(1, int(max_results))
        ascii_keywords = _extract_ascii_keywords(query)
        use_github = "github" in configured_engines and ascii_keywords and _looks_technical_query(query)
        non_github = [engine for engine in configured_engines if engine != "github"]

        if use_github and non_github:
            primary_task = asyncio.create_task(
                self._search_searxng_request(
                    query=query,
                    max_results=limit,
                    engines=non_github,
                    original_query=query,
                )
            )
            github_task = asyncio.create_task(
                self._search_searxng_request(
                    query=ascii_keywords,
                    max_results=limit,
                    engines=["github"],
                    original_query=query,
                )
            )
            batches = await asyncio.gather(primary_task, github_task, return_exceptions=True)
            merged = self._merge_results([batch for batch in batches if isinstance(batch, list)], limit=limit)
            if merged:
                return merged

            first_error = next((item for item in batches if isinstance(item, Exception)), None)
            if isinstance(first_error, Exception):
                raise AppError(
                    code="search_failed",
                    message="搜索失败，未能获取检索结果。",
                    suggestion="如果你启用了搜索增强（SearXNG），请确认地址可访问；也可以稍后再试。",
                    status_code=424,
                ) from first_error
            return []

        active_engines = configured_engines
        effective_query = query
        if not use_github and "github" in configured_engines:
            active_engines = non_github
            if not active_engines:
                return []
        elif use_github and configured_engines == ["github"]:
            effective_query = ascii_keywords
        return await self._search_searxng_request(
            query=effective_query,
            max_results=limit,
            engines=active_engines or None,
            original_query=query,
        )

    def _build_source_specific_queries(self, query: str) -> list[tuple[str, str]]:
        cleaned = (query or "").strip()
        if not cleaned:
            return []
        source_types: list[str] = []
        if _looks_technical_query(cleaned):
            source_types.extend(["wiki", "paper", "qa"])
        if _ACADEMIC_QUERY_PATTERN.search(cleaned):
            source_types.extend(["paper", "wiki"])
        if _BOOK_QUERY_PATTERN.search(cleaned):
            source_types.extend(["book", "wiki"])
        if _KNOWLEDGE_QUERY_PATTERN.search(cleaned):
            source_types.extend(["wiki"])
        if _COMMUNITY_QUERY_PATTERN.search(cleaned):
            source_types.extend(["qa", "social"])
        if not source_types:
            source_types.extend(["wiki", "qa", "social"])

        ordered = list(dict.fromkeys(source_types))[:4]
        query_map = dict(_SOURCE_QUERY_TEMPLATES)
        return [(source_type, query_map[source_type].format(query=cleaned)) for source_type in ordered if source_type in query_map]

    def _parse_engines(self, raw_value: str | None) -> list[str]:
        if not raw_value:
            return []
        parsed: list[str] = []
        seen: set[str] = set()
        for item in raw_value.split(","):
            engine = item.strip()
            if not engine:
                continue
            key = engine.lower()
            if key in seen:
                continue
            seen.add(key)
            parsed.append(engine)
        return parsed

    async def _search_searxng_request(
        self,
        *,
        query: str,
        max_results: int,
        engines: list[str] | None,
        original_query: str,
    ) -> list[SearchResult]:
        base = settings.searxng_url or ""
        url = f"{base.rstrip('/')}/search"
        timeout = httpx.Timeout(settings.searxng_timeout_seconds)
        try:
            params: dict[str, Any] = {
                "q": query,
                "format": "json",
                "pageno": 1,
                "safesearch": 0,
            }
            if engines:
                params["engines"] = ",".join(engines)
            forwarded_ip = (settings.searxng_forwarded_ip or "").strip() or "127.0.0.1"
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers={
                        "User-Agent": settings.user_agent,
                        "X-Forwarded-For": forwarded_ip,
                        "X-Real-IP": forwarded_ip,
                    },
                )
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            raise AppError(
                code="search_failed",
                message="搜索失败，未能获取检索结果。",
                suggestion="如果你启用了搜索增强（SearXNG），请确认地址可访问；也可以稍后再试。",
                status_code=424,
            ) from exc

        return self._parse_results(data, limit=max_results, original_query=original_query)

    def _parse_results(self, data: Any, *, limit: int, original_query: str) -> list[SearchResult]:
        raw_results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(raw_results, list):
            return []

        results: list[SearchResult] = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            raw_url = item.get("url")
            if not isinstance(raw_url, str) or not raw_url.strip():
                continue
            title = _clean_text(item.get("title")) or raw_url.strip()
            snippet = _clean_text(item.get("content"))
            results.append(
                _build_search_result(
                    original_query=original_query,
                    title=title,
                    url=raw_url.strip(),
                    snippet=snippet,
                )
            )
        results.sort(key=lambda item: (item.overall_score, item.relevance_score, item.credibility_score), reverse=True)
        return results[:limit]

    def _merge_results(self, batches: list[list[SearchResult]], *, limit: int) -> list[SearchResult]:
        best_by_url: dict[str, SearchResult] = {}
        for batch in batches:
            for item in batch:
                current = best_by_url.get(item.url)
                if current is None or (item.overall_score, item.relevance_score) > (current.overall_score, current.relevance_score):
                    best_by_url[item.url] = item
        merged = sorted(
            best_by_url.values(),
            key=lambda item: (item.overall_score, item.relevance_score, item.credibility_score),
            reverse=True,
        )
        return merged[:limit]

    async def _search_duckduckgo(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except Exception as exc:
            raise AppError(
                code="search_provider_missing",
                message="搜索功能未就绪，缺少 DuckDuckGo 搜索依赖。",
                suggestion="搜索功能还没配置好：可以在 Docker 里启用搜索增强（SearxNG），或联系管理员补全依赖。",
                status_code=500,
            ) from exc

        def run_sync() -> list[SearchResult]:
            results: list[SearchResult] = []
            with DDGS() as ddgs:
                for item in ddgs.text(query, max_results=max(1, int(max_results))):
                    if not isinstance(item, dict):
                        continue
                    raw_url = item.get("href") or item.get("url")
                    if not isinstance(raw_url, str) or not raw_url.strip():
                        continue
                    title = _clean_text(item.get("title")) or raw_url.strip()
                    snippet = _clean_text(item.get("body") or item.get("snippet"))
                    results.append(
                        _build_search_result(
                            original_query=query,
                            title=title,
                            url=raw_url.strip(),
                            snippet=snippet,
                        )
                    )
            results.sort(key=lambda item: (item.overall_score, item.relevance_score, item.credibility_score), reverse=True)
            return results

        try:
            return await anyio.to_thread.run_sync(run_sync)
        except Exception as exc:
            raise AppError(
                code="search_failed",
                message="搜索失败，未能获取检索结果。",
                suggestion="请检查网络环境；也可以启用搜索增强（SearXNG）提升稳定性。",
                status_code=424,
            ) from exc

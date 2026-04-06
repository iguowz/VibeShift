from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from app.core.config import settings
from app.core.errors import AppError
from app.core.schemas import (
    DiscoverBrief,
    DiscoverEvidenceItem,
    DiscoverMeta,
    DiscoverRequest,
    DiscoverResponse,
    DiscoverResumeOptions,
    DiscoverResumeStage,
    SearchSource,
)
from app.services.cache_service import discover_sources_cache
from app.services.content_fetcher import is_probably_url
from app.services.llm_service import LLMService
from app.services.prompt_builder import (
    build_discover_evidence_messages,
    build_discover_brief_messages,
    build_discover_draft_messages,
    build_discover_report_messages,
    compose_style_instruction,
)
from app.services.search_service import SearchResult, SearchService
from app.services.source_resolver import source_resolver
from app.services.workflow_service import WorkflowService


_DEEP_INTENT_PATTERN = re.compile(
    r"(选型|对比|最佳|落地|开源|方案|实践|坑|优缺点|trade[- ]?off|benchmark|compare|recommend)",
    re.IGNORECASE,
)


def _normalize_query(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _detect_deep_intent(query: str) -> bool:
    return bool(_DEEP_INTENT_PATTERN.search(query))


def _cache_key(query: str) -> str:
    cleaned = _normalize_query(query).lower()
    provider = "searxng" if settings.searxng_url else "ddg"
    return f"discover:{provider}:{cleaned}"


def _truncate(text: str, limit: int) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "…"


def _min_relevance_score(query: str) -> float:
    return 1.0 if _detect_deep_intent(query) else 1.4


def _fallback_excerpt(snippet: str) -> str:
    cleaned = _truncate((snippet or "").strip(), 900)
    if not cleaned:
        return ""
    return f"{cleaned}\n\n注：页面正文抓取失败，本条信息当前仅基于搜索摘要保留。"


class DiscoverService:
    def __init__(self) -> None:
        self.search_service = SearchService()
        self.llm_service = LLMService()
        self.workflow_service = WorkflowService()

    async def discover(self, payload: DiscoverRequest) -> DiscoverResponse:
        started = perf_counter()
        query = _normalize_query(payload.query)
        style_prompt = compose_style_instruction(payload.style_prompt.strip(), payload.style_profile)
        recorder = self.workflow_service.create_recorder(mode="discover", title=query)

        used_cache = False
        followup_used = False
        resumed = False
        resume_stage: str | None = None
        try:
            checkpoint = None
            if payload.resume is not None:
                async with recorder.step("恢复检查点", "复用历史任务产物，从指定阶段继续调研。"):
                    checkpoint = await asyncio.to_thread(self._load_resume_checkpoint, payload.resume, query)
                    resumed = True
                    resume_stage = payload.resume.stage.value
                    await self._write_sources_artifacts(recorder, checkpoint["sources"])
                    if checkpoint.get("evidence_items"):
                        await recorder.write_artifact(
                            kind="evidence",
                            label="discover-evidence",
                            content=[item.model_dump(mode="json") for item in checkpoint["evidence_items"]],
                            extension="json",
                            mime_type="application/json",
                        )
                    if payload.resume.stage in {DiscoverResumeStage.BRIEF, DiscoverResumeStage.DRAFT}:
                        await recorder.write_artifact(
                            kind="brief",
                            label="discover-brief",
                            content=checkpoint["brief"].model_dump(mode="json"),
                            extension="json",
                            mime_type="application/json",
                        )
                    if payload.resume.stage is DiscoverResumeStage.DRAFT:
                        await recorder.write_artifact(
                            kind="draft",
                            label="discover-draft",
                            content=checkpoint["draft_text"],
                            extension="md",
                            mime_type="text/markdown",
                        )

            if checkpoint is None:
                async with recorder.step("检索来源", "搜索候选链接并抽取高质量可用来源。"):
                    sources: list[SearchSource] | None = None
                    if payload.cache.enabled:
                        sources = discover_sources_cache.get(_cache_key(query))
                        if sources is not None:
                            used_cache = True

                    if sources is None:
                        sources = await self._build_sources(query=query)
                        if payload.cache.enabled:
                            discover_sources_cache.set(_cache_key(query), sources)

                    if settings.discover_followup_enabled and (_detect_deep_intent(query) or len(sources) < 3):
                        try:
                            followup_sources = await self._followup_sources(
                                query=query,
                                existing_sources=sources,
                                llm_config=payload.llm,
                            )
                        except Exception:
                            followup_sources = []

                        if followup_sources:
                            followup_used = True
                            merged = {str(item.url): item for item in sources}
                            for item in followup_sources:
                                merged[str(item.url)] = item
                            sources = list(merged.values())[: max(1, int(settings.discover_fetch_top_k) * 2)]

                    await self._write_sources_artifacts(recorder, sources)

            else:
                sources = checkpoint["sources"]

            if checkpoint is None or not checkpoint.get("evidence_items"):
                async with recorder.step("抽取证据", "从来源摘录中提炼可复用的证据包。"):
                    evidence_items = await self._extract_evidence_items(
                        query=query,
                        sources=sources,
                        llm_config=payload.llm,
                    )
                    await recorder.write_artifact(
                        kind="evidence",
                        label="discover-evidence",
                        content=[item.model_dump(mode="json") for item in evidence_items],
                        extension="json",
                        mime_type="application/json",
                    )
            else:
                evidence_items = checkpoint["evidence_items"]

            async with recorder.step("压缩上下文", "提炼调研目标、证据点与约束。"):
                compressed_context = self.workflow_service.build_discover_context(
                    query=query,
                    style_prompt=style_prompt,
                    sources=sources,
                    evidence_items=evidence_items,
                )
                context_brief = self.workflow_service.context_to_brief(compressed_context)
                await recorder.write_artifact(
                    kind="context",
                    label="compressed-context",
                    content=compressed_context,
                    extension="json",
                    mime_type="application/json",
                )

            if checkpoint is None or payload.resume.stage is DiscoverResumeStage.SOURCES:
                async with recorder.step("证据简报", "先整理结论、证据、不确定点与转写提纲。"):
                    research_brief = await self._generate_research_brief(
                        query=query,
                        style_prompt=style_prompt,
                        evidence_items=evidence_items,
                        sources=sources,
                        llm_config=payload.llm,
                        context_brief=context_brief,
                    )
                    await recorder.write_artifact(
                        kind="brief",
                        label="discover-brief",
                        content=research_brief.model_dump(mode="json"),
                        extension="json",
                        mime_type="application/json",
                    )
            else:
                research_brief = checkpoint["brief"]

            if checkpoint is None or payload.resume.stage in {DiscoverResumeStage.SOURCES, DiscoverResumeStage.BRIEF}:
                async with recorder.step("生成草稿", "基于证据简报整理可继续润色的调研草稿。"):
                    draft_text = await self._generate_draft(
                        query=query,
                        style_prompt=style_prompt,
                        evidence_items=evidence_items,
                        sources=sources,
                        llm_config=payload.llm,
                        context_brief=context_brief,
                        research_brief=research_brief,
                    )
                    await recorder.write_artifact(
                        kind="draft",
                        label="discover-draft",
                        content=draft_text,
                        extension="md",
                        mime_type="text/markdown",
                    )
            else:
                draft_text = checkpoint["draft_text"]

            async with recorder.step("生成调研稿", "基于证据简报与草稿生成正式调研报告。"):
                transformed_text = await self._generate_report(
                    query=query,
                    style_prompt=style_prompt,
                    evidence_items=evidence_items,
                    sources=sources,
                    llm_config=payload.llm,
                    context_brief=context_brief,
                    research_brief=research_brief,
                    draft_text=draft_text,
                )
                await recorder.write_artifact(
                    kind="report",
                    label="discover-report",
                    content=transformed_text,
                    extension="md",
                    mime_type="text/markdown",
                )

            recorder.finish(
                status="completed",
                summary=(
                    f"完成调研任务，整理 {len(sources)} 个来源，"
                    f"提炼 {len(research_brief.evidence)} 条证据，生成 {len(recorder.artifacts)} 份产物。"
                ),
            )
        except Exception:
            recorder.finish(status="failed")
            raise

        duration_ms = int((perf_counter() - started) * 1000)
        return DiscoverResponse(
            request_id=f"disc_{uuid4().hex[:12]}",
            title=query,
            transformed_text=transformed_text,
            brief=research_brief,
            sources=sources,
            meta=DiscoverMeta(
                provider=payload.llm.provider,
                model=payload.llm.model,
                duration_ms=duration_ms,
                used_cache=used_cache,
                followup_used=followup_used,
                sources=len(sources),
                evidence_items=len(research_brief.evidence),
                uncertainties=len(research_brief.uncertainties),
                resumed=resumed,
                resume_stage=resume_stage,
            ),
            run=recorder.run,
        )

    async def _write_sources_artifacts(self, recorder, sources: list[SearchSource]) -> None:
        await recorder.write_artifact(
            kind="sources",
            label="sources",
            content=self.workflow_service.render_sources_markdown(sources),
            extension="md",
            mime_type="text/markdown",
        )
        await recorder.write_artifact(
            kind="sources",
            label="sources-data",
            content=[item.model_dump(mode="json") for item in sources],
            extension="json",
            mime_type="application/json",
        )

    async def _build_sources(self, query: str) -> list[SearchSource]:
        # 多取一些候选链接：搜索结果里经常混入难以抓取的平台（如需要登录/强 JS 渲染）。
        search_k = max(int(settings.discover_max_results), int(settings.discover_fetch_top_k) * 6)
        all_results = await self.search_service.search(query, max_results=search_k)
        relevance_threshold = _min_relevance_score(query)
        results = [item for item in all_results if item.relevance_score >= relevance_threshold]
        if not results:
            results = all_results[: max(1, int(settings.discover_fetch_top_k) * 2)]

        picked: list[str] = []
        seen: set[str] = set()
        for item in results:
            url = item.url.strip()
            if not url or url in seen:
                continue
            if not is_probably_url(url):
                continue
            seen.add(url)
            picked.append(url)

        # 如果过滤后全没了，就退回不做过滤（至少给一次尝试机会）。
        if not picked:
            picked = self._pick_urls(results, max_urls=search_k)

        batch_size = max(1, int(settings.discover_fetch_top_k))
        max_try = max(batch_size, batch_size * 4)
        for offset in range(0, min(len(picked), max_try), batch_size):
            urls = picked[offset : offset + batch_size]
            sources = await self._fetch_sources(results=results, urls=urls)
            if sources:
                return sources

        raise AppError(
            code="discover_no_sources",
            message="未找到可用资料来源，无法完成探索发现。",
            suggestion="请尝试换一种关键词描述；也可以启用搜索增强（SearxNG）提升检索命中率。",
            status_code=424,
        )

    def _pick_urls(self, results: list[SearchResult], max_urls: int) -> list[str]:
        seen: set[str] = set()
        picked: list[str] = []
        for item in results:
            url = item.url.strip()
            if not url or url in seen:
                continue
            if not is_probably_url(url):
                continue
            seen.add(url)
            picked.append(url)
            if len(picked) >= max(1, int(max_urls)):
                break
        return picked

    async def _fetch_sources(self, results: list[SearchResult], urls: list[str]) -> list[SearchSource]:
        snippet_by_url = {item.url: item.snippet for item in results}
        title_by_url = {item.url: item.title for item in results}
        relevance_by_url = {item.url: item.relevance_score for item in results}
        credibility_by_url = {item.url: item.credibility_score for item in results}
        overall_by_url = {item.url: item.overall_score for item in results}
        source_type_by_url = {item.url: item.source_type for item in results}

        semaphore = asyncio.Semaphore(4)

        async def fetch_one(url: str, index: int) -> SearchSource | None:
            async with semaphore:
                try:
                    content, _ = await source_resolver.resolve_url(url, use_cache=True)
                    title = (content.title or "").strip() or (title_by_url.get(url) or "").strip() or url
                    excerpt = content.raw_excerpt.strip() or _truncate(content.full_text, 1200)
                    capture_mode = "full"
                except Exception:
                    title = (title_by_url.get(url) or "").strip() or url
                    snippet = _truncate(snippet_by_url.get(url, ""), 240)
                    excerpt = _fallback_excerpt(snippet)
                    if not title and not excerpt:
                        return None
                    capture_mode = "snippet"
                return SearchSource(
                    id=index,
                    title=title,
                    url=url,
                    snippet=_truncate(snippet_by_url.get(url, ""), 240),
                    excerpt=_truncate(excerpt, 1200),
                    source_type=source_type_by_url.get(url, "article"),
                    relevance_score=max(0.0, float(relevance_by_url.get(url, 0.0))),
                    credibility_score=max(0.0, float(credibility_by_url.get(url, 0.0))),
                    overall_score=max(0.0, float(overall_by_url.get(url, 0.0))),
                    capture_mode=capture_mode,
                )

        tasks = [fetch_one(url, index + 1) for index, url in enumerate(urls)]
        fetched = await asyncio.gather(*tasks)
        return sorted(
            [item for item in fetched if item is not None],
            key=lambda item: (item.overall_score, item.relevance_score, item.credibility_score),
            reverse=True,
        )

    async def _followup_sources(self, query: str, existing_sources: list[SearchSource], llm_config) -> list[SearchSource]:
        extra_queries = await self._generate_followup_queries(query=query, sources=existing_sources, llm_config=llm_config)
        if not extra_queries:
            return []

        combined_results: list[SearchResult] = []
        limit = max(3, settings.discover_max_results // 2)

        async def search_one(extra_query: str) -> list[SearchResult]:
            try:
                return await self.search_service.search(extra_query, max_results=limit)
            except Exception:
                return []

        search_tasks = [
            asyncio.create_task(search_one(extra_query))
            for extra_query in list(dict.fromkeys(extra_queries))[:5]
        ]
        for result_batch in await asyncio.gather(*search_tasks):
            combined_results.extend(result_batch)

        existing_urls = {str(item.url) for item in existing_sources}
        urls = [item.url for item in combined_results if item.url not in existing_urls and is_probably_url(item.url)]
        urls = list(dict.fromkeys(urls))[: max(1, int(settings.discover_fetch_top_k))]
        return await self._fetch_sources(results=combined_results, urls=urls)

    async def _generate_followup_queries(self, query: str, sources: list[SearchSource], llm_config) -> list[str]:
        brief_sources = "\n".join(f"- {item.title} ({item.url})" for item in sources[:6])
        messages = [
            {
                "role": "system",
                "content": (
                    "你是一个调研助理，擅长把用户问题拆解成高质量检索关键词。"
                    "只输出 JSON 数组（字符串数组），不要输出其他内容。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"用户问题：{query}\n\n"
                    "已有来源标题（供参考，避免重复）：\n"
                    f"{brief_sources}\n\n"
                    "请给出 3~5 条补充检索关键词/查询语句，用于进一步查找开源方案、最佳实践和对比信息。"
                    "要求：每条不超过 20 个字；尽量覆盖不同维度（选型、实现、坑、性能、替代方案）。"
                ),
            },
        ]

        raw = await self.llm_service.rewrite(messages, llm_config)
        cleaned = raw.strip()
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                result: list[str] = []
                for item in parsed:
                    text = _normalize_query(str(item))
                    if text and text.lower() != query.lower():
                        result.append(text)
                return result[:5]
        except Exception:
            pass

        # fallback: one query per line
        lines = []
        for line in cleaned.splitlines():
            line = re.sub(r"^[\-\*\d\.\)\s]+", "", line).strip()
            if not line:
                continue
            lines.append(_normalize_query(line))
        return list(dict.fromkeys(lines))[:5]

    def _resolve_resume_workspace(self, run_id: str) -> Path:
        if not re.fullmatch(r"run_[a-z0-9]{8,32}", (run_id or "").strip()):
            raise AppError(
                code="discover_resume_invalid_run",
                message="恢复任务失败，提供的运行编号不合法。",
                suggestion="请从最近任务或当前结果页发起阶段重跑，不要手动修改运行编号。",
                status_code=422,
            )

        runs_root = Path(settings.runs_directory).resolve()
        workspace = (runs_root / run_id.strip()).resolve()
        try:
            workspace.relative_to(runs_root)
        except ValueError as exc:
            raise AppError(
                code="discover_resume_invalid_path",
                message="恢复任务失败，运行目录不在允许范围内。",
                suggestion="请重新发起调研，或从系统生成的任务记录中重试。",
                status_code=422,
            ) from exc

        if not workspace.exists() or not workspace.is_dir():
            raise AppError(
                code="discover_resume_not_found",
                message="未找到可恢复的历史任务目录。",
                suggestion="请确认该任务仍存在于运行目录，或重新执行一次调研。",
                status_code=404,
            )
        return workspace

    def _read_workspace_text(self, workspace: Path, pattern: str) -> str:
        matches = sorted(workspace.glob(pattern))
        if not matches:
            raise AppError(
                code="discover_resume_missing_artifact",
                message="历史任务缺少恢复所需的中间产物。",
                suggestion="请重新从来源开始执行调研，以重新生成完整 artifact。",
                status_code=409,
            )
        return matches[-1].read_text(encoding="utf-8")

    def _load_resume_checkpoint(self, options: DiscoverResumeOptions, query: str) -> dict[str, object]:
        workspace = self._resolve_resume_workspace(options.run_id)
        context_matches = sorted(workspace.glob("*-compressed-context.json"))
        if context_matches:
            context = json.loads(context_matches[-1].read_text(encoding="utf-8"))
            if not isinstance(context, dict):
                raise AppError(
                    code="discover_resume_invalid_context",
                    message="历史任务的上下文产物已损坏，无法继续恢复。",
                    suggestion="请重新发起调研任务，生成新的上下文 artifact。",
                    status_code=409,
                )

            prior_query = str(context.get("query") or "").strip()
            if prior_query and _normalize_query(prior_query) != _normalize_query(query):
                raise AppError(
                    code="discover_resume_query_mismatch",
                    message="当前关键词与历史任务不一致，不能直接复用阶段产物。",
                    suggestion="请先恢复原任务输入，或从新的关键词重新开始调研。",
                    status_code=409,
                )

        sources_payload = json.loads(self._read_workspace_text(workspace, "*-sources-data.json"))
        if not isinstance(sources_payload, list):
            raise AppError(
                code="discover_resume_invalid_sources",
                message="历史来源数据已损坏，无法恢复来源阶段。",
                suggestion="请重新执行调研，让系统重新抓取与整理来源。",
                status_code=409,
            )
        sources = [SearchSource.model_validate(item) for item in sources_payload]

        checkpoint: dict[str, object] = {
            "sources": sources,
        }
        evidence_matches = sorted(workspace.glob("*-discover-evidence.json"))
        if evidence_matches:
            evidence_payload = json.loads(evidence_matches[-1].read_text(encoding="utf-8"))
            if isinstance(evidence_payload, list):
                checkpoint["evidence_items"] = [DiscoverEvidenceItem.model_validate(item) for item in evidence_payload]
        if options.stage in {DiscoverResumeStage.BRIEF, DiscoverResumeStage.DRAFT}:
            checkpoint["brief"] = DiscoverBrief.model_validate(
                json.loads(self._read_workspace_text(workspace, "*-discover-brief.json"))
            )
        if options.stage is DiscoverResumeStage.DRAFT:
            checkpoint["draft_text"] = self._read_workspace_text(workspace, "*-discover-draft.md")
        return checkpoint

    def _extract_json_payload(self, raw: str) -> dict[str, object] | None:
        cleaned = (raw or "").strip()
        if not cleaned:
            return None

        fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
        if fenced:
            cleaned = fenced.group(1).strip()

        for candidate in (cleaned,):
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(cleaned[start : end + 1])
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return None
        return None

    def _fallback_evidence_items(self, sources: list[SearchSource]) -> list[DiscoverEvidenceItem]:
        evidence_items: list[DiscoverEvidenceItem] = []
        for item in sources[:5]:
            quote = _truncate(item.excerpt or item.snippet, 160)
            evidence_items.append(
                DiscoverEvidenceItem(
                    source_id=item.id,
                    title=item.title,
                    url=item.url,
                    quote=quote,
                    evidence=quote,
                    relevance="可作为本轮判断的直接来源依据。",
                )
            )
        return evidence_items

    def _fallback_research_brief(
        self,
        query: str,
        sources: list[SearchSource],
        evidence_items: list[DiscoverEvidenceItem] | None = None,
    ) -> DiscoverBrief:
        evidence: list[DiscoverEvidenceItem] = []
        key_findings: list[str] = []
        for item in (evidence_items or self._fallback_evidence_items(sources))[:4]:
            excerpt = _truncate(item.evidence or item.quote, 180)
            evidence.append(
                DiscoverEvidenceItem(
                    source_id=item.source_id,
                    title=item.title,
                    url=item.url,
                    quote=item.quote,
                    evidence=excerpt,
                    relevance=item.relevance or "可作为本轮判断的直接来源依据。",
                )
            )
            if excerpt:
                key_findings.append(excerpt)

        uncertainties: list[str] = []
        if len(sources) < 3:
            uncertainties.append("当前可用来源偏少，结论仍建议结合更多官方资料或实测结果复核。")

        return DiscoverBrief(
            summary=f"围绕“{query}”完成来源整理，可继续进入调研写作。",
            conclusion="现有来源已经能支撑初步判断，但仍需按证据强弱组织成稿。",
            key_findings=key_findings[:4],
            evidence=evidence,
            uncertainties=uncertainties,
            draft_outline=[
                "问题背景与判断标准",
                "证据拆解与来源支撑",
                "推荐方案与适用边界",
                "风险、限制与后续验证",
            ],
        )

    def _normalize_evidence_payload(
        self,
        payload: dict[str, object],
        sources: list[SearchSource],
    ) -> list[DiscoverEvidenceItem]:
        source_by_id = {item.id: item for item in sources}
        source_by_url = {str(item.url): item for item in sources}
        evidence_items: list[DiscoverEvidenceItem] = []
        per_source_counts: dict[int, int] = {}
        seen_pairs: set[tuple[int, str]] = set()

        raw_evidence = payload.get("evidence")
        for raw_item in raw_evidence if isinstance(raw_evidence, list) else []:
            if not isinstance(raw_item, dict):
                continue

            source = None
            raw_source_id = raw_item.get("source_id")
            if isinstance(raw_source_id, (int, float)):
                source = source_by_id.get(int(raw_source_id))
            if source is None:
                raw_url = str(raw_item.get("url") or "").strip()
                if raw_url:
                    source = source_by_url.get(raw_url)
            if source is None:
                continue

            quote_text = _truncate(str(raw_item.get("quote") or "").strip() or source.excerpt or source.snippet, 180)
            evidence_text = _truncate(
                str(raw_item.get("evidence") or raw_item.get("fact") or "").strip() or quote_text,
                220,
            )
            relevance_text = _truncate(str(raw_item.get("relevance") or "").strip(), 120)
            if not evidence_text:
                continue

            normalized = evidence_text.lower()
            pair = (source.id, normalized)
            if pair in seen_pairs:
                continue
            if per_source_counts.get(source.id, 0) >= 2:
                continue

            per_source_counts[source.id] = per_source_counts.get(source.id, 0) + 1
            seen_pairs.add(pair)
            evidence_items.append(
                DiscoverEvidenceItem(
                    source_id=source.id,
                    title=source.title,
                    url=source.url,
                    quote=quote_text,
                    evidence=evidence_text,
                    relevance=relevance_text,
                )
            )
            if len(evidence_items) >= 8:
                break

        return evidence_items or self._fallback_evidence_items(sources)

    def _normalize_research_brief(
        self,
        payload: dict[str, object],
        query: str,
        sources: list[SearchSource],
        extracted_evidence: list[DiscoverEvidenceItem],
    ) -> DiscoverBrief:
        fallback = self._fallback_research_brief(query, sources, extracted_evidence)
        source_by_id = {item.id: item for item in sources}
        source_by_url = {str(item.url): item for item in sources}
        evidence_by_source = {item.source_id: item for item in extracted_evidence}
        raw_evidence = payload.get("evidence")
        raw_key_findings = payload.get("key_findings")
        raw_uncertainties = payload.get("uncertainties")
        raw_outline = payload.get("draft_outline")

        evidence_items: list[DiscoverEvidenceItem] = []
        seen_sources: set[int] = set()
        for raw_item in raw_evidence if isinstance(raw_evidence, list) else []:
            if not isinstance(raw_item, dict):
                continue

            source = None
            raw_source_id = raw_item.get("source_id")
            if isinstance(raw_source_id, (int, float)):
                source = source_by_id.get(int(raw_source_id))
            if source is None:
                raw_url = str(raw_item.get("url") or "").strip()
                if raw_url:
                    source = source_by_url.get(raw_url)
            if source is None or source.id in seen_sources:
                continue

            base_evidence = evidence_by_source.get(source.id)
            quote_text = _truncate(
                str(raw_item.get("quote") or "").strip()
                or (base_evidence.quote if base_evidence else "")
                or source.excerpt
                or source.snippet,
                180,
            )
            evidence_text = _truncate(
                str(raw_item.get("evidence") or raw_item.get("fact") or "").strip()
                or (base_evidence.evidence if base_evidence else "")
                or source.excerpt
                or source.snippet,
                220,
            )
            relevance_text = _truncate(
                str(raw_item.get("relevance") or "").strip() or (base_evidence.relevance if base_evidence else ""),
                120,
            )
            if not evidence_text:
                continue
            seen_sources.add(source.id)
            evidence_items.append(
                DiscoverEvidenceItem(
                    source_id=source.id,
                    title=source.title,
                    url=source.url,
                    quote=quote_text,
                    evidence=evidence_text,
                    relevance=relevance_text,
                )
            )

        key_findings = [
            _truncate(str(item).strip(), 180)
            for item in (raw_key_findings if isinstance(raw_key_findings, list) else [])
            if str(item).strip()
        ][:6]
        uncertainties = [
            _truncate(str(item).strip(), 160)
            for item in (raw_uncertainties if isinstance(raw_uncertainties, list) else [])
            if str(item).strip()
        ][:4]
        draft_outline = [
            _truncate(str(item).strip(), 120)
            for item in (raw_outline if isinstance(raw_outline, list) else [])
            if str(item).strip()
        ][:6]

        summary = _truncate(str(payload.get("summary") or "").strip(), 180) or fallback.summary
        conclusion = _truncate(str(payload.get("conclusion") or "").strip(), 200) or fallback.conclusion

        return DiscoverBrief(
            summary=summary,
            conclusion=conclusion,
            key_findings=key_findings or fallback.key_findings,
            evidence=evidence_items or fallback.evidence,
            uncertainties=uncertainties or fallback.uncertainties,
            draft_outline=draft_outline or fallback.draft_outline,
        )

    async def _generate_research_brief(
        self,
        query: str,
        style_prompt: str,
        evidence_items: list[DiscoverEvidenceItem],
        sources: list[SearchSource],
        llm_config,
        context_brief: str,
    ) -> DiscoverBrief:
        messages = build_discover_brief_messages(
            query=query,
            style_prompt=style_prompt,
            evidence_items=evidence_items,
            sources=sources,
            context_brief=context_brief,
        )
        raw = await self.llm_service.rewrite(messages, llm_config)
        payload = self._extract_json_payload(raw)
        if payload is None:
            return self._fallback_research_brief(query, sources, evidence_items)
        return self._normalize_research_brief(
            payload,
            query=query,
            sources=sources,
            extracted_evidence=evidence_items,
        )

    async def _extract_evidence_items(
        self,
        query: str,
        sources: list[SearchSource],
        llm_config,
    ) -> list[DiscoverEvidenceItem]:
        messages = build_discover_evidence_messages(query=query, sources=sources)
        raw = await self.llm_service.rewrite(messages, llm_config)
        payload = self._extract_json_payload(raw)
        if payload is None:
            return self._fallback_evidence_items(sources)
        return self._normalize_evidence_payload(payload, sources=sources)

    async def _generate_draft(
        self,
        query: str,
        style_prompt: str,
        evidence_items: list[DiscoverEvidenceItem],
        sources: list[SearchSource],
        llm_config,
        context_brief: str,
        research_brief: DiscoverBrief,
    ) -> str:
        messages = build_discover_draft_messages(
            query=query,
            style_prompt=style_prompt,
            evidence_items=evidence_items,
            sources=sources,
            research_brief=research_brief,
            context_brief=context_brief,
        )
        result = await self.llm_service.rewrite(messages, llm_config)
        return result.strip()

    async def _generate_report(
        self,
        query: str,
        style_prompt: str,
        evidence_items: list[DiscoverEvidenceItem],
        sources: list[SearchSource],
        llm_config,
        context_brief: str,
        research_brief: DiscoverBrief,
        draft_text: str,
    ) -> str:
        messages = build_discover_report_messages(
            query=query,
            style_prompt=style_prompt,
            evidence_items=evidence_items,
            sources=sources,
            research_brief=research_brief,
            draft_markdown=draft_text,
            context_brief=context_brief,
        )
        result = await self.llm_service.rewrite(messages, llm_config)
        return result.strip()

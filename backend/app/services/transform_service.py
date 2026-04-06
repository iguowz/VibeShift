import asyncio
import logging
from time import perf_counter
from uuid import uuid4

from app.core.config import settings
from app.core.errors import AppError
from app.core.schemas import InputType, LLMConfig, SourceContent, TransformMeta, TransformRequest, TransformResponse
from app.services.chunking_service import ChunkingService
from app.services.content_cleaner import build_text_source
from app.services.content_fetcher import extract_urls
from app.services.image_service import ImageService
from app.services.llm_service import LLMService
from app.services.prompt_builder import (
    build_chunk_rewrite_messages,
    build_image_prompts,
    build_merge_messages,
    build_rewrite_outline_messages,
    build_rewrite_verify_messages,
    compose_style_instruction,
    build_rewrite_messages,
    render_style_prompt,
)
from app.services.source_resolver import source_resolver
from app.services.workflow_service import WorkflowService


class TransformService:
    def __init__(self) -> None:
        self.llm_service = LLMService()
        self.image_service = ImageService()
        self.chunking_service = ChunkingService()
        self.workflow_service = WorkflowService()
        self.logger = logging.getLogger("vibeshift.transform")

    def _is_local_llm(self, payload: TransformRequest) -> bool:
        provider = payload.llm.provider.lower().strip()
        base_url = str(payload.llm.base_url).lower()
        return provider == "ollama" or "host.docker.internal:11434" in base_url or "localhost:11434" in base_url

    def _config_for_stage(self, payload: TransformRequest, stage: str) -> LLMConfig:
        if not self._is_local_llm(payload):
            return payload.llm

        base_max_tokens = int(payload.llm.max_tokens)
        stage_caps = {
            "outline": 900,
            "chunk": 1200,
            "merge": 2200,
            "verify": 2200,
        }
        bounded_max_tokens = max(512, min(base_max_tokens, stage_caps.get(stage, base_max_tokens)))
        temperature = payload.llm.temperature
        if stage in {"outline", "merge", "verify"}:
            temperature = min(temperature, 0.4)
        return payload.llm.model_copy(
            update={
                "max_tokens": bounded_max_tokens,
                "temperature": temperature,
            }
        )

    async def _rewrite_chunk(
        self,
        payload: TransformRequest,
        source: SourceContent,
        style_prompt: str,
        context_brief: str,
        outline_text: str,
        chunk,
        total_chunks: int,
        semaphore: asyncio.Semaphore,
    ) -> tuple[int, str]:
        async with semaphore:
            chunk_messages = build_chunk_rewrite_messages(
                source=source,
                style_prompt=style_prompt,
                chunk_content=chunk.content,
                chunk_index=chunk.index,
                total_chunks=total_chunks,
                context_brief=context_brief,
                outline_text=outline_text,
            )
            chunk_config = self._config_for_stage(payload, "chunk")
            chunk_result = await self.llm_service.rewrite(chunk_messages, chunk_config)
            return chunk.index, chunk_result

    async def _resolve_url_sources(self, payload: TransformRequest) -> tuple[SourceContent, bool]:
        urls = extract_urls(payload.input)
        if not urls:
            raise AppError(
                code="invalid_url",
                message="请输入合法的 http/https 链接。",
                suggestion="请检查链接是否以 http:// 或 https:// 开头；多个链接可按换行分隔。",
                status_code=422,
            )
        if len(urls) > settings.max_url_inputs:
            raise AppError(
                code="too_many_urls",
                message=f"单次最多支持 {settings.max_url_inputs} 个链接。",
                suggestion="请减少链接数量，或分批处理。",
                status_code=422,
            )

        if len(urls) == 1:
            return await source_resolver.resolve_url(urls[0], use_cache=payload.cache.enabled)

        self.logger.info("transform_multi_url_started count=%s urls=%s", len(urls), urls)
        results = await asyncio.gather(
            *(source_resolver.resolve_url(url, use_cache=payload.cache.enabled) for url in urls),
            return_exceptions=True,
        )
        successes: list[tuple[str, SourceContent, bool]] = []
        failures: list[tuple[str, Exception]] = []
        for url, item in zip(urls, results, strict=False):
            if isinstance(item, Exception):
                failures.append((url, item))
                continue
            source, used_cache = item
            successes.append((url, source, used_cache))

        if not successes:
            first_error = failures[0][1]
            if isinstance(first_error, AppError):
                raise first_error
            raise AppError(
                code="multi_url_fetch_failed",
                message="多个链接都未能成功抓取。",
                suggestion="请检查链接可访问性，或先只保留可公开访问的链接重试。",
                status_code=424,
            ) from first_error

        if failures:
            self.logger.warning(
                "transform_multi_url_partial_failure success=%s failed=%s failed_urls=%s",
                len(successes),
                len(failures),
                [url for url, _ in failures],
            )

        combined_source = self._combine_sources(successes)
        used_cache = all(item[2] for item in successes)
        return combined_source, used_cache

    def _combine_sources(self, sources: list[tuple[str, SourceContent, bool]]) -> SourceContent:
        first_source = sources[0][1]
        if len(sources) == 1:
            return first_source

        titles = [item[1].title.strip() or item[0] for item in sources]
        title = f"{titles[0]} 等 {len(sources)} 篇内容整理"
        excerpt_parts = [item[1].raw_excerpt.strip() for item in sources[:3] if item[1].raw_excerpt.strip()]
        full_text_parts = []
        for index, (url, source, _) in enumerate(sources, start=1):
            full_text_parts.append(
                "\n".join(
                    [
                        f"## 来源 {index}：{source.title}",
                        f"URL：{url}",
                        source.full_text.strip(),
                    ]
                ).strip()
            )

        return SourceContent(
            title=title,
            source_url=sources[0][0],
            raw_excerpt="\n\n".join(excerpt_parts)[:500],
            full_text="\n\n".join(full_text_parts),
        )

    async def _rewrite_source_text(
        self,
        payload: TransformRequest,
        source: SourceContent,
        style_prompt: str,
        context_brief: str,
        chunks,
        outline_text: str = "",
    ) -> str:
        if len(chunks) == 1:
            messages = build_rewrite_messages(
                source,
                style_prompt,
                context_brief=context_brief,
                outline_text=outline_text,
            )
            return await self.llm_service.rewrite(messages, self._config_for_stage(payload, "merge"))

        total_chunks = len(chunks)
        concurrency = self._resolve_rewrite_concurrency(payload, total_chunks)
        semaphore = asyncio.Semaphore(concurrency)
        verify_in_merge = self._should_verify_in_merge(payload, total_chunks)
        chunk_tasks = [
            asyncio.create_task(
                self._rewrite_chunk(
                    payload=payload,
                    source=source,
                    style_prompt=style_prompt,
                    context_brief=context_brief,
                    outline_text=outline_text,
                    chunk=chunk,
                    total_chunks=total_chunks,
                    semaphore=semaphore,
                )
            )
            for chunk in chunks
        ]
        chunk_results = [
            content
            for _, content in sorted(
                await asyncio.gather(*chunk_tasks),
                key=lambda item: item[0],
            )
        ]

        merge_messages = build_merge_messages(
            source,
            style_prompt,
            chunk_results,
            context_brief=context_brief,
            outline_text=outline_text,
            verify_final=verify_in_merge,
        )
        return await self.llm_service.rewrite(merge_messages, self._config_for_stage(payload, "merge"))

    def _resolve_rewrite_concurrency(self, payload: TransformRequest, total_chunks: int) -> int:
        base = max(1, min(settings.rewrite_max_concurrency, total_chunks))
        if self._is_local_llm(payload):
            self.logger.info(
                "transform_concurrency_adjusted provider=%s base_url=%s requested=%s effective=1 reason=local_llm_serialized",
                payload.llm.provider,
                payload.llm.base_url,
                base,
            )
            return 1
        return base

    def _should_verify_in_merge(self, payload: TransformRequest, total_chunks: int) -> bool:
        return self._is_local_llm(payload) and total_chunks > 1

    async def _build_rewrite_outline(
        self,
        payload: TransformRequest,
        source: SourceContent,
        style_prompt: str,
        context_brief: str,
    ) -> str:
        messages = build_rewrite_outline_messages(source, style_prompt, context_brief=context_brief)
        return (await self.llm_service.rewrite(messages, self._config_for_stage(payload, "outline"))).strip()

    async def _verify_rewrite(
        self,
        payload: TransformRequest,
        source: SourceContent,
        style_prompt: str,
        context_brief: str,
        outline_text: str,
        draft_text: str,
    ) -> str:
        messages = build_rewrite_verify_messages(
            source,
            style_prompt,
            draft_text=draft_text,
            context_brief=context_brief,
            outline_text=outline_text,
        )
        return (await self.llm_service.rewrite(messages, self._config_for_stage(payload, "verify"))).strip()

    async def transform(self, payload: TransformRequest) -> TransformResponse:
        started = perf_counter()
        if len(payload.input) > settings.max_input_characters:
            raise AppError(
                code="input_too_long",
                message="输入内容过长，当前版本暂不支持直接处理该长度。",
                suggestion="请缩短内容，或等待后续长文本分块版本。",
                status_code=422,
            )

        recorder = self.workflow_service.create_recorder(mode="transform")
        try:
            async with recorder.step("获取输入", "加载 URL 或正文，并解析为统一内容源。"):
                if payload.input_type is InputType.URL:
                    source, used_cache = await self._resolve_url_sources(payload)
                else:
                    source = build_text_source(payload.input)
                    used_cache = False
                recorder.set_title(source.title)
                await recorder.write_artifact(
                    kind="source",
                    label="source",
                    content=self.workflow_service.render_source_markdown(source),
                    extension="md",
                    mime_type="text/markdown",
                )

            rendered_style_prompt = render_style_prompt(payload.style_prompt, source)
            style_prompt = compose_style_instruction(rendered_style_prompt, payload.style_profile)

            async with recorder.step("压缩上下文", "提炼任务目标、关键事实和写作约束。"):
                compressed_context = self.workflow_service.build_transform_context(source, style_prompt)
                context_brief = self.workflow_service.context_to_brief(compressed_context)
                await recorder.write_artifact(
                    kind="context",
                    label="compressed-context",
                    content=compressed_context,
                    extension="json",
                    mime_type="application/json",
                )

            chunk_size, overlap = self.chunking_service.derive_chunking_window(
                preferred_chunk_size=settings.rewrite_chunk_size_characters,
                preferred_overlap=settings.rewrite_chunk_overlap_characters,
                llm_max_tokens=payload.llm.max_tokens,
            )
            self.logger.info(
                "transform_chunk_plan title=%s input_type=%s chars=%s chunk_size=%s overlap=%s llm_max_tokens=%s",
                source.title,
                payload.input_type.value,
                len(source.full_text),
                chunk_size,
                overlap,
                payload.llm.max_tokens,
            )
            chunks = self.chunking_service.split_text(
                source.full_text,
                chunk_size=chunk_size,
                overlap=overlap,
            )
            outline_text = ""
            if len(chunks) > 1:
                async with recorder.step("规划结构", "先生成长文改写的标题、TL;DR 与章节骨架。"):
                    outline_text = await self._build_rewrite_outline(payload, source, style_prompt, context_brief=context_brief)
                    await recorder.write_artifact(
                        kind="outline",
                        label="rewrite-outline",
                        content=outline_text,
                        extension="md",
                        mime_type="text/markdown",
                    )

            async with recorder.step("生成改写稿", "基于压缩上下文和原始内容生成结构化成稿。"):
                transformed_text = await self._rewrite_source_text(
                    payload,
                    source,
                    style_prompt,
                    context_brief=context_brief,
                    chunks=chunks,
                    outline_text=outline_text,
                )
                await recorder.write_artifact(
                    kind="draft",
                    label="rewrite-draft",
                    content=transformed_text,
                    extension="md",
                    mime_type="text/markdown",
                )
            if outline_text and not self._should_verify_in_merge(payload, len(chunks)):
                async with recorder.step("校验成稿", "检查长文改写是否遗漏关键事实，并修正结构与重复。"):
                    transformed_text = await self._verify_rewrite(
                        payload,
                        source,
                        style_prompt,
                        context_brief=context_brief,
                        outline_text=outline_text,
                        draft_text=transformed_text,
                    )
                    await recorder.write_artifact(
                        kind="report",
                        label="rewrite-verified",
                        content=transformed_text,
                        extension="md",
                        mime_type="text/markdown",
                    )

            images = []
            image_prompts: list[str] | None = None
            if payload.image.enabled:
                async with recorder.step("规划插图", "根据正文生成插图提示词与布局素材。"):
                    prompts = build_image_prompts(source, transformed_text, payload.image, style_profile=payload.style_profile)
                    await recorder.write_artifact(
                        kind="image_prompts",
                        label="image-prompts",
                        content=prompts,
                        extension="json",
                        mime_type="application/json",
                    )
                if payload.image.async_generation:
                    image_prompts = prompts
                    images = []
                else:
                    async with recorder.step("生成插图", "调用图像模型生成最终插图。"):
                        images = await self.image_service.generate_images(prompts, payload.image)
                        image_prompts = prompts

            recorder.finish(
                status="completed",
                summary=f"完成 {payload.input_type.value} 转换，共产出 {len(recorder.artifacts)} 份产物。",
            )
            self.logger.info(
                "transform_completed title=%s input_type=%s artifacts=%s chunks=%s used_cache=%s",
                source.title,
                payload.input_type.value,
                len(recorder.artifacts),
                len(chunks),
                used_cache,
            )
        except Exception:
            recorder.finish(status="failed")
            raise

        duration_ms = int((perf_counter() - started) * 1000)
        return TransformResponse(
            request_id=f"req_{uuid4().hex[:12]}",
            title=source.title,
            source_url=source.source_url,
            raw_excerpt=source.raw_excerpt,
            transformed_text=transformed_text,
            images=images,
            image_prompts=image_prompts,
            meta=TransformMeta(
                input_type=payload.input_type,
                provider=payload.llm.provider,
                model=payload.llm.model,
                duration_ms=duration_ms,
                used_cache=used_cache,
            ),
            run=recorder.run,
        )

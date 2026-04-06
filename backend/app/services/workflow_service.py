from __future__ import annotations

import asyncio
import json
import re
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from app.core.config import settings
from app.core.schemas import (
    ArtifactKind,
    DiscoverEvidenceItem,
    SearchSource,
    SourceContent,
    WorkflowArtifact,
    WorkflowRun,
    WorkflowRunMode,
    WorkflowRunStatus,
    WorkflowStep,
    WorkflowStepStatus,
)


_SENTENCE_BREAK_PATTERN = re.compile(r"(?<=[。！？.!?])\s+")


def utc_now() -> datetime:
    return datetime.now(UTC)


def _sanitize_name(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower()).strip("-")
    return cleaned or "artifact"


class WorkflowRecorder:
    def __init__(self, mode: WorkflowRunMode | str, title: str = "") -> None:
        self.started = perf_counter()
        self.run_id = f"run_{uuid4().hex[:12]}"
        self.workspace = (Path(settings.runs_directory) / self.run_id).resolve()
        self.workspace.mkdir(parents=True, exist_ok=True)
        now = utc_now()
        self.run = WorkflowRun(
            id=self.run_id,
            mode=WorkflowRunMode(mode),
            status=WorkflowRunStatus.RUNNING,
            workspace_path=str(self.workspace),
            started_at=now,
            finished_at=now,
            duration_ms=0,
            title=title.strip(),
            summary="",
            steps=[],
            artifacts=[],
        )

    @property
    def artifacts(self) -> list[WorkflowArtifact]:
        return self.run.artifacts

    @property
    def steps(self) -> list[WorkflowStep]:
        return self.run.steps

    def set_title(self, title: str) -> None:
        cleaned = (title or "").strip()
        if cleaned:
            self.run.title = cleaned

    def set_summary(self, summary: str) -> None:
        self.run.summary = (summary or "").strip()

    @asynccontextmanager
    async def step(self, label: str, detail: str = ""):
        started = utc_now()
        started_perf = perf_counter()
        try:
            yield
        except Exception:
            self.run.steps.append(
                WorkflowStep(
                    id=f"step_{len(self.run.steps) + 1}",
                    label=label,
                    status=WorkflowStepStatus.FAILED,
                    started_at=started,
                    finished_at=utc_now(),
                    duration_ms=max(0, int((perf_counter() - started_perf) * 1000)),
                    detail=detail,
                )
            )
            raise
        else:
            self.run.steps.append(
                WorkflowStep(
                    id=f"step_{len(self.run.steps) + 1}",
                    label=label,
                    status=WorkflowStepStatus.COMPLETED,
                    started_at=started,
                    finished_at=utc_now(),
                    duration_ms=max(0, int((perf_counter() - started_perf) * 1000)),
                    detail=detail,
                )
            )

    async def write_artifact(
        self,
        *,
        kind: ArtifactKind | str,
        label: str,
        content: str | dict | list,
        extension: str,
        mime_type: str,
    ) -> WorkflowArtifact:
        artifact_id = f"art_{len(self.run.artifacts) + 1}"
        filename = f"{len(self.run.artifacts) + 1:02d}-{_sanitize_name(label)}.{extension.lstrip('.')}"
        path = self.workspace / filename

        if isinstance(content, (dict, list)):
            rendered = json.dumps(content, ensure_ascii=False, indent=2)
        else:
            rendered = str(content)

        await asyncio.to_thread(path.write_text, rendered, encoding="utf-8")
        preview = rendered[: settings.artifact_preview_characters].strip()
        artifact = WorkflowArtifact(
            id=artifact_id,
            kind=ArtifactKind(kind),
            label=label,
            path=str(path),
            mime_type=mime_type,
            size_bytes=path.stat().st_size,
            preview=preview,
            created_at=utc_now(),
        )
        self.run.artifacts.append(artifact)
        return artifact

    def finish(self, *, status: WorkflowRunStatus | str, summary: str | None = None) -> WorkflowRun:
        if summary is not None:
            self.set_summary(summary)
        self.run.status = WorkflowRunStatus(status)
        self.run.finished_at = utc_now()
        self.run.duration_ms = max(0, int((perf_counter() - self.started) * 1000))
        return self.run


class WorkflowService:
    def create_recorder(self, mode: WorkflowRunMode | str, title: str = "") -> WorkflowRecorder:
        return WorkflowRecorder(mode=mode, title=title)

    def build_transform_context(self, source: SourceContent, style_prompt: str) -> dict[str, object]:
        key_points = self._extract_key_points(source.full_text, limit=6)
        return {
            "goal": "将原始内容稳定改写为目标风格成稿",
            "title": source.title,
            "source_url": source.source_url or "",
            "summary": source.raw_excerpt.strip(),
            "style_prompt": style_prompt.strip(),
            "key_points": key_points,
            "constraints": [
                "仅基于输入内容写作，不得引入来源外事实",
                "优先保留数字、人名、时间、地点、结论",
                "输出使用清晰 Markdown 结构",
            ],
            "source_map": [
                {
                    "id": "source-1",
                    "title": source.title,
                    "url": source.source_url or "",
                }
            ],
        }

    def build_discover_context(
        self,
        *,
        query: str,
        style_prompt: str,
        sources: list[SearchSource],
        evidence_items: list[DiscoverEvidenceItem] | None = None,
    ) -> dict[str, object]:
        key_points: list[str] = []
        evidence_quotes: list[dict[str, object]] = []
        if evidence_items:
            for item in evidence_items[:8]:
                quote = item.quote.strip()
                evidence = item.evidence.strip()
                point = quote or evidence
                if point:
                    key_points.extend(self._extract_key_points(point, limit=1))
                evidence_quotes.append(
                    {
                        "source_id": item.source_id,
                        "title": item.title,
                        "quote": quote,
                        "evidence": evidence,
                        "relevance": item.relevance.strip(),
                    }
                )
        if not key_points:
            for item in sources[:6]:
                point = item.excerpt.strip() or item.snippet.strip()
                if point:
                    key_points.extend(self._extract_key_points(point, limit=2))
        return {
            "goal": "基于检索来源生成可引用、可落地的调研报告",
            "query": query.strip(),
            "style_prompt": style_prompt.strip(),
            "source_count": len(sources),
            "key_points": key_points[:10],
            "evidence_quotes": evidence_quotes[:8],
            "constraints": [
                "所有关键判断尽量标注来源编号",
                "只基于给定来源写作",
                "优先给出可执行建议与风险说明",
            ],
            "source_map": [
                {
                    "id": item.id,
                    "title": item.title,
                    "url": str(item.url),
                    "snippet": item.snippet,
                    "source_type": item.source_type,
                    "credibility_score": item.credibility_score,
                    "overall_score": item.overall_score,
                    "capture_mode": item.capture_mode,
                }
                for item in sources
            ],
        }

    def context_to_brief(self, context: dict[str, object]) -> str:
        lines: list[str] = []
        goal = str(context.get("goal") or "").strip()
        if goal:
            lines.append(f"目标：{goal}")
        title = str(context.get("title") or context.get("query") or "").strip()
        if title:
            lines.append(f"主题：{title}")
        summary = str(context.get("summary") or "").strip()
        if summary:
            lines.append(f"摘要：{summary}")

        key_points = context.get("key_points")
        if isinstance(key_points, list) and key_points:
            lines.append("关键信息：")
            for item in key_points[:8]:
                text = str(item).strip()
                if text:
                    lines.append(f"- {text}")

        constraints = context.get("constraints")
        if isinstance(constraints, list) and constraints:
            lines.append("约束：")
            for item in constraints[:6]:
                text = str(item).strip()
                if text:
                    lines.append(f"- {text}")
        evidence_quotes = context.get("evidence_quotes")
        if isinstance(evidence_quotes, list) and evidence_quotes:
            lines.append("证据摘录：")
            for item in evidence_quotes[:5]:
                if not isinstance(item, dict):
                    continue
                source_id = str(item.get("source_id") or "").strip()
                quote = str(item.get("quote") or "").strip()
                evidence = str(item.get("evidence") or "").strip()
                snippet = quote or evidence
                if not snippet:
                    continue
                prefix = f"[{source_id}] " if source_id else ""
                lines.append(f"- {prefix}{snippet[:180]}")
        return "\n".join(lines).strip()

    def render_source_markdown(self, source: SourceContent) -> str:
        lines = [f"# {source.title}", ""]
        if source.source_url:
            lines.extend([f"- 来源：{source.source_url}", ""])
        lines.extend(["## 摘要", source.raw_excerpt.strip(), "", "## 正文", source.full_text.strip(), ""])
        return "\n".join(lines)

    def render_sources_markdown(self, sources: list[SearchSource]) -> str:
        lines = ["# 检索来源", ""]
        for item in sources:
            lines.extend(
                [
                    f"## [{item.id}] {item.title}",
                    f"- URL: {item.url}",
                    f"- 类型: {item.source_type}",
                    f"- 可信度: {item.credibility_score:.2f}",
                    f"- 相关度: {item.relevance_score:.2f}",
                    f"- 综合分: {item.overall_score:.2f}",
                    f"- 内容模式: {'完整摘录' if item.capture_mode == 'full' else '搜索摘要'}",
                    f"- Snippet: {item.snippet or '无'}",
                    "",
                    item.excerpt or "无摘录",
                    "",
                ]
            )
        return "\n".join(lines)

    def render_discover_evidence_markdown(self, evidence_items: list[DiscoverEvidenceItem]) -> str:
        lines = ["# 证据包", ""]
        for item in evidence_items:
            lines.extend(
                [
                    f"## [{item.source_id}] {item.title}",
                    f"- URL: {item.url}",
                    f"- Quote: {item.quote or '无'}",
                    f"- Evidence: {item.evidence or '无'}",
                    f"- Relevance: {item.relevance or '无'}",
                    "",
                ]
            )
        return "\n".join(lines)

    def _extract_key_points(self, text: str, *, limit: int) -> list[str]:
        cleaned = re.sub(r"\s+", " ", (text or "").strip())
        if not cleaned:
            return []
        candidates = _SENTENCE_BREAK_PATTERN.split(cleaned)
        results: list[str] = []
        seen: set[str] = set()
        for raw in candidates:
            candidate = raw.strip(" -\n\t")
            if len(candidate) < 18:
                continue
            normalized = candidate.lower()
            if normalized in seen:
                continue
            seen.add(normalized)
            results.append(candidate[:220])
            if len(results) >= limit:
                break
        if results:
            return results

        paragraph_fallback = [segment.strip() for segment in text.splitlines() if len(segment.strip()) >= 18]
        return paragraph_fallback[:limit]

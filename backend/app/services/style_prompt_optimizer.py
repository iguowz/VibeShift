from __future__ import annotations

import json
import re

from app.core.errors import AppError
from app.core.schemas import (
    StyleCitationPolicy,
    StyleImageFocus,
    StyleLayoutFormat,
    StylePromptMemoryHint,
    StyleProfileSuggestion,
    StylePromptTarget,
    StyleTitlePolicy,
    StyleVisualMode,
)
from app.services.llm_service import LLMService


def _strip_code_fence(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


_TONE_KEYWORDS = [
    "克制",
    "直接",
    "理性",
    "严谨",
    "通俗",
    "专业",
    "有判断",
    "信息密度高",
    "简洁",
    "轻松",
    "有感染力",
    "适合朗读",
    "自然",
    "有立场",
    "务实",
]
_EMPHASIS_CANDIDATES = [
    ("关键事实", ["事实", "数据", "数字", "原理"]),
    ("行动建议", ["建议", "行动", "方案", "落地"]),
    ("风险提示", ["风险", "注意", "限制", "边界"]),
    ("证据来源", ["来源", "引用", "证据", "编号"]),
    ("结构拆解", ["拆解", "结构", "层次", "分节"]),
    ("对比判断", ["对比", "比较", "优缺点", "取舍"]),
]


def _extract_audience(prompt: str, target: StylePromptTarget) -> str:
    cleaned = prompt.strip()
    audience_patterns = [
        r"面向(?P<value>[^，。\n]{2,24})",
        r"给(?P<value>[^，。\n]{2,24})看",
        r"适合(?P<value>[^，。\n]{2,24})(?:阅读|查看|理解)",
    ]
    for pattern in audience_patterns:
        match = re.search(pattern, cleaned)
        if match:
            return match.group("value").strip("：:，,。 ")
    lowered = cleaned.lower()
    if "公众号" in cleaned:
        return "公众号读者"
    if "产品经理" in cleaned:
        return "产品经理"
    if "开发者" in cleaned or "工程师" in cleaned:
        return "开发者"
    if "中学生" in cleaned:
        return "中学生"
    return "研究决策者" if target is StylePromptTarget.DISCOVER else ""


def _extract_tone(prompt: str, target: StylePromptTarget) -> str:
    picked = [keyword for keyword in _TONE_KEYWORDS if keyword in prompt]
    if picked:
        return "、".join(picked[:4])
    return "严谨、判断明确、信息密度高" if target is StylePromptTarget.DISCOVER else "清晰、克制、信息密度高"


def _extract_structure(prompt: str, target: StylePromptTarget) -> str:
    cleaned = prompt.strip()
    if any(keyword in cleaned for keyword in ["纪实", "非虚构", "口述", "现场", "实录", "时间线"]):
        return "现场切入 -> 事实脉络 -> 人物/背景 -> 余波与判断"
    if any(keyword in cleaned for keyword in ["书信", "公开信", "来信", "写给", "致读者", "信件"]):
        return "称呼与缘起 -> 主体展开 -> 重点叮嘱 -> 收束致意"
    if any(keyword in cleaned for keyword in ["播客", "口播", "节目稿", "主持稿", "串词", "朗读"]):
        return "开场引题 -> 主线展开 -> 转折补充 -> 收束与提问"
    if any(keyword in cleaned for keyword in ["辩论", "正方", "反方", "立论", "驳论", "攻防"]):
        return "主张 -> 论点一二三 -> 反方回应 -> 结论收束"
    if any(keyword in cleaned for keyword in ["演讲", "发言", "致辞", "答辩", "开场白"]):
        return "开场定调 -> 2~4 个核心论点 -> 例证/转折 -> 收束号召"
    if any(keyword in cleaned for keyword in ["访谈", "问答", "采访", "对谈", "Q&A", "qa"]):
        return "引题 -> 问题 -> 回答 -> 追问 -> 小结"
    if any(keyword in cleaned for keyword in ["教程", "指南", "手册", "步骤", "排错", "配置", "部署"]):
        return "目标 -> 前置条件 -> 步骤 -> 排错 -> 总结"
    if any(keyword in cleaned for keyword in ["评论", "社论", "时评", "立场", "观点"]):
        return "观点 -> 事实依据 -> 分析推进 -> 结论与建议"
    if any(keyword in cleaned for keyword in ["简报", "高管", "决策", "周报", "月报", "一页纸", "memo", "brief"]):
        return "一句话结论 -> 关键数据 -> 核心判断 -> 风险与建议"
    if "TL;DR" in cleaned or "tl;dr" in cleaned.lower():
        if "步骤" in cleaned or "落地" in cleaned:
            return "TL;DR -> 分节拆解 -> 落地步骤 -> 风险提示"
        return "TL;DR -> 分节拆解 -> 总结"
    if "问答" in cleaned:
        return "问题 -> 回答 -> 证据 -> 建议"
    if "对比" in cleaned or "优缺点" in cleaned:
        return "背景 -> 对比维度 -> 结论 -> 适用边界"
    if "步骤" in cleaned or "清单" in cleaned:
        return "背景 -> 步骤清单 -> 注意事项"
    return "结论 / TL;DR -> 要点拆解 -> 推荐方案 -> 风险与注意事项" if target is StylePromptTarget.DISCOVER else "TL;DR -> 分节解析 -> 结尾建议"


def _extract_emphasis_points(prompt: str, target: StylePromptTarget) -> list[str]:
    picked: list[str] = []
    for label, keywords in _EMPHASIS_CANDIDATES:
        if any(keyword in prompt for keyword in keywords):
            picked.append(label)
    if target is StylePromptTarget.DISCOVER and "证据来源" not in picked:
        picked.append("证据来源")
    if not picked:
        picked = ["关键事实", "结构拆解", "行动建议"] if target is StylePromptTarget.REWRITE else ["关键事实", "证据来源", "行动建议"]
    return picked[:4]


def _infer_citation_policy(prompt: str, target: StylePromptTarget) -> StyleCitationPolicy:
    cleaned = prompt.lower()
    if any(keyword in prompt for keyword in ["严格引用", "标注来源", "注明来源", "带编号"]):
        return StyleCitationPolicy.STRICT
    if any(keyword in prompt for keyword in ["不引用", "不要引用", "不主动引用"]):
        return StyleCitationPolicy.NONE
    if any(keyword in prompt for keyword in ["关键处引用", "必要时引用", "少量引用"]):
        return StyleCitationPolicy.MINIMAL
    return StyleCitationPolicy.MINIMAL if target is StylePromptTarget.DISCOVER else StyleCitationPolicy.AUTO


def _infer_title_policy(prompt: str) -> StyleTitlePolicy:
    if any(keyword in prompt for keyword in ["张力", "抓人", "更有传播性", "吸引点击"]):
        return StyleTitlePolicy.PUNCHY
    if any(keyword in prompt for keyword in ["重写标题", "改标题", "重新拟题"]):
        return StyleTitlePolicy.REWRITE
    return StyleTitlePolicy.RETAIN


def _infer_image_focus(prompt: str) -> StyleImageFocus:
    if any(keyword in prompt for keyword in ["图解", "结构图", "概念图", "流程图"]):
        return StyleImageFocus.DIAGRAM
    if any(keyword in prompt for keyword in ["故事感", "叙事", "场景感", "人物感"]):
        return StyleImageFocus.NARRATIVE
    if any(keyword in prompt.lower() for keyword in ["editorial", "杂志", "封面", "海报"]):
        return StyleImageFocus.EDITORIAL
    return StyleImageFocus.AUTO


def _infer_layout_format(prompt: str) -> StyleLayoutFormat:
    lowered = prompt.lower()
    if any(keyword in prompt for keyword in ["报纸", "专栏", "新闻稿", "头版"]):
        return StyleLayoutFormat.NEWSPAPER
    if any(keyword in prompt for keyword in ["海报", "长图", "poster", "封面式"]):
        return StyleLayoutFormat.POSTER
    if any(keyword in prompt for keyword in ["书籍", "章节", "chapter", "书稿"]):
        return StyleLayoutFormat.BOOK
    if any(keyword in prompt for keyword in ["古文", "古籍", "书卷", "线装", "章回", "文言"]):
        return StyleLayoutFormat.CLASSICAL
    if any(keyword in prompt for keyword in ["ppt", "演示稿", "幻灯片", "汇报页", "slides"]) or "slide" in lowered:
        return StyleLayoutFormat.PPT
    if any(keyword in prompt for keyword in ["论文", "研究报告", "摘要", "abstract", "method", "结论与讨论"]) or "paper" in lowered:
        return StyleLayoutFormat.PAPER
    if any(keyword in prompt for keyword in ["诗歌", "诗意", "短诗", "组诗", "抒情诗"]) or "poem" in lowered:
        return StyleLayoutFormat.POETRY
    if "newspaper" in lowered:
        return StyleLayoutFormat.NEWSPAPER
    return StyleLayoutFormat.AUTO


def _infer_visual_mode(prompt: str) -> StyleVisualMode:
    lowered = prompt.lower()
    if any(keyword in prompt for keyword in ["纯正文", "不要图表", "不需要图表", "不要流程图"]):
        return StyleVisualMode.NONE
    if any(keyword in prompt for keyword in ["图表", "统计图", "流程图", "关系图", "可视化", "统计卡", "流程卡"]) or "chart" in lowered:
        return StyleVisualMode.ENHANCED
    if any(keyword in prompt for keyword in ["必要时图解", "少量图解", "适当图示"]):
        return StyleVisualMode.MINIMAL
    return StyleVisualMode.AUTO


def _build_profile_suggestion(prompt: str, target: StylePromptTarget) -> StyleProfileSuggestion:
    return StyleProfileSuggestion(
        audience=_extract_audience(prompt, target),
        tone=_extract_tone(prompt, target),
        structure_template=_extract_structure(prompt, target),
        emphasis_points=_extract_emphasis_points(prompt, target),
        citation_policy=_infer_citation_policy(prompt, target),
        title_policy=_infer_title_policy(prompt),
        image_focus=_infer_image_focus(prompt),
        layout_format=_infer_layout_format(prompt),
        visual_mode=_infer_visual_mode(prompt),
    )


def _normalize_profile_suggestion(payload: object, prompt: str, target: StylePromptTarget) -> StyleProfileSuggestion:
    fallback = _build_profile_suggestion(prompt, target)
    if not isinstance(payload, dict):
        return fallback
    cleaned_points = payload.get("emphasis_points")
    emphasis_points = (
        [str(item).strip() for item in cleaned_points if str(item).strip()][:6]
        if isinstance(cleaned_points, list)
        else fallback.emphasis_points
    )
    citation_policy = payload.get("citation_policy")
    title_policy = payload.get("title_policy")
    image_focus = payload.get("image_focus")
    layout_format = payload.get("layout_format")
    visual_mode = payload.get("visual_mode")
    return StyleProfileSuggestion(
        audience=str(payload.get("audience") or "").strip() or fallback.audience,
        tone=str(payload.get("tone") or "").strip() or fallback.tone,
        structure_template=str(payload.get("structure_template") or "").strip() or fallback.structure_template,
        emphasis_points=emphasis_points,
        citation_policy=(
            citation_policy
            if citation_policy in {policy.value for policy in StyleCitationPolicy}
            else fallback.citation_policy
        ),
        title_policy=(
            title_policy
            if title_policy in {policy.value for policy in StyleTitlePolicy}
            else fallback.title_policy
        ),
        image_focus=(
            image_focus
            if image_focus in {policy.value for policy in StyleImageFocus}
            else fallback.image_focus
        ),
        layout_format=(
            layout_format
            if layout_format in {policy.value for policy in StyleLayoutFormat}
            else fallback.layout_format
        ),
        visual_mode=(
            visual_mode
            if visual_mode in {policy.value for policy in StyleVisualMode}
            else fallback.visual_mode
        ),
    )


def _fallback_optimize(prompt: str, target: StylePromptTarget) -> tuple[str, list[str], StyleProfileSuggestion]:
    base = prompt.strip()
    if target is StylePromptTarget.DISCOVER:
        optimized = (
            "请以中文输出一份严谨、可落地的调研报告。\n"
            "必须遵守固定结构：\n"
            "1) 结论 / TL;DR（3~6 条）\n"
            "2) 要点（覆盖关键维度）\n"
            "3) 推荐方案（最优 + 备选，偏向开源落地）\n"
            "4) 落地步骤（步骤清单）\n"
            "5) 风险与注意事项\n"
            "6) 参考链接（带编号）\n"
            "写作要求：信息密度高、少空话；关键结论尽量标注来源编号；不确定要明确说明信息不足。\n\n"
            f"在以上要求基础上，额外风格要求：{base}"
        )
        return optimized, ["已补齐探索发现的固定结构与严谨性约束。"], _build_profile_suggestion(optimized, target)

    optimized = (
        "请把原文改写为中文成稿，风格稳定且信息密度高。\n"
        "硬性要求：不编造原文没有的信息；保留关键事实、数字、人名、因果与结论；不确定就标注“原文未说明”。\n"
        "输出要求：Markdown 排版；先给 TL;DR（3~6 条），再分节展开；尽量使用小标题与列表；避免口水与重复。\n\n"
        f"在以上硬性要求基础上，额外风格要求：{base}"
    )
    return optimized, ["已补齐改写稳定性、结构与事实约束。"], _build_profile_suggestion(optimized, target)


def _render_profile_suggestion(profile: StyleProfileSuggestion | None) -> str:
    if profile is None:
        return "无"
    lines = [
        f"- audience: {profile.audience or '无'}",
        f"- tone: {profile.tone or '无'}",
        f"- structure_template: {profile.structure_template or '无'}",
        f"- emphasis_points: {'；'.join(profile.emphasis_points) or '无'}",
        f"- citation_policy: {profile.citation_policy.value}",
        f"- title_policy: {profile.title_policy.value}",
        f"- image_focus: {profile.image_focus.value}",
        f"- layout_format: {profile.layout_format.value}",
        f"- visual_mode: {profile.visual_mode.value}",
    ]
    return "\n".join(lines)


def _render_memory_hints(memory_hints: list[StylePromptMemoryHint]) -> str:
    if not memory_hints:
        return "无"
    blocks: list[str] = []
    for index, item in enumerate(memory_hints[:3], start=1):
        blocks.append(
            "\n".join(
                [
                    f"记忆 {index}：",
                    f"- source_style_name: {item.source_style_name or '无'}",
                    f"- prompt_excerpt: {item.prompt_excerpt or '无'}",
                    f"- optimized_prompt: {item.optimized_prompt or '无'}",
                    f"- usage_count: {item.usage_count}",
                    f"- accepted_at: {item.accepted_at.isoformat() if item.accepted_at else '无'}",
                    _render_profile_suggestion(item.profile_suggestion),
                ]
            )
        )
    return "\n\n".join(blocks)


class StylePromptOptimizerService:
    def __init__(self) -> None:
        self.llm_service = LLMService()

    async def optimize(
        self,
        prompt: str,
        target: StylePromptTarget,
        llm_config,
        current_profile: StyleProfileSuggestion | None = None,
        memory_hints: list[StylePromptMemoryHint] | None = None,
    ) -> tuple[str, list[str], StyleProfileSuggestion]:
        raw_prompt = prompt.strip()
        if not raw_prompt:
            raise AppError(
                code="empty_prompt",
                message="提示词不能为空。",
                suggestion="请先输入风格指令后再优化。",
                status_code=422,
            )

        messages = [
            {
                "role": "system",
                "content": (
                    "你是资深提示词工程师。你的目标是把用户的风格要求改写为更稳定、可复用的提示词模板。"
                    "请输出 JSON：{ \"optimized_prompt\": \"...\", \"notes\": [\"...\"], \"profile_suggestion\": { ... } }。"
                    "optimized_prompt 必须可直接用于后续生成，不要输出无关解释。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"目标场景：{target.value}\n\n"
                    "用户原始风格要求如下：\n"
                    f"{raw_prompt}\n\n"
                    "请优化：\n"
                    "- 更风格稳定（避免漂移）\n"
                    "- 兼顾主题与细节（信息密度高，但不堆砌）\n"
                    "- 明确输出结构、格式与硬性约束（事实准确、少空话）\n"
                    "- 若用户要求演讲稿、访谈问答、教程手册、商业简报、评论社论等风格，要把结构和语气约束明确写进 optimized_prompt\n"
                    "- 如用户需要报纸、海报、书籍、古文书卷、PPT、论文、诗歌等版式，需提炼到 layout_format\n"
                    "- 如用户需要统计图、图表、流程图、信息图等内容辅助，需提炼到 visual_mode\n"
                    "- 避免过长（建议 120~220 字）\n"
                    "- 同时抽取结构化风格建议 profile_suggestion，字段包括："
                    "audience, tone, structure_template, emphasis_points, citation_policy, title_policy, image_focus, layout_format, visual_mode\n"
                    "- citation_policy 只能是 auto/strict/minimal/none\n"
                    "- title_policy 只能是 retain/rewrite/punchy\n"
                    "- image_focus 只能是 auto/narrative/diagram/editorial\n"
                    "- layout_format 只能是 auto/newspaper/poster/book/classical/ppt/paper/poetry\n"
                    "- visual_mode 只能是 auto/enhanced/minimal/none\n"
                    "当前已存在的结构化风格：\n"
                    f"{_render_profile_suggestion(current_profile)}\n\n"
                    "以下是本地已接受的历史风格记忆，可在一致时复用，不一致时以本次用户要求为准：\n"
                    f"{_render_memory_hints(memory_hints or [])}\n"
                ),
            },
        ]

        try:
            raw = await self.llm_service.rewrite(messages, llm_config)
        except Exception:
            return _fallback_optimize(raw_prompt, target)

        cleaned = _strip_code_fence(raw)
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and isinstance(parsed.get("optimized_prompt"), str):
                optimized = parsed["optimized_prompt"].strip()
                notes = parsed.get("notes")
                if not optimized:
                    return _fallback_optimize(raw_prompt, target)
                if isinstance(notes, list):
                    note_list = [str(item).strip() for item in notes if str(item).strip()]
                else:
                    note_list = []
                profile_suggestion = _normalize_profile_suggestion(
                    parsed.get("profile_suggestion"),
                    optimized or raw_prompt,
                    target,
                )
                return optimized, note_list[:8], profile_suggestion
        except Exception:
            pass

        # fallback: treat full text as prompt
        optimized_text = cleaned.strip()
        if not optimized_text:
            return _fallback_optimize(raw_prompt, target)
        return (
            optimized_text,
            ["优化输出未返回 JSON，已按纯文本提示词使用。"],
            _build_profile_suggestion(optimized_text, target),
        )

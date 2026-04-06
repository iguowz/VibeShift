import json
import re

from app.core.schemas import (
    DiscoverBrief,
    DiscoverEvidenceItem,
    ImageConfig,
    SearchSource,
    SourceContent,
    StyleImageFocus,
    StyleLayoutFormat,
    StyleProfile,
    StyleVisualMode,
)


STYLE_VARIABLE_PATTERN = re.compile(r"\{([a-zA-Z0-9_]+)\}")

PRETEXT_GUIDE = (
    "如确有必要，可在 Markdown 中插入 pretext 可视化代码块。\n"
    "允许的代码块只有三种：\n"
    "1) ```pretext stats 后接 JSON：{\"items\":[{\"label\":\"指标\",\"value\":\"12\",\"note\":\"说明\"}]}\n"
    "2) ```pretext chart 后接 JSON：{\"title\":\"标题\",\"unit\":\"分\",\"items\":[{\"label\":\"官方资料\",\"value\":9.5,\"note\":\"高可信\"}]}\n"
    "3) ```pretext flow 后接 JSON：{\"title\":\"流程\",\"steps\":[{\"title\":\"步骤一\",\"detail\":\"说明\"},{\"title\":\"步骤二\",\"detail\":\"说明\"}]}\n"
    "只有在正文里存在明确数字、比较关系、步骤链路时才使用；不要为了炫技强行加入。"
)


def render_style_prompt(style_prompt: str, source: SourceContent) -> str:
    variables: dict[str, str] = {
        "title": source.title,
        "summary": source.raw_excerpt,
        "raw_excerpt": source.raw_excerpt,
        "source_url": source.source_url or "",
        "url": source.source_url or "",
    }

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        return variables.get(key, match.group(0))

    return STYLE_VARIABLE_PATTERN.sub(replace, style_prompt)


def compose_style_instruction(style_prompt: str, style_profile: StyleProfile | None = None) -> str:
    base_prompt = (style_prompt or "").strip()
    if style_profile is None:
        return base_prompt

    lines = [base_prompt, "", f"风格技能：{style_profile.name}"]
    if style_profile.audience.strip():
        lines.append(f"- 目标受众：{style_profile.audience.strip()}")
    if style_profile.tone.strip():
        lines.append(f"- 语气与表达：{style_profile.tone.strip()}")
    if style_profile.structure_template.strip():
        lines.append(f"- 推荐结构：{style_profile.structure_template.strip()}")
    if style_profile.emphasis_points:
        emphasis = "；".join(item.strip() for item in style_profile.emphasis_points if item.strip())
        if emphasis:
            lines.append(f"- 输出重点：{emphasis}")

    title_policy_map = {
        "retain": "标题尽量保留原始信息结构，不要过度营销化。",
        "rewrite": "允许重写标题，但必须更清晰准确。",
        "punchy": "标题可更有张力，但不能牺牲事实准确性。",
    }
    citation_policy_map = {
        "auto": "有来源编号时，关键结论尽量标注引用。",
        "strict": "关键判断、建议和结论都应尽量标注来源编号。",
        "minimal": "仅在核心结论或存在争议的信息处标注来源。",
        "none": "不主动输出引用编号，除非用户提示词明确要求。",
    }
    image_focus_map = {
        "auto": "配图风格按正文主题自动决策。",
        "narrative": "若生成配图，优先做叙事感强、场景明确的插画。",
        "diagram": "若生成配图，优先做概念图/结构图，强调信息表达。",
        "editorial": "若生成配图，优先做 editorial / 杂志插画风格。",
    }
    layout_format_map = {
        "auto": "版式按内容自动决定。",
        "newspaper": "整体排版采用报纸特稿/新闻专栏感，导语要先交代核心事实，小标题短促，段落紧凑，避免口语化拖沓。",
        "poster": "整体排版采用海报/长图式阅读感，标题更醒目，信息块要短、强、可扫读，优先一句话结论和重点数字。",
        "book": "整体排版采用书籍章节感，段落与节间过渡更从容，适合长阅读，可加入节中摘要与小结。",
        "classical": "整体排版采用古文书卷感，题解、纲目、按语更重要，语言可雅致但仍要可读，不要强行套现代报告式 TL;DR。",
        "ppt": "整体排版采用 PPT / 演示稿感，一屏一重点，短句、小标题、结论卡和行动项更明确，避免连续大段正文。",
        "paper": "整体排版采用论文/研究报告感，优先摘要、问题、分析、讨论、结论等分节，关键判断要交代证据边界。",
        "poetry": "整体排版采用诗歌/抒情短章感，行文更注重分行、节奏、停顿与留白，不要强塞密集 bullet 或报告腔。",
    }
    visual_mode_map = {
        "auto": "可视化按内容需要自动决定。",
        "enhanced": f"优先考虑用统计卡、图表、流程图辅助表达。{PRETEXT_GUIDE}",
        "minimal": "仅在确有必要时加入少量统计卡或流程图辅助表达。",
        "none": "不要主动加入图表、统计卡或流程图，保持纯正文。",
    }

    lines.append(f"- 标题策略：{title_policy_map[style_profile.title_policy.value]}")
    lines.append(f"- 引用策略：{citation_policy_map[style_profile.citation_policy.value]}")
    lines.append(f"- 配图策略：{image_focus_map[style_profile.image_focus.value]}")
    lines.append(f"- 版式策略：{layout_format_map[style_profile.layout_format.value]}")
    lines.append(f"- 可视化策略：{visual_mode_map[style_profile.visual_mode.value]}")
    fingerprint = " ".join(
        [
            style_profile.name or "",
            style_profile.tone or "",
            style_profile.structure_template or "",
            " ".join(style_profile.emphasis_points or []),
        ]
    ).lower()
    if style_profile.layout_format is StyleLayoutFormat.POETRY:
        lines.append("- 风格守则：优先保持诗歌节奏、分行与意象推进，不要先写 TL;DR 再写正文。")
    elif style_profile.layout_format is StyleLayoutFormat.CLASSICAL:
        lines.append("- 风格守则：优先保持题解、纲目、按语和书卷感，不要被通用摘要式写法压平。")
    elif style_profile.layout_format is StyleLayoutFormat.PPT:
        lines.append("- 风格守则：每一屏或每一节只承载一个重点，长段说明应主动拆成短句和要点。")
    elif style_profile.layout_format is StyleLayoutFormat.PAPER:
        lines.append("- 风格守则：优先采用摘要/背景/分析/讨论/结论结构，关键判断应说明依据与边界。")
    if any(keyword in fingerprint for keyword in ["纪实", "非虚构", "现场", "口述", "时间线"]):
        lines.append("- 纪实守则：优先交代时间线、事实脉络和现场细节；不要虚构情节，也不要过度煽情。")
    if any(keyword in fingerprint for keyword in ["书信", "来信", "写给", "致读者", "尺牍"]):
        lines.append("- 书信守则：保持称呼、缘起、展开和收束的对象感，不要写成普通说明文或报告。")
    if any(keyword in fingerprint for keyword in ["播客", "口播", "主持", "节目", "串词"]):
        lines.append("- 口播守则：句子需要顺口、可直接朗读，适当保留停顿、转场和陪伴感。")
    if any(keyword in fingerprint for keyword in ["辩论", "正方", "反方", "攻防", "驳论", "交锋"]):
        lines.append("- 辩论守则：先亮明主张，再推进论点攻防和反方回应，最后回到立场与结论。")
    if any(keyword in fingerprint for keyword in ["访谈", "问答", "采访", "对谈", "q&a", "qa"]):
        lines.append("- 问答守则：尽量保持提问、回答、追问的结构，不要全部改写成第三人称报告。")
    if style_profile.function_skills:
        lines.append("- 功能技能：")
        for skill in style_profile.function_skills[:8]:
            instruction = (skill.instruction or "").strip()
            if not instruction:
                continue
            lines.append(f"  - [{skill.label}] {instruction}")
    return "\n".join(line for line in lines if line is not None).strip()


def _render_discover_sources_block(sources: list[SearchSource], excerpt_limit: int = 420) -> str:
    ranked_sources = sorted(
        sources,
        key=lambda item: (item.overall_score, item.credibility_score, item.relevance_score),
        reverse=True,
    )
    rendered: list[str] = []
    for item in ranked_sources[:6]:
        excerpt = (item.excerpt or item.snippet or "").strip()
        if len(excerpt) > excerpt_limit:
            excerpt = excerpt[:excerpt_limit].rstrip() + "…"
        rendered.append(
            "\n".join(
                [
                    f"[{item.id}] {item.title}",
                    f"URL: {item.url}",
                    f"SourceType: {item.source_type or 'article'}",
                    f"Credibility: {item.credibility_score:.2f}",
                    f"Relevance: {item.relevance_score:.2f}",
                    f"CaptureMode: {item.capture_mode or 'full'}",
                    f"Snippet: {item.snippet or '无'}",
                    f"Excerpt: {excerpt or '无'}",
                ]
            )
        )
    return "\n\n".join(rendered)


def _render_discover_source_refs_block(sources: list[SearchSource]) -> str:
    ranked_sources = sorted(
        sources,
        key=lambda item: (item.overall_score, item.credibility_score, item.relevance_score),
        reverse=True,
    )
    return "\n".join(
        f"[{item.id}] {item.title} - {item.url} - type={item.source_type or 'article'} - credibility={item.credibility_score:.2f}"
        for item in ranked_sources[:8]
    )


def _render_discover_evidence_block(
    evidence_items: list[DiscoverEvidenceItem],
    *,
    quote_limit: int = 140,
    evidence_limit: int = 180,
) -> str:
    rendered: list[str] = []
    for item in evidence_items[:8]:
        quote = (item.quote or "").strip()
        evidence = (item.evidence or "").strip()
        relevance = (item.relevance or "").strip()
        if len(quote) > quote_limit:
            quote = quote[:quote_limit].rstrip() + "…"
        if len(evidence) > evidence_limit:
            evidence = evidence[:evidence_limit].rstrip() + "…"
        rendered.append(
            "\n".join(
                [
                    f"[{item.source_id}] {item.title}",
                    f"URL: {item.url}",
                    f"Quote: {quote or '无'}",
                    f"Evidence: {evidence or '无'}",
                    f"Relevance: {relevance or '无'}",
                ]
            )
        )
    return "\n\n".join(rendered)


def build_discover_evidence_messages(
    query: str,
    sources: list[SearchSource],
    context_brief: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    schema = {
        "evidence": [
            {
                "source_id": 1,
                "title": "来源标题",
                "url": "https://example.com",
                "quote": "来源摘录中的关键原句或短句",
                "evidence": "该摘录能支撑的具体判断",
                "relevance": "为什么这条证据重要",
            }
        ]
    }
    return [
        {
            "role": "system",
            "content": (
                "你是一名严谨的中文研究助理。"
                "你的任务是先抽取可复用的证据项，再交给后续写作阶段使用。"
                "你必须只根据给定来源中的 excerpt/snippet 提炼证据，不得引入来源外事实。"
                "应优先使用可信度高、相关性高、且 capture_mode 为 full 的来源；"
                "如果来源只有 snippet，提炼时必须更保守，不要把摘要误写成确定事实。"
                "输出只能是一个 JSON 对象，不要输出 Markdown、解释或代码块。"
                "evidence 至少给 2 条，最多 8 条；source_id 必须来自给定来源编号；"
                "quote 应尽量使用来源中的原句或紧贴原文的短摘录。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                "请先抽取可复用的证据项。输出 JSON 必须符合这个结构：\n"
                f"{json.dumps(schema, ensure_ascii=False, indent=2)}\n\n"
                "可用来源如下：\n\n"
                f"{_render_discover_sources_block(sources, excerpt_limit=280)}"
            ),
        },
    ]


def build_discover_brief_messages(
    query: str,
    style_prompt: str,
    evidence_items: list[DiscoverEvidenceItem],
    sources: list[SearchSource],
    context_brief: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    schema = {
        "summary": "一句话概括本轮调研发现",
        "conclusion": "面向用户问题的直接回答",
        "key_findings": ["发现 1", "发现 2"],
        "evidence": [
            {
                "source_id": 1,
                "title": "来源标题",
                "url": "https://example.com",
                "quote": "来源摘录中的关键原句或短句",
                "evidence": "能直接支撑判断的事实",
                "relevance": "这条证据为什么重要",
            }
        ],
        "uncertainties": ["仍需进一步确认的问题"],
        "draft_outline": ["适合继续转写的段落结构"],
    }
    return [
        {
            "role": "system",
            "content": (
                "你是一名严谨的中文研究分析师。"
                "你必须只根据给定来源提炼证据，不得补充来源外事实。"
                "应优先信任 official / paper / book / wiki 等高可信来源；"
                "来自 qa / social 且 capture_mode=snippet 的信息只能作为补充线索，不应单独支撑强结论。"
                "你的输出只能是一个 JSON 对象，不要输出 Markdown、解释或代码块。"
                "evidence 至少给 2 条，最多 5 条；source_id 必须来自给定来源编号。"
                "uncertainties 只保留真正无法从来源确认的问题。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                "请先做证据优先的研究简报。输出 JSON 必须符合这个结构：\n"
                f"{json.dumps(schema, ensure_ascii=False, indent=2)}\n\n"
                "已抽取的证据包如下：\n\n"
                f"{_render_discover_evidence_block(evidence_items)}\n\n"
                "可用来源编号如下：\n"
                f"{_render_discover_source_refs_block(sources)}"
            ),
        },
    ]


def build_discover_draft_messages(
    query: str,
    style_prompt: str,
    evidence_items: list[DiscoverEvidenceItem],
    sources: list[SearchSource],
    research_brief: DiscoverBrief,
    context_brief: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    brief_json = json.dumps(research_brief.model_dump(mode="json"), ensure_ascii=False, indent=2)
    return [
        {
            "role": "system",
            "content": (
                "你是一名中文研究编辑，负责把证据简报整理成可继续润色的调研草稿。"
                "你必须只使用给定来源与研究简报中的事实。"
                "输出必须是 Markdown，并保留引用编号 [1] 这样的标注。"
                "草稿要强调结构与证据，不要写成营销文案。"
                "如果某条判断主要来自低可信或仅摘要来源，必须显式写出保留态度。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                "请把下面的研究简报整理成一份可转写草稿，固定使用这个结构：\n"
                "1) 调研目标\n"
                "2) 初步结论\n"
                "3) 关键证据\n"
                "4) 可执行方案\n"
                "5) 风险与待确认点\n\n"
                f"研究简报：\n{brief_json}\n\n"
                "证据包如下：\n\n"
                f"{_render_discover_evidence_block(evidence_items, quote_limit=120, evidence_limit=150)}\n\n"
                "来源编号如下：\n"
                f"{_render_discover_source_refs_block(sources)}"
            ),
        },
    ]


def build_discover_report_messages(
    query: str,
    style_prompt: str,
    evidence_items: list[DiscoverEvidenceItem],
    sources: list[SearchSource],
    research_brief: DiscoverBrief,
    draft_markdown: str,
    context_brief: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    brief_json = json.dumps(research_brief.model_dump(mode="json"), ensure_ascii=False, indent=2)
    return [
        {
            "role": "system",
            "content": (
                "你是一名严谨的中文调研写作助手。"
                "你必须仅基于给定来源、研究简报和草稿写作，不要编造来源中不存在的信息。"
                "所有关键结论、判断和建议尽量在句末标注引用编号，例如 [1]。"
                "输出必须是 Markdown，排版清晰，避免重复和空话。"
                "如果存在未确认信息，要明确写出不确定点。"
                "优先引用高可信度来源；对于社区问答/社区笔记或仅搜索摘要来源，不要把其写成唯一依据。"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                "请把研究简报和调研草稿整合成一份可直接使用的正式调研报告。固定结构如下：\n"
                "1) 结论 / TL;DR（3~6 条）\n"
                "2) 要点（覆盖关键维度）\n"
                "3) 推荐方案（最优方案 + 备选 + 适用场景）\n"
                "4) 落地步骤（按步骤列出）\n"
                "5) 风险与注意事项\n"
                "6) 待确认问题（没有则写“暂无”）\n"
                "7) 参考链接（逐条列出 [编号] 标题 - URL）\n\n"
                f"研究简报：\n{brief_json}\n\n"
                f"调研草稿：\n{draft_markdown}\n\n"
                "证据包如下（仅可使用这些信息）：\n\n"
                f"{_render_discover_evidence_block(evidence_items, quote_limit=100, evidence_limit=140)}\n\n"
                "来源编号如下：\n"
                f"{_render_discover_source_refs_block(sources)}"
            ),
        },
    ]


def build_rewrite_messages(
    source: SourceContent,
    style_prompt: str,
    context_brief: str = "",
    outline_text: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一个专业内容改写助手，负责把原文改写为高质量中文成稿。"
                "硬性要求：只基于原文写作；不捏造原文没有的信息；"
                "保留关键事实（数字、人名、时间、地点、因果、结论）。"
                "如果原文信息不足，请明确标注“原文未说明/未给出”。"
                "风格要求（用户指令）在不违反事实约束的前提下具有最高优先级，必须严格执行。"
                "输出必须是 Markdown，排版清晰，信息密度高，少空话、少重复。"
                "推荐结构：先给 TL;DR（3~6 条要点），再按小标题分节展开，必要时使用列表。"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                "请在不丢失关键信息的前提下完成改写或提炼，并尽量保持结构化表达。\n\n"
                f"原文内容：\n{source.full_text}"
            ),
        },
    ]


def build_chunk_rewrite_messages(
    source: SourceContent,
    style_prompt: str,
    chunk_content: str,
    chunk_index: int,
    total_chunks: int,
    context_brief: str = "",
    outline_text: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一个专业内容改写助手。"
                "你将收到一篇长文中的一个分块，请只改写该分块。"
                "硬性要求：不编造；保留关键事实；风格要求在不违反事实的前提下必须执行。"
                "保持风格一致与信息密度，避免重复解释明显背景。"
                "输出必须是 Markdown（可含小标题/列表），不要输出与该分块无关的内容。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                f"当前是第 {chunk_index}/{total_chunks} 个分块。\n"
                "请输出该分块的改写结果，保留层次、信息密度与关键细节。\n\n"
                f"原文分块：\n{chunk_content}"
            ),
        },
    ]


def build_merge_messages(
    source: SourceContent,
    style_prompt: str,
    chunk_results: list[str],
    context_brief: str = "",
    outline_text: str = "",
    verify_final: bool = False,
) -> list[dict[str, str]]:
    joined_chunks = "\n\n".join(
        f"### 分块 {index}\n{content}" for index, content in enumerate(chunk_results, start=1)
    )
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    verify_system = (
        "合并后请顺带完成一次终稿校验：补齐明显遗漏的关键事实，修正结构跳跃，并尽量消除重复。"
        if verify_final
        else ""
    )
    verify_user = (
        "以下是长文分块改写结果，请直接合并并校验为一篇结构清晰、自然流畅、事实完整的最终版本：\n\n"
        if verify_final
        else "以下是长文分块改写结果，请合并为一篇结构清晰、自然流畅的最终版本：\n\n"
    )
    return [
        {
            "role": "system",
            "content": (
                "你是一个专业编辑，负责把多个已改写分块整合成一篇完整成稿。"
                "硬性要求：不引入分块中没有的新事实；去掉重复表达；补足段落衔接；保持统一风格与信息密度。"
                "风格要求（用户指令）在不违反事实约束的前提下具有最高优先级。"
                f"{verify_system}"
                "输出必须是 Markdown，排版清晰。推荐结构：TL;DR（3~6 条）+ 分节正文 + 一句总结（可选）。"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                f"{verify_user}"
                f"{joined_chunks}"
            ),
        },
    ]


def build_rewrite_outline_messages(
    source: SourceContent,
    style_prompt: str,
    context_brief: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一名中文内容策划编辑。"
                "你的任务不是直接写正文，而是先规划一篇长文改写稿的结构。"
                "你必须只基于给定原文信息，不得添加来源外事实。"
                "输出必须是 Markdown，包含：推荐标题、TL;DR 要点、分节结构、必须保留的关键事实。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                "请先规划整篇文章的结构，要求：\n"
                "1) 给出一个推荐标题\n"
                "2) 给出 3~6 条 TL;DR 要点\n"
                "3) 给出 3~6 个正文分节及每节目标\n"
                "4) 列出必须保留的关键事实（数字、人名、时间、结论）\n\n"
                f"原文内容：\n{source.full_text[:6000]}"
            ),
        },
    ]


def build_rewrite_verify_messages(
    source: SourceContent,
    style_prompt: str,
    draft_text: str,
    context_brief: str = "",
    outline_text: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一名中文总编，负责在不引入新事实的前提下校验并修正长文改写稿。"
                "你必须检查：关键事实是否遗漏、结构是否贴合规划、是否有明显重复或跳跃。"
                "如果草稿已经足够好，也要输出整理后的最终 Markdown，不要只回答“通过”。"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                "请检查下面这篇改写稿，必要时直接修正为最终版本。要求：\n"
                "- 不新增原文没有的事实\n"
                "- 尽量补回遗漏的关键事实\n"
                "- 保持结构完整、语言流畅、减少重复\n\n"
                f"当前改写稿：\n{draft_text}"
            ),
        },
    ]


def build_image_prompts(
    source: SourceContent,
    transformed_text: str,
    image_config: ImageConfig,
    style_profile: StyleProfile | None = None,
) -> list[str]:
    forced_style = image_config.custom_prompt.strip() or ""
    style_preset = image_config.style_preset.strip() or ""
    style = forced_style or style_preset or "高质量 editorial illustration"
    count = image_config.count

    image_focus_style = {
        StyleImageFocus.NARRATIVE: "电影感叙事插画",
        StyleImageFocus.DIAGRAM: "概念图",
        StyleImageFocus.EDITORIAL: "高质量 editorial illustration",
    }
    if style_profile is not None and style_profile.image_focus in image_focus_style and not forced_style:
        style = image_focus_style[style_profile.image_focus]

    if image_config.smart_mode:
        style = choose_smart_image_style(source.title, transformed_text)
        if style_profile is not None and style_profile.image_focus in image_focus_style:
            style = image_focus_style[style_profile.image_focus]
        count = choose_smart_image_count(transformed_text, max_count=image_config.smart_max_count)
    summary = transformed_text[:1200]
    prompts: list[str] = []
    for index in range(count):
        prompts.append(
            (
                f"基于以下文章内容生成一张配图。"
                f"文章标题：{source.title}。"
                f"视觉风格：{style}。"
                f"生成目标：突出文章主题、避免文字水印、构图清晰。"
                f"文章摘要：{summary}\n"
                f"第 {index + 1} 张图请保持与整体风格一致，但构图略有变化。"
            )
        )
    return prompts


def choose_smart_image_count(transformed_text: str, max_count: int) -> int:
    cleaned = (transformed_text or "").strip()
    length = len(cleaned)
    if length < 800:
        chosen = 1
    elif length < 1800:
        chosen = 2
    else:
        chosen = 3
    return max(1, min(int(max_count) if max_count else 3, chosen, 3))


def choose_smart_image_style(title: str, transformed_text: str) -> str:
    text = f"{title}\n{transformed_text}".lower()

    def score(keywords: set[str]) -> int:
        total = 0
        for keyword in keywords:
            if keyword in text:
                total += 1
        return total

    tech = {
        "ai",
        "aigc",
        "llm",
        "大模型",
        "模型",
        "算法",
        "开源",
        "推理",
        "训练",
        "部署",
        "编程",
        "代码",
        "软件",
        "系统",
        "数据库",
        "架构",
        "产品",
        "平台",
        "云",
        "芯片",
        "GPU".lower(),
    }
    culture = {"诗", "词", "书", "画", "水墨", "国风", "古典", "文学", "历史", "人文"}
    kids = {"儿童", "孩子", "亲子", "绘本", "童话", "故事", "小朋友", "中学生"}
    finance = {"投资", "股票", "基金", "财报", "营收", "利润", "经济", "通胀", "利率", "创业", "商业"}
    art = {"电影", "动画", "漫画", "综艺", "游戏", "娱乐", "二次元"}

    scores = {
        "科技感": score(tech),
        "水墨画": score(culture),
        "童话绘本": score(kids),
        "概念图": score(finance),
        "卡通": score(art),
    }

    # 默认风格：写实（当其他类别不明显时）
    best = "写实"
    best_score = 0
    for name, value in scores.items():
        if value > best_score:
            best = name
            best_score = value

    if best_score == 0:
        return "写实"
    return best

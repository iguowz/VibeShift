from app.core.schemas import DiscoverBrief, DiscoverEvidenceItem, ImageConfig, SearchSource, SourceContent, StyleProfile
from app.services.prompt_builder import (
    build_discover_brief_messages,
    build_discover_report_messages,
    build_image_prompts,
    build_rewrite_messages,
    compose_style_instruction,
)


def test_compose_style_instruction_includes_skill_metadata() -> None:
    profile = StyleProfile(
        name="公众号深读",
        audience="产品经理",
        tone="克制、判断明确",
        structure_template="TL;DR -> 拆解 -> 结论",
        emphasis_points=["关键事实", "落地建议"],
        citation_policy="strict",
        title_policy="punchy",
        image_focus="editorial",
        layout_format="poster",
        visual_mode="enhanced",
        function_skills=[
            {
                "id": "summary_first",
                "label": "重点先行",
                "instruction": "先给一句导语和 3~6 条重点，再展开细节。",
            }
        ],
    )

    result = compose_style_instruction("保留关键事实。", profile)

    assert "风格技能：公众号深读" in result
    assert "目标受众：产品经理" in result
    assert "关键事实" in result
    assert "标题策略" in result
    assert "引用策略" in result
    assert "版式策略" in result
    assert "可视化策略" in result
    assert "功能技能" in result
    assert "重点先行" in result
    assert "用户拿到即可使用的成稿" in result


def test_build_image_prompts_respects_style_profile_focus() -> None:
    source = SourceContent(
        title="云原生架构演进",
        source_url="https://example.com/post",
        raw_excerpt="讲述平台演进与架构变化。",
        full_text="这里是较长的正文。" * 40,
    )
    image = ImageConfig(
        enabled=True,
        provider="openai",
        base_url="https://api.openai.com/v1",
        api_key="sk-demo",
        model="gpt-image-1",
        count=1,
        style_preset="",
        custom_prompt="",
        placement="header",
        smart_mode=False,
    )
    profile = StyleProfile(name="架构复盘", image_focus="diagram")

    prompts = build_image_prompts(source, "这里是改写后的正文。", image, style_profile=profile)

    assert len(prompts) == 1
    assert "概念图" in prompts[0]


def test_compose_style_instruction_supports_paper_layout() -> None:
    profile = StyleProfile(
        name="论文综述",
        layout_format="paper",
        visual_mode="minimal",
    )

    result = compose_style_instruction("请整理成研究综述。", profile)

    assert "论文/研究报告感" in result


def test_compose_style_instruction_adds_poetry_guardrail() -> None:
    profile = StyleProfile(
        name="诗歌风",
        layout_format="poetry",
        visual_mode="none",
    )

    result = compose_style_instruction("请整理成现代诗。", profile)

    assert "诗歌/抒情短章感" in result
    assert "不要先写 TL;DR" in result


def test_compose_style_instruction_adds_documentary_guardrail() -> None:
    profile = StyleProfile(
        name="纪实风",
        tone="克制、具体、现场感强",
        structure_template="现场切入 -> 事实脉络 -> 人物/背景 -> 余波与判断",
        visual_mode="minimal",
    )

    result = compose_style_instruction("请整理成纪实稿。", profile)

    assert "纪实守则" in result
    assert "不要虚构情节" in result


def test_compose_style_instruction_adds_letter_guardrail() -> None:
    profile = StyleProfile(
        name="书信风",
        tone="真诚、从容、有对象感",
        structure_template="称呼与缘起 -> 主体展开 -> 重点叮嘱 -> 收束致意",
        visual_mode="minimal",
    )

    result = compose_style_instruction("请改成一封公开信。", profile)

    assert "书信守则" in result
    assert "对象感" in result
    assert "直接写成书信正文" in result


def test_build_rewrite_messages_respects_story_structure() -> None:
    source = SourceContent(
        title="平台迁移复盘",
        source_url="https://example.com/post",
        raw_excerpt="记录平台迁移过程。",
        full_text="这里是正文。" * 60,
    )
    profile = StyleProfile(
        name="故事风",
        tone="有画面感、顺滑、代入感强",
        structure_template="引子 -> 关键冲突 -> 过程展开 -> 启发总结",
    )

    messages = build_rewrite_messages(source, "请改写。", style_profile=profile)

    assert "不要用生硬 TL;DR 打断叙事" in messages[0]["content"]
    assert "不要输出“以下是改写结果”" in messages[0]["content"]


def test_build_discover_report_messages_respects_interview_structure() -> None:
    brief = DiscoverBrief(
        summary="已完成研究。",
        conclusion="建议优先关注类型提示与开发效率。",
        key_findings=["类型提示友好"],
        evidence=[
            {
                "source_id": 1,
                "title": "官方文档",
                "url": "https://example.com/fastapi",
                "quote": "FastAPI 基于类型提示。",
                "evidence": "支持高效开发。",
                "relevance": "能支撑框架定位。",
            }
        ],
        uncertainties=["缺少特定业务压测。"],
        draft_outline=["引题", "问题", "回答"],
    )
    sources = [
        SearchSource(
            id=1,
            title="官方文档",
            url="https://example.com/fastapi",
            snippet="FastAPI docs",
            excerpt="文档强调类型提示与异步能力。",
            source_type="official",
            relevance_score=9.0,
            credibility_score=9.5,
            overall_score=9.3,
            capture_mode="full",
        )
    ]
    profile = StyleProfile(
        name="访谈问答",
        tone="自然、清楚、有来有回",
        structure_template="引题 -> 问题 -> 回答 -> 追问 -> 小结",
    )

    messages = build_discover_report_messages(
        query="FastAPI 最佳实践",
        style_prompt="请整理。",
        evidence_items=brief.evidence,
        sources=sources,
        research_brief=brief,
        draft_markdown="## 草稿",
        style_profile=profile,
    )

    assert "正式问答稿" in messages[1]["content"]
    assert "关键问答" in messages[1]["content"]
    assert "用户拿到即可使用的成稿" in messages[0]["content"]


def test_build_discover_brief_messages_respects_briefing_style() -> None:
    sources = [
        SearchSource(
            id=1,
            title="官方文档",
            url="https://example.com/fastapi",
            snippet="FastAPI docs",
            excerpt="文档强调类型提示与异步能力。",
            source_type="official",
            relevance_score=9.0,
            credibility_score=9.5,
            overall_score=9.3,
            capture_mode="full",
        )
    ]
    evidence_items = [
        DiscoverEvidenceItem(
            source_id=1,
            title="官方文档",
            url="https://example.com/fastapi",
            quote="FastAPI 基于类型提示。",
            evidence="支持高效开发。",
            relevance="能支撑框架定位。",
        )
    ]
    profile = StyleProfile(
        name="商业简报",
        tone="冷静、结论先行",
        structure_template="一句话结论 -> 关键数据 -> 核心判断 -> 风险与建议",
        layout_format="ppt",
    )

    messages = build_discover_brief_messages(
        query="FastAPI 最佳实践",
        style_prompt="请整理。",
        evidence_items=evidence_items,
        sources=sources,
        style_profile=profile,
    )

    assert "可直接展示给用户的内容" in messages[0]["content"]
    assert "快速扫读与直接决策" in messages[1]["content"]
    assert "像重点卡片" in messages[1]["content"]


def test_build_rewrite_messages_respects_science_structure() -> None:
    source = SourceContent(
        title="为什么飞机能飞",
        source_url="https://example.com/post",
        raw_excerpt="解释升力与气流。",
        full_text="这里是正文。" * 40,
    )
    profile = StyleProfile(
        name="科普风",
        tone="耐心、清楚、不装深奥",
        structure_template="一句话概括 -> 常见问题 -> 原理解释 -> 误区提醒",
    )

    messages = build_rewrite_messages(source, "请改写。", style_profile=profile)

    assert "原理解释" in messages[0]["content"]
    assert "讲明白" in messages[0]["content"]

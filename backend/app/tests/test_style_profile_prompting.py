from app.core.schemas import ImageConfig, SourceContent, StyleProfile
from app.services.prompt_builder import build_image_prompts, compose_style_instruction


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

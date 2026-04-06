from app.services.prompt_builder import choose_smart_image_count, choose_smart_image_style


def test_choose_smart_image_count_respects_max() -> None:
    assert choose_smart_image_count("短文" * 50, max_count=3) == 1
    assert choose_smart_image_count("中等长度" * 200, max_count=3) in (1, 2)
    assert choose_smart_image_count("长文" * 1000, max_count=2) == 2


def test_choose_smart_image_style_tech() -> None:
    style = choose_smart_image_style("AI 大模型推理优化", "本文讨论 GPU、推理、部署与系统架构。")
    assert style == "科技感"


def test_choose_smart_image_style_kids() -> None:
    style = choose_smart_image_style("睡前故事", "适合孩子的小朋友阅读的童话绘本故事。")
    assert style == "童话绘本"


def test_choose_smart_image_style_fallback_realistic() -> None:
    style = choose_smart_image_style("今日随笔", "只是一些日常记录，没有明显主题。")
    assert style == "写实"


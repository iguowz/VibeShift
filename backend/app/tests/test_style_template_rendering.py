from app.core.schemas import SourceContent
from app.services.prompt_builder import render_style_prompt


def test_render_style_prompt_replaces_known_variables() -> None:
    source = SourceContent(
        title="测试标题",
        source_url="https://example.com/post",
        raw_excerpt="这里是摘要",
        full_text="正文内容",
    )
    rendered = render_style_prompt("用{title}开头，摘要：{summary}，链接：{source_url}，保留{unknown}", source)
    assert "测试标题" in rendered
    assert "这里是摘要" in rendered
    assert "https://example.com/post" in rendered
    assert "{unknown}" in rendered


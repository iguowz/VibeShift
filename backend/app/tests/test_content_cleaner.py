from app.services.content_cleaner import build_text_source, extract_main_content


def test_build_text_source_uses_first_line_as_title() -> None:
    source = build_text_source("第一行标题\n\n这里是一段足够长的正文内容，用于测试文本模式的内容构建。")
    assert source.title == "第一行标题"
    assert "正文内容" in source.full_text


def test_extract_main_content_from_article_html() -> None:
    html = """
    <html>
      <head><title>示例文章</title></head>
      <body>
        <article>
          <h1>示例文章</h1>
          <p>这是一个用于测试正文提取的段落，长度足够让解析器识别核心内容。</p>
          <p>第二段继续补充更多信息，以满足最小长度要求并验证抽取结果。</p>
        </article>
      </body>
    </html>
    """
    source = extract_main_content(html, "https://example.com/test")
    assert source.title
    assert "正文提取" in source.full_text


def test_extract_main_content_falls_back_to_body_text() -> None:
    html = """
    <html>
      <head><title>公告页</title></head>
      <body>
        <div class="wrapper">
          <p>这里是一段没有明显 article 结构、但正文足够长的页面内容，用来验证最终 body 文本兜底逻辑。这里继续补充更多背景说明，确保内容密度和长度接近真实公告页。</p>
          <p>第二段继续补充更多细节，确保最终能满足最小正文长度要求，而不是直接报提取失败。再增加几句说明，让最后的 body 文本足以被系统识别成可用正文。</p>
        </div>
      </body>
    </html>
    """
    source = extract_main_content(html, "https://example.com/fallback")
    assert source.title == "公告页"
    assert "body 文本兜底逻辑" in source.full_text

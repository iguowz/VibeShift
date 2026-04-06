from bs4 import BeautifulSoup
from readability import Document
import trafilatura

from app.core.errors import AppError
from app.core.schemas import SourceContent


def _clean_text(value: str) -> str:
    lines = [line.strip() for line in value.splitlines()]
    non_empty = [line for line in lines if line]
    return "\n".join(non_empty)


def extract_main_content(html: str, source_url: str | None = None) -> SourceContent:
    downloaded = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
        favor_precision=True,
        with_metadata=True,
        url=source_url,
    )

    title = ""
    full_text = ""
    if downloaded:
        full_text = _clean_text(downloaded)

    if len(full_text) < 200:
        doc = Document(html)
        title = doc.short_title()
        summary_html = doc.summary()
        soup = BeautifulSoup(summary_html, "html.parser")
        full_text = _clean_text(soup.get_text("\n"))

    if not title:
        soup = BeautifulSoup(html, "html.parser")
        title_node = soup.find("title")
        title = title_node.get_text(strip=True) if title_node else "未命名文章"

    if len(full_text) < 100:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        body_text = _clean_text(soup.get_text("\n"))
        if len(body_text) > len(full_text):
            full_text = body_text

    if len(full_text) < 100:
        raise AppError(
            code="content_extraction_failed",
            message="网页正文提取失败，未能获取足够内容。",
            suggestion="请尝试更换网页，或直接粘贴正文内容进行转换。",
            status_code=422,
        )

    excerpt = full_text[:500]
    return SourceContent(
        title=title or "未命名文章",
        source_url=source_url,
        raw_excerpt=excerpt,
        full_text=full_text,
    )


def build_text_source(raw_text: str) -> SourceContent:
    cleaned = _clean_text(raw_text)
    if len(cleaned) < 20:
        raise AppError(
            code="input_too_short",
            message="文本内容过短，无法完成有效转换。",
            suggestion="请提供更完整的文本内容，至少包含几个完整句子。",
            status_code=422,
        )
    lines = cleaned.splitlines()
    title = lines[0][:60]
    return SourceContent(
        title=title,
        raw_excerpt=cleaned[:500],
        full_text=cleaned,
    )

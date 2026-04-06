import { renderRichTextToHtml, stripLeadingRichTitle } from "./markdown";
import type { DiscoverResponse, RecentRunEntry, SearchSource, TransformResponse } from "../types";

export type ShareTarget = "xiaohongshu" | "moments" | "wechat" | "zhihu";

function normalizeWhitespace(value: string) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function bulletize(items: string[], limit = 4) {
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => `- ${item}`);
}

function topSources(sources: SearchSource[], limit = 4) {
  return sources
    .slice()
    .sort((left, right) => (right.overall_score || 0) - (left.overall_score || 0))
    .slice(0, limit);
}

function renderSourceLines(sources: SearchSource[], limit = 4) {
  return topSources(sources, limit).map((item, index) => {
    const label = item.title || item.url;
    return `${index + 1}. ${label}（${item.url}）`;
  });
}

function normalizeResultText(value: string) {
  return normalizeWhitespace(stripLeadingRichTitle(value));
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PRINTABLE_ALLOWED_ATTRIBUTES = new Set([
  "href",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
  "target",
  "rel",
]);

function normalizePrintableBodyHtml(html: string) {
  const raw = String(html || "").trim();
  if (!raw) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<main>${raw}</main>`, "text/html");
  const root = doc.querySelector("main");
  if (!root) return raw;

  for (const element of Array.from(root.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") {
      element.remove();
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (
        name === "class" ||
        name === "style" ||
        name === "id" ||
        name === "hidden" ||
        name === "aria-hidden" ||
        name === "loading" ||
        name === "decoding" ||
        name.startsWith("data-") ||
        name.startsWith("on")
      ) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (!PRINTABLE_ALLOWED_ATTRIBUTES.has(name)) {
        element.removeAttribute(attr.name);
      }
    }

    if (tag === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer noopener");
    }
    if (tag === "img" && !element.getAttribute("alt")) {
      element.setAttribute("alt", "image");
    }
  }

  return root.innerHTML.trim();
}

function buildPrintableHtml(title: string, html: string) {
  const printableBody = normalizePrintableBodyHtml(html);
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: auto; margin: 14mm 12mm; }
        :root { color-scheme: light; }
        html, body { background: #ffffff; }
        body {
          font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
          margin: 0 auto;
          max-width: 860px;
          color: #1f2937;
          line-height: 1.75;
          padding: 0 20px 40px;
        }
        .print-toolbar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 0 12px;
          background: rgba(255, 255, 255, 0.96);
          border-bottom: 1px solid #e2e8f0;
          backdrop-filter: blur(8px);
        }
        .print-toolbar button {
          border: 0;
          border-radius: 999px;
          padding: 10px 16px;
          background: #2563eb;
          color: #ffffff;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }
        .print-toolbar p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
        }
        h1,h2,h3 { line-height: 1.3; margin: 1.15em 0 0.55em; page-break-after: avoid; }
        p, ul, ol, blockquote, pre, table { margin: 0.7em 0; }
        pre { white-space: pre-wrap; word-break: break-word; background: #f5f7fb; padding: 12px 14px; border-radius: 12px; }
        blockquote { border-left: 4px solid #94a3b8; margin-left: 0; padding-left: 14px; color: #475569; }
        img { max-width: 100%; height: auto; border-radius: 12px; page-break-inside: avoid; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #dbe3f1; padding: 8px 10px; text-align: left; }
        a { color: #2563eb; text-decoration: none; }
        .print-shell { padding-top: 12px; }
        .print-title { margin-top: 0; margin-bottom: 1rem; }
        .print-shell > :first-child { margin-top: 0; }
        @media print {
          body { max-width: none; padding: 0; }
          .print-toolbar { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="print-toolbar">
        <button type="button" data-print-button>打印 / 另存为 PDF</button>
        <p data-print-status>正在准备导出页面，请稍候…</p>
      </div>
      <main class="print-shell">
        <h1 class="print-title">${escapeHtml(title)}</h1>
        ${printableBody}
      </main>
      <script>
        (function () {
          const button = document.querySelector("[data-print-button]");
          const status = document.querySelector("[data-print-status]");
          const setStatus = (text) => {
            if (status) status.textContent = text;
          };
          const waitForImages = async () => {
            const images = Array.from(document.images || []);
            await Promise.all(
              images.map(
                (image) =>
                  new Promise((resolve) => {
                    if (image.complete) {
                      resolve();
                      return;
                    }
                    image.addEventListener("load", resolve, { once: true });
                    image.addEventListener("error", resolve, { once: true });
                    window.setTimeout(resolve, 1200);
                  }),
              ),
            );
          };
          const ready = async () => {
            try {
              if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
              }
            } catch {}
            await waitForImages();
            setStatus("页面已准备完成，请点击“打印 / 另存为 PDF”。");
          };
          const printNow = () => {
            setStatus("正在打开打印面板…");
            window.focus();
            window.setTimeout(() => window.print(), 120);
          };
          if (button) {
            button.addEventListener("click", printNow);
          }
          window.addEventListener("afterprint", () => {
            setStatus("已关闭打印面板，如需重新导出可再次点击。");
          });
          if (document.readyState === "complete") {
            void ready();
          } else {
            window.addEventListener("load", () => void ready(), { once: true });
          }
        })();
      </script>
    </body>
  </html>`;
}

function writePrintableDocument(doc: Document, content: string) {
  doc.open();
  doc.write(content);
  doc.close();
}

function buildHistorySourceLines(entry: RecentRunEntry, limit = 4) {
  return (entry.source_preview || [])
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${item.title}（${item.url}）`);
}

export function buildTransformShareText(result: TransformResponse, target: ShareTarget): string {
  const body = normalizeWhitespace(result.transformed_text);
  const excerpt = normalizeWhitespace(result.raw_excerpt);
  if (target === "moments") {
    return normalizeWhitespace([
      `${result.title}`,
      excerpt,
      "",
      "今天整理了一版内容，核心要点如下：",
      ...bulletize(body.split("\n").filter((line) => line.trim().length >= 8), 3),
    ].join("\n"));
  }

  if (target === "xiaohongshu") {
    return normalizeWhitespace([
      `# ${result.title}`,
      "",
      excerpt,
      "",
      "这次我重点整理了：",
      ...bulletize(body.split("\n").filter((line) => line.trim().length >= 8), 4),
      "",
      "#内容创作 #效率工具 #信息整理",
    ].join("\n"));
  }

  if (target === "wechat") {
    return normalizeWhitespace([
      `# ${result.title}`,
      "",
      `导语：${excerpt}`,
      "",
      body,
    ].join("\n"));
  }

  return normalizeWhitespace([
    `# ${result.title}`,
    "",
    excerpt ? `摘要：${excerpt}\n` : "",
    body,
  ].join("\n"));
}

export function buildDiscoverShareText(result: DiscoverResponse, target: ShareTarget): string {
  const brief = result.brief;
  const topFindings = bulletize(brief.key_findings, 4);
  const sourceLines = renderSourceLines(result.sources, 4);
  if (target === "moments") {
    return normalizeWhitespace([
      `${result.title}`,
      brief.conclusion || brief.summary,
      "",
      ...topFindings.slice(0, 3),
    ].join("\n"));
  }

  if (target === "xiaohongshu") {
    return normalizeWhitespace([
      `# ${result.title}`,
      "",
      `一句话结论：${brief.conclusion || brief.summary}`,
      "",
      "我最关心的几个点：",
      ...topFindings,
      "",
      "优先看的公开来源：",
      ...sourceLines,
      "",
      "#调研 #做决策 #信息整理",
    ].join("\n"));
  }

  if (target === "wechat") {
    return normalizeWhitespace([
      `# ${result.title}`,
      "",
      `导语：${brief.summary || brief.conclusion}`,
      "",
      "## 直接结论",
      brief.conclusion || "暂无",
      "",
      "## 关键发现",
      ...topFindings,
      "",
      "## 参考来源",
      ...sourceLines,
      "",
      "## 正文",
      normalizeWhitespace(result.transformed_text),
    ].join("\n"));
  }

  return normalizeWhitespace([
    `# ${result.title}`,
    "",
    "## 直接结论",
    brief.conclusion || "暂无",
    "",
    "## 关键发现",
    ...topFindings,
    "",
    "## 参考来源",
    ...sourceLines,
    "",
    normalizeWhitespace(result.transformed_text),
  ].join("\n"));
}

export function buildHistoryShareText(entry: RecentRunEntry, target: ShareTarget): string {
  const body = normalizeResultText(entry.result_text);
  if (entry.mode === "discover") {
    const topFindings = bulletize(entry.brief_key_findings || [], 4);
    const sourceLines = buildHistorySourceLines(entry, 4);
    if (target === "moments") {
      return normalizeWhitespace([
        entry.title,
        entry.brief_conclusion || entry.brief_summary || entry.summary,
        "",
        ...topFindings.slice(0, 3),
      ].join("\n"));
    }

    if (target === "xiaohongshu") {
      return normalizeWhitespace([
        `# ${entry.title}`,
        "",
        `一句话结论：${entry.brief_conclusion || entry.brief_summary || entry.summary}`,
        "",
        "我最想先分享的几个点：",
        ...topFindings,
        "",
        "参考来源：",
        ...sourceLines,
        "",
        "#调研 #资料整理 #内容输出",
      ].join("\n"));
    }

    if (target === "wechat") {
      return normalizeWhitespace([
        `# ${entry.title}`,
        "",
        `导语：${entry.brief_summary || entry.brief_conclusion || entry.summary}`,
        "",
        "## 直接结论",
        entry.brief_conclusion || entry.summary || "暂无",
        "",
        "## 关键发现",
        ...topFindings,
        "",
        "## 参考来源",
        ...sourceLines,
        "",
        "## 正文",
        body,
      ].join("\n"));
    }

    return normalizeWhitespace([
      `# ${entry.title}`,
      "",
      "## 直接结论",
      entry.brief_conclusion || entry.summary || "暂无",
      "",
      "## 关键发现",
      ...topFindings,
      "",
      "## 参考来源",
      ...sourceLines,
      "",
      body,
    ].join("\n"));
  }

  const excerpt = normalizeWhitespace(entry.summary || entry.result_excerpt);
  if (target === "moments") {
    return normalizeWhitespace([
      entry.title,
      excerpt,
      "",
      "这次我整理出的重点：",
      ...bulletize(body.split("\n").filter((line) => line.trim().length >= 8), 3),
    ].join("\n"));
  }

  if (target === "xiaohongshu") {
    return normalizeWhitespace([
      `# ${entry.title}`,
      "",
      excerpt,
      "",
      "我会优先分享这几个点：",
      ...bulletize(body.split("\n").filter((line) => line.trim().length >= 8), 4),
      "",
      "#内容整理 #创作助手 #效率工具",
    ].join("\n"));
  }

  if (target === "wechat") {
    return normalizeWhitespace([
      `# ${entry.title}`,
      "",
      `导语：${excerpt}`,
      "",
      body,
    ].join("\n"));
  }

  return normalizeWhitespace([
    `# ${entry.title}`,
    "",
    excerpt ? `摘要：${excerpt}\n` : "",
    body,
  ].join("\n"));
}

export function exportHtmlToPdf(title: string, html: string) {
  const content = buildPrintableHtml(title, html);
  const popup = window.open("", "_blank", "width=960,height=720");
  if (popup) {
    writePrintableDocument(popup.document, content);
    popup.focus();
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  iframe.srcdoc = content;

  window.setTimeout(() => {
    const frameWindow = iframe.contentWindow;
    if (frameWindow) {
      frameWindow.focus();
    }
  }, 120);

  window.setTimeout(() => {
    iframe.remove();
  }, 300_000);
}

export function exportTransformResultPdf(result: TransformResponse) {
  const title = result.title || "VibeShift 导出";
  const html = renderRichTextToHtml(stripLeadingRichTitle(result.transformed_text));
  exportHtmlToPdf(title, html);
}

export function exportDiscoverResultPdf(result: DiscoverResponse) {
  const title = result.title || "VibeShift 调研导出";
  const html = renderRichTextToHtml(stripLeadingRichTitle(result.transformed_text));
  exportHtmlToPdf(title, html);
}

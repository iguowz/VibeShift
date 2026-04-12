import { stripLeadingRichTitle } from "./markdown";
import { renderStyleBodyHtml } from "./styleBodyRender";
import { classifyStyleProfile, type StyleFamily } from "./stylePresentation";
import { getSummaryRenderMode } from "./styleSummary";
import type { DiscoverResponse, RecentRunEntry, SearchSource, StyleSkillProfile, TransformResponse } from "../types";

export type ShareTarget = "xiaohongshu" | "moments" | "wechat" | "zhihu";
export type DiscoverExportView = "brief" | "report";
export type PreferredDeliverableView = "transform" | DiscoverExportView;

export const SHARE_TARGET_META: Record<
  ShareTarget,
  { channel: string; deliverable: string; action: string; copied: string; description: string }
> = {
  xiaohongshu: {
    channel: "小红书",
    deliverable: "小红书笔记",
    action: "复制小红书成稿",
    copied: "已复制小红书成稿",
    description: "适合重点前置、节奏更快的图文发布",
  },
  moments: {
    channel: "朋友圈",
    deliverable: "朋友圈短文",
    action: "复制朋友圈短文",
    copied: "已复制朋友圈短文",
    description: "适合短内容转发和一句话带重点",
  },
  wechat: {
    channel: "公众号",
    deliverable: "公众号长文",
    action: "复制公众号长文",
    copied: "已复制公众号长文",
    description: "适合完整表达和直接对外发送",
  },
  zhihu: {
    channel: "知乎",
    deliverable: "知乎回答",
    action: "复制知乎回答",
    copied: "已复制知乎回答",
    description: "适合展开解释、问答和观点阐述",
  },
};

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

function bulletizeForTarget(items: string[], target: ShareTarget, limit = 4) {
  const normalized = items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
  if (target === "xiaohongshu") {
    return normalized.map((item, index) => `${index + 1}. ${item}`);
  }
  if (target === "moments") {
    return normalized.map((item) => `• ${item}`);
  }
  return normalized.map((item) => `- ${item}`);
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

function normalizeExcerptText(value: string) {
  const metadataPattern = /^(title|url|hostname|description|sitename|date|tags|author|published|language|category)\s*:/i;
  return normalizeWhitespace(
    String(value || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line !== "---" && !metadataPattern.test(line) && !/^https?:\/\//i.test(line))
      .join("\n"),
  );
}

function splitParagraphs(value: string) {
  return normalizeWhitespace(value)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildHeading(title: string, target: ShareTarget) {
  if (target === "xiaohongshu") return `【${title}】`;
  return target === "moments" ? title : `# ${title}`;
}

export function getShareTargetMeta(target: ShareTarget) {
  return SHARE_TARGET_META[target];
}

export function getRecommendedShareTarget(
  family: StyleFamily,
  view: PreferredDeliverableView = "transform",
): ShareTarget {
  if (view === "brief") {
    if (family === "poster" || family === "snack") return "xiaohongshu";
    if (family === "interview" || family === "podcast") return "zhihu";
    return "wechat";
  }

  if (family === "poster" || family === "snack") return "xiaohongshu";
  if (family === "interview" || family === "podcast" || family === "editorial" || family === "newspaper") {
    return "zhihu";
  }
  return "wechat";
}

function extractListItems(value: string, limit = 4) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(/^([-*+]\s+|\d+\.\s+)(.+)$/)?.[2]?.trim() || "")
    .filter(Boolean)
    .slice(0, limit);
}

function extractDialogueLines(value: string, limit = 4) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(问|答|Q|A|主持人|嘉宾|采访者|受访者|提问者|回答者)\s*[：:]/i.test(line))
    .slice(0, limit);
}

function extractLeadingParagraphs(value: string, limit = 2) {
  return splitParagraphs(value)
    .filter((item) => item.length >= 12)
    .slice(0, limit);
}

function dedupeLeadingParagraph(lead: string, body: string) {
  const normalizedLead = normalizeWhitespace(lead);
  const paragraphs = splitParagraphs(body);
  if (!normalizedLead || !paragraphs.length) return body;
  if (normalizeWhitespace(paragraphs[0]) !== normalizedLead) return body;
  return normalizeWhitespace(paragraphs.slice(1).join("\n\n"));
}

function extractLetterAddressee(title: string, body: string) {
  const titleMatch = String(title || "").match(/写给(.+?)(?:的)?一封信/);
  if (titleMatch?.[1]) return `${titleMatch[1]}：`;
  const firstParagraph = splitParagraphs(body)[0] || "";
  if (/^[^\n]{1,20}[：:]$/.test(firstParagraph)) return firstParagraph;
  return "你好：";
}

function buildSpeechSceneText(title: string, body: string, target: ShareTarget, conclusion: string, findings: string[]) {
  const heading = buildHeading(title, target);
  const paragraphs = splitParagraphs(body);
  const opening = paragraphs[0] || normalizeWhitespace(conclusion);
  const middle = target === "moments" ? paragraphs.slice(1, 2) : paragraphs.slice(1);
  const takeawaySource =
    findings.length
      ? findings
      : middle
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, target === "moments" ? 2 : 3);
  const takeawayLines = bulletizeForTarget(takeawaySource, target, target === "moments" ? 2 : 3);
  const actionLine = findings[0] ? `最后，请大家先把这件事记住：${findings[0]}` : "";
  const opener = target === "xiaohongshu" ? `先把结论说在前面：${opening}` : opening;
  return normalizeWhitespace(
    [heading, "", opener, "", ...takeawayLines, ...(middle.length ? ["", ...middle] : []), ...(actionLine ? ["", actionLine] : [])].join("\n"),
  );
}

function buildLetterSceneText(title: string, body: string, target: ShareTarget, conclusion: string, findings: string[]) {
  const heading = buildHeading(title, target);
  const cleanBody = normalizeWhitespace(body);
  if (cleanBody && /[：:]\s*$/.test(splitParagraphs(cleanBody)[0] || "")) {
    return normalizeWhitespace([heading, "", cleanBody].join("\n"));
  }
  const addressee = extractLetterAddressee(title, cleanBody);
  const bodyParagraphs = [
    conclusion || extractLeadingParagraphs(cleanBody, 1)[0] || "",
    ...findings.slice(0, target === "moments" ? 2 : 3),
  ].filter(Boolean);
  const opener = target === "xiaohongshu" ? `${addressee}\n\n今天想认真说一件事。` : addressee;
  return normalizeWhitespace([heading, "", opener, "", ...bodyParagraphs, "", target === "moments" ? "祝一切顺利" : "祝好"].join("\n"));
}

function buildBriefingSceneText(title: string, target: ShareTarget, conclusion: string, findings: string[], uncertainties: string[], body: string) {
  const heading = buildHeading(title, target);
  const conciseBullets = bulletizeForTarget([...findings, ...uncertainties.map((item) => `风险：${item}`)], target, target === "moments" ? 3 : 5);
  const fallback = bulletizeForTarget(extractListItems(body, target === "moments" ? 3 : 5), target, target === "moments" ? 3 : 5);
  const leadLine =
    target === "xiaohongshu"
      ? `一句话结论：${conclusion || extractLeadingParagraphs(body, 1)[0] || ""}`
      : conclusion || extractLeadingParagraphs(body, 1)[0] || "";
  const lines = [heading, "", leadLine, "", ...(conciseBullets.length ? conciseBullets : fallback)];
  return normalizeWhitespace(lines.join("\n"));
}

function buildEditorialSceneText(
  title: string,
  target: ShareTarget,
  body: string,
  conclusion: string,
  findings: string[],
  sources: SearchSource[] | Array<{ title: string; url: string; overall_score?: number }>,
) {
  const heading = buildHeading(title, target);
  const cleanBody = dedupeLeadingParagraph(conclusion, body);
  const fallbackPivot = extractLeadingParagraphs(cleanBody, 2)[0] || "";
  const pivot = findings[0] ? `更值得继续追问的是：${findings[0]}` : fallbackPivot ? `更值得继续追问的是：${fallbackPivot}` : "";
  const sourceLines = renderSourceLines(
    (sources as SearchSource[]).map((item, index) => ({
      id: index + 1,
      title: item.title,
      url: item.url,
      snippet: "",
      excerpt: "",
      overall_score: (item as SearchSource).overall_score,
    })),
    target === "moments" ? 2 : 4,
  );
  return normalizeWhitespace(
    [
      heading,
      "",
      ...(conclusion ? [target === "xiaohongshu" ? `核心判断：${conclusion}` : conclusion, ""] : []),
      cleanBody,
      ...(pivot ? ["", target === "moments" ? pivot.replace("更值得继续追问的是：", "继续看：") : pivot] : []),
      ...(target === "zhihu" && sourceLines.length ? ["", "参考来源", ...sourceLines] : []),
    ].join("\n"),
  );
}

function buildShareBodyByFamily(params: {
  title: string;
  body: string;
  target: ShareTarget;
  family: StyleFamily;
  excerpt?: string;
  conclusion?: string;
  findings?: string[];
  sources?: SearchSource[] | Array<{ title: string; url: string; overall_score?: number }>;
}) {
  const { title, body, target, family, excerpt = "", conclusion = "", findings = [], sources = [] } = params;
  const heading = buildHeading(title, target);
  const cleanBody = normalizeWhitespace(body);
  const lead = normalizeWhitespace(conclusion || excerpt);
  const bullets = bulletize(findings.length ? findings : extractListItems(cleanBody, 4), 4);
  const dialogues = extractDialogueLines(cleanBody, target === "moments" ? 3 : 5);
  const leadParagraphs = extractLeadingParagraphs(cleanBody, target === "moments" ? 2 : 3);
  const sourceLines = renderSourceLines(
    (sources as SearchSource[]).map((item, index) => ({
      id: index + 1,
      title: item.title,
      url: item.url,
      snippet: "",
      excerpt: "",
      overall_score: (item as SearchSource).overall_score,
    })),
    target === "moments" ? 2 : 4,
  );

  switch (family) {
    case "interview":
      return normalizeWhitespace([heading, "", ...dialogues, ...(dialogues.length ? [] : leadParagraphs)].join("\n"));
    case "podcast":
      return normalizeWhitespace([heading, "", cleanBody].join("\n"));
    case "letter":
      return buildLetterSceneText(title, cleanBody, target, lead, findings);
    case "speech":
      return buildSpeechSceneText(title, cleanBody, target, lead, findings);
    case "poetry":
    case "classical":
    case "elegant":
    case "story":
    case "documentary":
    case "book":
      return normalizeWhitespace([heading, "", cleanBody].join("\n"));
    case "briefing":
    case "decision":
    case "poster":
    case "snack":
      return buildBriefingSceneText(title, target, lead, findings, [], cleanBody);
    case "manual":
    case "science":
    case "kids":
    case "plain":
      return normalizeWhitespace(
        [
          heading,
          "",
          ...(lead ? [lead, ""] : []),
          ...(bullets.length ? bullets : leadParagraphs),
          ...(target === "wechat" || target === "zhihu" ? ["", cleanBody] : []),
        ].join("\n"),
      );
    case "editorial":
    case "newspaper":
    case "paper":
      return buildEditorialSceneText(title, target, cleanBody, lead, findings, sources);
    default:
      return normalizeWhitespace(
        [
          heading,
          "",
          ...(lead ? [lead, ""] : []),
          cleanBody,
          ...(target === "zhihu" && sourceLines.length ? ["", "参考来源", ...sourceLines] : []),
        ].join("\n"),
      );
  }
}

function renderStyledPrintableHtml(content: string, family: StyleFamily) {
  return renderStyleBodyHtml(content, getSummaryRenderMode(family), family);
}

function buildDiscoverBriefDirectText(
  result: DiscoverResponse,
  family: StyleFamily,
  target: ShareTarget = "wechat",
) {
  const heading = buildHeading(result.title, target);
  const conclusion = normalizeWhitespace(result.brief.conclusion || result.brief.summary || result.title);
  const findings = bulletize(result.brief.key_findings, target === "moments" ? 3 : 4);
  const uncertainties = bulletize(
    result.brief.uncertainties.map((item) => `风险：${item}`),
    target === "moments" ? 1 : 2,
  );
  const outline = bulletize(result.brief.draft_outline, target === "moments" ? 2 : 3);

  switch (family) {
    case "interview":
    case "podcast":
      return normalizeWhitespace(
        [
          heading,
          "",
          "问：这次最值得先拿走的结论是什么？",
          `答：${conclusion}`,
          ...result.brief.key_findings.slice(0, target === "moments" ? 2 : 3).flatMap((item) => [
            "问：还要继续关注什么？",
            `答：${item}`,
          ]),
        ].join("\n"),
      );
    case "speech":
      return normalizeWhitespace(
        [
          heading,
          "",
          `各位好，先说结论：${conclusion}`,
          "",
          ...result.brief.key_findings.slice(0, target === "moments" ? 2 : 3),
          ...(result.brief.uncertainties.length ? ["", `最后，请继续关注：${result.brief.uncertainties[0]}`] : []),
        ].join("\n"),
      );
    case "letter":
      return normalizeWhitespace(
        [
          heading,
          "",
          extractLetterAddressee(result.title, result.transformed_text),
          "",
          conclusion,
          "",
          ...result.brief.key_findings.slice(0, target === "moments" ? 2 : 3),
          "",
          "祝好",
        ].join("\n"),
      );
    case "briefing":
    case "decision":
    case "poster":
    case "snack":
      return buildBriefingSceneText(result.title, target, conclusion, result.brief.key_findings, result.brief.uncertainties, result.transformed_text);
    case "editorial":
    case "newspaper":
    case "paper":
      return buildEditorialSceneText(
        result.title,
        target,
        normalizeResultText(result.transformed_text),
        conclusion,
        result.brief.key_findings,
        result.sources,
      );
    case "manual":
    case "science":
    case "kids":
    case "plain":
      return normalizeWhitespace(
        [heading, "", conclusion, "", ...(outline.length ? outline : findings), ...uncertainties].join("\n"),
      );
    default:
      return normalizeWhitespace([heading, "", conclusion, "", ...(findings.length ? findings : outline), ...uncertainties].join("\n"));
  }
}

function buildHistoryBriefDirectText(
  entry: RecentRunEntry,
  family: StyleFamily,
  target: ShareTarget = "wechat",
) {
  const heading = buildHeading(entry.title, target);
  const conclusion = normalizeWhitespace(entry.brief_conclusion || entry.brief_summary || entry.summary || entry.title);
  const findings = bulletize(entry.brief_key_findings || [], target === "moments" ? 3 : 4);

  switch (family) {
    case "interview":
    case "podcast":
      return normalizeWhitespace(
        [
          heading,
          "",
          "问：这次历史结果最值得先拿走的结论是什么？",
          `答：${conclusion}`,
          ...(entry.brief_key_findings || []).slice(0, target === "moments" ? 2 : 3).flatMap((item) => [
            "问：还要继续关注什么？",
            `答：${item}`,
          ]),
        ].join("\n"),
      );
    case "speech":
      return normalizeWhitespace(
        [
          heading,
          "",
          `各位好，先说结论：${conclusion}`,
          "",
          ...(entry.brief_key_findings || []).slice(0, target === "moments" ? 2 : 3),
        ].join("\n"),
      );
    case "letter":
      return normalizeWhitespace(
        [
          heading,
          "",
          extractLetterAddressee(entry.title, entry.result_text),
          "",
          conclusion,
          "",
          ...(entry.brief_key_findings || []).slice(0, target === "moments" ? 2 : 3),
          "",
          "祝好",
        ].join("\n"),
      );
    case "briefing":
    case "decision":
    case "poster":
    case "snack":
      return buildBriefingSceneText(entry.title, target, conclusion, entry.brief_key_findings || [], [], entry.result_text);
    case "editorial":
    case "newspaper":
    case "paper":
      return buildEditorialSceneText(
        entry.title,
        target,
        normalizeResultText(entry.result_text),
        conclusion,
        entry.brief_key_findings || [],
        (entry.source_preview || []).map((item) => ({
          title: item.title,
          url: item.url,
          overall_score: item.relevance_score || 0,
        })),
      );
    case "manual":
    case "science":
    case "kids":
    case "plain":
      return normalizeWhitespace([heading, "", conclusion, "", ...findings].join("\n"));
    default:
      return normalizeWhitespace([heading, "", conclusion, "", ...findings].join("\n"));
  }
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizePrintableClassName(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "");
}

function filterPrintableClasses(value: string) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => /^(body-|dialogue-render-|printable-)/.test(item))
    .map(sanitizePrintableClassName)
    .filter(Boolean);
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
      if (name === "class") {
        const allowedClasses = filterPrintableClasses(attr.value);
        if (allowedClasses.length) {
          element.setAttribute("class", allowedClasses.join(" "));
        } else {
          element.removeAttribute(attr.name);
        }
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

function buildPrintableHtml(title: string, html: string, family: StyleFamily) {
  const printableBody = normalizePrintableBodyHtml(html);
  const familyClass = sanitizePrintableClassName(`printable-family-${family}`);
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
        .body-card-module,
        .body-step-module,
        .body-section-module,
        .body-lead-block,
        .body-bridge-block,
        .body-closing-block,
        .dialogue-render-item {
          margin: 0.85rem 0;
          padding: 0.85rem 0.95rem;
          border: 1px solid #dbe3f1;
          border-radius: 14px;
          background: #f8fbff;
        }
        .body-card-grid,
        .body-step-list,
        .body-section-body,
        .dialogue-render-block { display: grid; gap: 0.65rem; }
        .body-card-item,
        .body-step-item {
          padding: 0.7rem 0.8rem;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #e5edf9;
        }
        .body-step-item { display: grid; grid-template-columns: auto 1fr; gap: 0.7rem; align-items: start; }
        .body-step-index {
          width: 1.5rem; height: 1.5rem; border-radius: 999px; display: inline-grid; place-items: center;
          background: #dbeafe; color: #1d4ed8; font-weight: 700; font-size: 12px;
        }
        .body-module-head strong,
        .body-section-head strong,
        .body-lead-head strong,
        .body-bridge-head strong,
        .body-closing-head strong,
        .dialogue-render-speaker {
          color: #1d4ed8;
          font-weight: 700;
        }
        .body-section-preface {
          margin: 0.6rem 0;
          padding: 0.65rem 0.8rem;
          border-left: 3px solid #93c5fd;
          background: #f8fbff;
          border-radius: 10px;
        }
        .body-letter-signature { margin-top: 0.7rem; text-align: right; font-weight: 700; letter-spacing: 0.08em; }
        .body-poetry-stanza { margin: 1.1rem auto; max-width: 680px; }
        .body-poetry-stanza p { text-align: center; line-height: 1.95; }
        .printable-family-letter .print-shell,
        .printable-family-book .print-shell,
        .printable-family-classical .print-shell,
        .printable-family-elegant .print-shell {
          font-family: "Source Han Serif SC", "Noto Serif SC", Georgia, serif;
        }
        .printable-family-speech .body-opening-speech,
        .printable-family-speech .body-closing-speech,
        .printable-family-editorial .body-lead-editorial,
        .printable-family-newspaper .body-lead-newspaper,
        .printable-family-paper .body-lead-paper {
          background: #eef4ff;
        }
        @media print {
          body { max-width: none; padding: 0; }
          .print-toolbar { display: none; }
        }
      </style>
    </head>
    <body class="${familyClass}">
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

export function buildTransformShareText(
  result: TransformResponse,
  target: ShareTarget,
  styleProfile?: StyleSkillProfile | null,
): string {
  const body = normalizeResultText(result.transformed_text);
  const excerpt = normalizeExcerptText(result.raw_excerpt);
  const family = classifyStyleProfile(styleProfile);
  return buildShareBodyByFamily({
    title: result.title,
    body,
    target,
    family,
    excerpt,
  });
}

export function buildDiscoverShareText(
  result: DiscoverResponse,
  target: ShareTarget,
  styleProfile?: StyleSkillProfile | null,
  activeTab: DiscoverExportView = "report",
): string {
  const family = classifyStyleProfile(styleProfile);
  if (activeTab === "brief") {
    return buildDiscoverBriefDirectText(result, family, target);
  }
  const brief = result.brief;
  return buildShareBodyByFamily({
    title: result.title,
    body: normalizeResultText(result.transformed_text),
    target,
    family,
    excerpt: brief.summary,
    conclusion: brief.conclusion,
    findings: brief.key_findings,
    sources: result.sources,
  });
}

export function buildHistoryShareText(
  entry: RecentRunEntry,
  target: ShareTarget,
  activeTab: DiscoverExportView = "report",
): string {
  const body = normalizeResultText(entry.result_text);
  const family = classifyStyleProfile(entry.style_snapshot);
  if (entry.mode === "discover") {
    if (activeTab === "brief") {
      return buildHistoryBriefDirectText(entry, family, target);
    }
    return buildShareBodyByFamily({
      title: entry.title,
      body,
      target,
      family,
      excerpt: entry.brief_summary || entry.summary,
      conclusion: entry.brief_conclusion,
      findings: entry.brief_key_findings || [],
      sources: (entry.source_preview || []).map((item) => ({
        title: item.title,
        url: item.url,
        overall_score: item.relevance_score || 0,
      })),
    });
  }

  const excerpt = normalizeWhitespace(entry.summary || entry.result_excerpt);
  return buildShareBodyByFamily({
    title: entry.title,
    body,
    target,
    family,
    excerpt,
  });
}

export function buildHistoryCopyText(entry: RecentRunEntry, activeTab: DiscoverExportView = "report") {
  if (entry.mode !== "discover" || activeTab === "report") {
    return entry.result_text;
  }
  return buildHistoryBriefDirectText(entry, classifyStyleProfile(entry.style_snapshot), "wechat");
}

export function buildPreferredTransformCopyText(
  result: TransformResponse,
  styleProfile?: StyleSkillProfile | null,
) {
  const family = classifyStyleProfile(styleProfile);
  return buildTransformShareText(result, getRecommendedShareTarget(family, "transform"), styleProfile);
}

export function buildDiscoverCopyText(
  result: DiscoverResponse,
  styleProfile?: StyleSkillProfile | null,
  activeTab: DiscoverExportView = "report",
) {
  const family = classifyStyleProfile(styleProfile);
  if (activeTab === "report") {
    return normalizeResultText(result.transformed_text);
  }
  return buildDiscoverBriefDirectText(result, family, "wechat");
}

export function buildPreferredDiscoverCopyText(
  result: DiscoverResponse,
  styleProfile?: StyleSkillProfile | null,
  activeTab: DiscoverExportView = "report",
) {
  const family = classifyStyleProfile(styleProfile);
  const target = getRecommendedShareTarget(family, activeTab);
  return buildDiscoverShareText(result, target, styleProfile, activeTab);
}

export function buildPreferredHistoryCopyText(entry: RecentRunEntry, activeTab: DiscoverExportView = "report") {
  const family = classifyStyleProfile(entry.style_snapshot);
  const view: PreferredDeliverableView = entry.mode === "discover" ? activeTab : "transform";
  const target = getRecommendedShareTarget(family, view);
  return buildHistoryShareText(entry, target, activeTab);
}

export function exportHtmlToPdf(title: string, html: string, family: StyleFamily = "default") {
  const content = buildPrintableHtml(title, html, family);
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

export function exportTransformResultPdf(result: TransformResponse, styleProfile?: StyleSkillProfile | null) {
  const title = result.title || "VibeShift 导出";
  const family = classifyStyleProfile(styleProfile);
  const exportText = buildPreferredTransformCopyText(result, styleProfile);
  const html = renderStyledPrintableHtml(stripLeadingRichTitle(exportText), family);
  exportHtmlToPdf(title, html, family);
}

export function exportDiscoverResultPdf(
  result: DiscoverResponse,
  styleProfile?: StyleSkillProfile | null,
  activeTab: DiscoverExportView = "report",
) {
  const title = result.title || "VibeShift 调研导出";
  const family = classifyStyleProfile(styleProfile);
  const exportText =
    activeTab === "brief"
      ? buildDiscoverBriefDirectText(result, family, "wechat")
      : normalizeResultText(result.transformed_text);
  const html = renderStyledPrintableHtml(stripLeadingRichTitle(exportText), family);
  exportHtmlToPdf(title, html, family);
}

export function exportHistoryResultPdf(entry: RecentRunEntry, activeTab: DiscoverExportView = "report") {
  const title = entry.title || "VibeShift 历史结果";
  const family = classifyStyleProfile(entry.style_snapshot);
  const exportText =
    entry.mode === "discover"
      ? activeTab === "brief"
        ? buildHistoryBriefDirectText(entry, family, "wechat")
        : normalizeResultText(entry.result_text)
      : buildPreferredHistoryCopyText(entry, activeTab);
  const html = renderStyledPrintableHtml(normalizeResultText(exportText), family);
  exportHtmlToPdf(title, html, family);
}

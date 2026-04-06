import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const MARKDOWN_CACHE_MAX_ENTRIES = 16;
const markdownHtmlCache = new Map<string, string>();
const htmlSanitizeCache = new Map<string, string>();
const HTML_DETECTION_PATTERN = /<(html|body|main|article|section|div|h1|h2|h3|p|ul|ol|li|table|blockquote|pre|code|img|figure|header|footer|span)\b/i;
const MARKDOWN_H1_PATTERN = /^\s*#\s+.+(?:\n+|$)/;
const PRETEXT_BLOCK_PATTERN = /```pretext\s+(stats|chart|flow)\s*\n([\s\S]*?)```/gi;

type PretextStatsBlock = {
  items?: Array<{ label?: string; value?: string | number; note?: string }>;
};

type PretextChartBlock = {
  title?: string;
  unit?: string;
  items?: Array<{ label?: string; value?: number | string; note?: string }>;
};

type PretextFlowBlock = {
  title?: string;
  steps?: Array<{ title?: string; detail?: string }>;
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parsePretextPayload<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function renderPretextStats(raw: string) {
  const payload = parsePretextPayload<PretextStatsBlock>(raw);
  const items = (payload?.items || [])
    .map((item) => ({
      label: String(item?.label || "").trim(),
      value: String(item?.value ?? "").trim(),
      note: String(item?.note || "").trim(),
    }))
    .filter((item) => item.label && item.value)
    .slice(0, 6);
  if (!items.length) {
    return `<pre class="pretext-raw">${escapeHtml(raw.trim())}</pre>`;
  }
  return [
    '<section class="pretext-block pretext-stats">',
    items
      .map(
        (item) =>
          `<article class="pretext-stat-card"><span class="pretext-stat-label">${escapeHtml(item.label)}</span><strong class="pretext-stat-value">${escapeHtml(item.value)}</strong>${item.note ? `<span class="pretext-stat-note">${escapeHtml(item.note)}</span>` : ""}</article>`,
      )
      .join(""),
    "</section>",
  ].join("");
}

function renderPretextChart(raw: string) {
  const payload = parsePretextPayload<PretextChartBlock>(raw);
  const items = (payload?.items || [])
    .map((item) => ({
      label: String(item?.label || "").trim(),
      value: Number(item?.value ?? 0),
      note: String(item?.note || "").trim(),
    }))
    .filter((item) => item.label && Number.isFinite(item.value))
    .slice(0, 8);
  if (!items.length) {
    return `<pre class="pretext-raw">${escapeHtml(raw.trim())}</pre>`;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  const title = String(payload?.title || "").trim();
  const unit = String(payload?.unit || "").trim();
  return [
    '<section class="pretext-block pretext-chart">',
    title
      ? `<header class="pretext-block-head"><strong>${escapeHtml(title)}</strong>${unit ? `<span>${escapeHtml(unit)}</span>` : ""}</header>`
      : "",
    '<div class="pretext-chart-list">',
    items
      .map((item) => {
        const percent = Math.max(8, Math.round((item.value / max) * 100));
        return `<article class="pretext-chart-row"><div class="pretext-chart-meta"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(unit ? `${item.value}${unit}` : String(item.value))}</strong></div><div class="pretext-chart-track"><span class="pretext-chart-bar" style="width:${percent}%"></span></div>${item.note ? `<div class="pretext-chart-note">${escapeHtml(item.note)}</div>` : ""}</article>`;
      })
      .join(""),
    "</div>",
    "</section>",
  ].join("");
}

function renderPretextFlow(raw: string) {
  const payload = parsePretextPayload<PretextFlowBlock>(raw);
  const steps = (payload?.steps || [])
    .map((item) => ({
      title: String(item?.title || "").trim(),
      detail: String(item?.detail || "").trim(),
    }))
    .filter((item) => item.title)
    .slice(0, 8);
  if (!steps.length) {
    return `<pre class="pretext-raw">${escapeHtml(raw.trim())}</pre>`;
  }
  const title = String(payload?.title || "").trim();
  return [
    '<section class="pretext-block pretext-flow">',
    title ? `<header class="pretext-block-head"><strong>${escapeHtml(title)}</strong></header>` : "",
    '<div class="pretext-flow-list">',
    steps
      .map(
        (item, index) =>
          `<article class="pretext-flow-step"><span class="pretext-flow-index">${index + 1}</span><div class="pretext-flow-body"><strong>${escapeHtml(item.title)}</strong>${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}</div></article>`,
      )
      .join(""),
    "</div>",
    "</section>",
  ].join("");
}

function preprocessPretextBlocks(markdown: string): string {
  return markdown.replace(PRETEXT_BLOCK_PATTERN, (_match, rawType, rawPayload) => {
    const type = String(rawType || "").toLowerCase();
    const payload = String(rawPayload || "");
    if (type === "stats") return renderPretextStats(payload);
    if (type === "chart") return renderPretextChart(payload);
    if (type === "flow") return renderPretextFlow(payload);
    return `<pre class="pretext-raw">${escapeHtml(payload.trim())}</pre>`;
  });
}

function readCachedHtml(markdown: string) {
  const cached = markdownHtmlCache.get(markdown);
  if (cached === undefined) return null;
  markdownHtmlCache.delete(markdown);
  markdownHtmlCache.set(markdown, cached);
  return cached;
}

function writeCachedHtml(markdown: string, html: string) {
  markdownHtmlCache.set(markdown, html);
  if (markdownHtmlCache.size <= MARKDOWN_CACHE_MAX_ENTRIES) return;
  const oldestKey = markdownHtmlCache.keys().next().value;
  if (oldestKey) {
    markdownHtmlCache.delete(oldestKey);
  }
}

export function renderMarkdownToHtml(markdown: string): string {
  const raw = (markdown || "").trim();
  if (!raw) return "";
  const cached = readCachedHtml(raw);
  if (cached != null) return cached;
  const html = marked.parse(preprocessPretextBlocks(raw)) as string;
  const sanitized = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  writeCachedHtml(raw, sanitized);
  return sanitized;
}

export function sanitizeHtml(html: string): string {
  const raw = (html || "").trim();
  if (!raw) return "";
  const cached = readCachedHtml(`html:${raw}`) ?? htmlSanitizeCache.get(raw);
  if (cached != null) return cached;
  const sanitized = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  htmlSanitizeCache.set(raw, sanitized);
  if (htmlSanitizeCache.size > MARKDOWN_CACHE_MAX_ENTRIES) {
    const oldestKey = htmlSanitizeCache.keys().next().value;
    if (oldestKey) htmlSanitizeCache.delete(oldestKey);
  }
  return sanitized;
}

export function detectRichTextFormat(content: string): "html" | "markdown" | "text" {
  const raw = (content || "").trim();
  if (!raw) return "text";
  const hasHtml = HTML_DETECTION_PATTERN.test(raw);
  const hasMarkdown = /^#{1,6}\s|\n[-*]\s|\n\d+\.\s|```|^\|.+\|/m.test(raw);
  if (hasHtml && hasMarkdown) return "markdown";
  if (hasHtml) return "html";
  if (hasMarkdown) return "markdown";
  return "text";
}

export function renderRichTextToHtml(content: string): string {
  const format = detectRichTextFormat(content);
  if (format === "html") return sanitizeHtml(content);
  return renderMarkdownToHtml(content);
}

export function stripLeadingRichTitle(content: string): string {
  const raw = String(content || "").trim();
  if (!raw) return "";
  const format = detectRichTextFormat(raw);
  if (format === "html") {
    return raw.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, "").trim();
  }
  if (format === "markdown") {
    return raw.replace(MARKDOWN_H1_PATTERN, "").trim();
  }
  return raw;
}

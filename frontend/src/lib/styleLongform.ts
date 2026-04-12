import { stripLeadingRichTitle } from "./markdown";
import { classifyStyleProfile, type StyleFamily } from "./stylePresentation";
import type { StyleSkillProfile } from "../types";

export interface LongformGuideItem {
  label: string;
  text: string;
}

export interface LongformGuide {
  introLabel: string;
  introText: string;
  highlightTitle: string;
  highlights: LongformGuideItem[];
  sectionTitle: string;
  sections: string[];
  closingLabel: string;
  closingText: string;
}

const DIALOGUE_PATTERN = /^(问|答|Q|A|主持人|嘉宾|采访者|受访者|提问者|回答者)\s*[：:]\s*(.+)$/i;
const CLOSING_HINT_PATTERN = /(最后|总之|归根结底|写在最后|说到底|因此|所以|谢谢|此致|祝好|愿|希望|让我们|写到这里)/i;

function normalizeWhitespace(value: string) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function clampText(value: string, maxLength = 72) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function splitBlocks(markdown: string) {
  return normalizeWhitespace(markdown)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripMarkdown(value: string) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(markdown: string) {
  return normalizeWhitespace(markdown)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => clampText(stripMarkdown(line), 36))
    .filter(Boolean);
}

function extractBullets(markdown: string) {
  return normalizeWhitespace(markdown)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^([-*+]\s+|\d+\.\s+)/.test(line))
    .map((line) => clampText(stripMarkdown(line), 48))
    .filter(Boolean);
}

function extractDialogues(markdown: string) {
  return normalizeWhitespace(markdown)
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const matched = line.match(DIALOGUE_PATTERN);
      if (!matched) return null;
      return {
        label: matched[1],
        text: clampText(matched[2], 52),
      };
    })
    .filter((item): item is LongformGuideItem => !!item);
}

function extractParagraphs(markdown: string) {
  return splitBlocks(markdown)
    .map((block) => clampText(stripMarkdown(block), 72))
    .filter((item) => item.length >= 10);
}

function dedupeStrings(items: string[], limit: number) {
  return items.filter((item, index) => item && items.indexOf(item) === index).slice(0, limit);
}

function buildGuideItems(items: string[], labels: string[]) {
  return dedupeStrings(items, labels.length || items.length).map((text, index) => ({
    label: labels[index] || `重点 ${index + 1}`,
    text,
  }));
}

function pickClosingText(paragraphs: string[], headings: string[]) {
  return paragraphs.find((item) => CLOSING_HINT_PATTERN.test(item)) || paragraphs[paragraphs.length - 1] || headings[headings.length - 1] || "";
}

function labelsForFamily(family: StyleFamily) {
  switch (family) {
    case "interview":
    case "podcast":
      return {
        introLabel: "开场提要",
        highlightTitle: "关键问答",
        sectionTitle: "对谈脉络",
        closingLabel: "收束一句",
        highlightLabels: ["问", "答", "追问", "回看"],
      };
    case "manual":
      return {
        introLabel: "上手导读",
        highlightTitle: "执行抓手",
        sectionTitle: "操作顺序",
        closingLabel: "完成检查",
        highlightLabels: ["先准备", "开始做", "检查点", "排错"],
      };
    case "science":
      return {
        introLabel: "先讲明白",
        highlightTitle: "理解抓手",
        sectionTitle: "解释顺序",
        closingLabel: "最后记住",
        highlightLabels: ["核心问题", "关键原理", "常见误区", "现实意义"],
      };
    case "kids":
    case "plain":
      return {
        introLabel: "上手导读",
        highlightTitle: "关键信息",
        sectionTitle: "阅读顺序",
        closingLabel: "最后提醒",
        highlightLabels: ["先知道", "怎么理解", "怎么使用", "记得注意"],
      };
    case "editorial":
    case "newspaper":
    case "paper":
      return {
        introLabel: "导语判断",
        highlightTitle: "论证抓手",
        sectionTitle: "论证推进",
        closingLabel: "结尾落点",
        highlightLabels: ["核心判断", "事实依据", "分析推进", "建议落点"],
      };
    case "speech":
      return {
        introLabel: "开场定调",
        highlightTitle: "演讲要点",
        sectionTitle: "推进节奏",
        closingLabel: "收束落点",
        highlightLabels: ["开场主张", "核心论点", "例证转折", "结尾号召"],
      };
    case "letter":
      return {
        introLabel: "来信导读",
        highlightTitle: "信中重点",
        sectionTitle: "行文脉络",
        closingLabel: "信尾心意",
        highlightLabels: ["缘起", "重点", "叮嘱", "致意"],
      };
    case "book":
    case "story":
    case "classical":
    case "elegant":
    case "documentary":
      return {
        introLabel: "开篇导读",
        highlightTitle: "阅读抓手",
        sectionTitle: "章节脉络",
        closingLabel: "收束余味",
        highlightLabels: ["主线", "层次", "转折", "落点"],
      };
    default:
      return {
        introLabel: "开篇导读",
        highlightTitle: "关键信息",
        sectionTitle: "内容分段",
        closingLabel: "最后落点",
        highlightLabels: ["重点 1", "重点 2", "重点 3", "重点 4"],
      };
  }
}

export function buildLongformGuide(content: string, styleProfile?: StyleSkillProfile | null): LongformGuide {
  const family = classifyStyleProfile(styleProfile);
  const cleaned = stripLeadingRichTitle(content);
  const headings = extractHeadings(cleaned);
  const bullets = extractBullets(cleaned);
  const dialogues = extractDialogues(cleaned);
  const paragraphs = extractParagraphs(cleaned);
  const labels = labelsForFamily(family);

  let introText = paragraphs[0] || headings[0] || "";
  let highlights: LongformGuideItem[] = [];
  let sections: string[] = [];
  let closingText = pickClosingText(paragraphs, headings);

  switch (family) {
    case "interview":
    case "podcast":
      introText = dialogues[0]?.text || paragraphs[0] || headings[0] || "";
      highlights = dialogues.slice(0, 4);
      sections = dedupeStrings([
        ...dialogues.slice(0, 4).map((item) => `${item.label}：${item.text}`),
        ...headings,
      ], 4);
      closingText = dialogues[dialogues.length - 1]?.text || closingText;
      break;
    case "editorial":
    case "newspaper":
    case "paper":
      introText = paragraphs[0] || headings[0] || "";
      highlights = buildGuideItems([...headings, ...bullets, ...paragraphs.slice(1, 5)], labels.highlightLabels);
      sections = dedupeStrings([...headings, ...paragraphs.slice(1, 6)], 5);
      closingText = pickClosingText(paragraphs.slice(1), headings) || paragraphs[paragraphs.length - 1] || "";
      break;
    case "speech":
      introText = paragraphs[0] || headings[0] || "";
      highlights = buildGuideItems([...headings, ...paragraphs.slice(0, 4)], labels.highlightLabels);
      sections = dedupeStrings([...headings, ...paragraphs.slice(1, 6)], 5);
      closingText = pickClosingText(paragraphs, headings);
      break;
    case "letter":
      introText = paragraphs[0] || headings[0] || "";
      highlights = buildGuideItems([...paragraphs.slice(1, 5), ...headings], labels.highlightLabels);
      sections = dedupeStrings([...headings, ...paragraphs.slice(1, 6)], 5);
      closingText = pickClosingText(paragraphs, headings);
      break;
    case "manual":
      introText = paragraphs[0] || bullets[0] || headings[0] || "";
      highlights = buildGuideItems([...bullets, ...paragraphs.slice(1, 5), ...headings], labels.highlightLabels);
      sections = dedupeStrings([...headings, ...bullets], 5);
      closingText = pickClosingText(paragraphs, headings) || bullets[bullets.length - 1] || "";
      break;
    case "science":
    case "kids":
    case "plain":
      introText = paragraphs[0] || bullets[0] || headings[0] || "";
      highlights = buildGuideItems([...bullets, ...paragraphs, ...headings], labels.highlightLabels);
      sections = dedupeStrings([...headings, ...bullets], 5);
      closingText = pickClosingText(paragraphs, headings) || bullets[bullets.length - 1] || "";
      break;
    case "book":
    case "story":
    case "classical":
    case "elegant":
    case "documentary":
      introText = paragraphs[0] || headings[0] || "";
      highlights = buildGuideItems([...headings, ...paragraphs.slice(0, 5)], labels.highlightLabels);
      sections = dedupeStrings([...headings, ...paragraphs.slice(1, 5)], 5);
      closingText = pickClosingText(paragraphs, headings);
      break;
    default:
      introText = paragraphs[0] || bullets[0] || headings[0] || "";
      highlights = buildGuideItems([...bullets, ...headings, ...paragraphs.slice(0, 4)], labels.highlightLabels);
      sections = dedupeStrings([...headings, ...paragraphs.slice(1, 5)], 5);
      closingText = pickClosingText(paragraphs, headings);
      break;
  }

  return {
    introLabel: labels.introLabel,
    introText,
    highlightTitle: labels.highlightTitle,
    highlights,
    sectionTitle: labels.sectionTitle,
    sections,
    closingLabel: labels.closingLabel,
    closingText,
  };
}

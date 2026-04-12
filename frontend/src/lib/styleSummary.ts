import { stripLeadingRichTitle } from "./markdown";
import { classifyStyleProfile, getResultFocusPresentation, type StyleFamily } from "./stylePresentation";
import type { DiscoverResponse, StyleSkillProfile, TransformResponse } from "../types";

export interface FocusSummary {
  lead: string;
  bullets: string[];
}

export type DiscoverDetailSection = "evidence" | "sources" | "uncertainties" | "outline";
export type SummaryRenderMode = "list" | "cards" | "dialogue" | "steps" | "chapters";

export interface SummaryRenderItem {
  eyebrow: string;
  text: string;
}

export interface SummaryRenderBlock {
  mode: SummaryRenderMode;
  items: SummaryRenderItem[];
}

function stripSummaryMarkdown(value: string) {
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

function clampText(value: string, maxLength: number) {
  const raw = String(value || "").trim();
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function splitSummarySentences(value: string) {
  return String(value || "")
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12);
}

function splitMarkdownParagraphs(markdown: string): string[] {
  const cleaned = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const lines = cleaned.split("\n");
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  let inFence = false;
  let fenceMarker: "```" | "~~~" | null = null;

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text) paragraphs.push(text);
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(```|~~~)/);
    if (fenceMatch) {
      const marker = fenceMatch[2] as "```" | "~~~";
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
        inFence = false;
        fenceMarker = null;
      }
      buffer.push(line);
      continue;
    }

    if (!inFence && !line.trim()) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return paragraphs;
}

function extractHeadingCandidates(markdown: string) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => stripSummaryMarkdown(line))
    .filter((line) => line.length >= 6);
}

function extractBulletLines(markdown: string) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^([-*+]\s+|\d+\.\s+)/.test(line))
    .map((line) => stripSummaryMarkdown(line))
    .filter((line) => line.length >= 8);
}

function extractDialogueCandidates(paragraphs: string[]) {
  return paragraphs
    .flatMap((item) => item.split("\n").map((line) => line.trim()))
    .filter(Boolean)
    .filter(
      (line) =>
        /^(q|a|问|答|主持人|嘉宾|采访者|受访者|提问者|回答者)[：: ]/i.test(line) ||
        (/[:：]/.test(line) && /[?？]/.test(line.slice(0, 18))),
    )
    .map((line) => clampText(stripSummaryMarkdown(line), 60));
}

function extractStepCandidates(paragraphs: string[], bulletLines: string[]) {
  const stepParagraphs = paragraphs
    .filter((item) => /步骤|step|前置条件|第[一二三四五六七八九十\d]+步|操作|排错|提醒/.test(item))
    .flatMap((item) => (splitSummarySentences(item).length ? splitSummarySentences(item) : [item]));
  return [...bulletLines, ...stepParagraphs]
    .map((item) => clampText(stripSummaryMarkdown(item), 60))
    .filter((item) => item.length >= 10);
}

function extractDecisionCandidates(paragraphs: string[], bulletLines: string[], headingLines: string[]) {
  const priorityKeywords = /结论|建议|风险|判断|导语|要点|重点|方案/;
  return [...bulletLines, ...headingLines, ...paragraphs.flatMap((item) => splitSummarySentences(item))]
    .map((item) => clampText(stripSummaryMarkdown(item), 60))
    .filter((item) => item.length >= 10 && priorityKeywords.test(item));
}

function extractCardCandidates(paragraphs: string[], bulletLines: string[], headingLines: string[]) {
  return [...bulletLines, ...headingLines, ...paragraphs.flatMap((item) => splitSummarySentences(item))]
    .map((item) => clampText(stripSummaryMarkdown(item), 48))
    .filter((item) => item.length >= 8);
}

function extractChapterCandidates(paragraphs: string[], headingLines: string[]) {
  const chapterParagraphs = paragraphs
    .filter((item) => /章节|一章|二章|三章|第一部分|第二部分|总结/.test(item))
    .flatMap((item) => splitSummarySentences(item).slice(0, 2));
  return [...headingLines, ...chapterParagraphs]
    .map((item) => clampText(stripSummaryMarkdown(item), 60))
    .filter((item) => item.length >= 8);
}

function extractScienceCandidates(paragraphs: string[], bulletLines: string[]) {
  return [...bulletLines, ...paragraphs.flatMap((item) => splitSummarySentences(item))]
    .map((item) => clampText(stripSummaryMarkdown(item), 60))
    .filter((item) => item.length >= 10)
    .filter((item) => /原理|误区|为什么|怎么回事|解释|类比|提醒/.test(item));
}

function cleanExcerptForSummary(rawExcerpt: string) {
  return String(rawExcerpt || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "---" && !/^(title|url|hostname|description|sitename|date|tags|author|published|language|category)\s*:/i.test(line))
    .filter((line) => !/^https?:\/\//i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(items: string[], lead = "") {
  return items.filter((item, index, list) => item.length >= 8 && list.indexOf(item) === index && item !== lead);
}

function dedupeLoose(items: string[], lead = "", minLength = 4) {
  return items.filter((item, index, list) => item.length >= minLength && list.indexOf(item) === index && item !== lead);
}

export function getSummaryRenderMode(family: StyleFamily): SummaryRenderMode {
  switch (family) {
    case "interview":
    case "podcast":
      return "dialogue";
    case "manual":
    case "science":
    case "kids":
    case "plain":
      return "steps";
    case "poster":
    case "snack":
    case "briefing":
    case "decision":
    case "newspaper":
    case "editorial":
    case "paper":
      return "cards";
    case "book":
    case "story":
    case "classical":
    case "elegant":
    case "letter":
      return "chapters";
    default:
      return "list";
  }
}

function buildRenderItems(items: string[], mode: SummaryRenderMode): SummaryRenderItem[] {
  return items
    .filter(Boolean)
    .map((item, index) => {
      const normalized = clampText(stripSummaryMarkdown(item), 72);
      if (!normalized) return null;

      if (mode === "dialogue") {
        const matched = normalized.match(/^([^：:]{1,14})[：:]\s*(.+)$/);
        return {
          eyebrow: matched?.[1]?.trim() || `片段 ${index + 1}`,
          text: matched?.[2]?.trim() || normalized,
        };
      }
      if (mode === "steps") {
        return { eyebrow: `步骤 ${index + 1}`, text: normalized };
      }
      if (mode === "chapters") {
        return { eyebrow: `段落 ${index + 1}`, text: normalized };
      }
      if (mode === "cards") {
        return { eyebrow: `重点 ${index + 1}`, text: normalized };
      }
      return { eyebrow: `要点 ${index + 1}`, text: normalized };
    })
    .filter((item): item is SummaryRenderItem => !!item);
}

function buildLead(
  family: StyleFamily,
  paragraphs: string[],
  headingLines: string[],
  dialogueCandidates: string[],
  decisionCandidates: string[],
  scienceCandidates: string[],
  chapterCandidates: string[],
  excerpt: string,
  cleanedBody: string,
) {
  switch (family) {
    case "interview":
    case "podcast":
      return dialogueCandidates[0] || paragraphs[0] || excerpt || cleanedBody;
    case "science":
      return scienceCandidates[0] || paragraphs.find((item) => /原理|为什么|怎么回事|误区/.test(item)) || paragraphs[0] || excerpt || cleanedBody;
    case "poster":
    case "snack":
    case "briefing":
    case "decision":
    case "newspaper":
    case "editorial":
      return decisionCandidates[0] || headingLines[0] || paragraphs[0] || excerpt || cleanedBody;
    case "book":
      return chapterCandidates[0] || headingLines[0] || paragraphs[0] || excerpt || cleanedBody;
    case "story":
    case "poetry":
    case "classical":
    case "elegant":
    case "letter":
      return paragraphs[0] || excerpt || cleanedBody;
    default:
      return paragraphs[0] || excerpt || cleanedBody;
  }
}

export function buildTransformFocusSummary(result: TransformResponse | null, styleProfile?: StyleSkillProfile | null): FocusSummary {
  const presentation = getResultFocusPresentation(styleProfile);
  const family = classifyStyleProfile(styleProfile);
  if (!result) return { lead: "", bullets: [] };

  const normalizedBody = stripLeadingRichTitle(result.transformed_text);
  const cleanedBody = stripSummaryMarkdown(normalizedBody);
  const paragraphs = splitMarkdownParagraphs(normalizedBody)
    .map((item) => stripSummaryMarkdown(item))
    .filter((item) => item.length >= 16);
  const bulletLines = extractBulletLines(normalizedBody);
  const headingLines = extractHeadingCandidates(normalizedBody);
  const dialogueCandidates = extractDialogueCandidates(paragraphs);
  const stepCandidates = extractStepCandidates(paragraphs, bulletLines);
  const decisionCandidates = extractDecisionCandidates(paragraphs, bulletLines, headingLines);
  const cardCandidates = extractCardCandidates(paragraphs, bulletLines, headingLines);
  const chapterCandidates = extractChapterCandidates(paragraphs, headingLines);
  const scienceCandidates = extractScienceCandidates(paragraphs, bulletLines);
  const excerpt = cleanExcerptForSummary(result.raw_excerpt);
  const lead = clampText(
    stripSummaryMarkdown(
      buildLead(family, paragraphs, headingLines, dialogueCandidates, decisionCandidates, scienceCandidates, chapterCandidates, excerpt, cleanedBody),
    ),
    120,
  );

  const sentenceCandidates = paragraphs.flatMap((item) => splitSummarySentences(item)).map((item) => clampText(item, 54));
  let bullets: string[] = [];

  switch (family) {
    case "interview":
    case "podcast":
      bullets = dedupe([...dialogueCandidates, ...headingLines, ...sentenceCandidates], lead).slice(0, 3);
      break;
    case "manual":
    case "kids":
    case "plain":
      bullets = dedupe([...stepCandidates, ...sentenceCandidates, ...headingLines], lead).slice(0, 4);
      break;
    case "science":
      bullets = dedupe([...scienceCandidates, ...stepCandidates, ...headingLines, ...sentenceCandidates], lead).slice(0, 4);
      break;
    case "poster":
    case "snack":
      bullets = dedupe([...cardCandidates, ...decisionCandidates, ...headingLines], lead).slice(0, 4);
      break;
    case "briefing":
    case "decision":
    case "newspaper":
    case "editorial":
      bullets = dedupe([...decisionCandidates, ...cardCandidates, ...headingLines], lead).slice(0, 3);
      break;
    case "book":
      bullets = dedupe([...chapterCandidates, ...headingLines, ...sentenceCandidates], lead).slice(0, 4);
      break;
    default:
      bullets = dedupe(
        [
          ...(presentation.summaryMode === "dialogue"
            ? dialogueCandidates
            : presentation.summaryMode === "steps"
              ? stepCandidates
              : bulletLines),
          ...headingLines,
          ...sentenceCandidates,
        ],
        lead,
      ).slice(0, presentation.summaryMode === "steps" ? 4 : presentation.summaryMode === "dialogue" ? 2 : 3);
      break;
  }

  if (presentation.summaryMode === "narrative") {
    bullets = family === "book" ? bullets.slice(0, 2) : [];
  }

  return { lead, bullets };
}

export function buildTransformHighlightBlock(
  result: TransformResponse | null,
  styleProfile?: StyleSkillProfile | null,
): SummaryRenderBlock {
  const family = classifyStyleProfile(styleProfile);
  const summary = buildTransformFocusSummary(result, styleProfile);
  const mode = getSummaryRenderMode(family);
  const sourceItems = summary.bullets.length ? summary.bullets : summary.lead ? [summary.lead] : [];
  return {
    mode,
    items: buildRenderItems(sourceItems, mode),
  };
}

export function buildDiscoverQuickView(result: DiscoverResponse, styleProfile?: StyleSkillProfile | null): FocusSummary {
  const family = classifyStyleProfile(styleProfile);
  const normalizedBody = stripLeadingRichTitle(result.transformed_text);
  const paragraphs = splitMarkdownParagraphs(normalizedBody).map((item) => stripSummaryMarkdown(item)).filter((item) => item.length >= 16);
  const headingLines = extractHeadingCandidates(normalizedBody);
  const bulletLines = extractBulletLines(normalizedBody);
  const dialogueCandidates = extractDialogueCandidates(paragraphs);
  const chapterCandidates = extractChapterCandidates(paragraphs, headingLines);
  const scienceCandidates = extractScienceCandidates(paragraphs, bulletLines);
  const decisionCandidates = extractDecisionCandidates(paragraphs, bulletLines, headingLines);
  const lead = clampText(stripSummaryMarkdown(result.brief.conclusion || result.brief.summary || result.title), 120);

  const findingBullets = result.brief.key_findings.map((item) => clampText(stripSummaryMarkdown(item), 54));
  const uncertaintyBullets = result.brief.uncertainties.map((item) => clampText(stripSummaryMarkdown(item), 54));
  const outlineBullets = result.brief.draft_outline.map((item) => clampText(stripSummaryMarkdown(item), 54));
  const evidenceBullets = result.brief.evidence.map((item) => clampText(stripSummaryMarkdown(item.quote || item.evidence || item.title), 54));

  let bullets: string[];
  switch (family) {
    case "interview":
    case "podcast":
      bullets = dedupe([...dialogueCandidates, ...outlineBullets, ...findingBullets], lead).slice(0, 3);
      break;
    case "book":
      bullets = dedupe([...chapterCandidates, ...outlineBullets, ...findingBullets], lead).slice(0, 4);
      break;
    case "science":
      bullets = dedupe([...scienceCandidates, ...findingBullets, ...uncertaintyBullets], lead).slice(0, 4);
      break;
    case "poster":
    case "snack":
      bullets = dedupe([...findingBullets, ...decisionCandidates, ...evidenceBullets], lead).slice(0, 4);
      break;
    case "briefing":
    case "decision":
    case "editorial":
    case "newspaper":
      bullets = dedupe([...findingBullets, ...uncertaintyBullets, ...evidenceBullets], lead).slice(0, 3);
      break;
    case "manual":
    case "kids":
    case "plain":
      bullets = dedupe([...outlineBullets, ...findingBullets, ...uncertaintyBullets], lead).slice(0, 4);
      break;
    default:
      bullets = dedupe([...findingBullets, ...evidenceBullets, ...outlineBullets], lead).slice(0, 3);
      break;
  }

  return { lead, bullets };
}

export function buildDiscoverBriefHighlights(
  result: DiscoverResponse,
  styleProfile?: StyleSkillProfile | null,
): SummaryRenderBlock {
  const family = classifyStyleProfile(styleProfile);
  const mode = getSummaryRenderMode(family);
  const outlineItems = result.brief.draft_outline.map((item) => clampText(stripSummaryMarkdown(item), 72));
  const findingItems = result.brief.key_findings.map((item) => clampText(stripSummaryMarkdown(item), 72));
  const uncertaintyItems = result.brief.uncertainties.map((item) => clampText(stripSummaryMarkdown(item), 72));
  const evidenceItems = result.brief.evidence.map((item) => clampText(stripSummaryMarkdown(item.quote || item.evidence || item.title), 72));

  let items: string[];
  switch (family) {
    case "interview":
    case "podcast":
      items = dedupeLoose([...outlineItems, ...findingItems, ...evidenceItems], "", 3).slice(0, 4);
      break;
    case "manual":
    case "science":
    case "kids":
    case "plain":
      items = dedupe([...outlineItems, ...findingItems, ...uncertaintyItems]).slice(0, 4);
      break;
    case "book":
    case "story":
    case "classical":
    case "letter":
    case "elegant":
      items = dedupe([...outlineItems, ...findingItems, ...evidenceItems]).slice(0, 4);
      break;
    case "poster":
    case "snack":
    case "briefing":
    case "decision":
    case "newspaper":
    case "editorial":
    case "paper":
      items = dedupe([...findingItems, ...uncertaintyItems, ...evidenceItems]).slice(0, 4);
      break;
    default:
      items = dedupe([...findingItems, ...outlineItems, ...evidenceItems]).slice(0, 3);
      break;
  }

  return {
    mode,
    items: buildRenderItems(items, mode),
  };
}

export function getDiscoverDetailOrder(styleProfile?: StyleSkillProfile | null): DiscoverDetailSection[] {
  const layout = styleProfile?.layout_format || "auto";
  if (layout === "book") return ["outline", "evidence", "sources", "uncertainties"];
  if (layout === "poster") return ["uncertainties", "evidence", "outline", "sources"];
  if (layout === "paper" || layout === "newspaper") return ["evidence", "sources", "uncertainties", "outline"];

  switch (classifyStyleProfile(styleProfile)) {
    case "briefing":
    case "decision":
    case "poster":
    case "snack":
      return ["uncertainties", "evidence", "outline", "sources"];
    case "science":
    case "paper":
    case "newspaper":
    case "editorial":
      return ["evidence", "sources", "uncertainties", "outline"];
    case "interview":
    case "podcast":
    case "story":
    case "book":
    case "letter":
      return ["outline", "evidence", "sources", "uncertainties"];
    case "manual":
    case "kids":
    case "plain":
      return ["outline", "uncertainties", "evidence", "sources"];
    default:
      return ["evidence", "sources", "uncertainties", "outline"];
  }
}

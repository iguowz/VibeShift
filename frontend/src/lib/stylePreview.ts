import { getDiscoverReportPresentation, getResultFocusPresentation } from "./stylePresentation";
import type { DetectedMode, StylePreviewItem, StyleTemplate } from "../types";

export interface StylePreviewCard {
  styleId: string;
  name: string;
  reason: string;
  score: number;
  source: "llm" | "heuristic";
  structure: string;
  emphasis: string[];
  displayHeading: string;
  displayForm: string;
  workflowHeading: string;
  workflowSteps: string[];
  previewText: string;
  previewFocusPoints: string[];
  outcomeText: string;
  fitText: string;
  approachText: string;
  focusText: string;
}

function buildOutcomeText(mode: DetectedMode, displayForm: string) {
  if (mode === "discover") {
    return `会产出更接近${displayForm}的简报与详文，拿到后就能直接使用。`;
  }
  return `会把这段内容整理成更接近${displayForm}的成稿，拿到后就能直接使用。`;
}

function buildFitText(style: StyleTemplate) {
  const parts: string[] = [];
  if (style.audience?.trim()) parts.push(`更适合给${style.audience.trim()}阅读`);
  if (style.tone?.trim()) parts.push(`表达会偏${style.tone.trim()}`);
  return parts.length ? `${parts.join("，")}。` : "";
}

function buildApproachText(structure: string, workflowSteps: string[]) {
  if (structure) {
    return `成稿会沿着“${structure}”的顺序展开。`;
  }
  if (workflowSteps.length) {
    return `写法上通常会${workflowSteps.join("，")}。`;
  }
  return "";
}

function buildFocusText(emphasis: string[]) {
  return emphasis.length ? `会特别突出${emphasis.join("、")}。` : "";
}

export function buildStyleGuideCard(params: {
  mode: DetectedMode;
  style: StyleTemplate;
  reason: string;
  score?: number;
  source?: "llm" | "heuristic";
  preview?: StylePreviewItem | null;
}): StylePreviewCard {
  const presentation =
    params.mode === "discover" ? getDiscoverReportPresentation(params.style) : getResultFocusPresentation(params.style);
  const structure = params.style.structure_template || "按当前风格自然展开";
  const emphasis = params.style.emphasis_points || [];

  return {
    styleId: params.style.id,
    name: params.style.name,
    reason: params.reason,
    score: params.score || 0,
    source: params.source || "heuristic",
    structure,
    emphasis,
    displayHeading: presentation.displayHeading,
    displayForm: presentation.displayForm,
    workflowHeading: presentation.workflowHeading,
    workflowSteps: presentation.workflowSteps,
    previewText: params.preview?.preview_text || "",
    previewFocusPoints: params.preview?.focus_points || [],
    outcomeText: buildOutcomeText(params.mode, presentation.displayForm),
    fitText: buildFitText(params.style),
    approachText: buildApproachText(structure, presentation.workflowSteps),
    focusText: buildFocusText(emphasis),
  };
}

export function buildStylePreviewCards(params: {
  mode: DetectedMode;
  styles: StyleTemplate[];
  candidates: Array<{ styleId: string; reason: string; score: number; source: "llm" | "heuristic" }>;
  previews?: StylePreviewItem[];
  limit?: number;
}): StylePreviewCard[] {
  const previewMap = new Map((params.previews || []).map((item) => [item.style_id, item]));
  const cards: StylePreviewCard[] = [];

  for (const candidate of params.candidates) {
    const style = params.styles.find((item) => item.id === candidate.styleId);
    if (!style || cards.some((item) => item.styleId === style.id)) continue;
    const preview = previewMap.get(style.id);
    cards.push(
      buildStyleGuideCard({
        mode: params.mode,
        style,
        reason: candidate.reason,
        score: candidate.score,
        source: candidate.source,
        preview,
      }),
    );
    if (cards.length >= Math.max(1, params.limit || 4)) break;
  }

  return cards;
}

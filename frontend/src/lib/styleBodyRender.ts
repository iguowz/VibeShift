import { detectRichTextFormat, renderRichTextToHtml, sanitizeHtml } from "./markdown";
import type { SummaryRenderMode } from "./styleSummary";
import type { StyleFamily } from "./stylePresentation";

const DIALOGUE_LINE_PATTERN = /^(问|答|Q|A|主持人|嘉宾|采访者|受访者|提问者|回答者)\s*[：:]\s*(.+)$/i;
const HEADING_ONLY_PATTERN = /^#{1,6}\s+(.+)$/;
const LIST_LINE_PATTERN = /^([-*+]\s+|\d+\.\s+)(.+)$/;
const CLASSICAL_NOTE_PATTERN = /^(题解|纲目|按|按语|题旨)\s*[：:]\s*(.+)$/;
const CLOSING_HINT_PATTERN = /(最后|总之|归根结底|写在最后|说到底|因此|所以|谢谢|此致|祝好|愿|希望|让我们|写到这里)/i;
const STEP_HEADING_PATTERN = /(步骤|操作|做法|流程|上手|怎么做|如何|执行|落地|实施|建议动作)/i;
const INSIGHT_HEADING_PATTERN = /(结论|重点|核心|判断|建议|提醒|误区|注意|先看|风险|收获|为什么|是什么|怎么理解|适用|边界)/i;
const TRANSITION_HINT_PATTERN = /(与此同时|另一方面|换句话说|接下来|回到|更重要的是|也就是说|再往下看|再看|接着|不过|但问题在于|先说|说到这里|从这个角度|然后|此时|下一步)/i;
const LETTER_SIGNATURE_PATTERN = /(此致|祝好|顺颂|敬礼|写信人|落款|敬上|谨上|祝一切顺利)/i;

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDialogueBlock(block: string): string | null {
  const lines = String(block || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const items = lines
    .map((line) => {
      const matched = line.match(DIALOGUE_LINE_PATTERN);
      if (!matched) return null;
      return {
        speaker: matched[1],
        text: matched[2],
      };
    })
    .filter((item): item is { speaker: string; text: string } => !!item);

  if (items.length < 2 || items.length !== lines.length) return null;

  return [
    '<section class="dialogue-render-block">',
    items
      .map(
        (item) =>
          `<article class="dialogue-render-item"><span class="dialogue-render-speaker">${escapeHtml(item.speaker)}</span><div class="dialogue-render-text">${escapeHtml(item.text)}</div></article>`,
      )
      .join(""),
    "</section>",
  ].join("");
}

function renderCardModule(title: string, items: string[]): string {
  return [
    '<section class="body-card-module">',
    title ? `<header class="body-module-head"><strong>${escapeHtml(title)}</strong></header>` : "",
    '<div class="body-card-grid">',
    items
      .map(
        (item) =>
          `<article class="body-card-item"><p>${escapeHtml(item)}</p></article>`,
      )
      .join(""),
    "</div>",
    "</section>",
  ].join("");
}

function renderStepModule(title: string, items: string[]): string {
  return [
    '<section class="body-step-module">',
    title ? `<header class="body-module-head"><strong>${escapeHtml(title)}</strong></header>` : "",
    '<div class="body-step-list">',
    items
      .map(
        (item, index) =>
          `<article class="body-step-item"><span class="body-step-index">${index + 1}</span><div class="body-step-text">${escapeHtml(item)}</div></article>`,
      )
      .join(""),
    "</div>",
    "</section>",
  ].join("");
}

function renderLeadBlock(title: string, bodyHtml: string, variant: string): string {
  return [
    `<section class="body-lead-block body-lead-${variant}">`,
    title ? `<header class="body-lead-head"><strong>${escapeHtml(title)}</strong></header>` : "",
    `<div class="body-lead-body">${bodyHtml}</div>`,
    "</section>",
  ].join("");
}

function renderProseBlock(bodyHtml: string, variant: string): string {
  return [
    `<section class="body-prose-block body-prose-${variant}">`,
    `<div class="body-prose-body">${bodyHtml}</div>`,
    "</section>",
  ].join("");
}

function renderClosingBlock(title: string, bodyHtml: string, variant: string): string {
  return [
    `<section class="body-closing-block body-closing-${variant}">`,
    title ? `<header class="body-closing-head"><strong>${escapeHtml(title)}</strong></header>` : "",
    `<div class="body-closing-body">${bodyHtml}</div>`,
    "</section>",
  ].join("");
}

function renderBridgeBlock(title: string, bodyHtml: string, variant: string): string {
  return [
    `<section class="body-bridge-block body-bridge-${variant}">`,
    title ? `<header class="body-bridge-head"><strong>${escapeHtml(title)}</strong></header>` : "",
    `<div class="body-bridge-body">${bodyHtml}</div>`,
    "</section>",
  ].join("");
}

function renderSectionPreface(bodyHtml: string, variant: string): string {
  return [
    `<section class="body-section-preface body-section-preface-${variant}">`,
    `<div class="body-section-preface-body">${bodyHtml}</div>`,
    "</section>",
  ].join("");
}

function renderSectionModule(title: string, bodyHtml: string, variant: string): string {
  return [
    `<section class="body-section-module body-section-${variant}">`,
    `<header class="body-section-head"><strong>${escapeHtml(title)}</strong></header>`,
    `<div class="body-section-body">${bodyHtml}</div>`,
    "</section>",
  ].join("");
}

function renderLetterClosingBlock(block: string): string {
  const lines = String(block || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] || "";
  const shouldSplit = !!lastLine && (LETTER_SIGNATURE_PATTERN.test(lastLine) || (lines.length >= 2 && lastLine.length <= 8));
  if (!shouldSplit) return renderClosingBlock("", renderRichTextToHtml(block), "letter");

  const body = lines.slice(0, -1).join("\n");
  return [
    '<section class="body-closing-block body-closing-letter body-letter-signoff">',
    body ? `<div class="body-closing-body">${renderRichTextToHtml(body)}</div>` : "",
    `<div class="body-letter-signature">${escapeHtml(lastLine)}</div>`,
    "</section>",
  ].join("");
}

function renderOpeningClosingModule(openingHtml: string, middleHtml: string[], closingHtml: string, variant: string): string {
  return [
    `<section class="body-narrative-shell body-narrative-${variant}">`,
    `<div class="body-opening-block body-opening-${variant}">${openingHtml}</div>`,
    middleHtml.join(""),
    `<div class="body-closing-block body-closing-${variant}">${closingHtml}</div>`,
    "</section>",
  ].join("");
}

function renderPoetryStanza(block: string): string {
  return [
    '<section class="body-poetry-stanza">',
    renderRichTextToHtml(block),
    "</section>",
  ].join("");
}

function renderAudioSegment(title: string, bodyHtml: string, variant: string): string {
  return [
    `<section class="body-audio-segment body-audio-${variant}">`,
    `<header class="body-audio-head"><strong>${escapeHtml(title)}</strong></header>`,
    `<div class="body-audio-body">${bodyHtml}</div>`,
    "</section>",
  ].join("");
}

function renderClassicalNote(label: string, text: string): string {
  return [
    '<section class="body-classical-note">',
    `<header class="body-classical-note-head"><strong>${escapeHtml(label)}</strong></header>`,
    `<div class="body-classical-note-body">${escapeHtml(text)}</div>`,
    "</section>",
  ].join("");
}

function parseHeading(block: string): string {
  const lines = String(block || "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) return "";
  const matched = lines[0].match(HEADING_ONLY_PATTERN);
  return matched?.[1]?.trim() || "";
}

function parseListItems(block: string): string[] {
  return String(block || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(LIST_LINE_PATTERN)?.[2]?.trim() || "")
    .filter(Boolean);
}

function isHeadingBlock(block: string) {
  return !!parseHeading(block);
}

function isLikelyClosingBlock(block: string, family?: StyleFamily) {
  const text = String(block || "").trim();
  if (!text) return false;
  if (family === "letter" && /(此致|祝好|顺颂|敬礼|落款|写信人|愿你)/.test(text)) return true;
  if (family === "speech" && /(谢谢大家|让我们|愿我们|最后我想|今天我想用|共同)/.test(text)) return true;
  if (family === "editorial" || family === "newspaper" || family === "paper") {
    if (/(因此|所以|由此|归根结底|换句话说|这意味着)/.test(text)) return true;
  }
  return CLOSING_HINT_PATTERN.test(text);
}

function isLikelyBridgeBlock(block: string, family?: StyleFamily) {
  const text = String(block || "").trim();
  if (!text || isHeadingBlock(text) || parseListItems(text).length) return false;
  if (isLikelyClosingBlock(text, family)) return false;
  if (TRANSITION_HINT_PATTERN.test(text)) return true;
  if ((family === "speech" || family === "letter") && text.length <= 60) return true;
  if ((family === "editorial" || family === "newspaper" || family === "paper" || family === "book") && text.length <= 72) {
    return /[，。；：]/.test(text);
  }
  return false;
}

function bridgeLabelForFamily(family?: StyleFamily) {
  switch (family) {
    case "editorial":
    case "newspaper":
    case "paper":
      return "论证推进";
    case "book":
    case "elegant":
    case "classical":
      return "段间转场";
    case "speech":
    case "podcast":
      return "承接";
    case "letter":
      return "接着说";
    default:
      return "转场";
  }
}

function supportsSectionPreface(family?: StyleFamily) {
  return !!family && new Set<StyleFamily>(["book", "editorial", "newspaper", "paper", "elegant", "classical"]).has(family);
}

function renderExplainerNarrative(raw: string, family?: StyleFamily): string | null {
  if (!family || !new Set<StyleFamily>(["manual", "science", "kids", "plain"]).has(family)) return null;
  const blocks = raw.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (!blocks.length) return null;

  const rendered: string[] = [];
  let converted = false;
  let index = 0;

  if (!isHeadingBlock(blocks[0]) && !parseListItems(blocks[0]).length) {
    rendered.push(renderLeadBlock("先看这里", renderRichTextToHtml(blocks[0]), family));
    converted = true;
    index = 1;
  }

  while (index < blocks.length) {
    const current = blocks[index];
    const heading = parseHeading(current);

    if (heading) {
      const next = blocks[index + 1] || "";
      const nextListItems = parseListItems(next);
      if (nextListItems.length >= 2) {
        const shouldUseSteps = family === "manual" || STEP_HEADING_PATTERN.test(heading);
        rendered.push(shouldUseSteps ? renderStepModule(heading, nextListItems) : renderCardModule(heading, nextListItems));
        converted = true;
        index += 2;
        continue;
      }

      const bodyParts: string[] = [];
      let cursor = index + 1;
      while (cursor < blocks.length && !isHeadingBlock(blocks[cursor])) {
        const listItems = parseListItems(blocks[cursor]);
        if (listItems.length >= 2) {
          const shouldUseSteps = family === "manual" || STEP_HEADING_PATTERN.test(heading);
          bodyParts.push(shouldUseSteps ? renderStepModule("", listItems) : renderCardModule("", listItems));
          converted = true;
        } else if (isLikelyBridgeBlock(blocks[cursor], family)) {
          bodyParts.push(renderBridgeBlock(bridgeLabelForFamily(family), renderRichTextToHtml(blocks[cursor]), family));
          converted = true;
        } else {
          bodyParts.push(renderRichTextToHtml(blocks[cursor]));
        }
        cursor += 1;
      }
      if (bodyParts.length) {
        rendered.push(renderSectionModule(heading, bodyParts.join(""), family));
        converted = true;
        index = cursor;
        continue;
      }
    }

    const ownListItems = parseListItems(current);
    if (ownListItems.length >= 3) {
      const shouldUseSteps = family === "manual" || STEP_HEADING_PATTERN.test(current);
      rendered.push(shouldUseSteps ? renderStepModule("", ownListItems) : renderCardModule("", ownListItems));
      converted = true;
      index += 1;
      continue;
    }

    if (index === blocks.length - 1 && isLikelyClosingBlock(current, family)) {
      rendered.push(renderClosingBlock(INSIGHT_HEADING_PATTERN.test(current) ? "最后提醒" : "", renderRichTextToHtml(current), family));
      converted = true;
      index += 1;
      continue;
    }

    rendered.push(renderProseBlock(renderRichTextToHtml(current), family));
    converted = true;
    index += 1;
  }

  return converted ? rendered.join("") : null;
}

function renderStructuredModules(raw: string, mode: SummaryRenderMode): string | null {
  if (mode !== "cards" && mode !== "steps") return null;

  const blocks = raw.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (!blocks.length) return null;

  const rendered: string[] = [];
  let converted = false;

  for (let index = 0; index < blocks.length; index += 1) {
    const current = blocks[index];
    const heading = parseHeading(current);
    const next = blocks[index + 1] || "";
    const listItems = parseListItems(next);

    if (heading && listItems.length >= 2) {
      rendered.push(mode === "cards" ? renderCardModule(heading, listItems) : renderStepModule(heading, listItems));
      converted = true;
      index += 1;
      continue;
    }

    const ownListItems = parseListItems(current);
    if (ownListItems.length >= 3) {
      rendered.push(mode === "cards" ? renderCardModule("", ownListItems) : renderStepModule("", ownListItems));
      converted = true;
      continue;
    }

    rendered.push(renderRichTextToHtml(current));
  }

  return converted ? rendered.join("") : null;
}

function renderSectionedNarrative(raw: string, family?: StyleFamily): string | null {
  if (!family) return null;
  const blocks = raw.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (!blocks.length) return null;

  const explainer = renderExplainerNarrative(raw, family);
  if (explainer) return explainer;

  if (family === "poetry" && blocks.length >= 2) {
    return blocks
      .map((block) => {
        const heading = parseHeading(block);
        if (heading) return renderRichTextToHtml(block);
        return renderPoetryStanza(block);
      })
      .join("");
  }

  const sectionFamilies = new Set<StyleFamily>(["editorial", "newspaper", "paper", "book", "classical", "elegant"]);
  if (sectionFamilies.has(family)) {
    const rendered: string[] = [];
    let converted = false;
    let index = 0;

    if (!isHeadingBlock(blocks[0]) && !blocks[0].match(CLASSICAL_NOTE_PATTERN)) {
      const leadLabel =
        family === "book" ? "开篇导读" : family === "editorial" || family === "newspaper" || family === "paper" ? "导语判断" : "起笔";
      rendered.push(renderLeadBlock(leadLabel, renderRichTextToHtml(blocks[0]), family));
      converted = true;
      index = 1;
    }

    for (; index < blocks.length; index += 1) {
      const current = blocks[index];
      const noteMatch = current.match(CLASSICAL_NOTE_PATTERN);
      if (noteMatch && (family === "classical" || family === "elegant")) {
        rendered.push(renderClassicalNote(noteMatch[1], noteMatch[2]));
        converted = true;
        continue;
      }
      const heading = parseHeading(current);
      if (!heading) {
        if (index === blocks.length - 1 && isLikelyClosingBlock(current, family)) {
          rendered.push(renderClosingBlock(family === "book" ? "收束小结" : "结尾落点", renderRichTextToHtml(current), family));
          converted = true;
          continue;
        }
        if (isLikelyBridgeBlock(current, family)) {
          rendered.push(renderBridgeBlock(bridgeLabelForFamily(family), renderRichTextToHtml(current), family));
          converted = true;
          continue;
        }
        rendered.push(renderProseBlock(renderRichTextToHtml(current), family));
        converted = true;
        continue;
      }
      const bodyParts: string[] = [];
      let addedPreface = false;
      let cursor = index + 1;
      while (cursor < blocks.length && !isHeadingBlock(blocks[cursor])) {
        const block = blocks[cursor];
        if (cursor === blocks.length - 1 && isLikelyClosingBlock(block, family)) {
          bodyParts.push(renderClosingBlock(family === "book" ? "收束小结" : "结尾落点", renderRichTextToHtml(block), family));
          converted = true;
          cursor += 1;
          break;
        }
        if (!addedPreface && supportsSectionPreface(family) && !parseListItems(block).length) {
          bodyParts.push(renderSectionPreface(renderRichTextToHtml(block), family));
          addedPreface = true;
          converted = true;
        } else if (isLikelyBridgeBlock(block, family)) {
          bodyParts.push(renderBridgeBlock(bridgeLabelForFamily(family), renderRichTextToHtml(block), family));
          converted = true;
        } else {
          bodyParts.push(renderRichTextToHtml(block));
        }
        cursor += 1;
      }
      if (!bodyParts.length) {
        rendered.push(renderRichTextToHtml(current));
        continue;
      }
      rendered.push(renderSectionModule(heading, bodyParts.join(""), family));
      converted = true;
      index = cursor - 1;
    }
    return converted ? rendered.join("") : null;
  }

  if ((family === "letter" || family === "speech" || family === "podcast") && blocks.length >= 2) {
    const opening = renderRichTextToHtml(blocks[0]);
    const closing = family === "letter" ? renderLetterClosingBlock(blocks[blocks.length - 1]) : renderRichTextToHtml(blocks[blocks.length - 1]);
    const middle = blocks.slice(1, -1).map((block, index) => {
      if (family === "speech" || family === "podcast") {
        const heading = parseHeading(block);
        if (!heading && isLikelyBridgeBlock(block, family)) {
          return renderBridgeBlock(bridgeLabelForFamily(family), renderRichTextToHtml(block), family);
        }
        return renderAudioSegment(heading || `段落 ${index + 1}`, renderRichTextToHtml(block), family);
      }
      if (isLikelyBridgeBlock(block, family)) {
        return renderBridgeBlock(bridgeLabelForFamily(family), renderRichTextToHtml(block), family);
      }
      return renderProseBlock(renderRichTextToHtml(block), family);
    });
    if (family === "letter") {
      return [
        '<section class="body-narrative-shell body-narrative-letter">',
        `<div class="body-opening-block body-letter-salutation">${opening}</div>`,
        `<div class="body-letter-main">${middle.join("")}</div>`,
        closing,
        "</section>",
      ].join("");
    }
    return renderOpeningClosingModule(opening, middle, closing, family);
  }

  if ((family === "story" || family === "documentary") && blocks.length >= 2) {
    const lastBlock = blocks[blocks.length - 1];
    return [
      `<section class="body-narrative-shell body-narrative-${family}">`,
      `<div class="body-opening-block body-lead-${family}">${renderRichTextToHtml(blocks[0])}</div>`,
      blocks
        .slice(1, -1)
        .map((block) => renderProseBlock(renderRichTextToHtml(block), family))
        .join(""),
      isLikelyClosingBlock(lastBlock, family)
        ? renderClosingBlock("收束落点", renderRichTextToHtml(lastBlock), family)
        : renderProseBlock(renderRichTextToHtml(lastBlock), family),
      "</section>",
    ].join("");
  }

  return null;
}

export function renderStyleBodyHtml(content: string, mode: SummaryRenderMode, family?: StyleFamily): string {
  const raw = String(content || "").trim();
  if (!raw) return "";

  if (detectRichTextFormat(raw) === "html") {
    return renderRichTextToHtml(raw);
  }

  const narrative = renderSectionedNarrative(raw, family);
  if (narrative) return sanitizeHtml(narrative);

  const structured = renderStructuredModules(raw, mode);
  if (structured) return sanitizeHtml(structured);

  if (mode !== "dialogue") {
    return renderRichTextToHtml(raw);
  }

  const blocks = raw.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const html = blocks.map((block) => renderDialogueBlock(block) || renderRichTextToHtml(block)).join("");
  return sanitizeHtml(html);
}

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import { detectRichTextFormat, stripLeadingRichTitle } from "../lib/markdown";
import { renderStyleBodyHtml } from "../lib/styleBodyRender";
import { buildLongformGuide } from "../lib/styleLongform";
import {
  buildPreferredTransformCopyText,
  buildTransformShareText,
  exportTransformResultPdf,
  getRecommendedShareTarget,
  getShareTargetMeta,
  type ShareTarget,
} from "../lib/shareFormats";
import { classifyStyleProfile, getResultFocusPresentation } from "../lib/stylePresentation";
import { buildTransformFocusSummary, buildTransformHighlightBlock } from "../lib/styleSummary";
import type { GeneratedImage, StyleSkillProfile, TransformResponse } from "../types";

const props = defineProps<{
  result: TransformResponse | null;
  loading: boolean;
  regeneratingImageId: string | null;
  generatingImages: boolean;
  imageProgress: { completed: number; total: number; eta_seconds: number | null } | null;
  imagePlacement: "header" | "interleave" | "footer";
  errorMessage: string;
  errorSuggestion: string;
  styleProfile?: StyleSkillProfile | null;
}>();

const emit = defineEmits<{
  (event: "regenerate-image", payload: { image_id: string; prompt: string }): void;
}>();

const promptDrafts = reactive<Record<string, string>>({});
const imageStates = reactive<Record<string, { loaded: boolean; failed: boolean }>>({});
const activeImageId = ref<string | null>(null);
const fullscreen = ref(false);
const copyNotice = ref("");
const shareMenuRef = ref<HTMLDetailsElement | null>(null);
let copyNoticeTimer: number | null = null;

const METADATA_LINE_PATTERN =
  /^(title|url|hostname|description|sitename|date|tags|author|published|language|category)\s*:/i;

const activeImage = computed(() => {
  if (!props.result || !activeImageId.value) return null;
  return props.result.images.find((image) => image.id === activeImageId.value) || null;
});

const hasResult = computed(() => !!props.result);
const layoutLabelMap: Record<string, string> = {
  auto: "自动版式",
  newspaper: "报纸版",
  poster: "海报版",
  book: "书籍版",
  classical: "书卷版",
  ppt: "PPT 版",
  paper: "论文版",
  poetry: "诗歌版",
};
const visualLabelMap: Record<string, string> = {
  auto: "自动可视化",
  enhanced: "增强可视化",
  minimal: "少量图表",
  none: "纯正文",
};
const layoutClass = computed(() => {
  const layout = props.styleProfile?.layout_format || "auto";
  return layout === "auto" ? "" : `layout-format-${layout}`;
});
const styleMetaPills = computed(() => {
  const pills: string[] = [];
  if (props.styleProfile?.name) pills.push(`风格：${props.styleProfile.name}`);
  if (props.styleProfile?.layout_format && props.styleProfile.layout_format !== "auto") {
    pills.push(layoutLabelMap[props.styleProfile.layout_format] || "自动版式");
  }
  if (props.styleProfile?.visual_mode && props.styleProfile.visual_mode !== "auto") {
    pills.push(visualLabelMap[props.styleProfile.visual_mode] || "自动可视化");
  }
  return pills;
});

function resetPromptDrafts() {
  for (const key of Object.keys(promptDrafts)) {
    delete promptDrafts[key];
  }
}

watch(
  () => props.result?.request_id,
  () => {
    resetPromptDrafts();
    if (!props.result) return;
    for (const image of props.result.images) {
      promptDrafts[image.id] = image.prompt;
    }
  },
  { immediate: true },
);

watch(
  () => props.result?.images,
  (images) => {
    if (!images) return;
    const nextIds = new Set(images.map((image) => image.id));
    for (const id of Object.keys(imageStates)) {
      if (!nextIds.has(id)) delete imageStates[id];
    }
    for (const image of images) {
      if (promptDrafts[image.id] === undefined) {
        promptDrafts[image.id] = image.prompt;
      }
      if (imageStates[image.id] === undefined) {
        imageStates[image.id] = { loaded: false, failed: false };
      }
    }
  },
  { deep: true },
);

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function renderImageMarkdown(image: GeneratedImage) {
  const alt = (image.prompt || "image").replace(/\n/g, " ").trim();
  const url = image.url;
  if (url.startsWith("data:") && url.length > 5000) {
    return [`- ${alt}`, `  - (data URL 过长，建议下载原图后再引用)`];
  }
  return [`![${alt}](${url})`];
}

function computeInterleavePositions(paragraphCount: number, imageCount: number) {
  const minPos = paragraphCount > 1 ? 1 : 0;
  const maxPos = paragraphCount > 1 ? paragraphCount - 1 : paragraphCount;
  const span = Math.max(1, maxPos - minPos + 1);
  const positions: number[] = [];
  for (let index = 0; index < imageCount; index += 1) {
    const pos = Math.floor(((index + 1) * span) / (imageCount + 1)) + minPos;
    positions.push(Math.min(maxPos, Math.max(minPos, pos)));
  }
  return positions;
}

type CopyBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "image"; image: GeneratedImage };

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

function normalizeComparableText(value: string) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n\n").trim();
}

function splitSummarySentences(value: string) {
  return String(value || "")
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 14);
}

function extractHeadingCandidates(markdown: string) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => stripSummaryMarkdown(line))
    .filter((line) => line.length >= 8);
}

function extractDialogueCandidates(paragraphs: string[]) {
  return paragraphs
    .flatMap((item) =>
      item
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((line) => /^(q|a|问|答|主持人|嘉宾|采访者|受访者|提问者|回答者)[：: ]/i.test(line) || (/[:：]/.test(line) && /[?？]/.test(line.slice(0, 18))))
    .map((line) => clampText(stripSummaryMarkdown(line), 60));
}

function extractStepCandidates(paragraphs: string[], bulletLines: string[]) {
  const stepParagraphs = paragraphs
    .filter((item) => /步骤|step|前置条件|第[一二三四五六七八九十\d]+步|操作|排错/.test(item))
    .flatMap((item) => splitSummarySentences(item).length ? splitSummarySentences(item) : [item]);
  return [...bulletLines, ...stepParagraphs]
    .map((item) => clampText(stripSummaryMarkdown(item), 60))
    .filter((item) => item.length >= 10);
}

function cleanExcerptForSummary(rawExcerpt: string) {
  const lines = String(rawExcerpt || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "---" && !METADATA_LINE_PATTERN.test(line) && !/^https?:\/\//i.test(line));
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function buildFocusSummary(result: TransformResponse | null) {
  return buildTransformFocusSummary(result, props.styleProfile);
}

const focusPresentation = computed(() => getResultFocusPresentation(props.styleProfile));

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return remainSeconds ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分`;
}

function buildCopyBlocks(result: TransformResponse): CopyBlock[] {
  const images = result.images.slice();
  const textParagraphs = splitMarkdownParagraphs(result.transformed_text);

  if (!images.length && !textParagraphs.length) return [];
  if (!images.length) return textParagraphs.map((text) => ({ kind: "paragraph" as const, text }));
  if (!textParagraphs.length) return images.map((image) => ({ kind: "image" as const, image }));

  if (props.imagePlacement === "header") {
    const blocks: CopyBlock[] = [];
    for (const image of images) blocks.push({ kind: "image" as const, image });
    for (const text of textParagraphs) blocks.push({ kind: "paragraph" as const, text });
    return blocks;
  }

  if (props.imagePlacement === "footer") {
    const blocks: CopyBlock[] = [];
    for (const text of textParagraphs) blocks.push({ kind: "paragraph" as const, text });
    for (const image of images) blocks.push({ kind: "image" as const, image });
    return blocks;
  }

  const positions = computeInterleavePositions(textParagraphs.length, images.length);
  const inserts = new Map<number, GeneratedImage[]>();
  for (let index = 0; index < images.length; index += 1) {
    const pos = positions[index];
    const list = inserts.get(pos) || [];
    list.push(images[index]);
    inserts.set(pos, list);
  }

  const blocks: CopyBlock[] = [];
  for (let index = 0; index < textParagraphs.length; index += 1) {
    blocks.push({ kind: "paragraph" as const, text: textParagraphs[index] });
    const after = index + 1;
    const list = inserts.get(after);
    if (!list?.length) continue;
    for (const image of list) {
      blocks.push({ kind: "image" as const, image });
    }
  }
  return blocks;
}

function buildMarkdown(result: TransformResponse) {
  const lines: string[] = [];
  if (result.title) {
    lines.push(`# ${result.title}`, "");
  }
  for (const block of buildCopyBlocks(result)) {
    if (block.kind === "paragraph") {
      lines.push(block.text, "");
      continue;
    }
    lines.push(...renderImageMarkdown(block.image), "");
  }
  return lines.join("\n").trim() + "\n";
}

function setCopyNotice(message: string) {
  copyNotice.value = message;
  if (copyNoticeTimer != null) window.clearTimeout(copyNoticeTimer);
  copyNoticeTimer = window.setTimeout(() => {
    copyNotice.value = "";
    copyNoticeTimer = null;
  }, 2000);
}

function closeShareMenu() {
  if (shareMenuRef.value) {
    shareMenuRef.value.open = false;
  }
}

async function copyMarkdown() {
  if (!editorMarkdown.value) return;
  await navigator.clipboard.writeText(editorMarkdown.value);
  closeShareMenu();
  setCopyNotice("已复制（编辑器用）");
}

async function copyForTarget(target: ShareTarget) {
  if (!props.result) return;
  const text = buildTransformShareText(props.result, target, props.styleProfile);
  await navigator.clipboard.writeText(text);
  closeShareMenu();
  setCopyNotice(getShareTargetMeta(target).copied);
}

async function copyPreferredDeliverable() {
  if (!props.result) return;
  await navigator.clipboard.writeText(buildPreferredTransformCopyText(props.result, props.styleProfile));
  setCopyNotice(preferredTargetMeta.value.copied);
}

async function copyRichText() {
  if (!editorMarkdown.value || !editorHtmlDocument.value) return;
  const html = editorHtmlDocument.value;
  const plain = editorMarkdown.value;

  const clipboardAny = navigator.clipboard as any;
  const ClipboardItemAny = (window as any).ClipboardItem;
  if (typeof clipboardAny?.write !== "function" || typeof ClipboardItemAny !== "function") {
    await navigator.clipboard.writeText(plain);
    setCopyNotice("已复制图文");
    return;
  }

  const item = new ClipboardItemAny({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([plain], { type: "text/plain" }),
  });
  await clipboardAny.write([item]);
  setCopyNotice("已复制图文");
}

function exportPdf() {
  if (!props.result) return;
  closeShareMenu();
  try {
    exportTransformResultPdf(props.result, props.styleProfile);
    setCopyNotice("已打开导出页，请在新页面点击“打印 / 另存为 PDF”");
  } catch (error) {
    setCopyNotice(error instanceof Error ? error.message : "导出 PDF 失败，请稍后重试");
  }
}

function downloadImage(url: string, index: number) {
  const link = document.createElement("a");
  link.href = url;
  link.download = `vibeshift-image-${index + 1}.png`;
  link.click();
}

function openImage(imageId: string) {
  activeImageId.value = imageId;
}

function closeImage() {
  activeImageId.value = null;
}

function markImageLoaded(imageId: string) {
  if (!imageStates[imageId]) imageStates[imageId] = { loaded: true, failed: false };
  imageStates[imageId].loaded = true;
  imageStates[imageId].failed = false;
}

function markImageFailed(imageId: string) {
  if (!imageStates[imageId]) imageStates[imageId] = { loaded: false, failed: true };
  imageStates[imageId].failed = true;
}

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value;
}

watch(fullscreen, (value) => {
  if (value) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

function requestRegenerate(imageId: string) {
  const prompt = (promptDrafts[imageId] || "").trim();
  if (!prompt) return;
  emit("regenerate-image", { image_id: imageId, prompt });
}

const editorMarkdown = computed(() => {
  if (!props.result) return "";
  return buildMarkdown(props.result);
});

const normalizedContent = computed(() => stripLeadingRichTitle(props.result?.transformed_text || ""));
const contentFormat = computed(() => detectRichTextFormat(normalizedContent.value));

const displayMarkdownHtml = computed(() => {
  if (!props.result) return "";
  const content = props.imagePlacement === "interleave" && contentFormat.value !== "html" ? editorMarkdown.value : normalizedContent.value;
  return renderStyleBodyHtml(content, focusHighlights.value.mode, styleFamily.value);
});

const editorHtmlDocument = computed(() => {
  if (!editorMarkdown.value) return "";
  const content = props.imagePlacement === "interleave" && contentFormat.value !== "html" ? editorMarkdown.value : normalizedContent.value;
  const html = renderStyleBodyHtml(content, focusHighlights.value.mode, styleFamily.value);
  return `<!doctype html><html><body>${html}</body></html>`;
});

const showOutput = computed(() => {
  if (!props.result) return false;
  if (props.loading) return false;
  return true;
});

const showLongContentHint = computed(() => {
  return (props.result?.transformed_text.length || 0) >= 9000;
});

const focusSummary = computed(() => buildFocusSummary(props.result));
const focusHighlights = computed(() => buildTransformHighlightBlock(props.result, props.styleProfile));
const bodyRenderClass = computed(() => `body-render-${focusHighlights.value.mode}`);
const styleFamily = computed(() => classifyStyleProfile(props.styleProfile));
const styleFamilyClass = computed(() => `style-family-${styleFamily.value}`);
const preferredTarget = computed(() => getRecommendedShareTarget(styleFamily.value, "transform"));
const preferredTargetMeta = computed(() => getShareTargetMeta(preferredTarget.value));
const preferredDeliverableText = computed(() => (props.result ? buildPreferredTransformCopyText(props.result, props.styleProfile) : ""));
const preferredDeliverableHtml = computed(() =>
  preferredDeliverableText.value
    ? renderStyleBodyHtml(stripLeadingRichTitle(preferredDeliverableText.value), focusHighlights.value.mode, styleFamily.value)
    : "",
);
const showPreferredDeliverablePreview = computed(() => {
  if (!props.result || !preferredDeliverableText.value) return false;
  return normalizeComparableText(stripLeadingRichTitle(preferredDeliverableText.value)) !== normalizeComparableText(normalizedContent.value);
});
const shareTargetOptions = computed(() => {
  const allTargets: ShareTarget[] = ["xiaohongshu", "moments", "wechat", "zhihu"];
  return [preferredTarget.value, ...allTargets.filter((item) => item !== preferredTarget.value)].map((target) => ({
    target,
    title: `${getShareTargetMeta(target).deliverable}${target === preferredTarget.value ? "（推荐）" : ""}`,
    description: getShareTargetMeta(target).description,
  }));
});
const primaryActionLabel = computed(() => preferredTargetMeta.value.action);
const shareActionLabel = computed(() => "更多场景成稿");
const exportActionLabel = computed(() => "导出成稿 PDF");
const resultReadyKicker = computed(() => "这篇内容已整理成可直接使用的成稿");
const resultReadyHelper = computed(() =>
  props.result?.source_url
    ? `主按钮和 PDF 导出会直接使用更适合当前风格分发的${preferredTargetMeta.value.deliverable}；如需对照原文，可用下方链接回看来源。`
    : `主按钮和 PDF 导出会直接使用更适合当前风格分发的${preferredTargetMeta.value.deliverable}，无需再自行整理结构。`,
);
const longformGuide = computed(() => buildLongformGuide(normalizedContent.value, props.styleProfile));
const readingLength = computed(() => Math.max(1, Math.round((normalizedContent.value.length || 0) / 450)));
const durationLabel = computed(() => (props.result ? formatDuration(props.result.meta.duration_ms) : ""));

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (activeImage.value) {
      closeImage();
      return;
    }
    fullscreen.value = false;
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  document.body.style.overflow = "";
  window.removeEventListener("keydown", handleKeydown);
  if (copyNoticeTimer != null) window.clearTimeout(copyNoticeTimer);
});
</script>

<template>
  <div v-if="fullscreen" class="fullscreen-backdrop" @click="fullscreen = false"></div>
  <section :class="['panel', 'result-panel', layoutClass, styleFamilyClass, { fullscreen }]">
    <div class="panel-heading result-heading">
      <div class="result-heading-copy">
        <h2>生成结果</h2>
        <p v-if="showOutput && props.result">{{ props.result.title }}</p>
        <p v-else-if="hasResult">正在整理结果，稍后会自动展示。</p>
        <p v-else>生成完成后会显示在这里。</p>
      </div>
      <div v-if="showOutput && props.result" class="result-toolbar">
        <div class="result-toolbar-group">
          <button class="secondary-button toolbar-button" type="button" @click="copyPreferredDeliverable">
            {{ primaryActionLabel }}
          </button>
          <details ref="shareMenuRef" class="copy-more compact-menu">
            <summary class="ghost-button toolbar-button">{{ shareActionLabel }}</summary>
            <div class="copy-more-menu">
              <button class="ghost-button" type="button" @click="copyRichText">复制图文</button>
              <button class="ghost-button" type="button" @click="copyMarkdown">复制（编辑器用）</button>
              <button
                v-for="option in shareTargetOptions"
                :key="option.target"
                class="ghost-button share-target-button"
                type="button"
                @click="copyForTarget(option.target)"
              >
                <strong>{{ option.title }}</strong>
                <span>{{ option.description }}</span>
              </button>
              <button class="ghost-button" type="button" @click="exportPdf">{{ exportActionLabel }}</button>
            </div>
          </details>
          <button class="ghost-button toolbar-button" type="button" @click="toggleFullscreen">
            {{ fullscreen ? "退出全屏" : "全屏阅读" }}
          </button>
        </div>
        <span v-if="copyNotice" class="hint success-text">{{ copyNotice }}</span>
      </div>
    </div>

    <div v-if="props.result" class="result-stack">
      <section v-if="showOutput" class="discover-summary-board">
        <article class="discover-highlight-card">
          <span class="section-kicker">{{ resultReadyKicker }}</span>
          <h2>{{ props.result.title }}</h2>
          <p>{{ focusSummary.lead || "正文已经整理完成，可继续阅读、复制或导出。" }}</p>
          <p class="hint">{{ resultReadyHelper }}</p>
          <div
            v-if="focusHighlights.items.length"
            :class="['summary-highlight-grid', `summary-highlight-${focusHighlights.mode}`]"
          >
            <article v-for="item in focusHighlights.items" :key="`${item.eyebrow}-${item.text}`" class="summary-highlight-card">
              <span class="summary-highlight-label">{{ item.eyebrow }}</span>
              <p>{{ item.text }}</p>
            </article>
          </div>
          <div v-if="props.result.source_url" class="summary-link-row">
            <a :href="props.result.source_url" target="_blank" rel="noreferrer">查看原链接</a>
          </div>
          <div v-if="styleMetaPills.length" class="pinned-run-points">
            <span v-for="item in styleMetaPills" :key="item" class="workflow-pill">{{ item }}</span>
          </div>
        </article>

        <div class="discover-summary-metrics">
          <article class="discover-metric-card">
            <strong>{{ readingLength }}</strong>
            <span>约需 {{ readingLength }} 分钟阅读</span>
          </article>
          <article class="discover-metric-card">
            <strong>{{ props.result.meta.provider }}</strong>
            <span>模型服务</span>
          </article>
          <article class="discover-metric-card">
            <strong>{{ props.result.images.length }}</strong>
            <span>{{ props.result.images.length ? "已整理配图" : "未生成配图" }}</span>
          </article>
        </div>
      </section>

      <div v-if="props.generatingImages && props.imageProgress" class="state-card">
        <div class="spinner"></div>
        <p>
          正在生成图片（{{ Math.min(props.imageProgress.completed + 1, props.imageProgress.total) }}/{{
            props.imageProgress.total
          }}）…
          <span v-if="props.imageProgress.eta_seconds != null">预计剩余约 {{ props.imageProgress.eta_seconds }} 秒</span>
        </p>
      </div>

      <div v-if="props.errorMessage" class="error-card">
        <strong>{{ props.errorMessage }}</strong>
        <p>{{ props.errorSuggestion }}</p>
      </div>

      <details v-if="showOutput" class="meta-card">
        <summary class="sources-summary">本次信息</summary>
        <div class="meta-lines">
          <div>耗时：{{ durationLabel }}</div>
          <div>本次使用：{{ props.result.meta.provider }} / {{ props.result.meta.model }}</div>
          <div>内容格式：{{ contentFormat === "html" ? "HTML" : contentFormat === "markdown" ? "Markdown" : "纯文本" }}</div>
        </div>
      </details>

      <div v-if="showOutput && showLongContentHint" class="state-card">
        <strong>内容较长</strong>
        <p>已启用稳定渲染，首屏优先展示正文；如果滚动较慢，建议使用“全屏阅读”或“复制（编辑器用）”。</p>
      </div>

      <article v-if="showOutput && showPreferredDeliverablePreview" :class="['discover-deliverable-card', bodyRenderClass]">
        <div class="discover-deliverable-head">
          <div>
            <h4>主按钮成稿预览</h4>
            <p>点击主按钮或导出 PDF 时，会直接使用这份 {{ preferredTargetMeta.deliverable }}。</p>
          </div>
          <span class="workflow-pill">{{ preferredTargetMeta.deliverable }}</span>
        </div>
        <div class="markdown" v-html="preferredDeliverableHtml" />
      </article>

      <section v-if="showOutput && (longformGuide.introText || longformGuide.highlights.length || longformGuide.sections.length)" class="deliverable-guide-panel">
        <article class="deliverable-guide-card deliverable-guide-intro">
          <span class="section-kicker">{{ longformGuide.introLabel }}</span>
          <p>{{ longformGuide.introText || "正文已经整理成适合直接发布的成稿。" }}</p>
        </article>
        <article v-if="longformGuide.highlights.length" class="deliverable-guide-card">
          <h4>{{ longformGuide.highlightTitle }}</h4>
          <div class="deliverable-guide-grid">
            <article v-for="item in longformGuide.highlights" :key="`${item.label}-${item.text}`" class="deliverable-guide-item">
              <span class="summary-highlight-label">{{ item.label }}</span>
              <p>{{ item.text }}</p>
            </article>
          </div>
        </article>
        <article v-if="longformGuide.sections.length" class="deliverable-guide-card">
          <h4>{{ longformGuide.sectionTitle }}</h4>
          <div class="deliverable-section-list">
            <span v-for="item in longformGuide.sections" :key="item" class="workflow-pill">{{ item }}</span>
          </div>
        </article>
        <article v-if="longformGuide.closingText" class="deliverable-guide-card deliverable-guide-closing">
          <h4>{{ longformGuide.closingLabel }}</h4>
          <p>{{ longformGuide.closingText }}</p>
        </article>
      </section>

      <section v-if="showOutput && props.result.images.length && props.imagePlacement === 'header'" class="image-grid">
        <article v-for="(image, index) in props.result.images" :key="image.id" class="image-card">
          <div class="image-media">
            <div v-if="!imageStates[image.id]?.loaded && !imageStates[image.id]?.failed" class="image-skeleton"></div>
            <div v-else-if="imageStates[image.id]?.failed" class="image-fallback">图片加载失败</div>
            <img
              :src="image.url"
              :alt="image.prompt"
              role="button"
              tabindex="0"
              loading="lazy"
              decoding="async"
              @load="markImageLoaded(image.id)"
              @error="markImageFailed(image.id)"
              @click="openImage(image.id)"
            />
          </div>
          <label class="image-prompt">
            <span>提示词</span>
            <textarea v-model="promptDrafts[image.id]" rows="4" />
          </label>

          <div class="image-actions">
            <button class="ghost-button" type="button" @click="downloadImage(image.url, index)">下载原图</button>
            <button
              class="secondary-button"
              type="button"
              :disabled="props.regeneratingImageId === image.id || !(promptDrafts[image.id] || '').trim()"
              @click="requestRegenerate(image.id)"
            >
              {{ props.regeneratingImageId === image.id ? "重新生成中..." : "重新生成" }}
            </button>
          </div>
        </article>
      </section>

      <article v-if="showOutput" :class="['result-article', 'markdown', bodyRenderClass]" v-html="displayMarkdownHtml" />

      <details v-if="showOutput && props.result.images.length && props.imagePlacement === 'interleave'" class="meta-card">
        <summary class="sources-summary">插图（可编辑/重新生成）</summary>
        <section class="image-grid" style="margin-top: 0.75rem">
          <article v-for="(image, index) in props.result.images" :key="image.id" class="image-card">
            <div class="image-media">
              <div v-if="!imageStates[image.id]?.loaded && !imageStates[image.id]?.failed" class="image-skeleton"></div>
              <div v-else-if="imageStates[image.id]?.failed" class="image-fallback">图片加载失败</div>
              <img
                :src="image.url"
                :alt="image.prompt"
                role="button"
                tabindex="0"
                loading="lazy"
                decoding="async"
                @load="markImageLoaded(image.id)"
                @error="markImageFailed(image.id)"
                @click="openImage(image.id)"
              />
            </div>
            <label class="image-prompt">
              <span>提示词</span>
              <textarea v-model="promptDrafts[image.id]" rows="4" />
            </label>

            <div class="image-actions">
              <button class="ghost-button" type="button" @click="downloadImage(image.url, index)">下载原图</button>
              <button
                class="secondary-button"
                type="button"
                :disabled="props.regeneratingImageId === image.id || !(promptDrafts[image.id] || '').trim()"
                @click="requestRegenerate(image.id)"
              >
                {{ props.regeneratingImageId === image.id ? "重新生成中..." : "重新生成" }}
              </button>
            </div>
          </article>
        </section>
      </details>

      <section v-if="showOutput && props.result.images.length && props.imagePlacement === 'footer'" class="image-grid">
        <article v-for="(image, index) in props.result.images" :key="image.id" class="image-card">
          <div class="image-media">
            <div v-if="!imageStates[image.id]?.loaded && !imageStates[image.id]?.failed" class="image-skeleton"></div>
            <div v-else-if="imageStates[image.id]?.failed" class="image-fallback">图片加载失败</div>
            <img
              :src="image.url"
              :alt="image.prompt"
              role="button"
              tabindex="0"
              loading="lazy"
              decoding="async"
              @load="markImageLoaded(image.id)"
              @error="markImageFailed(image.id)"
              @click="openImage(image.id)"
            />
          </div>
          <label class="image-prompt">
            <span>提示词</span>
            <textarea v-model="promptDrafts[image.id]" rows="4" />
          </label>

          <div class="image-actions">
            <button class="ghost-button" type="button" @click="downloadImage(image.url, index)">下载原图</button>
            <button
              class="secondary-button"
              type="button"
              :disabled="props.regeneratingImageId === image.id || !(promptDrafts[image.id] || '').trim()"
              @click="requestRegenerate(image.id)"
            >
              {{ props.regeneratingImageId === image.id ? "重新生成中..." : "重新生成" }}
            </button>
          </div>
        </article>
      </section>
    </div>

    <div v-else class="empty-card">
      <p>选择风格、配置模型，然后开始一次真实转换。</p>
    </div>

    <div v-if="activeImage" class="modal-overlay" @click.self="closeImage">
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="panel-heading">
          <div>
            <h2>查看图片</h2>
            <p>{{ activeImage.prompt }}</p>
          </div>
          <button class="ghost-button" type="button" @click="closeImage">关闭</button>
        </div>

        <div class="image-media modal-media">
          <div
            v-if="!imageStates[activeImage.id]?.loaded && !imageStates[activeImage.id]?.failed"
            class="image-skeleton"
          ></div>
          <div v-else-if="imageStates[activeImage.id]?.failed" class="image-fallback">图片加载失败</div>
          <img
            class="modal-image"
            :src="activeImage.url"
            :alt="activeImage.prompt"
            decoding="async"
            @load="markImageLoaded(activeImage.id)"
            @error="markImageFailed(activeImage.id)"
          />
        </div>

        <div class="image-actions">
          <button class="ghost-button" type="button" @click="downloadImage(activeImage.url, 0)">下载原图</button>
          <button
            class="secondary-button"
            type="button"
            :disabled="props.regeneratingImageId === activeImage.id || !(promptDrafts[activeImage.id] || '').trim()"
            @click="requestRegenerate(activeImage.id)"
          >
            {{ props.regeneratingImageId === activeImage.id ? "重新生成中..." : "重新生成" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

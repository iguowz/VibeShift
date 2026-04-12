<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { detectRichTextFormat, stripLeadingRichTitle } from "../lib/markdown";
import {
  buildHistoryCopyText,
  buildHistoryShareText,
  buildPreferredHistoryCopyText,
  exportHistoryResultPdf,
  getRecommendedShareTarget,
  getShareTargetMeta,
  type ShareTarget,
} from "../lib/shareFormats";
import { renderStyleBodyHtml } from "../lib/styleBodyRender";
import { classifyStyleProfile } from "../lib/stylePresentation";
import { buildLongformGuide } from "../lib/styleLongform";
import { getSummaryRenderMode } from "../lib/styleSummary";
import type { RecentRunEntry } from "../types";

const props = defineProps<{
  entry: RecentRunEntry | null;
  currentTitle?: string;
  currentResultText?: string;
  currentSummary?: string;
  currentKeyFindings?: string[];
}>();

const emit = defineEmits<{
  close: [];
  restore: [entry: RecentRunEntry];
}>();

const fullscreen = ref(false);
const copyNotice = ref("");
const shareMenuRef = ref<HTMLDetailsElement | null>(null);
const activeTab = ref<"brief" | "report">("report");

function normalizeComparableText(value: string) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n\n").trim();
}

watch(
  () => props.entry?.id,
  () => {
    activeTab.value = props.entry?.mode === "discover" ? "brief" : "report";
  },
  { immediate: true },
);

const isDiscoverEntry = computed(() => props.entry?.mode === "discover");
const displayText = computed(() => {
  if (!props.entry) return "";
  return buildHistoryCopyText(props.entry, activeTab.value);
});

const normalizedResultText = computed(() => {
  if (!displayText.value) return "";
  return stripLeadingRichTitle(displayText.value);
});

const html = computed(() => {
  if (!normalizedResultText.value) return "";
  return renderStyleBodyHtml(normalizedResultText.value, renderMode.value, styleFamily.value);
});

const contentFormat = computed(() => detectRichTextFormat(normalizedResultText.value));
const styleFamily = computed(() => classifyStyleProfile(props.entry?.style_snapshot));
const styleFamilyClass = computed(() => `style-family-${styleFamily.value}`);
const renderMode = computed(() => getSummaryRenderMode(styleFamily.value));
const bodyRenderClass = computed(() => `body-render-${renderMode.value}`);
const longformGuide = computed(() => buildLongformGuide(normalizedResultText.value, props.entry?.style_snapshot));
const showLongformGuide = computed(() => !isDiscoverEntry.value || activeTab.value === "report");
const preferredTarget = computed(() => getRecommendedShareTarget(styleFamily.value, isDiscoverEntry.value ? activeTab.value : "transform"));
const preferredTargetMeta = computed(() => getShareTargetMeta(preferredTarget.value));
const preferredDeliverableText = computed(() => (props.entry ? buildPreferredHistoryCopyText(props.entry, activeTab.value) : ""));
const preferredDeliverableHtml = computed(() =>
  preferredDeliverableText.value
    ? renderStyleBodyHtml(stripLeadingRichTitle(preferredDeliverableText.value), renderMode.value, styleFamily.value)
    : "",
);
const showPreferredDeliverablePreview = computed(() => {
  if (!props.entry || !preferredDeliverableText.value) return false;
  if (isDiscoverEntry.value && activeTab.value === "report") return false;
  return normalizeComparableText(stripLeadingRichTitle(preferredDeliverableText.value)) !== normalizeComparableText(normalizedResultText.value);
});
const shareTargetOptions = computed(() => {
  const allTargets: ShareTarget[] = ["xiaohongshu", "moments", "wechat", "zhihu"];
  return [preferredTarget.value, ...allTargets.filter((item) => item !== preferredTarget.value)].map((target) => ({
    target,
    title: `${getShareTargetMeta(target).deliverable}${target === preferredTarget.value ? "（推荐）" : ""}`,
    description: getShareTargetMeta(target).description,
  }));
});
const primaryActionLabel = computed(() => {
  if (isDiscoverEntry.value && activeTab.value === "report") return "复制详文成稿";
  return preferredTargetMeta.value.action;
});
const shareActionLabel = computed(() => {
  if (!isDiscoverEntry.value) return "更多场景成稿";
  return `更多场景成稿（${activeTab.value === "brief" ? "简报" : "详文"}）`;
});
const exportActionLabel = computed(() => {
  if (!isDiscoverEntry.value) return "导出成稿 PDF";
  return `导出 PDF（${activeTab.value === "brief" ? "简报" : "详文"}）`;
});
const summaryTitle = computed(() => (isDiscoverEntry.value ? (activeTab.value === "brief" ? "可直接发送的简报" : "详文导读") : "你最可能关心的内容"));
const summaryText = computed(() => {
  if (!props.entry) return "暂无摘要。";
  if (!isDiscoverEntry.value) return props.entry.summary || props.entry.result_excerpt || "暂无摘要。";
  return activeTab.value === "brief"
    ? props.entry.brief_conclusion || props.entry.brief_summary || props.entry.summary || "暂无摘要。"
    : props.entry.summary || props.entry.result_excerpt || props.entry.brief_conclusion || "暂无摘要。";
});
const pointTitle = computed(() => (isDiscoverEntry.value && activeTab.value === "report" ? "本篇重点" : "关键点"));
const layoutClass = computed(() => {
  const layout = props.entry?.style_snapshot?.layout_format || "auto";
  return layout === "auto" ? "" : `layout-format-${layout}`;
});

function setCopyNotice(message: string) {
  copyNotice.value = message;
  window.setTimeout(() => {
    if (copyNotice.value === message) {
      copyNotice.value = "";
    }
  }, 1800);
}

async function copyResult() {
  if (!props.entry) return;
  if (isDiscoverEntry.value && activeTab.value === "report") {
    await navigator.clipboard.writeText(buildHistoryCopyText(props.entry, activeTab.value));
    setCopyNotice("已复制详文成稿");
    return;
  }
  await navigator.clipboard.writeText(buildPreferredHistoryCopyText(props.entry, activeTab.value));
  setCopyNotice(preferredTargetMeta.value.copied);
}

function closeShareMenu() {
  if (shareMenuRef.value) {
    shareMenuRef.value.open = false;
  }
}

async function copyForTarget(target: ShareTarget) {
  if (!props.entry) return;
  const text = buildHistoryShareText(props.entry, target, activeTab.value);
  await navigator.clipboard.writeText(text);
  closeShareMenu();
  setCopyNotice(getShareTargetMeta(target).copied);
}

function exportPdf() {
  if (!props.entry) return;
  closeShareMenu();
  try {
    exportHistoryResultPdf(props.entry, activeTab.value);
    setCopyNotice("已打开导出页，请在新页面点击“打印 / 另存为 PDF”");
  } catch (error) {
    setCopyNotice(error instanceof Error ? error.message : "导出失败，请稍后重试");
  }
}

function tokenize(value: string): string[] {
  return Array.from(new Set((String(value || "").match(/[\u4e00-\u9fffa-zA-Z0-9]{2,}/g) || []).map((item) => item.toLowerCase())));
}

const comparison = computed(() => {
  if (!props.entry?.result_text || !props.currentResultText?.trim()) return null;
  const left = tokenize(props.entry.result_text);
  const right = tokenize(props.currentResultText);
  if (!left.length || !right.length) return null;
  const overlap = left.filter((item) => right.includes(item));
  const union = new Set([...left, ...right]);
  const similarity = union.size ? Math.round((overlap.length / union.size) * 100) : 0;
  const historyOnly = left.filter((item) => !right.includes(item)).slice(0, 8);
  const currentOnly = right.filter((item) => !left.includes(item)).slice(0, 8);
  return {
    similarity,
    historyOnly,
    currentOnly,
  };
});
</script>

<template>
  <teleport to="body">
    <div v-if="props.entry" class="drawer-overlay" @click.self="emit('close')">
      <section :class="['history-viewer', layoutClass, styleFamilyClass, { fullscreen }]">
        <div class="panel-heading">
          <div>
            <h2>{{ props.entry.title }}</h2>
            <p>
              {{ props.entry.mode === "discover" ? "调研结果" : "改写结果" }} · {{ props.entry.style_name || "未命名风格" }}
            </p>
          </div>
          <div class="actions-row">
            <button class="secondary-button" type="button" @click="copyResult">{{ primaryActionLabel }}</button>
            <details ref="shareMenuRef" class="copy-more">
              <summary class="ghost-button">{{ shareActionLabel }}</summary>
              <div class="copy-more-menu">
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
              </div>
            </details>
            <button class="ghost-button" type="button" @click="exportPdf">{{ exportActionLabel }}</button>
            <button class="ghost-button" type="button" @click="fullscreen = !fullscreen">
              {{ fullscreen ? "退出全屏" : "全屏查看" }}
            </button>
            <button class="secondary-button" type="button" @click="emit('restore', props.entry)">恢复到输入框</button>
            <button class="ghost-button" type="button" @click="emit('close')">关闭</button>
          </div>
        </div>

        <div class="drawer-header-row">
          <span class="hint">
            {{ contentFormat === "html" ? "HTML 快照" : contentFormat === "markdown" ? "Markdown 快照" : "文本快照" }}
            <span v-if="props.entry.result_truncated"> · 已截断保存</span>
          </span>
          <span v-if="copyNotice" class="success-text">{{ copyNotice }}</span>
        </div>

        <div v-if="isDiscoverEntry" class="result-tab-row">
          <button
            :class="['result-tab', { active: activeTab === 'brief' }]"
            type="button"
            @click="activeTab = 'brief'"
          >
            简报
          </button>
          <button
            :class="['result-tab', { active: activeTab === 'report' }]"
            type="button"
            @click="activeTab = 'report'"
          >
            详文
          </button>
        </div>

        <div class="history-viewer-summary">
          <article class="discover-brief-card">
            <h4>{{ summaryTitle }}</h4>
            <p>{{ summaryText }}</p>
          </article>
          <article v-if="props.entry.brief_key_findings?.length" class="discover-brief-card">
            <h4>{{ pointTitle }}</h4>
            <ul class="discover-list">
              <li v-for="item in props.entry.brief_key_findings" :key="item">{{ item }}</li>
            </ul>
          </article>
        </div>

        <section v-if="comparison" class="history-viewer-summary">
          <article class="discover-brief-card">
            <h4>与当前结果对比</h4>
            <p>相似度约 {{ comparison.similarity }}%</p>
            <p class="hint">用词和重点越接近，相似度会越高。</p>
          </article>
          <article class="discover-brief-card">
            <h4>当前结果重点</h4>
            <p>{{ props.currentSummary || "暂无摘要。" }}</p>
            <ul v-if="props.currentKeyFindings?.length" class="discover-list">
              <li v-for="item in props.currentKeyFindings" :key="item">{{ item }}</li>
            </ul>
          </article>
        </section>

        <section v-if="comparison && (comparison.historyOnly.length || comparison.currentOnly.length)" class="history-viewer-summary">
          <article class="discover-brief-card">
            <h4>历史结果更强调</h4>
            <div v-if="comparison.historyOnly.length" class="pinned-run-points">
              <span v-for="item in comparison.historyOnly" :key="item" class="workflow-pill">{{ item }}</span>
            </div>
            <p v-else class="hint">与当前结果重点接近。</p>
          </article>
          <article class="discover-brief-card">
            <h4>当前结果更强调</h4>
            <div v-if="comparison.currentOnly.length" class="pinned-run-points">
              <span v-for="item in comparison.currentOnly" :key="item" class="workflow-pill">{{ item }}</span>
            </div>
            <p v-else class="hint">与历史结果重点接近。</p>
          </article>
        </section>

        <div v-if="props.entry.result_too_long" class="state-card">
          <strong>内容较长</strong>
          <p>
            为了保证历史结果查看稳定性，这里展示的是本地快照。
            <span v-if="props.entry.result_truncated">当前内容已截断保存，建议恢复到输入框后重新生成完整结果。</span>
          </p>
        </div>

        <article v-if="showPreferredDeliverablePreview" :class="['discover-deliverable-card', bodyRenderClass]">
          <div class="discover-deliverable-head">
            <div>
              <h4>主按钮成稿预览</h4>
              <p>点击主按钮或导出 PDF 时，会直接使用这份 {{ preferredTargetMeta.deliverable }}。</p>
            </div>
            <span class="workflow-pill">{{ preferredTargetMeta.deliverable }}</span>
          </div>
          <div class="markdown" v-html="preferredDeliverableHtml" />
        </article>

        <section
          v-if="showLongformGuide && (longformGuide.introText || longformGuide.highlights.length || longformGuide.sections.length || longformGuide.closingText)"
          class="deliverable-guide-panel"
        >
          <article class="deliverable-guide-card deliverable-guide-intro">
            <span class="section-kicker">{{ longformGuide.introLabel }}</span>
            <p>{{ longformGuide.introText || summaryText }}</p>
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

        <article :class="['result-article', 'markdown', 'history-markdown', bodyRenderClass]" v-html="html" />

        <details v-if="props.entry.source_preview?.length" class="sources-panel">
          <summary class="sources-summary">参考来源（{{ props.entry.source_preview.length }}）</summary>
          <ol class="sources-list">
            <li v-for="source in props.entry.source_preview" :key="`${source.id}-${source.url}`">
              <a :href="source.url" target="_blank" rel="noreferrer">{{ source.title }}</a>
              <span v-if="source.relevance_score != null" class="hint">
                · 相关度 {{ source.relevance_score.toFixed(2) }}
              </span>
            </li>
          </ol>
        </details>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { stripLeadingRichTitle } from "../lib/markdown";
import { renderStyleBodyHtml } from "../lib/styleBodyRender";
import { buildLongformGuide } from "../lib/styleLongform";
import {
  buildDiscoverCopyText,
  buildDiscoverShareText,
  buildPreferredDiscoverCopyText,
  exportDiscoverResultPdf,
  getRecommendedShareTarget,
  getShareTargetMeta,
  type ShareTarget,
} from "../lib/shareFormats";
import { classifyStyleProfile, getDiscoverReportPresentation } from "../lib/stylePresentation";
import { buildDiscoverBriefHighlights, buildDiscoverQuickView, getDiscoverDetailOrder, type DiscoverDetailSection } from "../lib/styleSummary";
import type { DiscoverResponse, DiscoverResumeStage, SearchSource, StyleSkillProfile } from "../types";

const props = defineProps<{
  result: DiscoverResponse;
  busy?: boolean;
  styleProfile?: StyleSkillProfile | null;
}>();
const emit = defineEmits<{
  rerun: [stage: DiscoverResumeStage];
}>();

const copyNotice = ref("");
const activeTab = ref<"brief" | "report">("brief");
const shareMenuRef = ref<HTMLDetailsElement | null>(null);
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

const brief = computed(() => props.result.brief);
const artifactLabels = computed(() => new Set((props.result.run?.artifacts || []).map((item) => item.label)));
const canResumeFromDraft = computed(() => artifactLabels.value.has("discover-draft"));
const canResumeFromBrief = computed(() => artifactLabels.value.has("discover-brief"));
const canResumeFromSources = computed(() => artifactLabels.value.has("sources-data"));
const normalizedReportText = computed(() => stripLeadingRichTitle(props.result.transformed_text));
const showLongContentHint = computed(() => props.result.transformed_text.length >= 9000);
const topSources = computed(() =>
  props.result.sources
    .slice()
    .sort((left, right) => (right.overall_score || 0) - (left.overall_score || 0))
    .slice(0, 6),
);
const reportSummary = computed(() => brief.value.conclusion || brief.value.summary || props.result.title);
const reportPresentation = computed(() => getDiscoverReportPresentation(props.styleProfile));
const quickView = computed(() => buildDiscoverQuickView(props.result, props.styleProfile));
const briefHighlights = computed(() => buildDiscoverBriefHighlights(props.result, props.styleProfile));
const reportBodyRenderClass = computed(() => `body-render-${briefHighlights.value.mode}`);
const styleFamily = computed(() => classifyStyleProfile(props.styleProfile));
const styleFamilyClass = computed(() => `style-family-${styleFamily.value}`);
const reportHtml = computed(() => renderStyleBodyHtml(normalizedReportText.value, briefHighlights.value.mode, styleFamily.value));
const reportGuide = computed(() => buildLongformGuide(normalizedReportText.value, props.styleProfile));
const briefReadyText = computed(() => buildPreferredDiscoverCopyText(props.result, props.styleProfile, "brief"));
const briefReadyHtml = computed(() =>
  renderStyleBodyHtml(stripLeadingRichTitle(briefReadyText.value), briefHighlights.value.mode, styleFamily.value),
);
const detailSectionOrder = computed(() => getDiscoverDetailOrder(props.styleProfile));
const layoutClass = computed(() => {
  const layout = props.styleProfile?.layout_format || "auto";
  return layout === "auto" ? "" : `layout-format-${layout}`;
});
const preferredTarget = computed(() => getRecommendedShareTarget(styleFamily.value, activeTab.value));
const preferredTargetMeta = computed(() => getShareTargetMeta(preferredTarget.value));
const shareTargetOptions = computed(() => {
  const allTargets: ShareTarget[] = ["xiaohongshu", "moments", "wechat", "zhihu"];
  return [preferredTarget.value, ...allTargets.filter((item) => item !== preferredTarget.value)].map((target) => ({
    target,
    title: `${getShareTargetMeta(target).deliverable}${target === preferredTarget.value ? "（推荐）" : ""}`,
    description: getShareTargetMeta(target).description,
  }));
});
const primaryActionLabel = computed(() => (activeTab.value === "brief" ? preferredTargetMeta.value.action : "复制详文成稿"));
const exportActionLabel = computed(() => `导出 PDF（${activeTab.value === "brief" ? "简报" : "详文"}）`);
const shareActionLabel = computed(() => `更多场景成稿（${activeTab.value === "brief" ? "简报" : "详文"}）`);
const summaryLead = computed(() => (activeTab.value === "brief" ? brief.value.conclusion || props.result.title : quickView.value.lead || reportSummary.value));
const summaryHelper = computed(() =>
  activeTab.value === "brief"
    ? `已经整理成可直接发送的${preferredTargetMeta.value.deliverable}。`
    : brief.value.summary || `当前详文已整理成可直接使用的${preferredTargetMeta.value.deliverable}。`,
);
const summaryBullets = computed(() =>
  activeTab.value === "brief" ? briefHighlights.value.items.map((item) => item.text).slice(0, 3) : quickView.value.bullets,
);
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

watch(
  () => props.result.request_id,
  () => {
    activeTab.value = "brief";
  },
  { immediate: true },
);

function sourceTypeLabel(source: SearchSource) {
  const sourceType = source.source_type || "article";
  return (
    {
      wiki: "百科",
      qa: "问答",
      social: "社区笔记",
      book: "公开图书",
      paper: "论文",
      official: "官方资料",
      code: "代码仓库",
      news: "媒体报道",
      article: "公开文章",
    }[sourceType] || "公开资料"
  );
}

function closeShareMenu() {
  if (shareMenuRef.value) {
    shareMenuRef.value.open = false;
  }
}

async function copyAll() {
  const text =
    activeTab.value === "brief"
      ? buildPreferredDiscoverCopyText(props.result, props.styleProfile, activeTab.value)
      : buildDiscoverCopyText(props.result, props.styleProfile, activeTab.value);
  await navigator.clipboard.writeText(text);
  copyNotice.value = activeTab.value === "brief" ? preferredTargetMeta.value.copied : "已复制详文成稿";
  window.setTimeout(() => (copyNotice.value = ""), 1600);
}

async function copyForTarget(target: ShareTarget) {
  const text = buildDiscoverShareText(props.result, target, props.styleProfile, activeTab.value);
  await navigator.clipboard.writeText(text);
  closeShareMenu();
  copyNotice.value = getShareTargetMeta(target).copied;
  window.setTimeout(() => (copyNotice.value = ""), 1800);
}

function exportPdf() {
  closeShareMenu();
  try {
    exportDiscoverResultPdf(props.result, props.styleProfile, activeTab.value);
    copyNotice.value = "已打开导出页，请在新页面点击“打印 / 另存为 PDF”";
  } catch (error) {
    copyNotice.value = error instanceof Error ? error.message : "导出 PDF 失败，请稍后重试";
  }
  window.setTimeout(() => (copyNotice.value = ""), 1800);
}

function sectionHeading(section: DiscoverDetailSection) {
  if (section === "evidence") return `${reportPresentation.value.evidenceHeading}（${brief.value.evidence.length}）`;
  if (section === "sources") return `${reportPresentation.value.sourceHeading}（${topSources.value.length}）`;
  if (section === "uncertainties") return `${reportPresentation.value.uncertaintyHeading}（${brief.value.uncertainties.length}）`;
  return `${reportPresentation.value.outlineHeading}（${brief.value.draft_outline.length}）`;
}
</script>

<template>
  <section :class="['result-shell', layoutClass, styleFamilyClass]">
    <div class="result-actions">
      <button class="secondary-button" type="button" @click="copyAll">{{ primaryActionLabel }}</button>
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
      <button
        v-if="props.result.run?.id && canResumeFromDraft"
        class="secondary-button"
        type="button"
        :disabled="props.busy"
        @click="emit('rerun', 'draft')"
      >
        基于草稿重写成稿
      </button>
      <button
        v-if="props.result.run?.id && canResumeFromBrief"
        class="ghost-button"
        type="button"
        :disabled="props.busy"
        @click="emit('rerun', 'brief')"
      >
        基于简报重跑
      </button>
      <button
        v-if="props.result.run?.id && canResumeFromSources"
        class="ghost-button"
        type="button"
        :disabled="props.busy"
        @click="emit('rerun', 'sources')"
      >
        从来源重新研究
      </button>
      <span v-if="copyNotice" class="hint">{{ copyNotice }}</span>
    </div>

    <section class="discover-summary-board">
      <article class="discover-highlight-card">
        <span class="section-kicker">{{ activeTab === "brief" ? "这份简报可直接发送" : "这篇详文可直接使用" }}</span>
        <h2>{{ summaryLead }}</h2>
        <p>{{ summaryHelper }}</p>
        <ul v-if="summaryBullets.length" class="discover-list summary-points">
          <li v-for="item in summaryBullets" :key="item">{{ item }}</li>
        </ul>
        <div v-if="styleMetaPills.length" class="pinned-run-points">
          <span v-for="item in styleMetaPills" :key="item" class="workflow-pill">{{ item }}</span>
        </div>
      </article>

      <div class="discover-summary-metrics">
        <article class="discover-metric-card">
          <strong>{{ props.result.meta.sources }}</strong>
          <span>可用来源</span>
        </article>
        <article class="discover-metric-card">
          <strong>{{ props.result.meta.evidence_items }}</strong>
          <span>关键证据</span>
        </article>
        <article class="discover-metric-card">
          <strong>{{ props.result.meta.uncertainties }}</strong>
          <span>待确认点</span>
        </article>
      </div>
    </section>

    <div class="result-tab-row">
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

    <section v-if="activeTab === 'brief'" class="discover-brief-panel">
      <div class="discover-brief-head">
        <div>
          <h3>{{ reportPresentation.briefHeading }}</h3>
          <p>已为你整理成可直接发送的 {{ preferredTargetMeta.deliverable }}；下方证据与来源可作为备用支撑材料。</p>
        </div>
        <span class="workflow-pill">{{ reportPresentation.briefBadge }}</span>
      </div>

      <article :class="['discover-deliverable-card', reportBodyRenderClass]">
        <div class="discover-deliverable-head">
          <div>
            <h4>可直接发送版</h4>
            <p>保持当前风格，主按钮会直接复制最适合当前内容的成稿版本。</p>
          </div>
        </div>
        <div class="markdown" v-html="briefReadyHtml" />
      </article>

      <div class="discover-brief-grid">
        <article class="discover-brief-card">
          <h4>{{ reportPresentation.conclusionHeading }}</h4>
          <p>{{ brief.conclusion || "暂无结论" }}</p>
        </article>

        <article class="discover-brief-card">
          <h4>{{ reportPresentation.findingsHeading }}</h4>
          <div
            v-if="briefHighlights.items.length"
            :class="['summary-highlight-grid', `summary-highlight-${briefHighlights.mode}`]"
          >
            <article
              v-for="item in briefHighlights.items"
              :key="`${item.eyebrow}-${item.text}`"
              class="summary-highlight-card"
            >
              <span class="summary-highlight-label">{{ item.eyebrow }}</span>
              <p>{{ item.text }}</p>
            </article>
          </div>
          <p v-else class="hint">暂无结构化发现。</p>
        </article>
      </div>

      <details class="discover-support-details">
        <summary class="sources-summary">备用支撑材料（证据 / 来源 / 风险 / 提纲）</summary>
        <div class="discover-brief-grid discover-support-grid">
          <template v-for="section in detailSectionOrder" :key="section">
            <details v-if="section === 'evidence'" class="discover-brief-card">
            <summary class="sources-summary">{{ sectionHeading(section) }}</summary>
            <div class="evidence-list">
              <article v-for="item in brief.evidence" :key="`${item.source_id}-${item.url}`" class="evidence-card">
                <div class="evidence-head">
                  <strong>[{{ item.source_id }}] {{ item.title }}</strong>
                  <a :href="item.url" target="_blank" rel="noreferrer">打开来源</a>
                </div>
                <p v-if="item.quote" class="evidence-quote">“{{ item.quote }}”</p>
                <p>{{ item.evidence }}</p>
                <p v-if="item.relevance" class="hint">为什么重要：{{ item.relevance }}</p>
              </article>
            </div>
            </details>

            <article v-else-if="section === 'sources'" class="discover-brief-card">
              <h4>{{ sectionHeading(section) }}</h4>
              <ol class="sources-list compact">
                <li v-for="item in topSources" :key="item.url">
                  <a :href="item.url" target="_blank" rel="noreferrer">{{ item.title }}</a>
                  <div class="hint">
                    {{ sourceTypeLabel(item) }} · 可信度 {{ (item.credibility_score || 0).toFixed(1) }} / 10 · 相关度
                    {{ (item.relevance_score || 0).toFixed(1) }}
                    <span v-if="item.capture_mode === 'snippet'"> · 仅搜索摘要</span>
                  </div>
                </li>
              </ol>
            </article>

            <details v-else-if="section === 'uncertainties'" class="discover-brief-card">
              <summary class="sources-summary">{{ sectionHeading(section) }}</summary>
              <ul v-if="brief.uncertainties.length" class="discover-list">
                <li v-for="item in brief.uncertainties" :key="item">{{ item }}</li>
              </ul>
              <p v-else class="hint">暂无明显待确认问题。</p>
            </details>

            <details v-else class="discover-brief-card">
              <summary class="sources-summary">{{ sectionHeading(section) }}</summary>
              <ol v-if="brief.draft_outline.length" class="discover-list">
                <li v-for="item in brief.draft_outline" :key="item">{{ item }}</li>
              </ol>
              <p v-else class="hint">暂无转写提纲。</p>
            </details>
          </template>
        </div>
      </details>
    </section>

    <section v-else class="discover-report-panel">
      <div class="discover-brief-head">
        <div>
          <h3>详文</h3>
          <p>{{ reportPresentation.helper }}</p>
        </div>
      </div>

      <div v-if="showLongContentHint" class="state-card">
        <strong>内容较长</strong>
        <p>可先快速浏览上方简报，再直接使用下方详文；复制或导出时会保留完整内容。</p>
      </div>

      <section v-if="reportGuide.introText || reportGuide.highlights.length || reportGuide.sections.length" class="deliverable-guide-panel">
        <article class="deliverable-guide-card deliverable-guide-intro">
          <span class="section-kicker">{{ reportGuide.introLabel }}</span>
          <p>{{ reportGuide.introText || reportSummary }}</p>
        </article>
        <article v-if="reportGuide.highlights.length" class="deliverable-guide-card">
          <h4>{{ reportGuide.highlightTitle }}</h4>
          <div class="deliverable-guide-grid">
            <article v-for="item in reportGuide.highlights" :key="`${item.label}-${item.text}`" class="deliverable-guide-item">
              <span class="summary-highlight-label">{{ item.label }}</span>
              <p>{{ item.text }}</p>
            </article>
          </div>
        </article>
        <article v-if="reportGuide.sections.length" class="deliverable-guide-card">
          <h4>{{ reportGuide.sectionTitle }}</h4>
          <div class="deliverable-section-list">
            <span v-for="item in reportGuide.sections" :key="item" class="workflow-pill">{{ item }}</span>
          </div>
        </article>
        <article v-if="reportGuide.closingText" class="deliverable-guide-card deliverable-guide-closing">
          <h4>{{ reportGuide.closingLabel }}</h4>
          <p>{{ reportGuide.closingText }}</p>
        </article>
      </section>

      <article :class="['result-text', 'discover-report-body', reportBodyRenderClass]">
        <div class="markdown" v-html="reportHtml" />
      </article>
    </section>

    <details class="sources-panel">
      <summary class="sources-summary">全部参考来源（{{ props.result.sources.length }}）</summary>
      <ol class="sources-list">
        <li v-for="item in props.result.sources" :key="item.url">
          <a :href="item.url" target="_blank" rel="noreferrer">{{ item.title }}</a>
          <div class="hint">
            {{ sourceTypeLabel(item) }} · 可信度 {{ (item.credibility_score || 0).toFixed(1) }} / 10 · 相关度
            {{ (item.relevance_score || 0).toFixed(1) }}
            <span v-if="item.overall_score != null"> · 综合分 {{ item.overall_score.toFixed(1) }}</span>
            <span v-if="item.capture_mode === 'snippet'"> · 仅搜索摘要</span>
          </div>
          <div v-if="item.snippet" class="hint">{{ item.snippet }}</div>
        </li>
      </ol>
    </details>
  </section>
</template>

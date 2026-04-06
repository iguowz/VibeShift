<script setup lang="ts">
import { computed, ref } from "vue";

import { detectRichTextFormat, renderRichTextToHtml, stripLeadingRichTitle } from "../lib/markdown";
import { buildHistoryShareText, exportHtmlToPdf, type ShareTarget } from "../lib/shareFormats";
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

const normalizedResultText = computed(() => {
  if (!props.entry?.result_text) return "";
  return stripLeadingRichTitle(props.entry.result_text);
});

const html = computed(() => {
  if (!normalizedResultText.value) return "";
  return renderRichTextToHtml(normalizedResultText.value);
});

const contentFormat = computed(() => detectRichTextFormat(normalizedResultText.value));
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
  if (!props.entry?.result_text) return;
  await navigator.clipboard.writeText(props.entry.result_text);
  setCopyNotice("已复制历史结果");
}

function closeShareMenu() {
  if (shareMenuRef.value) {
    shareMenuRef.value.open = false;
  }
}

async function copyForTarget(target: ShareTarget) {
  if (!props.entry) return;
  const text = buildHistoryShareText(props.entry, target);
  await navigator.clipboard.writeText(text);
  closeShareMenu();
  setCopyNotice(`已复制${target === "xiaohongshu" ? "小红书" : target === "moments" ? "朋友圈" : target === "wechat" ? "公众号" : "知乎"}格式`);
}

function exportPdf() {
  if (!props.entry) return;
  closeShareMenu();
  try {
    exportHtmlToPdf(props.entry.title || "VibeShift 历史结果", html.value);
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
      <section :class="['history-viewer', layoutClass, { fullscreen }]">
        <div class="panel-heading">
          <div>
            <h2>{{ props.entry.title }}</h2>
            <p>
              {{ props.entry.mode === "discover" ? "调研结果" : "改写结果" }} · {{ props.entry.style_name || "未命名风格" }}
            </p>
          </div>
          <div class="actions-row">
            <button class="secondary-button" type="button" @click="copyResult">复制结果</button>
            <details ref="shareMenuRef" class="copy-more">
              <summary class="ghost-button">复制分享格式</summary>
              <div class="copy-more-menu">
                <button class="ghost-button" type="button" @click="copyForTarget('xiaohongshu')">小红书</button>
                <button class="ghost-button" type="button" @click="copyForTarget('moments')">朋友圈</button>
                <button class="ghost-button" type="button" @click="copyForTarget('wechat')">公众号</button>
                <button class="ghost-button" type="button" @click="copyForTarget('zhihu')">知乎</button>
              </div>
            </details>
            <button class="ghost-button" type="button" @click="exportPdf">导出 PDF</button>
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

        <div class="history-viewer-summary">
          <article class="discover-brief-card">
            <h4>你最可能关心的内容</h4>
            <p>{{ props.entry.brief_conclusion || props.entry.summary || "暂无摘要。" }}</p>
          </article>
          <article v-if="props.entry.brief_key_findings?.length" class="discover-brief-card">
            <h4>关键点</h4>
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

        <article class="result-article markdown history-markdown" v-html="html" />

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

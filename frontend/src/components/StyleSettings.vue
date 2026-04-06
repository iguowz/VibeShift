<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { isRequestCanceled, optimizeStylePrompt, resolveApiError, submitDiscover, submitTransform } from "../lib/api";
import { detectMode } from "../lib/detectMode";
import { buildFunctionSkillHits } from "../lib/functionSkills";
import { renderMarkdownToHtml } from "../lib/markdown";
import { buildStyleProfile, createStyleTemplate } from "../lib/styleSkill";
import { usePreferencesStore } from "../stores/preferences";
import { useRunMemoryStore } from "../stores/runMemory";
import type {
  StylePromptMemoryHint,
  StylePromptOptimizeResponse,
  DetectedMode,
  StylePromptTarget,
  StyleTemplate,
  TransformPayload,
} from "../types";

const props = defineProps<{
  currentInput: string;
}>();

const store = usePreferencesStore();
const runMemory = useRunMemoryStore();

const search = ref("");
const draftName = ref("");
const draftPrompt = ref("");
const draftAudience = ref("");
const draftTone = ref("");
const draftStructureTemplate = ref("");
const draftEmphasisText = ref("");
const draftCitationPolicy = ref<StyleTemplate["citation_policy"]>("auto");
const draftTitlePolicy = ref<StyleTemplate["title_policy"]>("retain");
const draftImageFocus = ref<StyleTemplate["image_focus"]>("auto");
const draftLayoutFormat = ref<StyleTemplate["layout_format"]>("auto");
const draftVisualMode = ref<StyleTemplate["visual_mode"]>("auto");
const optimizing = ref(false);
const optimizeNotes = ref<string[]>([]);
const optimizedPrompt = ref("");
const optimizedProfile = ref<StylePromptOptimizeResponse["profile_suggestion"]>(null);
const optimizeError = ref("");

const comparing = ref(false);
const compareError = ref("");
const beforeText = ref("");
const afterText = ref("");
let compareController: AbortController | null = null;

const beforeHtml = computed(() => renderMarkdownToHtml(beforeText.value));
const afterHtml = computed(() => renderMarkdownToHtml(afterText.value));
const filteredStyles = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return store.styles;
  return store.styles.filter((style) => style.name.toLowerCase().includes(keyword));
});

function loadStyle(style: StyleTemplate) {
  store.selectedStyleId = style.id;
  draftName.value = style.name;
  draftPrompt.value = style.prompt;
  draftAudience.value = style.audience;
  draftTone.value = style.tone;
  draftStructureTemplate.value = style.structure_template;
  draftEmphasisText.value = style.emphasis_points.join("，");
  draftCitationPolicy.value = style.citation_policy;
  draftTitlePolicy.value = style.title_policy;
  draftImageFocus.value = style.image_focus;
  draftLayoutFormat.value = style.layout_format;
  draftVisualMode.value = style.visual_mode;
  optimizedPrompt.value = "";
  optimizedProfile.value = null;
  optimizeNotes.value = [];
  optimizeError.value = "";
  beforeText.value = "";
  afterText.value = "";
  compareError.value = "";
}

function createNew() {
  store.selectedStyleId = "";
  draftName.value = "";
  draftPrompt.value = "";
  draftAudience.value = "";
  draftTone.value = "";
  draftStructureTemplate.value = "";
  draftEmphasisText.value = "";
  draftCitationPolicy.value = "auto";
  draftTitlePolicy.value = "retain";
  draftImageFocus.value = "auto";
  draftLayoutFormat.value = "auto";
  draftVisualMode.value = "auto";
  optimizedPrompt.value = "";
  optimizedProfile.value = null;
  optimizeNotes.value = [];
  optimizeError.value = "";
  beforeText.value = "";
  afterText.value = "";
  compareError.value = "";
}

function saveCurrent() {
  const id = store.selectedStyleId || crypto.randomUUID();
  const emphasisPoints = draftEmphasisText.value
    .split(/[\n,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  const next = createStyleTemplate({
    id,
    name: draftName.value.trim(),
    prompt: draftPrompt.value.trim(),
    audience: draftAudience.value.trim(),
    tone: draftTone.value.trim(),
    structure_template: draftStructureTemplate.value.trim(),
    emphasis_points: emphasisPoints,
    citation_policy: draftCitationPolicy.value,
    title_policy: draftTitlePolicy.value,
    image_focus: draftImageFocus.value,
    layout_format: draftLayoutFormat.value,
    visual_mode: draftVisualMode.value,
  });
  store.upsertStyle(next);
  store.selectedStyleId = id;
}

function buildDraftStyle(promptValue = draftPrompt.value, profileOverride: StylePromptOptimizeResponse["profile_suggestion"] = null) {
  const emphasisPoints = profileOverride?.emphasis_points?.length
    ? profileOverride.emphasis_points
    : draftEmphasisText.value
        .split(/[\n,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);
  return createStyleTemplate({
    id: store.selectedStyleId || "draft-style",
    name: draftName.value.trim() || "未命名风格",
    prompt: promptValue.trim(),
    audience: profileOverride?.audience ?? draftAudience.value.trim(),
    tone: profileOverride?.tone ?? draftTone.value.trim(),
    structure_template: profileOverride?.structure_template ?? draftStructureTemplate.value.trim(),
    emphasis_points: emphasisPoints,
    citation_policy: profileOverride?.citation_policy ?? draftCitationPolicy.value,
    title_policy: profileOverride?.title_policy ?? draftTitlePolicy.value,
    image_focus: profileOverride?.image_focus ?? draftImageFocus.value,
    layout_format: profileOverride?.layout_format ?? draftLayoutFormat.value,
    visual_mode: profileOverride?.visual_mode ?? draftVisualMode.value,
  });
}

function removeCurrent() {
  const id = store.selectedStyleId;
  if (!id) return;
  store.removeStyle(id);
}

const detectedMode = computed(() => detectMode(props.currentInput));

function targetForMode(mode: DetectedMode): StylePromptTarget {
  return mode === "discover" ? "discover" : "rewrite";
}

function signatureForHint(item: StylePromptMemoryHint) {
  return [
    item.target,
    item.optimized_prompt.trim(),
    item.profile_suggestion.structure_template,
    item.profile_suggestion.tone,
    item.source_style_name,
  ].join("|");
}

function buildCurrentProfileSuggestion(): StylePromptOptimizeResponse["profile_suggestion"] {
  return {
    audience: draftAudience.value.trim(),
    tone: draftTone.value.trim(),
    structure_template: draftStructureTemplate.value.trim(),
    emphasis_points: draftEmphasisText.value
      .split(/[\n,，;；]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8),
    citation_policy: draftCitationPolicy.value,
    title_policy: draftTitlePolicy.value,
    image_focus: draftImageFocus.value,
    layout_format: draftLayoutFormat.value,
    visual_mode: draftVisualMode.value,
  };
}

const matchedMemoryHints = computed(() => store.getStylePromptMemoryHints(draftPrompt.value, targetForMode(detectedMode.value), 3));
const matchedRunHints = computed(() => runMemory.getReusableStyleHints(draftPrompt.value, targetForMode(detectedMode.value), 3));
const activeFunctionSkillHits = computed(() => {
  const draftStyle = buildDraftStyle();
  return buildFunctionSkillHits({
    mode: detectedMode.value,
    input: props.currentInput,
    styleProfile: buildStyleProfile(draftStyle),
    imageConfig: store.imageConfig,
  });
});

function buildDraftStyleProfile(promptValue = draftPrompt.value, profileOverride: StylePromptOptimizeResponse["profile_suggestion"] = null) {
  const draftStyle = buildDraftStyle(promptValue, profileOverride);
  return buildStyleProfile(draftStyle, {
    functionSkills: buildFunctionSkillHits({
      mode: detectedMode.value,
      input: props.currentInput,
      styleProfile: buildStyleProfile(draftStyle),
      imageConfig: store.imageConfig,
    }),
  });
}

const matchedHints = computed(() => {
  const seen = new Set<string>();
  const merged: StylePromptMemoryHint[] = [];
  for (const item of [...matchedMemoryHints.value, ...matchedRunHints.value]) {
    const signature = signatureForHint(item);
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(item);
  }
  return merged.slice(0, 5);
});

function applyMemoryHint(item: StylePromptMemoryHint) {
  draftPrompt.value = item.optimized_prompt.trim();
  draftAudience.value = item.profile_suggestion.audience || "";
  draftTone.value = item.profile_suggestion.tone || "";
  draftStructureTemplate.value = item.profile_suggestion.structure_template || "";
  draftEmphasisText.value = (item.profile_suggestion.emphasis_points || []).join("，");
  draftCitationPolicy.value = item.profile_suggestion.citation_policy || "auto";
  draftTitlePolicy.value = item.profile_suggestion.title_policy || "retain";
  draftImageFocus.value = item.profile_suggestion.image_focus || "auto";
  draftLayoutFormat.value = item.profile_suggestion.layout_format || "auto";
  draftVisualMode.value = item.profile_suggestion.visual_mode || "auto";
  store.recordStylePromptMemory({
    target: item.target,
    prompt_excerpt: item.prompt_excerpt,
    optimized_prompt: item.optimized_prompt,
    profile_suggestion: item.profile_suggestion,
    source_style_name: item.source_style_name || draftName.value.trim() || "历史风格",
    accepted_at: item.accepted_at,
  });
}

async function runCompare(
  beforePrompt: string,
  afterPromptValue: string,
  profileOverride: StylePromptOptimizeResponse["profile_suggestion"] = null,
) {
  compareController?.abort();
  const controller = new AbortController();
  compareController = controller;
  comparing.value = true;
  compareError.value = "";
  beforeText.value = "";
  afterText.value = "";
  const mode = detectedMode.value;

  try {
    const beforeStyleProfile = buildDraftStyleProfile(beforePrompt);
    const styleProfile = buildDraftStyleProfile(afterPromptValue, profileOverride);
    if (mode === "discover") {
      const [before, after] = await Promise.all([
        submitDiscover(
          {
            query: props.currentInput.trim(),
            style_prompt: beforePrompt,
            style_profile: beforeStyleProfile,
            llm: store.llmConfig,
            cache: { enabled: true },
          },
          controller.signal,
        ),
        submitDiscover(
          {
            query: props.currentInput.trim(),
            style_prompt: afterPromptValue,
            style_profile: styleProfile,
            llm: store.llmConfig,
            cache: { enabled: true },
          },
          controller.signal,
        ),
      ]);
      if (compareController !== controller) return;
      beforeText.value = before.transformed_text;
      afterText.value = after.transformed_text;
      return;
    }

    const basePayload: Omit<TransformPayload, "style_prompt"> = {
      input_type: mode,
      input: props.currentInput,
      style_profile: beforeStyleProfile,
      llm: store.llmConfig,
      image: { ...store.imageConfig, enabled: false },
      cache: { enabled: true },
    };

    const [before, after] = await Promise.all([
      submitTransform({ ...basePayload, style_prompt: beforePrompt }, controller.signal),
      submitTransform({ ...basePayload, style_prompt: afterPromptValue, style_profile: styleProfile }, controller.signal),
    ]);
    if (compareController !== controller) return;
    beforeText.value = before.transformed_text;
    afterText.value = after.transformed_text;
  } catch (error) {
    if (isRequestCanceled(error)) {
      return;
    }
    if (compareController !== controller) return;
    compareError.value = resolveApiError(
      error,
      "对比运行失败。",
      "对比任务耗时较长或服务暂时不可用，请稍后重试。",
    ).message;
  } finally {
    if (compareController === controller) {
      comparing.value = false;
      compareController = null;
    }
  }
}

async function handleOptimize() {
  optimizeError.value = "";
  optimizedPrompt.value = "";
  optimizedProfile.value = null;
  optimizeNotes.value = [];

  const rawPrompt = draftPrompt.value.trim();
  if (!rawPrompt) {
    optimizeError.value = "请先填写风格提示词。";
    return;
  }

  optimizing.value = true;
  try {
    const response = await optimizeStylePrompt({
      prompt: rawPrompt,
      target: targetForMode(detectedMode.value),
      llm: store.llmConfig,
      current_profile: buildStyleProfile(buildDraftStyle()) ? buildCurrentProfileSuggestion() : null,
      memory_hints: matchedHints.value,
    });
    optimizedPrompt.value = response.optimized_prompt;
    optimizedProfile.value = response.profile_suggestion || null;
    optimizeNotes.value = response.notes || [];

    if (props.currentInput.trim()) {
      await runCompare(rawPrompt, optimizedPrompt.value, optimizedProfile.value);
    }
  } catch (error) {
    optimizeError.value = resolveApiError(
      error,
      "提示词优化失败。",
      "提示词优化服务暂时不可用，请稍后重试。",
    ).message;
  } finally {
    optimizing.value = false;
  }
}

function applyOptimized() {
  if (!optimizedPrompt.value.trim()) return;
  const target = targetForMode(detectedMode.value);
  const promptBeforeApply = draftPrompt.value.trim();
  draftPrompt.value = optimizedPrompt.value.trim();
  if (optimizedProfile.value) {
    draftAudience.value = optimizedProfile.value.audience || "";
    draftTone.value = optimizedProfile.value.tone || "";
    draftStructureTemplate.value = optimizedProfile.value.structure_template || "";
    draftEmphasisText.value = (optimizedProfile.value.emphasis_points || []).join("，");
    draftCitationPolicy.value = optimizedProfile.value.citation_policy || "auto";
    draftTitlePolicy.value = optimizedProfile.value.title_policy || "retain";
    draftImageFocus.value = optimizedProfile.value.image_focus || "auto";
    draftLayoutFormat.value = optimizedProfile.value.layout_format || "auto";
    draftVisualMode.value = optimizedProfile.value.visual_mode || "auto";
    store.recordStylePromptMemory({
      target,
      prompt_excerpt: promptBeforeApply,
      optimized_prompt: optimizedPrompt.value.trim(),
      profile_suggestion: optimizedProfile.value,
      source_style_name: draftName.value.trim() || "未命名风格",
    });
  }
  optimizedPrompt.value = "";
  optimizedProfile.value = null;
  optimizeNotes.value = [];
  saveCurrent();
}

watch(
  () => [store.selectedStyleId, store.styles] as const,
  () => {
    const current = store.styles.find((style) => style.id === store.selectedStyleId) || store.styles[0];
    if (!current || store.selectedStyleId === "") return;
    draftName.value = current.name;
    draftPrompt.value = current.prompt;
    draftAudience.value = current.audience;
    draftTone.value = current.tone;
    draftStructureTemplate.value = current.structure_template;
    draftEmphasisText.value = current.emphasis_points.join("，");
    draftCitationPolicy.value = current.citation_policy;
    draftTitlePolicy.value = current.title_policy;
    draftImageFocus.value = current.image_focus;
    draftLayoutFormat.value = current.layout_format;
    draftVisualMode.value = current.visual_mode;
  },
  { immediate: true, deep: true },
);

onBeforeUnmount(() => {
  compareController?.abort();
  compareController = null;
});
</script>

<template>
  <section class="drawer-section">
    <div class="drawer-header-row">
      <h2 class="drawer-title">风格卡片提示词</h2>
      <div class="hint">会自动匹配当前输入场景</div>
    </div>

    <input v-if="store.styles.length > 2" v-model="search" placeholder="搜索风格卡片" />

    <div class="style-chip-row">
      <button
        v-for="style in filteredStyles"
        :key="style.id"
        :class="['tag-chip', { active: style.id === store.selectedStyleId }]"
        type="button"
        @click="loadStyle(style)"
      >
        {{ style.name }}
      </button>
    </div>

    <div class="grid-2">
      <label class="field">
        <span>风格名称</span>
        <input v-model="draftName" placeholder="例如：公众号解读" />
      </label>
      <div class="actions-row align-end">
        <button class="ghost-button" type="button" @click="createNew">新建</button>
        <button class="ghost-button danger" type="button" :disabled="!store.selectedStyleId" @click="removeCurrent">
          删除
        </button>
        <button class="secondary-button" type="button" :disabled="!draftName.trim() || !draftPrompt.trim()" @click="saveCurrent">
          保存
        </button>
      </div>
    </div>

    <label class="field">
      <span>风格提示词</span>
      <textarea v-model="draftPrompt" rows="6" placeholder="输入完整的风格化改写要求" />
    </label>
    <p class="hint">支持变量：{title}、{summary}、{source_url}（改写链路会自动替换）。</p>

    <div class="grid-2">
      <label class="field">
        <span>目标受众</span>
        <input v-model="draftAudience" placeholder="例如：公众号读者 / 产品经理 / 中学生" />
      </label>
      <label class="field">
        <span>语气与表达</span>
        <input v-model="draftTone" placeholder="例如：克制、直接、信息密度高" />
      </label>
    </div>

    <label class="field">
      <span>推荐结构</span>
      <input v-model="draftStructureTemplate" placeholder="例如：TL;DR -> 分节解析 -> 结尾建议" />
    </label>

    <label class="field">
      <span>输出重点</span>
      <input v-model="draftEmphasisText" placeholder="用逗号分隔，例如：关键事实，行动建议，风险提示" />
    </label>

    <div class="grid-3">
      <label class="field">
        <span>标题策略</span>
        <select v-model="draftTitlePolicy">
          <option value="retain">尽量保留原意</option>
          <option value="rewrite">允许重写</option>
          <option value="punchy">更有张力</option>
        </select>
      </label>
      <label class="field">
        <span>引用策略</span>
        <select v-model="draftCitationPolicy">
          <option value="auto">自动</option>
          <option value="strict">严格引用</option>
          <option value="minimal">仅关键处引用</option>
          <option value="none">不主动引用</option>
        </select>
      </label>
      <label class="field">
        <span>配图倾向</span>
        <select v-model="draftImageFocus">
          <option value="auto">自动</option>
          <option value="narrative">叙事插画</option>
          <option value="diagram">概念图</option>
          <option value="editorial">杂志插画</option>
        </select>
      </label>
    </div>

    <div class="grid-2">
      <label class="field">
        <span>版式风格</span>
        <select v-model="draftLayoutFormat">
          <option value="auto">自动</option>
          <option value="newspaper">报纸版</option>
          <option value="poster">海报版</option>
          <option value="book">书籍版</option>
          <option value="classical">古文书卷版</option>
          <option value="ppt">PPT 汇报版</option>
          <option value="paper">论文研究版</option>
          <option value="poetry">诗歌留白版</option>
        </select>
      </label>
      <label class="field">
      <span>内容可视化</span>
      <select v-model="draftVisualMode">
        <option value="auto">自动</option>
          <option value="enhanced">尽量加入图表/流程</option>
          <option value="minimal">仅必要时加入</option>
          <option value="none">纯正文</option>
      </select>
    </label>
    </div>

    <details class="panel-lite" open>
      <summary class="sources-summary">本轮将附带的功能技能（{{ activeFunctionSkillHits.length }}）</summary>
      <div class="skill-suggestion-grid">
        <article v-for="item in activeFunctionSkillHits" :key="item.id" class="memory-hint-card function-skill-card">
          <p><strong>{{ item.label }}</strong></p>
          <p>{{ item.instruction }}</p>
          <p class="hint">命中原因：{{ item.reason }}</p>
        </article>
      </div>
    </details>

    <div class="actions-row">
      <button class="primary-button" type="button" :disabled="optimizing || !draftPrompt.trim()" @click="handleOptimize">
        {{ optimizing ? "优化中..." : "一键优化提示词" }}
      </button>
      <button class="ghost-button" type="button" :disabled="!optimizedPrompt.trim()" @click="applyOptimized">应用优化</button>
      <span v-if="optimizeError" class="danger-text">{{ optimizeError }}</span>
    </div>

    <div v-if="optimizeNotes.length" class="hint">
      <p v-for="note in optimizeNotes" :key="note">- {{ note }}</p>
    </div>

    <details v-if="matchedHints.length" class="panel-lite">
      <summary class="sources-summary">命中的风格记忆（{{ matchedHints.length }}）</summary>
      <div class="skill-suggestion-grid">
        <article v-for="item in matchedHints" :key="signatureForHint(item)" class="memory-hint-card">
          <p><strong>{{ item.source_style_name || "历史风格" }}</strong> · {{ item.target === "discover" ? "调研" : "改写" }}</p>
          <p class="hint">{{ item.prompt_excerpt }}</p>
          <p><strong>结构：</strong>{{ item.profile_suggestion.structure_template || "未提取" }}</p>
          <p><strong>语气：</strong>{{ item.profile_suggestion.tone || "未提取" }}</p>
          <div class="actions-row">
            <button class="ghost-button" type="button" @click="applyMemoryHint(item)">复用到当前风格</button>
          </div>
        </article>
      </div>
    </details>

    <details v-if="optimizedPrompt.trim()" class="panel-lite">
      <summary class="sources-summary">优化后的提示词（点击展开）</summary>
      <pre class="pre-wrap">{{ optimizedPrompt }}</pre>
    </details>

    <details v-if="optimizedProfile" class="panel-lite">
      <summary class="sources-summary">结构化风格建议（点击展开）</summary>
      <div class="skill-suggestion-grid">
        <p><strong>目标受众：</strong>{{ optimizedProfile.audience || "未提取" }}</p>
        <p><strong>语气与表达：</strong>{{ optimizedProfile.tone || "未提取" }}</p>
        <p><strong>推荐结构：</strong>{{ optimizedProfile.structure_template || "未提取" }}</p>
        <p><strong>输出重点：</strong>{{ optimizedProfile.emphasis_points?.join("，") || "未提取" }}</p>
        <p><strong>标题策略：</strong>{{ optimizedProfile.title_policy }}</p>
        <p><strong>引用策略：</strong>{{ optimizedProfile.citation_policy }}</p>
        <p><strong>配图倾向：</strong>{{ optimizedProfile.image_focus }}</p>
        <p><strong>版式风格：</strong>{{ optimizedProfile.layout_format }}</p>
        <p><strong>内容可视化：</strong>{{ optimizedProfile.visual_mode }}</p>
      </div>
    </details>

    <div v-if="comparing" class="hint">正在生成优化前/后效果对比…</div>
    <div v-else-if="compareError" class="danger-text">{{ compareError }}</div>

    <div v-if="beforeText || afterText" class="compare-grid">
      <div class="compare-col">
        <div class="compare-title">优化前</div>
        <div class="markdown" v-html="beforeHtml" />
      </div>
      <div class="compare-col">
        <div class="compare-title">优化后</div>
        <div class="markdown" v-html="afterHtml" />
      </div>
    </div>
  </section>
</template>

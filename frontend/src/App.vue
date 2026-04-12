<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import DiscoverViewer from "./components/DiscoverViewer.vue";
import HistoryDrawer from "./components/HistoryDrawer.vue";
import HistoryResultViewer from "./components/HistoryResultViewer.vue";
import OnboardingOverlay from "./components/OnboardingOverlay.vue";
import PinnedRunsStrip from "./components/PinnedRunsStrip.vue";
import ProgressStepper from "./components/ProgressStepper.vue";
import SettingsDrawer from "./components/SettingsDrawer.vue";
import TopBar from "./components/TopBar.vue";
import ResultViewer from "./components/ResultViewer.vue";
import { useTransform } from "./composables/useTransform";
import { isRequestCanceled, previewStylePrompt, recommendStylePrompt, resolveApiError, submitDiscover } from "./lib/api";
import { buildFunctionSkills } from "./lib/functionSkills";
import { buildStyleGuideCard, buildStylePreviewCards } from "./lib/stylePreview";
import { recommendStyle, recommendStyleCandidates } from "./lib/styleRecommend";
import { buildStyleProfile } from "./lib/styleSkill";
import { usePreferencesStore } from "./stores/preferences";
import { useRunMemoryStore } from "./stores/runMemory";
import { detectMode } from "./lib/detectMode";
import { parseDirectLaunchConfigFromLocation } from "./lib/directInput";
import {
  computeTokenRateK,
  gradeFromTokenRateK,
  updateTokenRateWindowAverageK,
} from "./lib/tokenRate";
import type { DetectedMode, DiscoverResponse, DiscoverResumeStage, RecentRunEntry } from "./types";

const store = usePreferencesStore();
const runMemory = useRunMemoryStore();
const {
  loading,
  regeneratingImageId,
  generatingImages,
  errorMessage,
  errorSuggestion,
  result,
  run,
  cancel,
  imageProgress,
  regenerateSingleImage,
} = useTransform();

const inputValue = ref("");
const inputEl = ref<HTMLTextAreaElement | null>(null);
const manualStyleLocked = ref(false);
const detectedMode = computed<DetectedMode>(() => detectMode(inputValue.value));
const showManualStyleSelection = computed(() => !store.autoStyleEnabled || manualStyleLocked.value);

const selectedStylePrompt = computed(() => store.selectedStyle?.prompt || "");
const selectedFunctionSkills = computed(() =>
  buildFunctionSkills({
    mode: detectedMode.value,
    input: inputValue.value,
    styleProfile: buildStyleProfile(store.selectedStyle),
    imageConfig: store.imageConfig,
  }),
);
const selectedStyleProfile = computed(() =>
  buildStyleProfile(store.selectedStyle, {
    functionSkills: selectedFunctionSkills.value,
  }),
);

function handleRegenerateImage(payload: { image_id: string; prompt: string }) {
  regenerateSingleImage({
    ...payload,
    image: store.imageConfig,
    llm: store.llmConfig,
  });
}

const settingsOpen = ref(false);
const settingsTab = ref<"llm" | "styles" | "advanced">("llm");
const historyOpen = ref(false);
const bootstrappedDirectInput = ref(false);

const tokenRateK = ref<number | null>(null);
const tokenGrade = ref<1 | 2 | 3 | 4 | 5 | null>(null);

const discoverLoading = ref(false);
const discoverResult = ref<DiscoverResponse | null>(null);
const discoverErrorMessage = ref("");
const discoverErrorSuggestion = ref("");
let discoverController: AbortController | null = null;
const selectedHistoryRun = ref<RecentRunEntry | null>(null);
const activeMode = ref<DetectedMode | null>(null);
const inputPlaceholder = computed(() => {
  if (detectedMode.value === "discover") return "输入你想了解的问题，或贴入带问题的一段需求说明";
  if (detectedMode.value === "url") return "粘贴一个或多个公开链接；多个链接可直接连续粘贴，也可换行";
  return "粘贴正文、资料片段，或直接开始写你想整理的内容";
});
const inputHint = computed(() => {
  if (detectedMode.value === "url") return "多个链接支持空格、换行或中文标点分隔；单条链接可直接回车开始。";
  if (detectedMode.value === "discover") return "问题越具体，结论和来源会越稳。";
  return "支持长文本自动扩展输入框；正文模式可用 Ctrl/Cmd + Enter 开始。";
});
const heuristicStyleRecommendation = computed(() =>
  recommendStyle({
    input: inputValue.value,
    mode: detectedMode.value,
    styles: store.styles,
    recentRuns: runMemory.recentRuns,
    styleMemories: store.stylePromptMemories,
  }),
);
const heuristicStyleCandidates = computed(() =>
  recommendStyleCandidates(
    {
      input: inputValue.value,
      mode: detectedMode.value,
      styles: store.styles,
      recentRuns: runMemory.recentRuns,
      styleMemories: store.stylePromptMemories,
    },
    4,
  ),
);
const llmStyleRecommendation = ref<{ styleId: string; reason: string; score: number } | null>(null);
const llmStyleCandidates = ref<Array<{ styleId: string; reason: string; score: number }>>([]);
const stylePreviewItems = ref<Array<{ style_id: string; preview_text: string; focus_points: string[] }>>([]);
const stylePanelsCollapsed = ref(false);
const autoStyleRecommendation = computed(() => llmStyleRecommendation.value || heuristicStyleRecommendation.value);
const recommendedStyleMeta = computed(() => {
  const styleId = autoStyleRecommendation.value?.styleId;
  if (!styleId) return null;
  return store.styles.find((style) => style.id === styleId) || null;
});
const recommendedStyleGuide = computed(() => {
  if (!store.autoStyleEnabled || manualStyleLocked.value || !recommendedStyleMeta.value || !autoStyleRecommendation.value) return null;
  return buildStyleGuideCard({
    mode: detectedMode.value,
    style: recommendedStyleMeta.value,
    reason: autoStyleRecommendation.value.reason,
    score: autoStyleRecommendation.value.score,
    source: llmStyleRecommendation.value?.styleId === recommendedStyleMeta.value.id ? "llm" : "heuristic",
    preview: stylePreviewItems.value.find((item) => item.style_id === recommendedStyleMeta.value?.id) || null,
  });
});
const showStyleAssistant = computed(() => !stylePanelsCollapsed.value);
const manualSelectedStyleGuide = computed(() => {
  if (!manualStyleLocked.value || !store.selectedStyle) return null;
  return buildStyleGuideCard({
    mode: detectedMode.value,
    style: store.selectedStyle,
    reason: "你已手动锁定这个风格，本次会按这一路数直接成稿。",
    preview: stylePreviewItems.value.find((item) => item.style_id === store.selectedStyle?.id) || null,
  });
});
const stylePreviewCandidates = computed(() => {
  const candidates: Array<{ styleId: string; reason: string; score: number; source: "llm" | "heuristic" }> = [];
  const pushCandidate = (styleId: string, reason: string, score: number, source: "llm" | "heuristic") => {
    if (!styleId || candidates.some((item) => item.styleId === styleId)) return;
    candidates.push({ styleId, reason, score, source });
  };

  if (llmStyleRecommendation.value?.styleId) {
    pushCandidate(
      llmStyleRecommendation.value.styleId,
      llmStyleRecommendation.value.reason,
      llmStyleRecommendation.value.score,
      "llm",
    );
  }
  for (const candidate of llmStyleCandidates.value) {
    pushCandidate(candidate.styleId, candidate.reason, candidate.score, "llm");
    if (candidates.length >= 4) break;
  }
  for (const candidate of heuristicStyleCandidates.value) {
    pushCandidate(candidate.styleId, candidate.reason, candidate.score, "heuristic");
    if (candidates.length >= 4) break;
  }
  return buildStylePreviewCards({
    mode: detectedMode.value,
    styles: store.styles,
    candidates,
    previews: stylePreviewItems.value,
    limit: 4,
  });
});
let autoStyleController: AbortController | null = null;
let autoStyleTimer: number | null = null;
let stylePreviewController: AbortController | null = null;
let stylePreviewTimer: number | null = null;

type StepperState = "idle" | "running" | "done" | "error";
const stepperState = ref<StepperState>("idle");
const stepperSteps = ref<string[]>([]);
const stepperActiveIndex = ref(0);
const timers: number[] = [];

function clearTimers() {
  while (timers.length) {
    const id = timers.pop();
    if (id != null) window.clearTimeout(id);
  }
}

function clearAutoStyleTimer() {
  if (autoStyleTimer != null) {
    window.clearTimeout(autoStyleTimer);
    autoStyleTimer = null;
  }
}

function clearStylePreviewTimer() {
  if (stylePreviewTimer != null) {
    window.clearTimeout(stylePreviewTimer);
    stylePreviewTimer = null;
  }
}

function styleTargetForMode(mode: DetectedMode) {
  return mode === "discover" ? "discover" : "rewrite";
}

function stopAutoStyleRequest() {
  clearAutoStyleTimer();
  autoStyleController?.abort();
  autoStyleController = null;
}

function stopStylePreviewRequest() {
  clearStylePreviewTimer();
  stylePreviewController?.abort();
  stylePreviewController = null;
}

async function runLLMStyleRecommendation() {
  stopAutoStyleRequest();
  const cleanedInput = inputValue.value.trim();
  if (!store.autoStyleEnabled || manualStyleLocked.value || !cleanedInput || cleanedInput.length < 8 || !store.styles.length) {
    llmStyleRecommendation.value = null;
    llmStyleCandidates.value = [];
    stylePreviewItems.value = [];
    return;
  }

  const controller = new AbortController();
  autoStyleController = controller;
  try {
    const response = await recommendStylePrompt(
      {
        input_text: cleanedInput,
        target: styleTargetForMode(detectedMode.value),
        llm: store.llmConfig,
        top_k: 4,
        styles: store.styles.map((style) => ({
          id: style.id,
          name: style.name,
          prompt: style.prompt,
          audience: style.audience,
          tone: style.tone,
          structure_template: style.structure_template,
          emphasis_points: style.emphasis_points,
          layout_format: style.layout_format,
          visual_mode: style.visual_mode,
        })),
      },
      controller.signal,
    );
    if (autoStyleController !== controller) return;
    if (!response.style_id) {
      llmStyleRecommendation.value = null;
      llmStyleCandidates.value = [];
      stylePreviewItems.value = [];
      return;
    }
    llmStyleRecommendation.value = {
      styleId: response.style_id,
      reason: response.reason?.trim() || "已由模型识别为更匹配的风格。",
      score: Math.round((response.confidence ?? 0.8) * 100),
    };
    llmStyleCandidates.value = (response.candidates || [])
      .map((candidate) => ({
        styleId: candidate.style_id,
        reason: candidate.reason?.trim() || "已由模型识别为较匹配的备选风格。",
        score: Math.round((candidate.confidence ?? 0.6) * 100),
      }))
      .filter((candidate, index, list) => candidate.styleId && list.findIndex((item) => item.styleId === candidate.styleId) === index)
      .slice(0, 4);
  } catch (error) {
    if (isRequestCanceled(error)) return;
    if (autoStyleController !== controller) return;
    llmStyleRecommendation.value = null;
    llmStyleCandidates.value = [];
    stylePreviewItems.value = [];
  } finally {
    if (autoStyleController === controller) {
      autoStyleController = null;
    }
  }
}

async function runStylePreviewRequest() {
  stopStylePreviewRequest();
  const cleanedInput = inputValue.value.trim();
  const candidateIds = stylePreviewCandidates.value.map((item) => item.styleId).slice(0, 3);
  if (!cleanedInput || cleanedInput.length < 12 || candidateIds.length < 2) {
    stylePreviewItems.value = [];
    return;
  }

  const controller = new AbortController();
  stylePreviewController = controller;
  try {
    const response = await previewStylePrompt(
      {
        input_text: cleanedInput,
        target: styleTargetForMode(detectedMode.value),
        llm: store.llmConfig,
        style_ids: candidateIds,
        max_items: candidateIds.length,
        styles: store.styles
          .filter((style) => candidateIds.includes(style.id))
          .map((style) => ({
            id: style.id,
            name: style.name,
            prompt: style.prompt,
            audience: style.audience,
            tone: style.tone,
            structure_template: style.structure_template,
            emphasis_points: style.emphasis_points,
            layout_format: style.layout_format,
            visual_mode: style.visual_mode,
          })),
      },
      controller.signal,
    );
    if (stylePreviewController !== controller) return;
    stylePreviewItems.value = response.previews || [];
  } catch (error) {
    if (isRequestCanceled(error)) return;
    if (stylePreviewController !== controller) return;
    stylePreviewItems.value = [];
  } finally {
    if (stylePreviewController === controller) {
      stylePreviewController = null;
    }
  }
}

function queueStylePreviewRequest() {
  clearStylePreviewTimer();
  stylePreviewTimer = window.setTimeout(() => {
    void runStylePreviewRequest();
  }, 720);
}

function queueLLMStyleRecommendation() {
  clearAutoStyleTimer();
  autoStyleTimer = window.setTimeout(() => {
    void runLLMStyleRecommendation();
  }, 520);
}

function buildSteps(mode: DetectedMode, withImages: boolean): string[] {
  if (mode === "discover") return ["查找资料", "筛选内容", "整理重点", "生成结果", "完成"];
  if (mode === "url") return withImages ? ["读取页面", "提取内容", "生成结果", "生成配图", "完成"] : ["读取页面", "提取内容", "生成结果", "完成"];
  return withImages ? ["整理输入", "生成结果", "生成配图", "完成"] : ["整理输入", "生成结果", "完成"];
}

function startStepper(mode: DetectedMode) {
  clearTimers();
  const withImages = store.imageConfig.enabled && mode !== "discover";
  stepperSteps.value = buildSteps(mode, withImages);
  stepperActiveIndex.value = 0;
  stepperState.value = "running";

  const lastIndex = stepperSteps.value.length - 1;
  const stopBeforeIndex = withImages ? Math.max(0, lastIndex - 2) : Math.max(0, lastIndex - 1);
  const schedule = (index: number, delay: number) => {
    timers.push(
      window.setTimeout(() => {
        if (stepperState.value !== "running") return;
        stepperActiveIndex.value = Math.min(index, stopBeforeIndex);
      }, delay),
    );
  };

  if (mode === "url") {
    schedule(1, 420);
    schedule(2, 1100);
  } else if (mode === "text") {
    schedule(1, 520);
  } else {
    schedule(1, 520);
    schedule(2, 1200);
    schedule(3, 1700);
  }
}

function finishStepper() {
  clearTimers();
  stepperActiveIndex.value = Math.max(0, stepperSteps.value.length - 1);
  stepperState.value = "done";
}

function errorStepper() {
  clearTimers();
  stepperState.value = "error";
}

function updateTokenIndicator(text: string, durationMs: number) {
  const rate = computeTokenRateK(text, durationMs);
  tokenRateK.value = Number.isFinite(rate) ? rate : null;
  if (tokenRateK.value == null) {
    tokenGrade.value = null;
    return;
  }

  const avg10mK = updateTokenRateWindowAverageK(tokenRateK.value);
  tokenGrade.value = avg10mK == null ? gradeFromTokenRateK(tokenRateK.value) : gradeFromTokenRateK(avg10mK);
}

const running = computed(() => loading.value || discoverLoading.value || generatingImages.value);
const currentResultSnapshot = computed(() => {
  if (discoverResult.value) {
    return {
      title: discoverResult.value.title,
      text: discoverResult.value.transformed_text,
      summary: discoverResult.value.brief.conclusion || discoverResult.value.brief.summary,
      keyFindings: discoverResult.value.brief.key_findings,
    };
  }
  if (result.value) {
    return {
      title: result.value.title,
      text: result.value.transformed_text,
      summary: result.value.raw_excerpt,
      keyFindings: [] as string[],
    };
  }
  return null;
});

async function runDiscoverFlow() {
  return await runDiscoverFlowWithResume(null);
}

async function runDiscoverFlowWithResume(resumeStage: DiscoverResumeStage | null) {
  discoverController?.abort();
  const requestController = new AbortController();
  discoverController = requestController;
  discoverLoading.value = true;
  discoverErrorMessage.value = "";
  discoverErrorSuggestion.value = "";
  if (!resumeStage) {
    discoverResult.value = null;
  }

  try {
    const resume = resumeStage && discoverResult.value?.run?.id
      ? {
          run_id: discoverResult.value.run.id,
          stage: resumeStage,
        }
      : null;
    discoverResult.value = await submitDiscover(
      {
        query: inputValue.value.trim(),
        style_prompt: selectedStylePrompt.value,
        style_profile: selectedStyleProfile.value,
        llm: store.llmConfig,
        resume,
        cache: { enabled: true },
      },
      requestController.signal,
    );
    if (discoverController !== requestController) return;
    updateTokenIndicator(discoverResult.value.transformed_text, discoverResult.value.meta.duration_ms);
    finishStepper();
  } catch (error) {
    if (isRequestCanceled(error)) {
      return;
    }
    if (discoverController !== requestController) return;
    const resolvedError = resolveApiError(
      error,
      "探索发现失败。",
      "可以换个关键词试试；如果你启用了“搜索增强（SearxNG）”，确认它已启动并可访问。",
    );
    discoverErrorMessage.value = resolvedError.message;
    discoverErrorSuggestion.value = resolvedError.suggestion;
    errorStepper();
  } finally {
    if (discoverController === requestController) {
      discoverLoading.value = false;
      discoverController = null;
    }
  }
}

async function handleRerunDiscover(stage: DiscoverResumeStage) {
  if (!discoverResult.value?.run?.id || discoverLoading.value || loading.value || generatingImages.value) return;
  activeMode.value = "discover";
  startStepper("discover");
  await runDiscoverFlowWithResume(stage);
}

function runTransformFlow(mode: "url" | "text") {
  discoverController?.abort();
  discoverLoading.value = false;
  discoverResult.value = null;
  discoverErrorMessage.value = "";
  discoverErrorSuggestion.value = "";

  run({
    input_type: mode,
    input: inputValue.value,
    style_prompt: selectedStylePrompt.value,
    style_profile: selectedStyleProfile.value,
    llm: store.llmConfig,
    image: {
      ...store.imageConfig,
      provider: store.imageConfig.provider || store.llmConfig.provider,
      base_url: store.imageConfig.base_url || store.llmConfig.base_url,
    },
    cache: {
      enabled: mode === "url" ? true : store.cacheEnabled,
    },
  });
}

function stopAll() {
  clearTimers();
  stepperState.value = "idle";
  stepperActiveIndex.value = 0;
  activeMode.value = null;
  cancel();
  discoverController?.abort();
  discoverController = null;
  discoverLoading.value = false;
}

async function handlePrimaryClick() {
  if (running.value) {
    stopAll();
    return;
  }

  const value = inputValue.value.trim();
  if (!value) return;
  stylePanelsCollapsed.value = true;

  // Reset previous result/errors
  cancel();
  result.value = null;
  discoverResult.value = null;
  discoverErrorMessage.value = "";
  discoverErrorSuggestion.value = "";
  activeMode.value = detectedMode.value;
  startStepper(activeMode.value);

  if (activeMode.value === "discover") {
    await runDiscoverFlow();
    return;
  }
  runTransformFlow(activeMode.value);
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && running.value) {
    event.preventDefault();
    stopAll();
    return;
  }

  const ctrlEnter = (event.ctrlKey || event.metaKey) && event.key === "Enter";
  if (ctrlEnter) {
    event.preventDefault();
    void handlePrimaryClick();
    return;
  }

  const isEnter = event.key === "Enter";
  if (!isEnter || event.shiftKey) return;

  const mode = detectedMode.value;
  if (mode === "text") return;

  // In url/discover mode: Enter submits; Shift+Enter creates a newline.
  event.preventDefault();
  void handlePrimaryClick();
}

function resizeInput() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.overflowY = "hidden";
  const next = Math.min(420, Math.max(108, el.scrollHeight));
  el.style.height = `${next}px`;
  if (el.scrollHeight > next) {
    el.style.overflowY = "auto";
  }
}

function handleMainInput(event: Event) {
  inputValue.value = (event.target as HTMLTextAreaElement).value;
  stylePanelsCollapsed.value = false;
  resizeInput();
}

watch(inputValue, () => resizeInput(), { flush: "post" });

watch(
  () => result.value?.request_id,
  () => {
    if (!result.value) return;
    runMemory.recordTransformRun({
      input: inputValue.value,
      style: store.selectedStyle || null,
      response: result.value,
    });
  },
);

watch(
  () => discoverResult.value?.request_id,
  () => {
    if (!discoverResult.value) return;
    runMemory.recordDiscoverRun({
      input: inputValue.value,
      style: store.selectedStyle || null,
      response: discoverResult.value,
    });
  },
);

onMounted(async () => {
  resizeInput();
  if (bootstrappedDirectInput.value || inputValue.value.trim()) return;
  const launchConfig = parseDirectLaunchConfigFromLocation(window.location);
  const directInput = launchConfig.input;
  if (!directInput) return;
  bootstrappedDirectInput.value = true;
  inputValue.value = directInput;
  if (launchConfig.mode === "url" || launchConfig.mode === "text") {
    store.inputType = launchConfig.mode;
  }
  if (launchConfig.style) {
    const normalizedStyle = launchConfig.style.toLowerCase();
    const matchedStyle = store.styles.find(
      (style) => style.id.toLowerCase() === normalizedStyle || style.name.toLowerCase() === normalizedStyle,
    );
    if (matchedStyle) {
      store.autoStyleEnabled = false;
      manualStyleLocked.value = true;
      store.selectedStyleId = matchedStyle.id;
    }
  }
  await nextTick();
  resizeInput();
  if (launchConfig.autorun && detectMode(directInput) === "url") {
    void handlePrimaryClick();
  }
});

watch(
  () => generatingImages.value,
  (value) => {
    if (stepperState.value !== "running") return;
    if (!value) {
      if (loading.value) return;
      if (activeMode.value !== "discover") {
        finishStepper();
      }
      return;
    }
    const index = stepperSteps.value.findIndex((item) => item === "配图");
    if (index >= 0) stepperActiveIndex.value = index;
  },
);

watch(
  () => loading.value,
  (value) => {
    if (value) return;
    if (stepperState.value !== "running") return;
    if (generatingImages.value) return;
    if (!errorMessage.value && result.value) finishStepper();
    if (errorMessage.value) errorStepper();
  },
);

watch(
  () => result.value?.request_id,
  () => {
    if (!result.value) return;
    updateTokenIndicator(result.value.transformed_text, result.value.meta.duration_ms);
  },
);

const onboardingOpen = ref(false);
const onboardingStep = ref<1 | 2 | 3>(1);

function initOnboarding() {
  const seen = localStorage.getItem("vibeshift-onboarding-seen") === "1";
  if (!seen) onboardingOpen.value = true;
}

function handleRestoreRun(entry: RecentRunEntry) {
  runMemory.markRunRestored(entry.id);
  inputValue.value = entry.input;
  manualStyleLocked.value = true;
  store.autoStyleEnabled = false;
  if (entry.style_snapshot) {
    store.upsertStyle(entry.style_snapshot);
    store.selectedStyleId = entry.style_snapshot.id;
  } else if (entry.style_id && store.styles.some((style) => style.id === entry.style_id)) {
    store.selectedStyleId = entry.style_id;
  }
  settingsOpen.value = false;
  historyOpen.value = false;
  selectedHistoryRun.value = null;
}

function handleViewRun(entry: RecentRunEntry) {
  historyOpen.value = false;
  selectedHistoryRun.value = entry;
}

function closeOnboarding() {
  onboardingOpen.value = false;
  localStorage.setItem("vibeshift-onboarding-seen", "1");
}

function nextOnboarding() {
  if (onboardingStep.value === 3) {
    closeOnboarding();
    return;
  }
  onboardingStep.value = (onboardingStep.value + 1) as 1 | 2 | 3;
}

function openSettings(tab: "llm" | "styles" | "advanced") {
  settingsTab.value = tab;
  settingsOpen.value = true;
}

function handleSelectStyle(id: string) {
  manualStyleLocked.value = true;
  store.autoStyleEnabled = false;
  store.selectedStyleId = id;
  stylePanelsCollapsed.value = false;
}

function handlePreviewSelectStyle(id: string) {
  handleSelectStyle(id);
}

function enableAutoStyle() {
  store.autoStyleEnabled = true;
  manualStyleLocked.value = false;
  stylePanelsCollapsed.value = false;
  if (autoStyleRecommendation.value?.styleId) {
    store.selectedStyleId = autoStyleRecommendation.value.styleId;
  }
}

watch(
  () => autoStyleRecommendation.value?.styleId,
  (styleId) => {
    if (!styleId || !store.autoStyleEnabled || manualStyleLocked.value) return;
    if (styleId !== store.selectedStyleId) {
      store.selectedStyleId = styleId;
    }
  },
  { immediate: true },
);

watch(
  () => inputValue.value.trim(),
  (value) => {
    if (!value) {
      manualStyleLocked.value = false;
      llmStyleRecommendation.value = null;
      llmStyleCandidates.value = [];
      stylePreviewItems.value = [];
    }
  },
);

watch(
  [
    () => inputValue.value.trim(),
    () => detectedMode.value,
    () => store.autoStyleEnabled,
    () => manualStyleLocked.value,
    () => store.llmConfig.provider,
    () => store.llmConfig.model,
    () => store.styles.map((style) => style.id).join("|"),
  ],
  () => {
    if (!store.autoStyleEnabled || manualStyleLocked.value || !inputValue.value.trim()) {
      stopAutoStyleRequest();
      llmStyleRecommendation.value = null;
      llmStyleCandidates.value = [];
      stylePreviewItems.value = [];
      return;
    }
    queueLLMStyleRecommendation();
  },
  { immediate: true },
);

watch(
  [
    () => inputValue.value.trim(),
    () => detectedMode.value,
    () => store.autoStyleEnabled,
    () => manualStyleLocked.value,
    () => stylePreviewCandidates.value.map((item) => item.styleId).join("|"),
    () => store.llmConfig.provider,
    () => store.llmConfig.model,
  ],
  () => {
    if (!store.autoStyleEnabled || manualStyleLocked.value || !inputValue.value.trim() || stylePreviewCandidates.value.length < 2) {
      stopStylePreviewRequest();
      stylePreviewItems.value = [];
      return;
    }
    queueStylePreviewRequest();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopAutoStyleRequest();
  stopStylePreviewRequest();
});

initOnboarding();
</script>

<template>
  <main class="minimal-shell">
    <TopBar
      title="VibeShift"
      :token-rate-k="tokenRateK"
      :token-grade="tokenGrade"
      @open-history="historyOpen = true"
      @open-settings="settingsOpen = true"
    />

    <section class="center">
      <div class="brand">
        <h1 class="brand-title">VibeShift</h1>
        <p v-if="showStyleAssistant" class="brand-subtitle">把链接、正文或你想了解的问题粘贴进来，点一下开始就能生成结果。</p>
      </div>

      <div class="input-card">
        <textarea
          ref="inputEl"
          :value="inputValue"
          class="main-input"
          rows="3"
          :placeholder="inputPlaceholder"
          @keydown="handleInputKeydown"
          @input="handleMainInput"
        />

        <div class="primary-row">
          <button class="main-button" type="button" :disabled="!inputValue.trim()" @click="handlePrimaryClick">
            {{ running ? "停止" : "开始" }}
          </button>
          <span class="hint">{{ inputHint }} Esc 停止。</span>
        </div>

        <div v-if="showStyleAssistant" class="style-row" aria-label="风格卡片">
          <button
            :class="['style-chip', 'style-chip-auto', { active: store.autoStyleEnabled && !manualStyleLocked }]"
            type="button"
            :disabled="running"
            @click="enableAutoStyle"
          >
            自动匹配
          </button>
          <button
            v-for="style in store.styles"
            :key="style.id"
            :class="['style-chip', { active: showManualStyleSelection && style.id === store.selectedStyleId }]"
            type="button"
            :disabled="running"
            :title="style.prompt"
            @click="handleSelectStyle(style.id)"
          >
            {{ style.name }}
          </button>
        </div>
        <div
          v-if="showStyleAssistant && recommendedStyleGuide"
          class="state-card"
        >
          <strong>自动推荐：{{ recommendedStyleGuide.name }}</strong>
          <p>{{ recommendedStyleGuide.reason }}</p>
          <p class="hint">{{ recommendedStyleGuide.outcomeText }}</p>
          <p v-if="recommendedStyleGuide.fitText" class="hint">{{ recommendedStyleGuide.fitText }}</p>
          <p v-if="recommendedStyleGuide.approachText" class="hint">{{ recommendedStyleGuide.approachText }}</p>
          <p v-if="recommendedStyleGuide.focusText" class="hint">{{ recommendedStyleGuide.focusText }}</p>
          <p v-if="recommendedStyleGuide.previewText" class="hint">如果现在开始，开头大概会这样写：{{ recommendedStyleGuide.previewText }}</p>
        </div>
        <div v-if="showStyleAssistant && manualSelectedStyleGuide" class="state-card">
          <strong>当前已选：{{ manualSelectedStyleGuide.name }}</strong>
          <p>{{ manualSelectedStyleGuide.reason }}</p>
          <p class="hint">{{ manualSelectedStyleGuide.outcomeText }}</p>
          <p v-if="manualSelectedStyleGuide.fitText" class="hint">{{ manualSelectedStyleGuide.fitText }}</p>
          <p v-if="manualSelectedStyleGuide.approachText" class="hint">{{ manualSelectedStyleGuide.approachText }}</p>
          <p v-if="manualSelectedStyleGuide.focusText" class="hint">{{ manualSelectedStyleGuide.focusText }}</p>
          <p v-if="manualSelectedStyleGuide.previewText" class="hint">如果现在开始，开头大概会这样写：{{ manualSelectedStyleGuide.previewText }}</p>
          <p v-if="manualSelectedStyleGuide.previewFocusPoints.length" class="hint">
            这一版会更突出：{{ manualSelectedStyleGuide.previewFocusPoints.join(" / ") }}
          </p>
        </div>
        <div
          v-if="showStyleAssistant && store.autoStyleEnabled && !manualStyleLocked && inputValue.trim() && stylePreviewCandidates.length > 1"
          class="discover-brief-grid"
          style="margin-top: 0.9rem"
        >
          <article
            v-for="candidate in stylePreviewCandidates"
            :key="candidate.styleId"
            class="discover-brief-card"
          >
            <div class="discover-brief-head">
              <div>
                <h3>{{ candidate.name }}</h3>
                <p>{{ candidate.reason }}</p>
              </div>
              <span class="workflow-pill">{{ candidate.source === "llm" ? "模型优先" : "备选" }}</span>
            </div>
            <p class="hint">{{ candidate.outcomeText }}</p>
            <p v-if="candidate.fitText" class="hint">{{ candidate.fitText }}</p>
            <p v-if="candidate.approachText" class="hint">{{ candidate.approachText }}</p>
            <p v-if="candidate.focusText" class="hint">{{ candidate.focusText }}</p>
            <p v-if="candidate.previewText" class="hint" style="margin-top: 0.55rem">如果现在开始，开头大概会这样写：{{ candidate.previewText }}</p>
            <p v-else class="hint" style="margin-top: 0.55rem">正在生成该风格的开头预演…</p>
            <p v-if="candidate.previewFocusPoints.length" class="hint">
              这一版会更突出：{{ candidate.previewFocusPoints.join(" / ") }}
            </p>
            <div class="result-actions" style="padding: 0; margin-top: 0.75rem">
              <button
                class="ghost-button"
                type="button"
                :disabled="running || candidate.styleId === store.selectedStyleId"
                @click="handlePreviewSelectStyle(candidate.styleId)"
              >
                {{ candidate.styleId === store.selectedStyleId ? "当前使用" : "切换到此风格" }}
              </button>
            </div>
          </article>
        </div>

        <ProgressStepper
          v-if="stepperState !== 'idle'"
          :steps="stepperSteps"
          :active-index="stepperActiveIndex"
          :state="stepperState"
        />
      </div>

      <PinnedRunsStrip
        :entries="runMemory.pinnedRecentRuns"
        @view="handleViewRun"
        @restore="handleRestoreRun"
      />

      <div v-if="discoverErrorMessage" class="error-card">
        <strong>{{ discoverErrorMessage }}</strong>
        <p>{{ discoverErrorSuggestion }}</p>
      </div>

      <div v-if="discoverResult" class="result-area">
        <DiscoverViewer :result="discoverResult" :busy="discoverLoading" :style-profile="selectedStyleProfile" @rerun="handleRerunDiscover" />
      </div>

      <div v-else-if="errorMessage && !result" class="error-card">
        <strong>{{ errorMessage }}</strong>
        <p>{{ errorSuggestion }}</p>
      </div>

      <div v-else-if="result" class="result-area">
        <ResultViewer
          :result="result"
          :loading="loading"
          :regenerating-image-id="regeneratingImageId"
          :generating-images="generatingImages"
          :image-progress="imageProgress"
          :image-placement="store.imageConfig.placement"
          :error-message="errorMessage"
          :error-suggestion="errorSuggestion"
          :style-profile="selectedStyleProfile"
          @regenerate-image="handleRegenerateImage"
        />
      </div>
      <div v-else-if="running" class="hint" style="text-align: center; margin-top: 1.25rem">正在生成中…</div>
    </section>

    <SettingsDrawer
      :open="settingsOpen"
      :tab="settingsTab"
      :current-input="inputValue"
      @close="settingsOpen = false"
      @update:tab="settingsTab = $event"
    />

    <HistoryDrawer
      :open="historyOpen"
      :entries="runMemory.recentRuns"
      @close="historyOpen = false"
      @restore="handleRestoreRun"
      @view="handleViewRun"
      @toggle-pin="runMemory.toggleStyleMemoryPin"
      @remove="runMemory.removeRecentRun"
      @clear="runMemory.clearRecentRuns"
    />

    <HistoryResultViewer
      :entry="selectedHistoryRun"
      :current-title="currentResultSnapshot?.title || ''"
      :current-result-text="currentResultSnapshot?.text || ''"
      :current-summary="currentResultSnapshot?.summary || ''"
      :current-key-findings="currentResultSnapshot?.keyFindings || []"
      @close="selectedHistoryRun = null"
      @restore="handleRestoreRun"
    />

    <OnboardingOverlay
      :open="onboardingOpen"
      :step="onboardingStep"
      @close="closeOnboarding"
      @next="nextOnboarding"
      @open-llm="openSettings('llm')"
      @open-styles="openSettings('styles')"
    />
  </main>
</template>

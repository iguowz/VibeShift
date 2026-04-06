import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";

import { defaultStyles, providerPresets } from "../lib/presets";
import type { CostPricingSettings, ImageConfig, InputType, LLMConfig, StylePromptMemoryHint, StylePromptTarget, StyleTemplate } from "../types";

const MAX_STYLE_MEMORY_ENTRIES = 24;

function truncate(value: string, limit: number) {
  const cleaned = String(value || "").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit).trimEnd()}…`;
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeTheme(value: unknown): "light" | "dark" | null {
  if (value === "light" || value === "dark") return value;
  return null;
}

function normalizeStyles(value: unknown): StyleTemplate[] | null {
  if (!Array.isArray(value)) return null;
  const result: StyleTemplate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const raw = item as Partial<StyleTemplate>;
    const id = String(raw.id || "").trim();
    const name = String(raw.name || "").trim();
    const prompt = String(raw.prompt || "").trim();
    if (!id || !name || !prompt) return null;
    const audience = String(raw.audience ?? "");
    const tone = String(raw.tone ?? "");
    const structureTemplate = String((raw as any).structure_template ?? "");
    const emphasisPointsRaw = Array.isArray((raw as any).emphasis_points) ? (raw as any).emphasis_points : [];
    const emphasisPoints = emphasisPointsRaw
      .map((entry: unknown) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, 8);
    const citationPolicy =
      raw.citation_policy === "strict" || raw.citation_policy === "minimal" || raw.citation_policy === "none"
        ? raw.citation_policy
        : "auto";
    const titlePolicy = raw.title_policy === "rewrite" || raw.title_policy === "punchy" ? raw.title_policy : "retain";
    const imageFocus =
      raw.image_focus === "narrative" || raw.image_focus === "diagram" || raw.image_focus === "editorial"
        ? raw.image_focus
        : "auto";
    const layoutFormat =
      raw.layout_format === "newspaper" ||
      raw.layout_format === "poster" ||
      raw.layout_format === "book" ||
      raw.layout_format === "classical" ||
      raw.layout_format === "ppt" ||
      raw.layout_format === "paper" ||
      raw.layout_format === "poetry"
        ? raw.layout_format
        : "auto";
    const visualMode =
      raw.visual_mode === "enhanced" || raw.visual_mode === "minimal" || raw.visual_mode === "none"
        ? raw.visual_mode
        : "auto";
    result.push({
      id,
      name,
      prompt,
      audience,
      tone,
      structure_template: structureTemplate,
      emphasis_points: emphasisPoints,
      citation_policy: citationPolicy,
      title_policy: titlePolicy,
      image_focus: imageFocus,
      layout_format: layoutFormat,
      visual_mode: visualMode,
    });
  }
  return result;
}

function mergeWithDefaultStyles(stored: StyleTemplate[] | null): StyleTemplate[] {
  if (!stored?.length) return defaultStyles.slice();
  const seen = new Set(stored.map((item) => item.id));
  const merged = stored.slice();
  for (const item of defaultStyles) {
    if (seen.has(item.id)) continue;
    merged.push(item);
  }
  return merged;
}

function normalizeStylePromptMemory(value: unknown): StylePromptMemoryHint[] | null {
  if (!Array.isArray(value)) return null;
  const result: StylePromptMemoryHint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<StylePromptMemoryHint>;
    const target = raw.target === "discover" ? "discover" : raw.target === "rewrite" ? "rewrite" : null;
    const optimizedPrompt = String(raw.optimized_prompt || "").trim();
    if (!target || !optimizedPrompt) continue;
    const profile = raw.profile_suggestion && typeof raw.profile_suggestion === "object" ? raw.profile_suggestion : null;
    if (!profile) continue;
    const citationPolicy =
      profile.citation_policy === "strict" || profile.citation_policy === "minimal" || profile.citation_policy === "none"
        ? profile.citation_policy
        : "auto";
    const titlePolicy = profile.title_policy === "rewrite" || profile.title_policy === "punchy" ? profile.title_policy : "retain";
    const imageFocus =
      profile.image_focus === "narrative" || profile.image_focus === "diagram" || profile.image_focus === "editorial"
        ? profile.image_focus
        : "auto";
    const layoutFormat =
      profile.layout_format === "newspaper" ||
      profile.layout_format === "poster" ||
      profile.layout_format === "book" ||
      profile.layout_format === "classical" ||
      profile.layout_format === "ppt" ||
      profile.layout_format === "paper" ||
      profile.layout_format === "poetry"
        ? profile.layout_format
        : "auto";
    const visualMode =
      profile.visual_mode === "enhanced" || profile.visual_mode === "minimal" || profile.visual_mode === "none"
        ? profile.visual_mode
        : "auto";
    const emphasisPoints = Array.isArray(profile.emphasis_points)
      ? profile.emphasis_points.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 6)
      : [];
    result.push({
      target,
      prompt_excerpt: truncate(String(raw.prompt_excerpt || ""), 220),
      optimized_prompt: optimizedPrompt,
      profile_suggestion: {
        audience: String(profile.audience || "").trim(),
        tone: String(profile.tone || "").trim(),
        structure_template: String(profile.structure_template || "").trim(),
        emphasis_points: emphasisPoints,
        citation_policy: citationPolicy,
        title_policy: titlePolicy,
        image_focus: imageFocus,
        layout_format: layoutFormat,
        visual_mode: visualMode,
      },
      source_style_name: String(raw.source_style_name || "").trim(),
      accepted_at: raw.accepted_at ? String(raw.accepted_at) : null,
      usage_count: Math.max(1, Number(raw.usage_count || 1) || 1),
    });
  }
  return result.slice(0, MAX_STYLE_MEMORY_ENTRIES);
}

function tokenizePrompt(value: string): string[] {
  const baseTokens = (String(value || "").match(/[\u4e00-\u9fffa-zA-Z0-9]{2,}/g) || [])
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2);
  const expanded = new Set<string>();
  for (const token of baseTokens) {
    expanded.add(token);
    if (/^[\u4e00-\u9fff]+$/.test(token) && token.length >= 4) {
      for (let index = 0; index < token.length - 1; index += 1) {
        expanded.add(token.slice(index, index + 2));
      }
    }
  }
  return Array.from(expanded);
}

function scoreStyleMemory(entry: StylePromptMemoryHint, prompt: string, target: StylePromptTarget): number {
  if (entry.target !== target) return -1;
  const promptTokens = tokenizePrompt(prompt);
  const memoryTokens = tokenizePrompt(`${entry.prompt_excerpt} ${entry.optimized_prompt} ${entry.profile_suggestion.tone} ${entry.profile_suggestion.structure_template}`);
  const overlap = promptTokens.filter((token) => memoryTokens.includes(token)).length;
  const acceptedAt = entry.accepted_at ? new Date(entry.accepted_at).getTime() : 0;
  const ageDays = Number.isFinite(acceptedAt) && acceptedAt > 0 ? Math.max(0, (Date.now() - acceptedAt) / 86400000) : 365;
  const recencyBoost = Math.max(0, 6 - ageDays);
  return overlap * 10 + Math.min(entry.usage_count, 6) + recencyBoost;
}

function normalizeCostPricing(value: unknown): CostPricingSettings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CostPricingSettings>;
  const enabled = Boolean(raw.enabled);
  const prompt = Number(raw.prompt_usd_per_1k ?? 0);
  const completion = Number(raw.completion_usd_per_1k ?? 0);
  const imageUsdEach = raw.image_usd_each == null ? null : Number(raw.image_usd_each);
  return {
    enabled,
    prompt_usd_per_1k: Number.isFinite(prompt) ? prompt : 0,
    completion_usd_per_1k: Number.isFinite(completion) ? completion : 0,
    image_usd_each: imageUsdEach != null && Number.isFinite(imageUsdEach) ? imageUsdEach : null,
  };
}

function normalizeLLMConfig(value: unknown): LLMConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<LLMConfig>;
  const provider = String(raw.provider || "").trim();
  const baseUrl = String(raw.base_url || "").trim();
  const apiKey = String(raw.api_key || "");
  const model = String(raw.model || "").trim();
  const temperature = Number(raw.temperature ?? 0.7);
  const maxTokens = Number(raw.max_tokens ?? 2000);
  const topP = Number(raw.top_p ?? 1);
  if (!provider || !baseUrl || !model) return null;
  return {
    provider,
    base_url: baseUrl,
    api_key: apiKey,
    model,
    temperature: Number.isFinite(temperature) ? temperature : 0.7,
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 2000,
    top_p: Number.isFinite(topP) ? topP : 1,
  };
}

function normalizeImageConfig(value: unknown): ImageConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ImageConfig>;
  const enabled = Boolean(raw.enabled);
  const provider = raw.provider == null ? null : String(raw.provider);
  const baseUrl = raw.base_url == null ? null : String(raw.base_url);
  const apiKey = raw.api_key == null ? null : String(raw.api_key);
  const model = raw.model == null ? null : String(raw.model);
  const count = Number(raw.count ?? 1);
  const stylePreset = String(raw.style_preset ?? "");
  const customPrompt = String(raw.custom_prompt ?? "");
  const placement = raw.placement === "header" || raw.placement === "interleave" || raw.placement === "footer" ? raw.placement : "header";
  const smartMode = raw.smart_mode == null ? true : Boolean(raw.smart_mode);
  const smartMax = Number(raw.smart_max_count ?? 3);
  const retryOnFailure = raw.retry_on_failure == null ? true : Boolean(raw.retry_on_failure);
  const retryStrategy = raw.retry_strategy === "fallback_model" ? "fallback_model" : "simplify_prompt";
  const fallbackModel = raw.fallback_model == null ? null : String(raw.fallback_model);

  return {
    enabled,
    provider,
    base_url: baseUrl,
    api_key: apiKey,
    model,
    count: Number.isFinite(count) ? Math.max(1, Math.min(3, count)) : 1,
    style_preset: stylePreset,
    custom_prompt: customPrompt,
    placement,
    smart_mode: smartMode,
    smart_max_count: Number.isFinite(smartMax) ? Math.max(1, Math.min(3, smartMax)) : 3,
    retry_on_failure: retryOnFailure,
    retry_strategy: retryStrategy,
    fallback_model: fallbackModel,
  };
}

function getStorageProfile(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("profile") || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return cleaned || null;
}

function getStorageKey(baseKey: string): string {
  const profile = getStorageProfile();
  if (!profile) return `vibeshift-${baseKey}`;
  return `vibeshift-${profile}-${baseKey}`;
}

function getUnscopedStorageKey(baseKey: string): string {
  return `vibeshift-${baseKey}`;
}

function createDefaultLLMConfig(): LLMConfig {
  return {
    ...providerPresets.openai,
    api_key: "",
  };
}

function createDefaultImageConfig(): ImageConfig {
  return {
    enabled: false,
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    api_key: "",
    model: "gpt-image-1.5",
    count: 1,
    style_preset: "科技感",
    custom_prompt: "",
    placement: "header",
    smart_mode: true,
    smart_max_count: 3,
    retry_on_failure: true,
    retry_strategy: "simplify_prompt",
    fallback_model: "",
  };
}

function createDefaultCostPricing(): CostPricingSettings {
  return {
    enabled: false,
    prompt_usd_per_1k: 0,
    completion_usd_per_1k: 0,
    image_usd_each: null,
  };
}

export const usePreferencesStore = defineStore("preferences", () => {
  const THEME_KEY = getStorageKey("theme");
  const STYLES_KEY = getStorageKey("styles");
  const SELECTED_STYLE_KEY = getStorageKey("selected-style");
  const LLM_CONFIG_KEY = getStorageKey("llm-config");
  const LLM_CONFIG_BASE_KEY = getUnscopedStorageKey("llm-config");
  const IMAGE_CONFIG_KEY = getStorageKey("image-config");
  const IMAGE_CONFIG_BASE_KEY = getUnscopedStorageKey("image-config");
  const COST_PRICING_KEY = getStorageKey("cost-pricing");
  const CACHE_ENABLED_KEY = getStorageKey("cache-enabled");
  const STYLE_MEMORY_KEY = getStorageKey("style-memory");
  const AUTO_STYLE_ENABLED_KEY = getStorageKey("auto-style-enabled");

  const theme = ref<"light" | "dark">(normalizeTheme(localStorage.getItem(THEME_KEY)) || "light");
  const styles = ref<StyleTemplate[]>(
    mergeWithDefaultStyles(normalizeStyles(safeJsonParse(localStorage.getItem(STYLES_KEY)))),
  );
  const storedSelectedStyle = String(localStorage.getItem(SELECTED_STYLE_KEY) || "").trim();
  const selectedStyleId = ref(
    storedSelectedStyle && styles.value.some((style) => style.id === storedSelectedStyle)
      ? storedSelectedStyle
      : (styles.value[0]?.id ?? ""),
  );
  const inputType = ref<InputType>("url");
  const llmConfig = ref<LLMConfig>(
    normalizeLLMConfig(safeJsonParse(localStorage.getItem(LLM_CONFIG_KEY))) ||
      normalizeLLMConfig(safeJsonParse(localStorage.getItem(LLM_CONFIG_BASE_KEY))) ||
      createDefaultLLMConfig(),
  );
  const imageConfig = ref<ImageConfig>(
    normalizeImageConfig(safeJsonParse(localStorage.getItem(IMAGE_CONFIG_KEY))) ||
      normalizeImageConfig(safeJsonParse(localStorage.getItem(IMAGE_CONFIG_BASE_KEY))) ||
      createDefaultImageConfig(),
  );
  const costPricing = ref<CostPricingSettings>(
    normalizeCostPricing(safeJsonParse(localStorage.getItem(COST_PRICING_KEY))) || createDefaultCostPricing(),
  );
  const cacheEnabled = ref<boolean>(localStorage.getItem(CACHE_ENABLED_KEY) === "1");
  const autoStyleEnabled = ref<boolean>(localStorage.getItem(AUTO_STYLE_ENABLED_KEY) !== "0");
  const stylePromptMemories = ref<StylePromptMemoryHint[]>(
    normalizeStylePromptMemory(safeJsonParse(localStorage.getItem(STYLE_MEMORY_KEY))) || [],
  );

  watch(theme, (value) => {
    localStorage.setItem(THEME_KEY, value);
    document.documentElement.dataset.theme = value;
  }, { immediate: true });

  watch(styles, (value) => {
    localStorage.setItem(STYLES_KEY, JSON.stringify(value));
  }, { deep: true });

  watch(selectedStyleId, (value) => {
    localStorage.setItem(SELECTED_STYLE_KEY, value);
  }, { immediate: true });

  watch(costPricing, (value) => {
    localStorage.setItem(COST_PRICING_KEY, JSON.stringify(value));
  }, { deep: true });

  watch(llmConfig, (value) => {
    localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(value));
    if (LLM_CONFIG_KEY !== LLM_CONFIG_BASE_KEY) {
      localStorage.setItem(LLM_CONFIG_BASE_KEY, JSON.stringify(value));
    }
  }, { deep: true, immediate: true });

  watch(imageConfig, (value) => {
    localStorage.setItem(IMAGE_CONFIG_KEY, JSON.stringify(value));
    if (IMAGE_CONFIG_KEY !== IMAGE_CONFIG_BASE_KEY) {
      localStorage.setItem(IMAGE_CONFIG_BASE_KEY, JSON.stringify(value));
    }
  }, { deep: true, immediate: true });

  watch(cacheEnabled, (value) => {
    localStorage.setItem(CACHE_ENABLED_KEY, value ? "1" : "0");
  }, { immediate: true });

  watch(autoStyleEnabled, (value) => {
    localStorage.setItem(AUTO_STYLE_ENABLED_KEY, value ? "1" : "0");
  }, { immediate: true });

  watch(stylePromptMemories, (value) => {
    localStorage.setItem(STYLE_MEMORY_KEY, JSON.stringify(value.slice(0, MAX_STYLE_MEMORY_ENTRIES)));
  }, { deep: true, immediate: true });

  const selectedStyle = computed(
    () => styles.value.find((style) => style.id === selectedStyleId.value) || styles.value[0],
  );

  function toggleTheme() {
    theme.value = theme.value === "light" ? "dark" : "light";
  }

  function applyProviderPreset(key: keyof typeof providerPresets) {
    llmConfig.value = {
      ...providerPresets[key],
      api_key: llmConfig.value.api_key,
    };
  }

  function resetLLMConfig() {
    const providerKey = llmConfig.value.provider as keyof typeof providerPresets;
    if (providerPresets[providerKey]) {
      applyProviderPreset(providerKey);
      return;
    }
    applyProviderPreset("openai");
  }

  function resetImageConfig() {
    const apiKey = imageConfig.value.api_key;
    imageConfig.value = {
      ...createDefaultImageConfig(),
      api_key: apiKey,
    };
  }

  function clearLocalData() {
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem(STYLES_KEY);
    localStorage.removeItem(SELECTED_STYLE_KEY);
    localStorage.removeItem(LLM_CONFIG_KEY);
    localStorage.removeItem(LLM_CONFIG_BASE_KEY);
    localStorage.removeItem(IMAGE_CONFIG_KEY);
    localStorage.removeItem(IMAGE_CONFIG_BASE_KEY);
    localStorage.removeItem(COST_PRICING_KEY);
    localStorage.removeItem(CACHE_ENABLED_KEY);
    localStorage.removeItem(STYLE_MEMORY_KEY);
    localStorage.removeItem(AUTO_STYLE_ENABLED_KEY);

    theme.value = "light";
    styles.value = defaultStyles.slice();
    selectedStyleId.value = styles.value[0]?.id ?? "";
    llmConfig.value = createDefaultLLMConfig();
    imageConfig.value = createDefaultImageConfig();
    costPricing.value = createDefaultCostPricing();
    cacheEnabled.value = false;
    autoStyleEnabled.value = true;
    stylePromptMemories.value = [];
  }

  function replaceStyles(next: StyleTemplate[]) {
    styles.value = next.slice();
    selectedStyleId.value = styles.value[0]?.id ?? "";
  }

  function upsertStyle(style: StyleTemplate) {
    const index = styles.value.findIndex((item) => item.id === style.id);
    if (index === -1) {
      styles.value.push(style);
    } else {
      styles.value[index] = style;
    }
  }

  function removeStyle(id: string) {
    styles.value = styles.value.filter((style) => style.id !== id);
    if (!styles.value.find((style) => style.id === selectedStyleId.value)) {
      selectedStyleId.value = styles.value[0]?.id ?? "";
    }
  }

  function recordStylePromptMemory(entry: Omit<StylePromptMemoryHint, "accepted_at" | "usage_count"> & { accepted_at?: string | null }) {
    const acceptedAt = entry.accepted_at || new Date().toISOString();
    const signature = [
      entry.target,
      entry.optimized_prompt.trim(),
      entry.profile_suggestion.structure_template,
      entry.profile_suggestion.tone,
    ].join("|");
    const index = stylePromptMemories.value.findIndex((item) => {
      const existingSignature = [
        item.target,
        item.optimized_prompt.trim(),
        item.profile_suggestion.structure_template,
        item.profile_suggestion.tone,
      ].join("|");
      return existingSignature === signature;
    });
    const nextEntry: StylePromptMemoryHint = {
      ...entry,
      prompt_excerpt: truncate(entry.prompt_excerpt, 220),
      optimized_prompt: entry.optimized_prompt.trim(),
      source_style_name: entry.source_style_name.trim(),
      accepted_at: acceptedAt,
      usage_count: 1,
    };
    if (index === -1) {
      stylePromptMemories.value = [nextEntry, ...stylePromptMemories.value].slice(0, MAX_STYLE_MEMORY_ENTRIES);
      return;
    }
    const current = stylePromptMemories.value[index];
    stylePromptMemories.value[index] = {
      ...current,
      ...nextEntry,
      usage_count: current.usage_count + 1,
      accepted_at: acceptedAt,
    };
    stylePromptMemories.value = [...stylePromptMemories.value].sort((a, b) => {
      const left = a.accepted_at ? Date.parse(a.accepted_at) : 0;
      const right = b.accepted_at ? Date.parse(b.accepted_at) : 0;
      return right - left;
    });
  }

  function getStylePromptMemoryHints(prompt: string, target: StylePromptTarget, limit = 3) {
    const cleaned = prompt.trim();
    if (!cleaned) return [];
    return stylePromptMemories.value
      .map((entry) => ({ entry, score: scoreStyleMemory(entry, cleaned, target) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.entry);
  }

  function clearStylePromptMemories() {
    stylePromptMemories.value = [];
  }

  return {
    theme,
    styles,
    selectedStyleId,
    selectedStyle,
    inputType,
    llmConfig,
    imageConfig,
    costPricing,
    cacheEnabled,
    autoStyleEnabled,
    stylePromptMemories,
    toggleTheme,
    applyProviderPreset,
    resetLLMConfig,
    resetImageConfig,
    clearLocalData,
    replaceStyles,
    upsertStyle,
    removeStyle,
    recordStylePromptMemory,
    getStylePromptMemoryHints,
    clearStylePromptMemories,
  };
});

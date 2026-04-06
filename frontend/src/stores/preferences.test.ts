import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

import { createStyleTemplate } from "../lib/styleSkill";
import { usePreferencesStore } from "./preferences";

describe("preferences store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("toggles theme and persists to localStorage", () => {
    const store = usePreferencesStore();
    expect(store.theme).toBe("light");

    store.toggleTheme();
    expect(store.theme).toBe("dark");
    return nextTick().then(() => {
      expect(localStorage.getItem("vibeshift-theme")).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("scopes localStorage keys by profile", () => {
    window.history.pushState({}, "", "/?profile=alice");
    const store = usePreferencesStore();
    store.toggleTheme();
    return nextTick().then(() => {
      expect(localStorage.getItem("vibeshift-alice-theme")).toBe("dark");
    });
  });

  it("falls back when styles JSON is corrupted", () => {
    localStorage.setItem("vibeshift-styles", "{broken-json");
    const store = usePreferencesStore();
    expect(store.styles.length).toBeGreaterThan(0);
    expect(store.selectedStyleId).toBeTruthy();
  });

  it("falls back when theme is invalid", () => {
    localStorage.setItem("vibeshift-theme", "blue");
    const store = usePreferencesStore();
    expect(store.theme).toBe("light");
  });

  it("migrates legacy styles into full skill schema", () => {
    localStorage.setItem("vibeshift-styles", JSON.stringify([{ id: "legacy", name: "旧风格", prompt: "旧提示词" }]));
    const store = usePreferencesStore();
    expect(store.styles[0]?.citation_policy).toBe("auto");
    expect(store.styles[0]?.image_focus).toBe("auto");
    expect(store.styles[0]?.layout_format).toBe("auto");
    expect(store.styles[0]?.visual_mode).toBe("auto");
  });

  it("merges new built-in styles into existing local style library", () => {
    localStorage.setItem(
      "vibeshift-styles",
      JSON.stringify([
        { id: "humor", name: "幽默风趣", prompt: "旧版幽默风" },
        { id: "outline", name: "简明大纲", prompt: "旧版大纲风" },
      ]),
    );

    const store = usePreferencesStore();
    expect(store.styles.some((item) => item.id === "story")).toBe(true);
    expect(store.styles.some((item) => item.id === "ppt")).toBe(true);
    expect(store.styles.some((item) => item.id === "paper")).toBe(true);
    expect(store.styles.find((item) => item.id === "humor")?.prompt).toBe("旧版幽默风");
  });

  it("persists selected style id", async () => {
    const store = usePreferencesStore();
    const target = store.styles[1]?.id;
    if (target) {
      store.selectedStyleId = target;
    } else {
      store.replaceStyles([
        createStyleTemplate({ id: "a", name: "A", prompt: "prompt a" }),
        createStyleTemplate({ id: "b", name: "B", prompt: "prompt b" }),
      ]);
      store.selectedStyleId = "b";
    }

    await nextTick();
    expect(localStorage.getItem("vibeshift-selected-style")).toBe(store.selectedStyleId);
  });

  it("replaces styles and updates selection", () => {
    const store = usePreferencesStore();
    store.replaceStyles([
      createStyleTemplate({ id: "a", name: "A", prompt: "prompt a" }),
      createStyleTemplate({ id: "b", name: "B", prompt: "prompt b" }),
    ]);
    expect(store.styles.length).toBe(2);
    expect(store.selectedStyleId).toBe("a");
  });

  it("persists cache enabled flag", async () => {
    const store = usePreferencesStore();
    store.cacheEnabled = true;
    await nextTick();
    expect(localStorage.getItem("vibeshift-cache-enabled")).toBe("1");
  });

  it("persists auto style matching preference", async () => {
    const store = usePreferencesStore();
    expect(store.autoStyleEnabled).toBe(true);
    store.autoStyleEnabled = false;
    await nextTick();
    expect(localStorage.getItem("vibeshift-auto-style-enabled")).toBe("0");
  });

  it("persists llm config and survives refresh", async () => {
    const store = usePreferencesStore();
    store.llmConfig = {
      ...store.llmConfig,
      provider: "ollama",
      base_url: "http://localhost:11434/v1",
      model: "qwen2.5:7b",
    };
    await nextTick();
    expect(localStorage.getItem("vibeshift-llm-config")).toBeTruthy();
  });

  it("persists llm config to both scoped and base keys", async () => {
    window.history.pushState({}, "", "/?profile=alice");
    const store = usePreferencesStore();
    store.llmConfig = {
      ...store.llmConfig,
      provider: "openai",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    };
    await nextTick();
    expect(localStorage.getItem("vibeshift-alice-llm-config")).toBeTruthy();
    expect(localStorage.getItem("vibeshift-llm-config")).toBeTruthy();
  });

  it("persists cost pricing settings", async () => {
    const store = usePreferencesStore();
    store.costPricing = {
      enabled: true,
      prompt_usd_per_1k: 0.5,
      completion_usd_per_1k: 1.2,
      image_usd_each: 0.02,
    };

    await Promise.resolve();
    const raw = localStorage.getItem("vibeshift-cost-pricing");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.enabled).toBe(true);
    expect(parsed.prompt_usd_per_1k).toBe(0.5);
    expect(parsed.image_usd_each).toBe(0.02);
  });

  it("records and retrieves style prompt memories by target relevance", async () => {
    const store = usePreferencesStore();
    store.recordStylePromptMemory({
      target: "rewrite",
      prompt_excerpt: "公众号解读，强调关键事实和行动建议",
      optimized_prompt: "请先给 TL;DR，再拆解关键事实和行动建议。",
      source_style_name: "公众号解读",
      profile_suggestion: {
        audience: "产品经理",
        tone: "克制、直接",
        structure_template: "TL;DR -> 拆解 -> 建议",
        emphasis_points: ["关键事实", "行动建议"],
        citation_policy: "minimal",
        title_policy: "rewrite",
        image_focus: "diagram",
        layout_format: "newspaper",
        visual_mode: "enhanced",
      },
    });
    await nextTick();

    const hints = store.getStylePromptMemoryHints("请优化成公众号解读风格，突出关键事实", "rewrite");
    expect(hints).toHaveLength(1);
    expect(hints[0].source_style_name).toBe("公众号解读");
    expect(localStorage.getItem("vibeshift-style-memory")).toContain("公众号解读");
  });

  it("clears style prompt memories with local data reset", async () => {
    const store = usePreferencesStore();
    store.recordStylePromptMemory({
      target: "discover",
      prompt_excerpt: "调研报告，严格引用",
      optimized_prompt: "请输出带编号引用的调研报告。",
      source_style_name: "调研风格",
      profile_suggestion: {
        audience: "研究决策者",
        tone: "严谨、判断明确",
        structure_template: "结论 -> 证据 -> 建议",
        emphasis_points: ["关键事实", "证据来源"],
        citation_policy: "strict",
        title_policy: "retain",
        image_focus: "auto",
        layout_format: "book",
        visual_mode: "minimal",
      },
    });
    await nextTick();

    store.clearLocalData();
    await nextTick();

    expect(store.stylePromptMemories).toHaveLength(0);
    expect(localStorage.getItem("vibeshift-style-memory")).toBe("[]");
  });
});

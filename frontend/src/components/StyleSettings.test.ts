import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { vi } from "vitest";

import StyleSettings from "./StyleSettings.vue";
import { optimizeStylePrompt } from "../lib/api";
import { usePreferencesStore } from "../stores/preferences";
import { useRunMemoryStore } from "../stores/runMemory";
import { createStyleTemplate } from "../lib/styleSkill";

vi.mock("../lib/api", () => ({
  optimizeStylePrompt: vi.fn(),
  submitDiscover: vi.fn(),
  submitTransform: vi.fn(),
  isRequestCanceled: vi.fn(() => false),
}));

describe("StyleSettings", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.mocked(optimizeStylePrompt).mockReset();
  });

  it("applies optimized prompt together with structured style suggestions", async () => {
    vi.mocked(optimizeStylePrompt).mockResolvedValue({
      optimized_prompt: "请用结构化方式输出，保留关键事实与行动建议。",
      notes: ["已补齐结构和约束"],
      profile_suggestion: {
        audience: "产品经理",
        tone: "克制、直接、信息密度高",
        structure_template: "TL;DR -> 拆解 -> 建议",
        emphasis_points: ["关键事实", "行动建议"],
        citation_policy: "minimal",
        title_policy: "rewrite",
        image_focus: "diagram",
        layout_format: "poster",
        visual_mode: "enhanced",
      },
    });

    const wrapper = mount(StyleSettings, {
      props: {
        currentInput: "",
      },
      global: {
        plugins: [pinia],
      },
    });

    const promptField = wrapper.get("textarea");
    await promptField.setValue("写得更像公众号解读");

    const optimizeButton = wrapper.findAll("button").find((item) => item.text().includes("一键优化提示词"));
    expect(optimizeButton).toBeTruthy();
    await optimizeButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("结构化风格建议");
    expect(wrapper.text()).toContain("产品经理");
    expect(wrapper.text()).toContain("TL;DR -> 拆解 -> 建议");

    const applyButton = wrapper.findAll("button").find((item) => item.text().includes("应用优化"));
    expect(applyButton).toBeTruthy();
    await applyButton!.trigger("click");
    await flushPromises();

    expect((wrapper.get('input[placeholder="例如：公众号读者 / 产品经理 / 中学生"]').element as HTMLInputElement).value).toBe("产品经理");
    expect((wrapper.get('input[placeholder="例如：克制、直接、信息密度高"]').element as HTMLInputElement).value).toBe("克制、直接、信息密度高");
    expect((wrapper.get('input[placeholder="例如：TL;DR -> 分节解析 -> 结尾建议"]').element as HTMLInputElement).value).toBe("TL;DR -> 拆解 -> 建议");
    expect((wrapper.get('input[placeholder="用逗号分隔，例如：关键事实，行动建议，风险提示"]').element as HTMLInputElement).value).toBe("关键事实，行动建议");

    const selects = wrapper.findAll("select");
    expect((selects[0].element as HTMLSelectElement).value).toBe("rewrite");
    expect((selects[1].element as HTMLSelectElement).value).toBe("minimal");
    expect((selects[2].element as HTMLSelectElement).value).toBe("diagram");
  });

  it("sends matched local style memories when optimizing", async () => {
    const store = usePreferencesStore();
    const runMemory = useRunMemoryStore();
    store.recordStylePromptMemory({
      target: "discover",
      prompt_excerpt: "调研报告，突出关键事实和证据来源",
      optimized_prompt: "请先给结论，再拆解关键事实和证据来源。",
      source_style_name: "调研风格",
      profile_suggestion: {
        audience: "研究决策者",
        tone: "克制、直接",
        structure_template: "结论 -> 证据 -> 建议",
        emphasis_points: ["关键事实", "证据来源"],
        citation_policy: "strict",
        title_policy: "retain",
        image_focus: "diagram",
        layout_format: "book",
        visual_mode: "enhanced",
      },
    });
    runMemory.recordDiscoverRun({
      input: "FastAPI 最佳实践",
      style: createStyleTemplate({
        id: "recent-discover-style",
        name: "近期调研风格",
        prompt: "先给结论，再拆解关键事实和证据来源。",
        tone: "克制、直接",
        structure_template: "结论 -> 证据 -> 建议",
        emphasis_points: ["关键事实", "证据来源"],
        citation_policy: "strict",
      }),
      response: {
        request_id: "disc_recent",
        title: "FastAPI 最佳实践",
        transformed_text: "近期调研结果，正文较长，强调关键事实、证据来源、适用场景和建议，模拟高质量可复用结果。",
        brief: {
          summary: "有近期调研总结",
          conclusion: "值得采用",
          key_findings: [],
          evidence: [],
          uncertainties: [],
          draft_outline: [],
        },
        sources: [
          { id: 1, title: "source-1", url: "https://example.com/1", snippet: "snippet", excerpt: "excerpt" },
          { id: 2, title: "source-2", url: "https://example.com/2", snippet: "snippet", excerpt: "excerpt" },
          { id: 3, title: "source-3", url: "https://example.com/3", snippet: "snippet", excerpt: "excerpt" },
        ],
        meta: {
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 800,
          used_cache: false,
          followup_used: false,
          sources: 0,
          evidence_items: 0,
          uncertainties: 0,
          resumed: false,
          resume_stage: null,
        },
        run: {
          id: "run_recent",
          mode: "discover",
          status: "completed",
          workspace_path: "/tmp/run_recent",
          started_at: "2025-01-01T00:00:00Z",
          finished_at: "2025-01-01T00:00:01Z",
          duration_ms: 1000,
          title: "FastAPI 最佳实践",
          summary: "近期调研",
          steps: [],
          artifacts: [],
        },
      },
    });
    vi.mocked(optimizeStylePrompt).mockResolvedValue({
      optimized_prompt: "请先给 TL;DR，再拆解关键事实。",
      notes: [],
      profile_suggestion: null,
    });

    const wrapper = mount(StyleSettings, {
      props: {
        currentInput: "",
      },
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.get("textarea").setValue("请优化调研报告风格，强调关键事实和证据来源");
    const optimizeButton = wrapper.findAll("button").find((item) => item.text().includes("一键优化提示词"));
    await optimizeButton!.trigger("click");
    await flushPromises();

    expect(optimizeStylePrompt).toHaveBeenCalled();
    const payload = vi.mocked(optimizeStylePrompt).mock.calls[0][0];
    expect(payload.memory_hints?.length).toBeGreaterThan(0);
    expect(payload.memory_hints?.some((item) => item.source_style_name === "调研风格")).toBe(true);
    expect(payload.memory_hints?.some((item) => item.source_style_name === "近期调研风格")).toBe(true);
    expect(wrapper.text()).toContain("命中的风格记忆");
  });

  it("applies recent run style memory into the current draft", async () => {
    const runMemory = useRunMemoryStore();
    runMemory.recordDiscoverRun({
      input: "FastAPI 最佳实践",
      style: createStyleTemplate({
        id: "recent-discover-style",
        name: "近期调研风格",
        prompt: "先给结论，再拆解关键事实和证据来源。",
        audience: "技术负责人",
        tone: "克制、直接",
        structure_template: "结论 -> 证据 -> 建议",
        emphasis_points: ["关键事实", "证据来源"],
        citation_policy: "strict",
        title_policy: "rewrite",
        image_focus: "diagram",
      }),
      response: {
        request_id: "disc_recent_apply",
        title: "FastAPI 最佳实践",
        transformed_text: "近期调研结果，正文较长，强调关键事实、证据来源、适用场景和建议，模拟高质量可复用结果。",
        brief: {
          summary: "有近期调研总结",
          conclusion: "值得采用",
          key_findings: [],
          evidence: [],
          uncertainties: [],
          draft_outline: [],
        },
        sources: [
          { id: 1, title: "source-1", url: "https://example.com/1", snippet: "snippet", excerpt: "excerpt" },
          { id: 2, title: "source-2", url: "https://example.com/2", snippet: "snippet", excerpt: "excerpt" },
          { id: 3, title: "source-3", url: "https://example.com/3", snippet: "snippet", excerpt: "excerpt" },
        ],
        meta: {
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 800,
          used_cache: false,
          followup_used: false,
          sources: 0,
          evidence_items: 0,
          uncertainties: 0,
          resumed: false,
          resume_stage: null,
        },
        run: {
          id: "run_recent_apply",
          mode: "discover",
          status: "completed",
          workspace_path: "/tmp/run_recent_apply",
          started_at: "2025-01-01T00:00:00Z",
          finished_at: "2025-01-01T00:00:01Z",
          duration_ms: 1000,
          title: "FastAPI 最佳实践",
          summary: "近期调研",
          steps: [],
          artifacts: [],
        },
      },
    });

    const wrapper = mount(StyleSettings, {
      props: {
        currentInput: "",
      },
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.get("textarea").setValue("请优化调研报告风格，强调关键事实和证据来源");
    expect(wrapper.text()).toContain("命中的风格记忆");

    const reuseButton = wrapper.findAll("button").find((item) => item.text().includes("复用到当前风格"));
    expect(reuseButton).toBeTruthy();
    await reuseButton!.trigger("click");
    await flushPromises();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("先给结论，再拆解关键事实和证据来源。");
    expect((wrapper.get('input[placeholder="例如：公众号读者 / 产品经理 / 中学生"]').element as HTMLInputElement).value).toBe("技术负责人");
    expect((wrapper.get('input[placeholder="例如：克制、直接、信息密度高"]').element as HTMLInputElement).value).toBe("克制、直接");
  });

  it("shows active function skills for the current input", async () => {
    const store = usePreferencesStore();
    store.imageConfig = {
      ...store.imageConfig,
      enabled: true,
      provider: "openai",
      base_url: "https://api.openai.com/v1",
      api_key: "sk-demo",
      model: "gpt-image-1.5",
    };

    const wrapper = mount(StyleSettings, {
      props: {
        currentInput: "https://example.com/a https://example.com/b",
      },
      global: {
        plugins: [pinia],
      },
    });

    expect(wrapper.text()).toContain("本轮将附带的功能技能");
    expect(wrapper.text()).toContain("多源整合");
    expect(wrapper.text()).toContain("长文改写");
    expect(wrapper.text()).toContain("插图规划");
  });
});

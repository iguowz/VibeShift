import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

import { createStyleTemplate } from "../lib/styleSkill";
import { useRunMemoryStore } from "./runMemory";

describe("run memory store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("records transform runs and persists them", async () => {
    const store = useRunMemoryStore();
    store.recordTransformRun({
      input: "https://example.com/article",
      style: createStyleTemplate({ id: "skill-1", name: "公众号解读", prompt: "请改写。" }),
      response: {
        request_id: "req_1",
        title: "测试标题",
        source_url: "https://example.com/article",
        raw_excerpt: "摘要",
        transformed_text: "改写结果正文",
        images: [],
        meta: {
          input_type: "url",
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 1200,
          used_cache: false,
        },
        run: null,
      },
    });

    await nextTick();
    expect(store.recentRuns).toHaveLength(1);
    expect(store.recentRuns[0].style_name).toBe("公众号解读");
    expect(store.recentRuns[0].result_text).toContain("改写结果正文");
    expect(store.recentRuns[0].result_truncated).toBe(false);
    expect(store.recentRuns[0].quality_score).toBeGreaterThanOrEqual(1);
    expect(store.recentRuns[0].restore_count).toBe(0);
    expect(store.recentRuns[0].pinned_for_style_memory).toBe(false);
    expect(localStorage.getItem("vibeshift-recent-runs")).toContain("req_1");
  });

  it("stores a bounded snapshot for long results", async () => {
    const store = useRunMemoryStore();
    store.recordTransformRun({
      input: "https://example.com/long",
      style: null,
      response: {
        request_id: "req_long",
        title: "长结果",
        source_url: "https://example.com/long",
        raw_excerpt: "摘要",
        transformed_text: "a".repeat(13050),
        images: [],
        meta: {
          input_type: "url",
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 1200,
          used_cache: false,
        },
        run: null,
      },
    });

    await nextTick();
    expect(store.recentRuns[0].result_text.length).toBeLessThanOrEqual(12001);
    expect(store.recentRuns[0].result_truncated).toBe(true);
    expect(store.recentRuns[0].result_too_long).toBe(true);
  });

  it("scopes recent runs by profile", async () => {
    window.history.pushState({}, "", "/?profile=alice");
    const store = useRunMemoryStore();
    store.recordDiscoverRun({
      input: "fastapi 最佳实践",
      style: null,
      response: {
        request_id: "disc_1",
        title: "fastapi 最佳实践",
        transformed_text: "调研结果",
        brief: {
          summary: "已整理调研简报",
          conclusion: "适合 API 场景",
          key_findings: [],
          evidence: [],
          uncertainties: [],
          draft_outline: [],
        },
        sources: [],
        meta: {
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 900,
          used_cache: false,
          followup_used: false,
          sources: 0,
          evidence_items: 0,
          uncertainties: 0,
          resumed: false,
          resume_stage: null,
        },
        run: null,
      },
    });

    await nextTick();
    expect(localStorage.getItem("vibeshift-alice-recent-runs")).toContain("disc_1");
  });

  it("normalizes legacy style snapshots from localStorage", () => {
    localStorage.setItem(
      "vibeshift-recent-runs",
      JSON.stringify([
        {
          id: "disc_legacy",
          mode: "discover",
          title: "旧任务",
          input: "fastapi",
          style_snapshot: {
            id: "legacy-style",
            name: "旧风格",
            prompt: "旧提示词",
          },
        },
      ]),
    );

    const store = useRunMemoryStore();
    expect(store.recentRuns).toHaveLength(1);
    expect(store.recentRuns[0].style_snapshot?.citation_policy).toBe("auto");
    expect(store.recentRuns[0].style_snapshot?.image_focus).toBe("auto");
    expect(store.recentRuns[0].style_snapshot?.layout_format).toBe("auto");
    expect(store.recentRuns[0].style_snapshot?.visual_mode).toBe("auto");
  });

  it("drops oldest entries when localStorage quota is exceeded", async () => {
    const originalSetItem = Storage.prototype.setItem;
    let shouldThrow = true;

    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "vibeshift-recent-runs" && shouldThrow) {
        shouldThrow = false;
        throw new Error("quota exceeded");
      }
      return originalSetItem.call(this, key, value);
    };

    try {
      const store = useRunMemoryStore();
      store.recordTransformRun({
        input: "https://example.com/article",
        style: createStyleTemplate({ id: "skill-1", name: "公众号解读", prompt: "请改写。" }),
        response: {
          request_id: "req_quota",
          title: "测试标题",
          source_url: "https://example.com/article",
          raw_excerpt: "摘要",
          transformed_text: "改写结果正文",
          images: [],
          meta: {
            input_type: "url",
            provider: "openai",
            model: "gpt-4o-mini",
            duration_ms: 1200,
            used_cache: false,
          },
          run: {
            id: "run_quota",
            mode: "transform",
            status: "completed",
            workspace_path: "/tmp/run_quota",
            started_at: "2025-01-01T00:00:00Z",
            finished_at: "2025-01-01T00:00:01Z",
            duration_ms: 1000,
            title: "测试标题",
            summary: "完成改写",
            steps: [],
            artifacts: [
              {
                id: "art_1",
                kind: "draft",
                label: "rewrite-draft",
                path: "/tmp/run_quota/01-rewrite-draft.md",
                mime_type: "text/markdown",
                size_bytes: 2048,
                preview: "x".repeat(1000),
                created_at: "2025-01-01T00:00:01Z",
              },
            ],
          },
        },
      });

      await nextTick();
      expect(store.recentRuns[0]?.id).toBe("req_quota");
      expect(localStorage.getItem("vibeshift-recent-runs")).toContain("req_quota");
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });

  it("clears persisted recent runs together with in-memory state", async () => {
    localStorage.setItem(
      "vibeshift-recent-runs",
      JSON.stringify([
        {
          id: "req_existing",
          mode: "transform",
          title: "已存在任务",
          input: "https://example.com/existing",
        },
      ]),
    );

    const store = useRunMemoryStore();
    expect(store.recentRuns).toHaveLength(1);

    store.clearRecentRuns();
    await nextTick();

    expect(store.recentRuns).toHaveLength(0);
    expect(localStorage.getItem("vibeshift-recent-runs")).toBeNull();
  });

  it("derives reusable style hints from recent runs", async () => {
    const store = useRunMemoryStore();
    store.recordDiscoverRun({
      input: "FastAPI 最佳实践",
      style: createStyleTemplate({
        id: "research-style",
        name: "研究报告",
        prompt: "先给结论，再拆解关键事实、证据和建议。",
        tone: "克制、直接",
        structure_template: "结论 -> 证据 -> 建议",
        emphasis_points: ["关键事实", "证据来源"],
        citation_policy: "strict",
      }),
      response: {
        request_id: "disc_hint",
        title: "FastAPI 最佳实践",
        transformed_text: "这是一段较长的调研结果正文，强调关键事实、证据来源、适用场景与落地建议，用来模拟高质量的研究产出。",
        brief: {
          summary: "整理了最佳实践结论",
          conclusion: "适合中大型 API 场景",
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
          duration_ms: 900,
          used_cache: false,
          followup_used: false,
          sources: 1,
          evidence_items: 0,
          uncertainties: 0,
          resumed: false,
          resume_stage: null,
        },
        run: {
          id: "run_hint",
          mode: "discover",
          status: "completed",
          workspace_path: "/tmp/run_hint",
          started_at: "2025-01-01T00:00:00Z",
          finished_at: "2025-01-01T00:00:02Z",
          duration_ms: 2000,
          title: "FastAPI 最佳实践",
          summary: "完成调研",
          steps: [],
          artifacts: [],
        },
      },
    });

    await nextTick();
    const hints = store.getReusableStyleHints("请优化调研报告风格，强调关键事实和证据来源", "discover");
    expect(hints).toHaveLength(1);
    expect(hints[0].source_style_name).toBe("研究报告");
    expect(hints[0].profile_suggestion.structure_template).toBe("结论 -> 证据 -> 建议");
  });

  it("boosts pinned and restored runs when ranking reusable style hints", async () => {
    const store = useRunMemoryStore();
    store.recordDiscoverRun({
      input: "FastAPI 最佳实践",
      style: createStyleTemplate({
        id: "style-a",
        name: "普通调研风格",
        prompt: "先给结论，再拆解关键事实。",
        tone: "克制",
        structure_template: "结论 -> 拆解",
      }),
      response: {
        request_id: "disc_a",
        title: "FastAPI 最佳实践",
        transformed_text: "普通调研结果，但正文长度足够，覆盖关键事实、结构化要点和建议，确保会进入可复用记忆。",
        brief: {
          summary: "普通调研",
          conclusion: "可用",
          key_findings: [],
          evidence: [],
          uncertainties: [],
          draft_outline: [],
        },
        sources: [
          { id: 1, title: "source-a1", url: "https://example.com/a1", snippet: "snippet", excerpt: "excerpt" },
          { id: 2, title: "source-a2", url: "https://example.com/a2", snippet: "snippet", excerpt: "excerpt" },
          { id: 3, title: "source-a3", url: "https://example.com/a3", snippet: "snippet", excerpt: "excerpt" },
        ],
        meta: {
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 900,
          used_cache: false,
          followup_used: false,
          sources: 0,
          evidence_items: 0,
          uncertainties: 0,
          resumed: false,
          resume_stage: null,
        },
        run: null,
      },
    });
    store.recordDiscoverRun({
      input: "FastAPI 最佳实践",
      style: createStyleTemplate({
        id: "style-b",
        name: "收藏调研风格",
        prompt: "先给结论，再拆解关键事实和证据来源。",
        tone: "克制、直接",
        structure_template: "结论 -> 证据 -> 建议",
        emphasis_points: ["关键事实", "证据来源"],
      }),
      response: {
        request_id: "disc_b",
        title: "FastAPI 最佳实践",
        transformed_text: "收藏调研结果，正文较长，强调关键事实、证据来源和结构化结论，也应进入高质量记忆。",
        brief: {
          summary: "收藏调研",
          conclusion: "更适合复用",
          key_findings: [],
          evidence: [],
          uncertainties: [],
          draft_outline: [],
        },
        sources: [
          { id: 1, title: "source-b1", url: "https://example.com/b1", snippet: "snippet", excerpt: "excerpt" },
          { id: 2, title: "source-b2", url: "https://example.com/b2", snippet: "snippet", excerpt: "excerpt" },
          { id: 3, title: "source-b3", url: "https://example.com/b3", snippet: "snippet", excerpt: "excerpt" },
        ],
        meta: {
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 900,
          used_cache: false,
          followup_used: false,
          sources: 0,
          evidence_items: 0,
          uncertainties: 0,
          resumed: false,
          resume_stage: null,
        },
        run: null,
      },
    });

    store.toggleStyleMemoryPin("disc_b");
    store.markRunRestored("disc_a");
    store.markRunRestored("disc_a");
    store.markRunRestored("disc_b");
    await nextTick();

    const hints = store.getReusableStyleHints("请优化调研报告风格，强调关键事实和证据来源", "discover", 2);
    expect(hints).toHaveLength(2);
    expect(hints[0].source_style_name).toBe("收藏调研风格");
    expect(store.recentRuns.find((item) => item.id === "disc_b")?.pinned_for_style_memory).toBe(true);
    expect(store.recentRuns.find((item) => item.id === "disc_b")?.restore_count).toBe(1);
  });

  it("surfaces pinned recent runs for homepage quick access", async () => {
    const store = useRunMemoryStore();
    store.recordTransformRun({
      input: "https://example.com/a",
      style: null,
      response: {
        request_id: "req_a",
        title: "A",
        source_url: "https://example.com/a",
        raw_excerpt: "摘要A",
        transformed_text: "结果A",
        images: [],
        meta: {
          input_type: "url",
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 1000,
          used_cache: false,
        },
        run: null,
      },
    });
    store.recordTransformRun({
      input: "https://example.com/b",
      style: null,
      response: {
        request_id: "req_b",
        title: "B",
        source_url: "https://example.com/b",
        raw_excerpt: "摘要B",
        transformed_text: "结果B",
        images: [],
        meta: {
          input_type: "url",
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 1000,
          used_cache: false,
        },
        run: null,
      },
    });

    store.toggleStyleMemoryPin("req_b");
    await nextTick();

    expect(store.pinnedRecentRuns).toHaveLength(1);
    expect(store.pinnedRecentRuns[0].id).toBe("req_b");
  });

  it("filters out low-quality stale style memories unless pinned", () => {
    const staleDate = new Date(Date.now() - 60 * 86400000).toISOString();
    localStorage.setItem(
      "vibeshift-recent-runs",
      JSON.stringify([
        {
          id: "old_low",
          mode: "discover",
          title: "旧低质量任务",
          input: "旧任务",
          created_at: staleDate,
          style_name: "旧风格",
          style_snapshot: {
            id: "old-style",
            name: "旧风格",
            prompt: "旧提示词",
          },
          summary: "低质量",
          result_excerpt: "低质量结果",
          result_text: "低质量结果",
          quality_score: 1,
          restore_count: 0,
          pinned_for_style_memory: false,
        },
        {
          id: "old_pinned",
          mode: "discover",
          title: "旧收藏任务",
          input: "旧收藏任务",
          created_at: staleDate,
          style_name: "收藏风格",
          style_snapshot: {
            id: "pinned-style",
            name: "收藏风格",
            prompt: "强调证据来源和结构",
          },
          summary: "高价值",
          result_excerpt: "强调证据来源和结构",
          result_text: "强调证据来源和结构",
          quality_score: 2,
          restore_count: 0,
          pinned_for_style_memory: true,
        },
      ]),
    );

    const store = useRunMemoryStore();
    const hints = store.getReusableStyleHints("请优化调研风格，强调证据来源和结构", "discover", 5);
    expect(hints.map((item) => item.source_style_name)).toContain("收藏风格");
    expect(hints.map((item) => item.source_style_name)).not.toContain("旧风格");
  });
});

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { vi } from "vitest";

vi.mock("../lib/shareFormats", async () => {
  const actual = await vi.importActual<typeof import("../lib/shareFormats")>("../lib/shareFormats");
  return {
    ...actual,
    exportHtmlToPdf: vi.fn(),
  };
});

import HistoryResultViewer from "./HistoryResultViewer.vue";
import * as shareFormats from "../lib/shareFormats";
import { createStyleTemplate } from "../lib/styleSkill";

function buttonByText(text: string) {
  return Array.from(document.body.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
}

describe("HistoryResultViewer", () => {
  it("shows the stored result snapshot and source preview", () => {
    const wrapper = mount(HistoryResultViewer, {
      attachTo: document.body,
      props: {
        entry: {
          id: "run_history",
          mode: "discover",
          title: "FastAPI 最佳实践",
          input: "FastAPI 最佳实践",
          input_preview: "FastAPI 最佳实践",
          created_at: "2025-01-01T08:00:00Z",
          style_id: "style_1",
          style_name: "研究报告",
          style_snapshot: createStyleTemplate({
            id: "style_1",
            name: "研究报告",
            prompt: "先给结论，再拆解关键事实。",
          }),
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "整理了研究结论",
          result_excerpt: "这里是结果摘要",
          result_text: "## 结论\nFastAPI 适合高开发效率场景。",
          result_truncated: true,
          result_too_long: true,
          brief_summary: "已整理研究简报",
          brief_conclusion: "FastAPI 适合高开发效率场景",
          brief_key_findings: ["异步能力强", "类型提示友好"],
          source_preview: [{ id: 1, title: "官方文档", url: "https://example.com", relevance_score: 8.5 }],
          source_count: 4,
          quality_score: 5,
          restore_count: 1,
          pinned_for_style_memory: true,
          run: null,
        },
      },
    });

    expect(document.body.textContent || "").toContain("你最可能关心的内容");
    expect(document.body.textContent || "").toContain("FastAPI 适合高开发效率场景");
    expect(document.body.textContent || "").toContain("内容较长");
    expect(document.body.textContent || "").toContain("官方文档");
    expect(document.body.textContent || "").toContain("相关度 8.50");
    wrapper.unmount();
  });

  it("compares the history snapshot with the current result", () => {
    const wrapper = mount(HistoryResultViewer, {
      attachTo: document.body,
      props: {
        entry: {
          id: "run_history",
          mode: "discover",
          title: "FastAPI 最佳实践",
          input: "FastAPI 最佳实践",
          input_preview: "FastAPI 最佳实践",
          created_at: "2025-01-01T08:00:00Z",
          style_id: "style_1",
          style_name: "研究报告",
          style_snapshot: createStyleTemplate({
            id: "style_1",
            name: "研究报告",
            prompt: "先给结论，再拆解关键事实。",
          }),
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "整理了研究结论",
          result_excerpt: "这里是结果摘要",
          result_text: "FastAPI 适合高开发效率场景，强调类型提示和异步能力。",
          result_truncated: false,
          result_too_long: false,
          brief_summary: "已整理研究简报",
          brief_conclusion: "FastAPI 适合高开发效率场景",
          brief_key_findings: ["异步能力强", "类型提示友好"],
          source_preview: [],
          source_count: 4,
          quality_score: 5,
          restore_count: 1,
          pinned_for_style_memory: true,
          run: null,
        },
        currentTitle: "当前结果",
        currentResultText: "FastAPI 更强调部署效率，也提到了异步能力。",
        currentSummary: "当前结果更强调部署效率。",
        currentKeyFindings: ["部署效率", "异步能力"],
      },
    });

    expect(document.body.textContent || "").toContain("与当前结果对比");
    expect(document.body.textContent || "").toContain("当前结果重点");
    expect(document.body.textContent || "").toContain("历史结果更强调");
    expect(document.body.textContent || "").toContain("当前结果更强调");
    wrapper.unmount();
  });

  it("supports fullscreen, copy and export", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    vi.mocked(shareFormats.exportHtmlToPdf).mockClear();

    const wrapper = mount(HistoryResultViewer, {
      attachTo: document.body,
      props: {
        entry: {
          id: "run_history",
          mode: "transform",
          title: "历史改写结果",
          input: "原始内容",
          input_preview: "原始内容",
          created_at: "2025-01-01T08:00:00Z",
          style_id: null,
          style_name: "",
          style_snapshot: null,
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "摘要",
          result_excerpt: "这里是结果摘要",
          result_text: "# 历史改写结果\n\n## 正文\n内容保留",
          result_truncated: false,
          result_too_long: false,
          brief_summary: "",
          brief_conclusion: "",
          brief_key_findings: [],
          source_preview: [],
          source_count: 0,
          quality_score: 3,
          restore_count: 0,
          pinned_for_style_memory: false,
          run: null,
        },
      },
    });

    const copyButton = buttonByText("复制结果");
    const exportButton = buttonByText("导出 PDF");
    const fullscreenButton = buttonByText("全屏查看");

    expect(copyButton).toBeTruthy();
    expect(exportButton).toBeTruthy();
    expect(fullscreenButton).toBeTruthy();

    (copyButton as HTMLButtonElement).click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("# 历史改写结果\n\n## 正文\n内容保留");

    (exportButton as HTMLButtonElement).click();
    expect(shareFormats.exportHtmlToPdf).toHaveBeenCalled();

    (fullscreenButton as HTMLButtonElement).click();
    await nextTick();
    expect(document.body.querySelector(".history-viewer")?.classList.contains("fullscreen")).toBe(true);
    expect(document.body.textContent || "").toContain("Markdown 快照");
    expect(document.body.innerHTML).not.toContain("历史改写结果</h1>");

    wrapper.unmount();
  });

  it("copies platform share formats from history results", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();

    const wrapper = mount(HistoryResultViewer, {
      attachTo: document.body,
      props: {
        entry: {
          id: "run_history_share",
          mode: "discover",
          title: "黑洞是什么",
          input: "黑洞是什么",
          input_preview: "黑洞是什么",
          created_at: "2025-01-01T08:00:00Z",
          style_id: "science",
          style_name: "科普风",
          style_snapshot: createStyleTemplate({
            id: "science",
            name: "科普风",
            prompt: "先讲清原理，再解释常见误区。",
          }),
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "解释黑洞基本概念",
          result_excerpt: "历史结果摘要",
          result_text: "## 直接结论\n黑洞是引力极强的天体。",
          result_truncated: false,
          result_too_long: false,
          brief_summary: "解释了黑洞的基本概念",
          brief_conclusion: "黑洞是引力极强的天体",
          brief_key_findings: ["并不是宇宙吸尘器", "来自恒星坍缩"],
          source_preview: [{ id: 1, title: "百科来源", url: "https://example.com/wiki", relevance_score: 9.1 }],
          source_count: 1,
          quality_score: 4,
          restore_count: 0,
          pinned_for_style_memory: false,
          run: null,
        },
      },
    });

    const details = document.body.querySelector(".copy-more") as HTMLDetailsElement;
    details.open = true;
    await nextTick();

    const shareButton = buttonByText("小红书");
    expect(shareButton).toBeTruthy();
    (shareButton as HTMLButtonElement).click();
    await nextTick();

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("# 黑洞是什么");
    expect(details.open).toBe(false);
    wrapper.unmount();
  });
});

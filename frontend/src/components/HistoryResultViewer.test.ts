import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { vi } from "vitest";

vi.mock("../lib/shareFormats", async () => {
  const actual = await vi.importActual<typeof import("../lib/shareFormats")>("../lib/shareFormats");
  return {
    ...actual,
    exportHistoryResultPdf: vi.fn(),
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

    expect(document.body.textContent || "").toContain("可直接发送的简报");
    expect(document.body.textContent || "").toContain("FastAPI 适合高开发效率场景");
    expect(document.body.textContent || "").toContain("内容较长");
    expect(document.body.textContent || "").toContain("官方文档");
    expect(document.body.textContent || "").toContain("相关度 8.50");
    expect(document.body.textContent || "").toContain("简报");
    expect(document.body.textContent || "").toContain("详文");
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
    vi.mocked(shareFormats.exportHistoryResultPdf).mockClear();

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

    const copyButton = buttonByText("复制公众号长文");
    const exportButton = buttonByText("导出成稿 PDF");
    const fullscreenButton = buttonByText("全屏查看");

    expect(copyButton).toBeTruthy();
    expect(exportButton).toBeTruthy();
    expect(fullscreenButton).toBeTruthy();

    (copyButton as HTMLButtonElement).click();
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("# 历史改写结果");
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("## 正文");
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("内容保留");

    (exportButton as HTMLButtonElement).click();
    expect(shareFormats.exportHistoryResultPdf).toHaveBeenCalled();

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
          title: "部署简报",
          input: "部署简报",
          input_preview: "部署简报",
          created_at: "2025-01-01T08:00:00Z",
          style_id: "poster",
          style_name: "海报风",
          style_snapshot: createStyleTemplate({
            id: "poster",
            name: "海报风",
            prompt: "大标题 -> 一句话结论 -> 重点卡片 -> 行动建议。",
          }),
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "部署建议摘要",
          result_excerpt: "历史结果摘要",
          result_text: "## 一句话结论\n优先采用容器化部署。",
          result_truncated: false,
          result_too_long: false,
          brief_summary: "整理了部署建议。",
          brief_conclusion: "优先采用容器化部署。",
          brief_key_findings: ["上线节奏更稳", "回滚成本更低"],
          source_preview: [{ id: 1, title: "部署来源", url: "https://example.com/deploy", relevance_score: 9.1 }],
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

    const shareButton = buttonByText("小红书笔记");
    expect(shareButton).toBeTruthy();
    (shareButton as HTMLButtonElement).click();
    await nextTick();

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(document.body.textContent || "").toContain("适合重点前置、节奏更快的图文发布");
    expect(document.body.textContent || "").toContain("主按钮成稿预览");
    expect(document.body.textContent || "").toContain("小红书笔记");
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("【部署简报】");
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).not.toContain("## 直接结论");
    expect(details.open).toBe(false);
    wrapper.unmount();
  });

  it("copies and exports discover history by active tab", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    vi.mocked(shareFormats.exportHistoryResultPdf).mockClear();

    const wrapper = mount(HistoryResultViewer, {
      attachTo: document.body,
      props: {
        entry: {
          id: "run_history_tabs",
          mode: "discover",
          title: "部署方案评估",
          input: "部署方案评估",
          input_preview: "部署方案评估",
          created_at: "2025-01-01T08:00:00Z",
          style_id: "briefing",
          style_name: "简报风",
          style_snapshot: createStyleTemplate({
            id: "briefing",
            name: "简报风",
            prompt: "一句话结论 -> 关键判断 -> 风险",
          }),
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "部署方案比较",
          result_excerpt: "这里是结果摘要",
          result_text: "# 部署方案评估\n\n## 正文\n这里是完整详文。",
          result_truncated: false,
          result_too_long: false,
          brief_summary: "比较了当前可选方案。",
          brief_conclusion: "优先采用容器化部署。",
          brief_key_findings: ["上线节奏更稳", "回滚成本更低"],
          source_preview: [],
          source_count: 0,
          quality_score: 4,
          restore_count: 0,
          pinned_for_style_memory: false,
          run: null,
        },
      },
    });

    const copyButton = buttonByText("复制公众号长文");
    expect(copyButton).toBeTruthy();
    expect(document.body.textContent || "").toContain("更多场景成稿（简报）");
    (copyButton as HTMLButtonElement).click();
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("优先采用容器化部署。");
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).not.toContain("完整详文");

    const reportTab = buttonByText("详文");
    expect(reportTab).toBeTruthy();
    (reportTab as HTMLButtonElement).click();
    await nextTick();

    expect(document.body.textContent || "").toContain("复制详文成稿");
    expect(document.body.textContent || "").toContain("更多场景成稿（详文）");
    expect(document.body.textContent || "").toContain("详文导读");
    (copyButton as HTMLButtonElement).click();
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("# 部署方案评估");
    expect(String((navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] || "")).toContain("完整详文");

    const exportButton = buttonByText("导出 PDF");
    expect(exportButton).toBeTruthy();
    (exportButton as HTMLButtonElement).click();
    expect(shareFormats.exportHistoryResultPdf).toHaveBeenCalledWith(expect.any(Object), "report");

    wrapper.unmount();
  });

  it("renders history snapshots with style-aware dialogue layout", async () => {
    const wrapper = mount(HistoryResultViewer, {
      attachTo: document.body,
      props: {
        entry: {
          id: "run_history_dialogue",
          mode: "transform",
          title: "访谈稿",
          input: "原始访谈",
          input_preview: "原始访谈",
          created_at: "2025-01-01T08:00:00Z",
          style_id: "interview",
          style_name: "访谈问答",
          style_snapshot: createStyleTemplate({
            id: "interview",
            name: "访谈问答",
            prompt: "整理成问答稿。",
          }),
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "一组关键问答",
          result_excerpt: "一组关键问答",
          result_text: "问：为什么改成问答稿？\n答：因为读者更容易抓重点。\n\n问：重点是什么？\n答：让内容拿来就能用。",
          result_truncated: false,
          result_too_long: false,
          brief_summary: "",
          brief_conclusion: "",
          brief_key_findings: [],
          source_preview: [],
          source_count: 0,
          quality_score: 4,
          restore_count: 0,
          pinned_for_style_memory: false,
          run: null,
        },
      },
    });

    await nextTick();
    const article = document.body.querySelector(".history-markdown") as HTMLElement;
    expect(article.innerHTML).toContain("dialogue-render-block");
    expect(article.textContent || "").toContain("为什么改成问答稿");
    wrapper.unmount();
  });

  it("renders longform guide for history report snapshots", async () => {
    const wrapper = mount(HistoryResultViewer, {
      attachTo: document.body,
      props: {
        entry: {
          id: "run_history_editorial",
          mode: "transform",
          title: "评论稿",
          input: "原始内容",
          input_preview: "原始内容",
          created_at: "2025-01-01T08:00:00Z",
          style_id: "editorial",
          style_name: "评论风",
          style_snapshot: createStyleTemplate({
            id: "editorial",
            name: "评论风",
            prompt: "观点 -> 事实依据 -> 分析推进 -> 结论与建议。",
          }),
          provider: "openai",
          model: "gpt-4o-mini",
          summary: "一篇带判断的评论稿",
          result_excerpt: "一篇带判断的评论稿",
          result_text:
            "# 评论稿\n\n先把判断讲清：现在更适合稳步推进。\n\n## 事实依据\n\n数据和反馈都支持这个判断。\n\n## 分析推进\n\n团队仍在磨合期。\n\n因此，先稳后快会更合理。",
          result_truncated: false,
          result_too_long: false,
          brief_summary: "",
          brief_conclusion: "",
          brief_key_findings: [],
          source_preview: [],
          source_count: 0,
          quality_score: 4,
          restore_count: 0,
          pinned_for_style_memory: false,
          run: null,
        },
      },
    });

    await nextTick();
    expect(document.body.textContent || "").toContain("导语判断");
    expect(document.body.textContent || "").toContain("论证抓手");
    expect(document.body.textContent || "").toContain("结尾落点");
    expect(document.body.querySelector(".deliverable-guide-closing")).toBeTruthy();
    wrapper.unmount();
  });
});

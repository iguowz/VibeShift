import { mount } from "@vue/test-utils";
import { vi } from "vitest";

vi.mock("../lib/shareFormats", async () => {
  const actual = await vi.importActual<typeof import("../lib/shareFormats")>("../lib/shareFormats");
  return {
    ...actual,
    exportDiscoverResultPdf: vi.fn(),
  };
});

import DiscoverViewer from "./DiscoverViewer.vue";
import * as shareFormats from "../lib/shareFormats";
import type { DiscoverResponse } from "../types";

function buildResult(): DiscoverResponse {
  return {
    request_id: "disc_test",
    title: "FastAPI 最佳实践",
    transformed_text: "## 结论 / TL;DR\n- 适合中小型 API 服务 [1]",
    brief: {
      summary: "已整理出证据优先的研究简报",
      conclusion: "FastAPI 更适合追求开发效率的 API 场景 [1]",
      key_findings: ["类型提示与异步能力是主要优势", "生态成熟度较高"],
      evidence: [
        {
          source_id: 1,
          title: "官方文档",
          url: "https://example.com/fastapi",
          quote: "FastAPI docs emphasize async support and type hints.",
          evidence: "文档强调类型提示与异步能力。",
          relevance: "能直接支撑框架定位判断。",
        },
      ],
      uncertainties: ["缺少特定业务下的压测数据。"],
      draft_outline: ["结论", "证据拆解", "落地建议"],
    },
    sources: [
      {
        id: 1,
        title: "官方文档",
        url: "https://example.com/fastapi",
        snippet: "FastAPI docs",
        excerpt: "文档强调类型提示与异步能力。",
      },
    ],
    meta: {
      provider: "openai",
      model: "gpt-4o-mini",
      duration_ms: 980,
      used_cache: false,
      followup_used: true,
      sources: 1,
      evidence_items: 1,
      uncertainties: 1,
      resumed: false,
      resume_stage: null,
    },
    run: {
      id: "run_discover",
      mode: "discover",
      status: "completed",
      workspace_path: "/tmp/vibeshift/run_discover",
      started_at: "2025-01-01T00:00:00Z",
      finished_at: "2025-01-01T00:00:01Z",
      duration_ms: 1000,
      title: "FastAPI 最佳实践",
      summary: "完成调研任务。",
      steps: [],
      artifacts: [
        {
          id: "art_1",
          kind: "sources",
          label: "sources-data",
          path: "/tmp/vibeshift/run_discover/02-sources-data.json",
          mime_type: "application/json",
          size_bytes: 128,
          preview: "[]",
          created_at: "2025-01-01T00:00:01Z",
        },
        {
          id: "art_2",
          kind: "evidence",
          label: "discover-evidence",
          path: "/tmp/vibeshift/run_discover/03-discover-evidence.json",
          mime_type: "application/json",
          size_bytes: 256,
          preview: "[]",
          created_at: "2025-01-01T00:00:01Z",
        },
        {
          id: "art_3",
          kind: "brief",
          label: "discover-brief",
          path: "/tmp/vibeshift/run_discover/04-discover-brief.json",
          mime_type: "application/json",
          size_bytes: 256,
          preview: "{}",
          created_at: "2025-01-01T00:00:01Z",
        },
        {
          id: "art_4",
          kind: "draft",
          label: "discover-draft",
          path: "/tmp/vibeshift/run_discover/05-discover-draft.md",
          mime_type: "text/markdown",
          size_bytes: 256,
          preview: "## 调研目标",
          created_at: "2025-01-01T00:00:01Z",
        },
      ],
    },
  };
}

describe("DiscoverViewer", () => {
  it("renders evidence-first brief panels", () => {
    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: false,
      },
    });

    expect(wrapper.text()).toContain("简报");
    expect(wrapper.text()).toContain("研究简报");
    expect(wrapper.text()).toContain("直接结论");
    expect(wrapper.text()).toContain("FastAPI 更适合追求开发效率");
    expect(wrapper.text()).toContain("关键证据（1）");
    expect(wrapper.text()).toContain("FastAPI docs emphasize async support");
    expect(wrapper.text()).toContain("缺少特定业务下的压测数据");
  });

  it("copies report with research brief summary", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: false,
      },
    });

    const button = wrapper.findAll("button").find((item) => item.text().includes("复制结果"));
    expect(button).toBeTruthy();
    await button!.trigger("click");

    expect(vi.isMockFunction(navigator.clipboard.writeText)).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const payload = (navigator.clipboard.writeText as any).mock.calls[0][0] as string;
    expect(payload).toContain("## 研究简报");
    expect(payload).toContain("FastAPI 更适合追求开发效率");
  });

  it("emits rerun events for resume stages", async () => {
    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: false,
      },
    });

    const buttons = wrapper.findAll("button");
    const rerunReport = buttons.find((item) => item.text().includes("基于草稿重写成稿"));
    const rerunBrief = buttons.find((item) => item.text().includes("基于简报重跑"));
    const rerunSources = buttons.find((item) => item.text().includes("从来源重新研究"));

    expect(rerunReport).toBeTruthy();
    expect(rerunBrief).toBeTruthy();
    expect(rerunSources).toBeTruthy();

    await rerunReport!.trigger("click");
    await rerunBrief!.trigger("click");
    await rerunSources!.trigger("click");

    expect(wrapper.emitted("rerun")?.map((entry) => entry[0])).toEqual(["draft", "brief", "sources"]);
  });

  it("hides rerun actions when required artifacts are missing", () => {
    const result = buildResult();
    result.run = {
      ...result.run!,
      artifacts: [],
    };

    const wrapper = mount(DiscoverViewer, {
      props: {
        result,
        busy: false,
      },
    });

    expect(wrapper.text()).not.toContain("基于草稿重写成稿");
    expect(wrapper.text()).not.toContain("基于简报重跑");
    expect(wrapper.text()).not.toContain("从来源重新研究");
  });

  it("disables rerun actions while busy", () => {
    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: true,
      },
    });

    const rerunButtons = wrapper.findAll("button").filter((item) => item.text().includes("重跑") || item.text().includes("重新研究"));
    expect(rerunButtons.length).toBeGreaterThan(0);
    for (const button of rerunButtons) {
      expect(button.attributes("disabled")).toBeDefined();
    }
  });

  it("switches between brief and report tabs", async () => {
    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: false,
      },
    });

    expect(wrapper.text()).toContain("研究简报");
    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("调研全文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    expect(wrapper.text()).toContain("调研全文");
    expect(wrapper.text()).not.toContain("Markdown 源码");
    expect(wrapper.text()).not.toContain("HTML 源码");
  });

  it("copies xiaohongshu share text, closes share menu and exports pdf", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    vi.mocked(shareFormats.exportDiscoverResultPdf).mockClear();

    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: false,
      },
    });

    const details = wrapper.find("details.copy-more");
    (details.element as HTMLDetailsElement).open = true;
    const xhsButton = wrapper.findAll("button").find((item) => item.text().includes("小红书"));
    expect(xhsButton).toBeTruthy();
    await xhsButton!.trigger("click");

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const payload = (navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] as string;
    expect(payload).toContain("# FastAPI 最佳实践");
    expect(payload).toContain("#调研");
    expect((details.element as HTMLDetailsElement).open).toBe(false);

    const pdfButton = wrapper.findAll("button").find((item) => item.text().includes("导出 PDF"));
    expect(pdfButton).toBeTruthy();
    await pdfButton!.trigger("click");
    expect(shareFormats.exportDiscoverResultPdf).toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("支持渲染 Markdown 或 HTML");
  });

  it("removes duplicated leading report title in preview", async () => {
    const result = buildResult();
    result.transformed_text = "# 调研报告：FastAPI 最佳实践\n\n## 结论\n- 更适合高开发效率场景";

    const wrapper = mount(DiscoverViewer, {
      props: {
        result,
        busy: false,
      },
    });

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("调研全文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    const markdown = wrapper.get(".discover-report-body .markdown");
    expect(markdown.html()).not.toContain("调研报告：FastAPI 最佳实践</h1>");
    expect(markdown.text()).toContain("更适合高开发效率场景");
  });

  it("renders pretext flow blocks directly in the report body", async () => {
    const result = buildResult();
    result.transformed_text =
      "## 落地路径\n\n```pretext flow\n{\"title\":\"研究步骤\",\"steps\":[{\"title\":\"厘清对象\",\"detail\":\"先区分庄子原典与余光中文本\"},{\"title\":\"对齐语境\",\"detail\":\"再分别解释哲学与文学层面的逍遥\"}]}\n```";

    const wrapper = mount(DiscoverViewer, {
      props: {
        result,
        busy: false,
      },
    });

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("调研全文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    const markdown = wrapper.get(".discover-report-body .markdown");
    expect(markdown.html()).toContain("pretext-flow");
    expect(markdown.text()).toContain("研究步骤");
    expect(markdown.text()).toContain("厘清对象");
    expect(markdown.text()).not.toContain('<article class="pretext-flow-step">');
  });
});

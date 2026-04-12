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
        styleProfile: {
          name: "商业简报",
          audience: "管理层",
          tone: "冷静、结论先行",
          structure_template: "一句话结论 -> 关键数据 -> 核心判断 -> 风险与建议",
          emphasis_points: ["关键数据", "风险提示"],
          citation_policy: "minimal",
          title_policy: "retain",
          image_focus: "diagram",
          layout_format: "ppt",
          visual_mode: "enhanced",
        },
      },
    });

    expect(wrapper.text()).toContain("简报");
    expect(wrapper.text()).toContain("已为你整理成可直接发送的 公众号长文");
    expect(wrapper.text()).toContain("可直接发送版");
    expect(wrapper.text()).toContain("一句话结论");
    expect(wrapper.text()).toContain("FastAPI 更适合追求开发效率");
    expect(wrapper.text()).toContain("备用支撑材料");
    expect(wrapper.text()).toContain("数据与依据（1）");
    expect(wrapper.text()).toContain("FastAPI docs emphasize async support");
    expect(wrapper.text()).toContain("缺少特定业务下的压测数据");
    expect(wrapper.text()).toContain("重点 1");
    expect(wrapper.text()).not.toContain("报告形式");
    expect(wrapper.text()).not.toContain("生成流程");
    expect(wrapper.text()).not.toContain("输出重点");
    expect(wrapper.text().indexOf("风险与待确认点（1）")).toBeLessThan(wrapper.text().indexOf("数据与依据（1）"));
    const preview = wrapper.get(".discover-deliverable-card .markdown");
    expect(preview.text()).toContain("FastAPI 更适合追求开发效率");
  });

  it("copies current brief as direct-use content", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: false,
      },
    });

    const button = wrapper.findAll("button").find((item) => item.text().includes("复制公众号长文"));
    expect(button).toBeTruthy();
    await button!.trigger("click");

    expect(vi.isMockFunction(navigator.clipboard.writeText)).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const payload = (navigator.clipboard.writeText as any).mock.calls[0][0] as string;
    expect(payload).toContain("# FastAPI 最佳实践");
    expect(payload).toContain("FastAPI 更适合追求开发效率");
    expect(payload).not.toContain("研究简报");
    expect(payload).not.toContain("参考链接");
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
    expect(wrapper.text()).toContain("复制公众号长文");
    expect(wrapper.text()).toContain("更多场景成稿（简报）");
    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    expect(wrapper.text()).toContain("详文");
    expect(wrapper.text()).toContain("复制详文成稿");
    expect(wrapper.text()).toContain("更多场景成稿（详文）");
    expect(wrapper.text()).toContain("这篇详文可直接使用");
    expect(wrapper.text()).toContain("内容分段");
    expect(wrapper.text()).not.toContain("Markdown 源码");
    expect(wrapper.text()).not.toContain("HTML 源码");
  });

  it("renders family-specific longform guide in report tab", async () => {
    const result = buildResult();
    result.transformed_text =
      "# 黑洞是什么\n\n先用一句话讲清：黑洞是引力极强的天体区域。\n\n## 为什么会形成\n\n- 来自恒星坍缩\n- 会形成极端引力\n\n## 常见误区\n\n- 不是宇宙吸尘器\n- 不会无差别吞掉一切\n\n最后记住：它首先是引力现象。";

    const wrapper = mount(DiscoverViewer, {
      props: {
        result,
        busy: false,
        styleProfile: {
          name: "科普风",
          audience: "普通读者",
          tone: "清楚、友好",
          structure_template: "一句话讲清 -> 原理解释 -> 误区提醒 -> 现实意义",
          emphasis_points: ["常见误区"],
          citation_policy: "minimal",
          title_policy: "retain",
          image_focus: "diagram",
          layout_format: "auto",
          visual_mode: "minimal",
        },
      },
    });

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    expect(wrapper.text()).toContain("先讲明白");
    expect(wrapper.text()).toContain("理解抓手");
    expect(wrapper.text()).toContain("最后记住");
    expect(wrapper.find(".deliverable-guide-closing").exists()).toBe(true);
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
    const xhsButton = details.findAll("button").find((item) => item.text().includes("小红书笔记"));
    expect(xhsButton).toBeTruthy();
    await xhsButton!.trigger("click");

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(wrapper.text()).toContain("适合重点前置、节奏更快的图文发布");
    const payload = (navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] as string;
    expect(payload).toContain("【FastAPI 最佳实践】");
    expect(payload).toContain("FastAPI 更适合追求开发效率");
    expect(payload).not.toContain("#调研");
    expect(payload).not.toContain("## 结论 / TL;DR");
    expect((details.element as HTMLDetailsElement).open).toBe(false);

    const pdfButton = wrapper.findAll("button").find((item) => item.text().includes("导出 PDF"));
    expect(pdfButton).toBeTruthy();
    await pdfButton!.trigger("click");
    expect(shareFormats.exportDiscoverResultPdf).toHaveBeenCalledWith(expect.any(Object), undefined, "brief");
    expect(wrapper.text()).not.toContain("支持渲染 Markdown 或 HTML");
  });

  it("exports report tab as report content when switched", async () => {
    vi.mocked(shareFormats.exportDiscoverResultPdf).mockClear();

    const wrapper = mount(DiscoverViewer, {
      props: {
        result: buildResult(),
        busy: false,
      },
    });

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    const pdfButton = wrapper.findAll("button").find((item) => item.text().includes("导出 PDF"));
    expect(pdfButton).toBeTruthy();
    await pdfButton!.trigger("click");

    expect(shareFormats.exportDiscoverResultPdf).toHaveBeenCalledWith(expect.any(Object), undefined, "report");
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

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
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

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    const markdown = wrapper.get(".discover-report-body .markdown");
    expect(markdown.html()).toContain("pretext-flow");
    expect(markdown.text()).toContain("研究步骤");
    expect(markdown.text()).toContain("厘清对象");
    expect(markdown.text()).not.toContain('<article class="pretext-flow-step">');
  });

  it("renders interview-style report body as dialogue blocks", async () => {
    const result = buildResult();
    result.transformed_text =
      "## 引题\n\n问：为什么选 FastAPI？\n答：因为开发效率高。\n\n问：风险是什么？\n答：团队需要熟悉类型提示。";

    const wrapper = mount(DiscoverViewer, {
      props: {
        result,
        busy: false,
        styleProfile: {
          name: "访谈问答",
          audience: "产品经理",
          tone: "自然、清楚",
          structure_template: "引题 -> 问题 -> 回答 -> 追问 -> 小结",
          emphasis_points: ["关键问答"],
          citation_policy: "minimal",
          title_policy: "retain",
          image_focus: "narrative",
          layout_format: "book",
          visual_mode: "minimal",
        },
      },
    });

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    const markdown = wrapper.get(".discover-report-body .markdown");
    expect(markdown.html()).toContain("dialogue-render-block");
    expect(markdown.text()).toContain("为什么选 FastAPI");
    expect(markdown.text()).toContain("因为开发效率高");
  });

  it("renders manual-style report body as step modules", async () => {
    const result = buildResult();
    result.transformed_text = "## 操作步骤\n\n1. 明确目标\n2. 配置参数\n3. 验证结果";

    const wrapper = mount(DiscoverViewer, {
      props: {
        result,
        busy: false,
        styleProfile: {
          name: "教程手册",
          audience: "执行同学",
          tone: "清楚、直接",
          structure_template: "目标 -> 前置条件 -> 步骤 -> 排错 -> 完成标准",
          emphasis_points: ["关键步骤"],
          citation_policy: "minimal",
          title_policy: "retain",
          image_focus: "diagram",
          layout_format: "auto",
          visual_mode: "minimal",
        },
      },
    });

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    const markdown = wrapper.get(".discover-report-body .markdown");
    expect(markdown.html()).toContain("body-step-module");
    expect(markdown.text()).toContain("明确目标");
    expect(markdown.text()).toContain("配置参数");
  });

  it("renders editorial-style report body as section modules", async () => {
    const result = buildResult();
    result.transformed_text = "## 核心判断\n\n这是第一段分析。\n\n## 事实依据\n\n这里是支撑判断的事实。";

    const wrapper = mount(DiscoverViewer, {
      props: {
        result,
        busy: false,
        styleProfile: {
          name: "评论社论",
          audience: "管理层",
          tone: "鲜明、克制",
          structure_template: "观点 -> 事实依据 -> 分析推进 -> 结论与建议",
          emphasis_points: ["核心判断"],
          citation_policy: "minimal",
          title_policy: "retain",
          image_focus: "editorial",
          layout_format: "newspaper",
          visual_mode: "minimal",
        },
      },
    });

    const reportTab = wrapper.findAll("button").find((item) => item.text().includes("详文"));
    expect(reportTab).toBeTruthy();
    await reportTab!.trigger("click");

    const markdown = wrapper.get(".discover-report-body .markdown");
    expect(markdown.html()).toContain("body-section-module");
    expect(markdown.html()).toContain("body-section-editorial");
    expect(markdown.text()).toContain("事实依据");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildHistoryCopyText,
  buildHistoryShareText,
  buildDiscoverCopyText,
  buildPreferredDiscoverCopyText,
  buildPreferredHistoryCopyText,
  buildPreferredTransformCopyText,
  buildDiscoverShareText,
  buildTransformShareText,
  exportDiscoverResultPdf,
  exportHistoryResultPdf,
  exportHtmlToPdf,
  exportTransformResultPdf,
  getRecommendedShareTarget,
} from "./shareFormats";
import type { DiscoverResponse, TransformResponse } from "../types";
import { createStyleTemplate } from "./styleSkill";

describe("shareFormats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes printable html directly into the popup document", async () => {
    const docOpen = vi.fn();
    const docWrite = vi.fn();
    const docClose = vi.fn();
    const popup = {
      document: {
        open: docOpen,
        write: docWrite,
        close: docClose,
      },
      focus: vi.fn(),
    } as any;

    vi.spyOn(window, "open").mockReturnValue(popup);

    exportHtmlToPdf("测试导出", "<p class=\"hidden\" style=\"display:none\">正文内容</p>");
    await vi.runAllTimersAsync();

    expect(window.open).toHaveBeenCalledWith("", "_blank", "width=960,height=720");
    expect(docOpen).toHaveBeenCalled();
    expect(docWrite).toHaveBeenCalledTimes(1);
    const printableHtml = docWrite.mock.calls[0]?.[0] as string;
    expect(printableHtml).toContain("打印 / 另存为 PDF");
    expect(printableHtml).toContain("正文内容");
    expect(printableHtml).not.toContain("display:none");
    expect(printableHtml).not.toContain("class=\"hidden\"");
    expect(docClose).toHaveBeenCalled();
    expect(popup.focus).toHaveBeenCalled();
  });

  it("exports transform pdf using the preferred deliverable text", async () => {
    const docWrite = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: {
        open: vi.fn(),
        write: docWrite,
        close: vi.fn(),
      },
      focus: vi.fn(),
    } as any);

    exportTransformResultPdf(
      {
        request_id: "req_pdf_transform",
        title: "部署简报",
        source_url: null,
        raw_excerpt: "优先采用容器化部署。",
        transformed_text: "# 部署简报\n\n这是完整正文。",
        images: [],
        meta: {
          input_type: "text",
          provider: "openai",
          model: "gpt-4o-mini",
          duration_ms: 1200,
          used_cache: false,
        },
        run: null,
      },
      {
        name: "海报风",
        audience: "管理层",
        tone: "醒目、直接",
        structure_template: "结论 -> 重点卡片",
        emphasis_points: ["行动建议"],
        citation_policy: "minimal",
        title_policy: "punchy",
        image_focus: "editorial",
        layout_format: "poster",
        visual_mode: "enhanced",
      },
    );

    const printableHtml = String(docWrite.mock.calls[0]?.[0] || "");
    expect(printableHtml).toContain("部署简报");
    expect(printableHtml).toContain("优先采用容器化部署。");
    expect(printableHtml).not.toContain("这是完整正文。");
  });

  it("exports transform history pdf using the preferred deliverable text", async () => {
    const docWrite = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: {
        open: vi.fn(),
        write: docWrite,
        close: vi.fn(),
      },
      focus: vi.fn(),
    } as any);

    exportHistoryResultPdf({
      id: "history_transform_pdf",
      mode: "transform",
      title: "部署简报",
      input: "原始输入",
      input_preview: "原始输入",
      created_at: "2025-01-01T08:00:00Z",
      style_id: "poster",
      style_name: "海报风",
      style_snapshot: createStyleTemplate({
        id: "poster",
        name: "海报风",
        prompt: "大标题 -> 一句话结论 -> 重点卡片。",
      }),
      provider: "openai",
      model: "gpt-4o-mini",
      summary: "部署建议摘要",
      result_excerpt: "优先采用容器化部署。",
      result_text: "# 部署简报\n\n这是历史完整正文。",
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
    });

    const printableHtml = String(docWrite.mock.calls[0]?.[0] || "");
    expect(printableHtml).toContain("部署简报");
    expect(printableHtml).toContain("一句话结论：部署建议摘要");
    expect(printableHtml).not.toContain("这是历史完整正文。");
  });

  it("keeps letter-style share text in direct usable form", () => {
    const result: TransformResponse = {
      request_id: "req_letter",
      title: "写给团队的一封信",
      source_url: null,
      raw_excerpt: "关于近期调整的一点说明。",
      transformed_text: "# 写给团队的一封信\n\n各位同事：\n\n这次调整的重点，是让协作节奏更稳定。\n\n此致\n敬礼",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 3200,
        used_cache: false,
      },
      run: null,
    };

    const text = buildTransformShareText(result, "wechat", {
      name: "书信风",
      audience: "团队成员",
      tone: "真诚、克制",
      structure_template: "称呼 -> 正文 -> 致意",
      emphasis_points: ["真诚沟通"],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "narrative",
      layout_format: "book",
      visual_mode: "minimal",
    });

    expect(text).toContain("# 写给团队的一封信");
    expect(text).toContain("各位同事：");
    expect(text).toContain("此致");
    expect(text).not.toContain("导语：");
    expect(text).not.toContain("#内容创作");
  });

  it("builds dialogue-first discover share text for interview style", () => {
    const result: DiscoverResponse = {
      request_id: "req_interview",
      title: "为什么选择 FastAPI",
      transformed_text: "# 为什么选择 FastAPI\n\n问：为什么它适合当前项目？\n答：因为开发效率和异步能力兼顾。\n\n问：风险在哪里？\n答：团队要适应类型提示。",
      brief: {
        summary: "整理了选择 FastAPI 的原因和风险。",
        conclusion: "适合快速迭代，但需要团队同步编码规范。",
        key_findings: ["开发效率高", "异步能力强"],
        evidence: [],
        uncertainties: [],
        draft_outline: [],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 4200,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 0,
        resumed: false,
      },
      run: null,
    };

    const text = buildDiscoverShareText(result, "zhihu", {
      name: "访谈问答",
      audience: "技术负责人",
      tone: "自然、清楚",
      structure_template: "问题 -> 回答 -> 追问",
      emphasis_points: ["关键问答"],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "narrative",
      layout_format: "book",
      visual_mode: "minimal",
    });

    expect(text).toContain("问：为什么它适合当前项目？");
    expect(text).toContain("答：因为开发效率和异步能力兼顾。");
    expect(text).not.toContain("一句话结论");
    expect(text).not.toContain("我最关心的几个点");
  });

  it("recommends default deliverable targets by family and view", () => {
    expect(getRecommendedShareTarget("poster", "transform")).toBe("xiaohongshu");
    expect(getRecommendedShareTarget("interview", "report")).toBe("zhihu");
    expect(getRecommendedShareTarget("briefing", "brief")).toBe("wechat");
  });

  it("builds preferred copy text as direct deliverable instead of raw result shell", () => {
    const transformResult: TransformResponse = {
      request_id: "req_default_copy",
      title: "部署简报",
      source_url: null,
      raw_excerpt: "优先采用容器化部署。",
      transformed_text: "# 部署简报\n\n优先采用容器化部署。\n\n- 上线节奏更稳\n- 回滚成本更低",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 1800,
        used_cache: false,
      },
      run: null,
    };
    const discoverResult: DiscoverResponse = {
      request_id: "req_default_discover_copy",
      title: "为什么选择 FastAPI",
      transformed_text: "# 为什么选择 FastAPI\n\n问：为什么它适合当前项目？\n答：因为开发效率和异步能力兼顾。",
      brief: {
        summary: "整理了选择 FastAPI 的原因。",
        conclusion: "适合快速迭代，也便于接口规范落地。",
        key_findings: ["开发效率高", "异步能力强"],
        evidence: [],
        uncertainties: [],
        draft_outline: [],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 1800,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 0,
        resumed: false,
      },
      run: null,
    };

    const historyEntry = {
      id: "history_1",
      mode: "discover" as const,
      title: "历史问答稿",
      input: "历史输入",
      input_preview: "历史输入",
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
      summary: "历史结果摘要",
      result_excerpt: "历史结果摘要",
      result_text: "# 历史问答稿\n\n问：为什么要这样做？\n答：因为更容易拿来就用。",
      result_truncated: false,
      result_too_long: false,
      brief_summary: "历史结果摘要",
      brief_conclusion: "先把结论讲清。",
      brief_key_findings: ["再用问答展开。"],
      source_preview: [],
      source_count: 0,
      quality_score: 4,
      restore_count: 0,
      pinned_for_style_memory: false,
      run: null,
    };

    expect(
      buildPreferredTransformCopyText(transformResult, {
        name: "海报风",
        audience: "管理层",
        tone: "醒目、直接",
        structure_template: "结论 -> 重点卡片",
        emphasis_points: ["行动建议"],
        citation_policy: "minimal",
        title_policy: "punchy",
        image_focus: "editorial",
        layout_format: "poster",
        visual_mode: "enhanced",
      }),
    ).toContain("【部署简报】");
    expect(
      buildPreferredDiscoverCopyText(
        discoverResult,
        {
          name: "访谈问答",
          audience: "技术负责人",
          tone: "自然、清楚",
          structure_template: "问题 -> 回答 -> 追问",
          emphasis_points: ["关键问答"],
          citation_policy: "minimal",
          title_policy: "retain",
          image_focus: "narrative",
          layout_format: "book",
          visual_mode: "minimal",
        },
        "report",
      ),
    ).toContain("# 为什么选择 FastAPI");
    expect(buildPreferredHistoryCopyText(historyEntry, "report")).toContain("# 历史问答稿");
  });

  it("builds speech-style brief share text as direct speaking script", () => {
    const result: DiscoverResponse = {
      request_id: "req_speech",
      title: "团队例会发言",
      transformed_text: "# 团队例会发言\n\n各位好，今天先把方向讲清。\n\n## 第一部分\n\n窗口期正在打开。\n\n谢谢大家。",
      brief: {
        summary: "总结了接下来的工作方向。",
        conclusion: "我们接下来要优先稳住节奏，再推进扩张。",
        key_findings: ["先把流程稳定下来", "把关键风险前置处理"],
        evidence: [],
        uncertainties: ["仍需确认排期余量"],
        draft_outline: [],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 3200,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 1,
        resumed: false,
      },
      run: null,
    };

    const text = buildDiscoverShareText(result, "wechat", {
      name: "演讲风",
      audience: "团队成员",
      tone: "坚定、自然",
      structure_template: "开场定调 -> 核心论点 -> 收束号召",
      emphasis_points: ["开场", "结尾"],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "editorial",
      layout_format: "auto",
      visual_mode: "minimal",
    }, "brief");

    expect(text).toContain("各位好，先说结论：我们接下来要优先稳住节奏");
    expect(text).toContain("最后，请继续关注：仍需确认排期余量");
    expect(text).not.toContain("研究简报");
  });

  it("builds letter-style brief share text with salutation and signoff", () => {
    const result: DiscoverResponse = {
      request_id: "req_letter_brief",
      title: "写给团队的一封信",
      transformed_text: "# 写给团队的一封信\n\n各位同事：\n\n这次调整想先把方向讲清。\n\n祝好",
      brief: {
        summary: "解释了这次调整的出发点。",
        conclusion: "这次调整的重点，是让协作节奏更稳定。",
        key_findings: ["先统一节奏", "再推进扩张"],
        evidence: [],
        uncertainties: [],
        draft_outline: [],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 3200,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 0,
        resumed: false,
      },
      run: null,
    };

    const text = buildDiscoverShareText(result, "wechat", {
      name: "书信风",
      audience: "团队成员",
      tone: "真诚、克制",
      structure_template: "称呼 -> 正文 -> 致意",
      emphasis_points: ["真诚沟通"],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "narrative",
      layout_format: "book",
      visual_mode: "minimal",
    }, "brief");

    expect(text).toContain("团队：");
    expect(text).toContain("这次调整的重点，是让协作节奏更稳定。");
    expect(text).toContain("祝好");
  });

  it("keeps briefing-style share text concise instead of appending full report body", () => {
    const result: TransformResponse = {
      request_id: "req_briefing_share",
      title: "部署简报",
      source_url: null,
      raw_excerpt: "优先采用容器化部署。",
      transformed_text: "# 部署简报\n\n优先采用容器化部署。\n\n- 上线节奏更稳\n- 回滚成本更低\n\n## 详文\n这里是完整说明。",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 1200,
        used_cache: false,
      },
      run: null,
    };

    const text = buildTransformShareText(result, "wechat", {
      name: "简报风",
      audience: "管理层",
      tone: "简洁、结论先行",
      structure_template: "一句话结论 -> 关键判断 -> 风险",
      emphasis_points: ["结论前置"],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "diagram",
      layout_format: "ppt",
      visual_mode: "minimal",
    });

    expect(text).toContain("优先采用容器化部署。");
    expect(text).toContain("- 上线节奏更稳");
    expect(text).not.toContain("这里是完整说明");
  });

  it("formats briefing share text differently for xiaohongshu and moments", () => {
    const result: TransformResponse = {
      request_id: "req_platform_briefing",
      title: "部署简报",
      source_url: null,
      raw_excerpt: "优先采用容器化部署。",
      transformed_text: "# 部署简报\n\n优先采用容器化部署。\n\n- 上线节奏更稳\n- 回滚成本更低",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 1200,
        used_cache: false,
      },
      run: null,
    };

    const profile = {
      name: "简报风",
      audience: "管理层",
      tone: "简洁、结论先行",
      structure_template: "一句话结论 -> 关键判断 -> 风险",
      emphasis_points: ["结论前置"],
      citation_policy: "minimal" as const,
      title_policy: "retain" as const,
      image_focus: "diagram" as const,
      layout_format: "ppt" as const,
      visual_mode: "minimal" as const,
    };

    const xhs = buildTransformShareText(result, "xiaohongshu", profile);
    const moments = buildTransformShareText(result, "moments", profile);

    expect(xhs).toContain("【部署简报】");
    expect(xhs).toContain("一句话结论：优先采用容器化部署。");
    expect(xhs).toContain("1. 上线节奏更稳");
    expect(moments).toContain("部署简报");
    expect(moments).not.toContain("# 部署简报");
    expect(moments).toContain("• 上线节奏更稳");
  });

  it("avoids duplicating editorial lead in share text", () => {
    const result: TransformResponse = {
      request_id: "req_editorial_share",
      title: "评论稿",
      source_url: null,
      raw_excerpt: "现在更适合稳步推进。",
      transformed_text: "# 评论稿\n\n现在更适合稳步推进。\n\n进一步看，真正的挑战在执行节奏。\n\n因此，先稳后快更合理。",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 1100,
        used_cache: false,
      },
      run: null,
    };

    const text = buildTransformShareText(result, "wechat", {
      name: "评论风",
      audience: "管理层",
      tone: "鲜明、克制",
      structure_template: "观点 -> 事实依据 -> 分析推进 -> 结论与建议",
      emphasis_points: ["核心判断"],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "editorial",
      layout_format: "newspaper",
      visual_mode: "minimal",
    });

    expect(text.match(/现在更适合稳步推进。/g)?.length).toBe(1);
    expect(text).toContain("更值得继续追问的是");
  });

  it("formats editorial share text with platform-specific lead phrasing", () => {
    const result: TransformResponse = {
      request_id: "req_editorial_platform",
      title: "评论稿",
      source_url: null,
      raw_excerpt: "现在更适合稳步推进。",
      transformed_text: "# 评论稿\n\n现在更适合稳步推进。\n\n进一步看，真正的挑战在执行节奏。\n\n因此，先稳后快更合理。",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 1100,
        used_cache: false,
      },
      run: null,
    };

    const profile = {
      name: "评论风",
      audience: "管理层",
      tone: "鲜明、克制",
      structure_template: "观点 -> 事实依据 -> 分析推进 -> 结论与建议",
      emphasis_points: ["核心判断"],
      citation_policy: "minimal" as const,
      title_policy: "retain" as const,
      image_focus: "editorial" as const,
      layout_format: "newspaper" as const,
      visual_mode: "minimal" as const,
    };

    const xhs = buildTransformShareText(result, "xiaohongshu", profile);
    const moments = buildTransformShareText(result, "moments", profile);

    expect(xhs).toContain("核心判断：现在更适合稳步推进。");
    expect(moments).toContain("继续看：");
  });

  it("formats speech share text differently for xiaohongshu and moments", () => {
    const result: TransformResponse = {
      request_id: "req_speech_platform",
      title: "团队发言",
      source_url: null,
      raw_excerpt: "我们要先稳住节奏。",
      transformed_text: "# 团队发言\n\n各位好，今天先把方向讲清。\n\n窗口期正在打开。\n\n最后，请大家先把这件事记住：先稳住节奏。",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 1100,
        used_cache: false,
      },
      run: null,
    };

    const profile = {
      name: "演讲风",
      audience: "团队成员",
      tone: "坚定、自然",
      structure_template: "开场定调 -> 核心论点 -> 收束号召",
      emphasis_points: ["开场", "结尾"],
      citation_policy: "minimal" as const,
      title_policy: "retain" as const,
      image_focus: "editorial" as const,
      layout_format: "auto" as const,
      visual_mode: "minimal" as const,
    };

    const xhs = buildTransformShareText(result, "xiaohongshu", profile);
    const moments = buildTransformShareText(result, "moments", profile);

    expect(xhs).toContain("先把结论说在前面：各位好，今天先把方向讲清。");
    expect(xhs).toContain("1. ");
    expect(moments).not.toContain("# 团队发言");
    expect(moments).toContain("• ");
  });

  it("copies brief tab content without workflow meta", () => {
    const result: DiscoverResponse = {
      request_id: "req_brief",
      title: "部署方案评估",
      transformed_text: "# 部署方案评估\n\n## 结论\n优先采用容器化部署。",
      brief: {
        summary: "比较了当前可选方案。",
        conclusion: "优先采用容器化部署。",
        key_findings: ["上线节奏更稳", "回滚成本更低"],
        evidence: [],
        uncertainties: [],
        draft_outline: [],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 2800,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 0,
        resumed: false,
      },
      run: null,
    };

    const text = buildDiscoverCopyText(
      result,
      {
        name: "简报风",
        audience: "管理层",
        tone: "简洁、决策导向",
        structure_template: "一句话结论 -> 关键判断 -> 行动建议",
        emphasis_points: ["结论前置"],
        citation_policy: "minimal",
        title_policy: "retain",
        image_focus: "diagram",
        layout_format: "ppt",
        visual_mode: "minimal",
      },
      "brief",
    );

    expect(text).toContain("优先采用容器化部署。");
    expect(text).toContain("- 上线节奏更稳");
    expect(text).not.toContain("研究简报");
    expect(text).not.toContain("参考链接");
    expect(text).not.toContain("## 结论");
  });

  it("exports brief tab pdf from concise brief content", async () => {
    const docOpen = vi.fn();
    const docWrite = vi.fn();
    const docClose = vi.fn();
    const popup = {
      document: {
        open: docOpen,
        write: docWrite,
        close: docClose,
      },
      focus: vi.fn(),
    } as any;

    vi.spyOn(window, "open").mockReturnValue(popup);

    const result: DiscoverResponse = {
      request_id: "req_export_brief",
      title: "部署方案评估",
      transformed_text: "# 部署方案评估\n\n## 结论\n优先采用容器化部署。\n\n## 正文\n这里是更长的说明。",
      brief: {
        summary: "比较了当前可选方案。",
        conclusion: "优先采用容器化部署。",
        key_findings: ["上线节奏更稳", "回滚成本更低"],
        evidence: [],
        uncertainties: ["仍需确认镜像体积。"],
        draft_outline: [],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 2100,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 1,
        resumed: false,
      },
      run: null,
    };

    exportDiscoverResultPdf(
      result,
      {
        name: "简报风",
        audience: "管理层",
        tone: "简洁、结论先行",
        structure_template: "一句话结论 -> 关键判断 -> 风险",
        emphasis_points: ["结论前置"],
        citation_policy: "minimal",
        title_policy: "retain",
        image_focus: "diagram",
        layout_format: "ppt",
        visual_mode: "minimal",
      },
      "brief",
    );
    await vi.runAllTimersAsync();

    const printableHtml = docWrite.mock.calls[0]?.[0] as string;
    expect(printableHtml).toContain("优先采用容器化部署。");
    expect(printableHtml).toContain("上线节奏更稳");
    expect(printableHtml).not.toContain("这里是更长的说明。");
  });

  it("builds history brief copy and share text without full report body", () => {
    const entry = {
      id: "history_discover",
      mode: "discover" as const,
      title: "黑洞是什么",
      input: "黑洞是什么",
      input_preview: "黑洞是什么",
      created_at: "2025-01-01T00:00:00Z",
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
      result_text: "# 黑洞是什么\n\n## 正文\n黑洞的完整长文说明。",
      result_truncated: false,
      result_too_long: false,
      brief_summary: "解释了黑洞的基本概念",
      brief_conclusion: "黑洞是引力极强的天体",
      brief_key_findings: ["并不是宇宙吸尘器", "来自恒星坍缩"],
      source_preview: [],
      source_count: 0,
      quality_score: 4,
      restore_count: 0,
      pinned_for_style_memory: false,
      run: null,
    };

    const copyText = buildHistoryCopyText(entry, "brief");
    const shareText = buildHistoryShareText(entry, "wechat", "brief");

    expect(copyText).toContain("黑洞是引力极强的天体");
    expect(copyText).toContain("- 并不是宇宙吸尘器");
    expect(copyText).not.toContain("完整长文说明");
    expect(shareText).toContain("# 黑洞是什么");
    expect(shareText).not.toContain("完整长文说明");
  });
});

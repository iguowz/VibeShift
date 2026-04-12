import { describe, expect, it } from "vitest";

import { buildFunctionSkills } from "./functionSkills";

describe("functionSkills", () => {
  it("builds discover-oriented skills for research mode", () => {
    const skills = buildFunctionSkills({
      mode: "discover",
      input: "比较中国 AI 产业链的发展趋势，并给出关键结论",
      styleProfile: {
        name: "论文风",
        audience: "",
        tone: "",
        structure_template: "",
        emphasis_points: [],
        citation_policy: "strict",
        title_policy: "retain",
        image_focus: "auto",
        layout_format: "paper",
        visual_mode: "enhanced",
      },
      imageConfig: {
        enabled: false,
        provider: null,
        base_url: null,
        api_key: null,
        model: null,
        count: 1,
        style_preset: "",
        custom_prompt: "",
        placement: "header",
        smart_mode: true,
        smart_max_count: 3,
        retry_on_failure: true,
        retry_strategy: "simplify_prompt",
        fallback_model: null,
      },
    });

    expect(skills.map((item) => item.id)).toContain("evidence_first");
    expect(skills.map((item) => item.id)).toContain("visual_pretext");
    expect(skills.map((item) => item.id)).toContain("summary_first");
  });

  it("adds multi-source and image-planning skills for multi-url transform", () => {
    const skills = buildFunctionSkills({
      mode: "url",
      input: "https://example.com/a https://example.com/b",
      styleProfile: {
        name: "海报风",
        audience: "",
        tone: "",
        structure_template: "",
        emphasis_points: [],
        citation_policy: "auto",
        title_policy: "retain",
        image_focus: "editorial",
        layout_format: "poster",
        visual_mode: "minimal",
      },
      imageConfig: {
        enabled: true,
        provider: "openai",
        base_url: "https://api.openai.com/v1",
        api_key: "sk-demo",
        model: "gpt-image-1.5",
        count: 1,
        style_preset: "",
        custom_prompt: "",
        placement: "header",
        smart_mode: true,
        smart_max_count: 3,
        retry_on_failure: true,
        retry_strategy: "simplify_prompt",
        fallback_model: null,
      },
    });

    expect(skills.map((item) => item.id)).toContain("multi_source_merge");
    expect(skills.map((item) => item.id)).toContain("image_planning");
    expect(skills.map((item) => item.id)).toContain("share_ready");
  });

  it("suppresses summary-first for poetic styles and keeps style fidelity", () => {
    const skills = buildFunctionSkills({
      mode: "text",
      input: "把这段关于春天和科技的内容写成一首现代诗",
      styleProfile: {
        name: "诗歌风",
        audience: "",
        tone: "凝练、抒情、留白感强",
        structure_template: "意象开场 -> 分段递进 -> 回响式收束",
        emphasis_points: [],
        citation_policy: "none",
        title_policy: "rewrite",
        image_focus: "narrative",
        layout_format: "poetry",
        visual_mode: "none",
      },
      imageConfig: {
        enabled: false,
        provider: null,
        base_url: null,
        api_key: null,
        model: null,
        count: 1,
        style_preset: "",
        custom_prompt: "",
        placement: "header",
        smart_mode: true,
        smart_max_count: 3,
        retry_on_failure: true,
        retry_strategy: "simplify_prompt",
        fallback_model: null,
      },
    });

    expect(skills.map((item) => item.id)).not.toContain("summary_first");
    expect(skills.map((item) => item.id)).toContain("style_fidelity");
    expect(skills.find((item) => item.id === "style_fidelity")?.instruction).toMatch(/诗歌|分行|TL;DR/);
  });

  it("suppresses summary-first for podcast-like oral styles", () => {
    const skills = buildFunctionSkills({
      mode: "text",
      input: "把这段行业观察改成一段适合播客朗读的口播稿",
      styleProfile: {
        name: "播客口播",
        audience: "",
        tone: "自然、顺口、有陪伴感",
        structure_template: "开场引题 -> 主线展开 -> 转折补充 -> 收束与提问",
        emphasis_points: [],
        citation_policy: "minimal",
        title_policy: "rewrite",
        image_focus: "narrative",
        layout_format: "book",
        visual_mode: "minimal",
      },
      imageConfig: {
        enabled: false,
        provider: null,
        base_url: null,
        api_key: null,
        model: null,
        count: 1,
        style_preset: "",
        custom_prompt: "",
        placement: "header",
        smart_mode: true,
        smart_max_count: 3,
        retry_on_failure: true,
        retry_strategy: "simplify_prompt",
        fallback_model: null,
      },
    });

    expect(skills.map((item) => item.id)).not.toContain("summary_first");
    expect(skills.find((item) => item.id === "style_fidelity")?.instruction).toMatch(/口播|朗读|bullet/);
  });

  it("keeps style fidelity for plain explanatory styles", () => {
    const skills = buildFunctionSkills({
      mode: "text",
      input: "把这段算法解释讲人话一点，通俗易懂",
      styleProfile: {
        name: "通俗风",
        audience: "",
        tone: "直接、易懂、生活化",
        structure_template: "先讲结论 -> 分点解释 -> 最后提醒",
        emphasis_points: [],
        citation_policy: "minimal",
        title_policy: "rewrite",
        image_focus: "auto",
        layout_format: "auto",
        visual_mode: "minimal",
      },
      imageConfig: {
        enabled: false,
        provider: null,
        base_url: null,
        api_key: null,
        model: null,
        count: 1,
        style_preset: "",
        custom_prompt: "",
        placement: "header",
        smart_mode: true,
        smart_max_count: 3,
        retry_on_failure: true,
        retry_strategy: "simplify_prompt",
        fallback_model: null,
      },
    });

    expect(skills.map((item) => item.id)).toContain("style_fidelity");
    expect(skills.find((item) => item.id === "style_fidelity")?.instruction).toMatch(/日常说法|易懂|结论/);
  });
});

import { recommendStyle, recommendStyleCandidates } from "./styleRecommend";
import { createStyleTemplate } from "./styleSkill";

describe("recommendStyle", () => {
  const styles = [
    createStyleTemplate({
      id: "paper",
      name: "论文风",
      prompt: "写成论文风，带摘要、方法、结论。",
      structure_template: "摘要 -> 方法 -> 讨论 -> 结论",
      layout_format: "paper",
      visual_mode: "enhanced",
    }),
    createStyleTemplate({
      id: "science",
      name: "科普风",
      prompt: "讲清原理、误区和现实意义。",
      structure_template: "一句话概括 -> 原理解释 -> 误区提醒",
      layout_format: "auto",
      visual_mode: "enhanced",
    }),
    createStyleTemplate({
      id: "story",
      name: "故事风",
      prompt: "讲成带人物和转折的故事。",
      structure_template: "引子 -> 冲突 -> 转折 -> 收束",
      layout_format: "book",
      visual_mode: "minimal",
    }),
    createStyleTemplate({
      id: "manual",
      name: "教程手册",
      prompt: "写成步骤清晰、可执行的操作手册。",
      structure_template: "目标 -> 前置条件 -> 步骤 -> 排错 -> 总结",
      layout_format: "book",
      visual_mode: "enhanced",
    }),
    createStyleTemplate({
      id: "speech",
      name: "演讲稿",
      prompt: "写成适合朗读的演讲稿。",
      structure_template: "开场定调 -> 核心论点 -> 收束号召",
      layout_format: "ppt",
      visual_mode: "minimal",
    }),
    createStyleTemplate({
      id: "podcast",
      name: "播客口播",
      prompt: "写成适合播客口播的表达，顺口、自然、有停顿。",
      structure_template: "开场引题 -> 主线展开 -> 转折补充 -> 收束与提问",
      layout_format: "book",
      visual_mode: "minimal",
    }),
    createStyleTemplate({
      id: "debate",
      name: "辩论风",
      prompt: "写成立场鲜明、带攻防感的辩论稿。",
      structure_template: "主张 -> 论点一二三 -> 反方回应 -> 结论收束",
      layout_format: "ppt",
      visual_mode: "minimal",
    }),
    createStyleTemplate({
      id: "plain",
      name: "通俗风",
      prompt: "写得通俗易懂，先讲结论，再分点解释。",
      structure_template: "先讲结论 -> 分点解释 -> 最后提醒",
      layout_format: "auto",
      visual_mode: "minimal",
    }),
    createStyleTemplate({
      id: "snack",
      name: "快餐风",
      prompt: "写成速读重点版。",
      structure_template: "一句话结论 -> 3~5 个重点 -> 行动建议",
      layout_format: "poster",
      visual_mode: "enhanced",
    }),
  ];

  it("prefers paper style for academic discover queries", () => {
    const recommendation = recommendStyle({
      input: "请调研 RAG 检索增强生成的论文进展、研究方法和 benchmark 对比",
      mode: "discover",
      styles,
      recentRuns: [],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("paper");
    expect(recommendation?.reason).toContain("研究");
  });

  it("respects recent high-quality style preference when content is similar", () => {
    const recommendation = recommendStyle({
      input: "把这个创业案例讲成一个更有画面感的品牌故事",
      mode: "text",
      styles,
      recentRuns: [
        {
          id: "run_story",
          mode: "transform",
          title: "品牌复盘",
          input: "讲品牌故事",
          input_preview: "讲品牌故事",
          created_at: new Date().toISOString(),
          style_id: "story",
          style_name: "故事风",
          style_snapshot: styles[2],
          provider: "openai",
          model: "gpt-5-mini",
          summary: "上次使用故事风完成改写",
          result_excerpt: "有冲突和转折",
          result_text: "品牌故事正文",
          result_truncated: false,
          result_too_long: false,
          source_count: 0,
          quality_score: 5,
          restore_count: 3,
          pinned_for_style_memory: true,
          run: null,
          brief_summary: "",
          brief_conclusion: "",
          brief_key_findings: [],
          source_preview: [],
        },
      ],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("story");
    expect(recommendation?.reason).toMatch(/故事|高质量风格/);
  });

  it("prefers manual style for how-to content", () => {
    const recommendation = recommendStyle({
      input: "请把这份 FastAPI 部署说明改成更清晰的教程，包含步骤、配置和排错建议",
      mode: "text",
      styles,
      recentRuns: [],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("manual");
    expect(recommendation?.reason).toMatch(/教程|步骤/);
  });

  it("prefers speech style for presentation content", () => {
    const recommendation = recommendStyle({
      input: "把这段公司战略说明改成路演演讲稿，适合现场发言",
      mode: "text",
      styles,
      recentRuns: [],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("speech");
    expect(recommendation?.reason).toMatch(/演讲稿|现场表达/);
  });

  it("prefers podcast style for oral delivery content", () => {
    const recommendation = recommendStyle({
      input: "把这段产品观察改成播客口播稿，适合主持人自然朗读",
      mode: "text",
      styles,
      recentRuns: [],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("podcast");
    expect(recommendation?.reason).toMatch(/播客|口播/);
  });

  it("prefers debate style for argument-heavy content", () => {
    const recommendation = recommendStyle({
      input: "把这段关于 AI 是否会替代人的分析改成辩论稿，加入正反方攻防",
      mode: "text",
      styles,
      recentRuns: [],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("debate");
    expect(recommendation?.reason).toMatch(/辩论|攻防/);
  });

  it("prefers plain style for easy-to-understand requests", () => {
    const recommendation = recommendStyle({
      input: "把这段数据库原理讲人话一点，通俗易懂，别太复杂",
      mode: "text",
      styles,
      recentRuns: [],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("plain");
    expect(recommendation?.reason).toMatch(/通俗|直白|易懂/);
  });

  it("prefers snack style for quick-scan content", () => {
    const recommendation = recommendStyle({
      input: "帮我做一个一分钟速读版，只保留重点速看和行动建议",
      mode: "text",
      styles,
      recentRuns: [],
      styleMemories: [],
    });

    expect(recommendation?.styleId).toBe("snack");
    expect(recommendation?.reason).toMatch(/快扫|速读|重点/);
  });

  it("returns multiple ranked style candidates for preview compare", () => {
    const recommendations = recommendStyleCandidates({
      input: "帮我做一个适合管理层快速扫读的一页海报式简报，突出重点卡片、风险和行动建议",
      mode: "text",
      styles,
      recentRuns: [],
      styleMemories: [],
    }, 3);

    expect(recommendations.length).toBeGreaterThanOrEqual(2);
    expect(recommendations[0]?.styleId).toBe("snack");
    expect(recommendations[1]?.score).toBeLessThanOrEqual(recommendations[0]?.score ?? 0);
    expect(recommendations.every((item) => item.reason.length > 0)).toBe(true);
  });
});

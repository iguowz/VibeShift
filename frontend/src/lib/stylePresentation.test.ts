import { describe, expect, it } from "vitest";

import { getDiscoverReportPresentation, getResultFocusPresentation } from "./stylePresentation";

describe("stylePresentation", () => {
  it("uses narrative presentation for letter style", () => {
    const resultPresentation = getResultFocusPresentation({
      name: "书信风",
      audience: "",
      tone: "真诚、从容、有对象感",
      structure_template: "称呼与缘起 -> 主体展开 -> 重点叮嘱 -> 收束致意",
      emphasis_points: [],
      citation_policy: "minimal",
      title_policy: "rewrite",
      image_focus: "narrative",
      layout_format: "book",
      visual_mode: "minimal",
    });

    expect(resultPresentation.kicker).toBe("先看这封信");
    expect(resultPresentation.summaryMode).toBe("narrative");
    expect(resultPresentation.displayForm).toContain("书信");
  });

  it("uses dialogue presentation for podcast style", () => {
    const reportPresentation = getDiscoverReportPresentation({
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
    });

    expect(reportPresentation.heading).toBe("先看开场口播");
    expect(reportPresentation.sourceHeading).toBe("口播前建议先看");
    expect(reportPresentation.workflowSteps[0]).toContain("先抓最适合口播的结论");
  });

  it("uses speech presentation for speech-like style", () => {
    const resultPresentation = getResultFocusPresentation({
      name: "演讲稿",
      audience: "",
      tone: "有感染力、顺口、节奏清晰",
      structure_template: "开场定调 -> 核心论点 -> 例证/转折 -> 收束号召",
      emphasis_points: [],
      citation_policy: "minimal",
      title_policy: "punchy",
      image_focus: "editorial",
      layout_format: "ppt",
      visual_mode: "minimal",
    });

    expect(resultPresentation.kicker).toBe("先听开场");
    expect(resultPresentation.structureHeading).toBe("演讲骨架");
    expect(resultPresentation.displayForm).toContain("演讲稿");
  });

  it("uses science presentation for explanatory style", () => {
    const resultPresentation = getResultFocusPresentation({
      name: "科普风",
      audience: "",
      tone: "耐心、清楚、不装深奥",
      structure_template: "一句话概括 -> 常见问题 -> 原理解释 -> 误区提醒",
      emphasis_points: [],
      citation_policy: "minimal",
      title_policy: "rewrite",
      image_focus: "diagram",
      layout_format: "auto",
      visual_mode: "enhanced",
    });

    expect(resultPresentation.kicker).toBe("先看一句话讲清");
    expect(resultPresentation.structureHeading).toBe("科普结构");
    expect(resultPresentation.workflowSteps[1]).toContain("解释原理");
  });

  it("uses briefing presentation for business briefing style", () => {
    const reportPresentation = getDiscoverReportPresentation({
      name: "商业简报",
      audience: "",
      tone: "冷静、结论先行、适合决策",
      structure_template: "一句话结论 -> 关键数据 -> 核心判断 -> 风险与建议",
      emphasis_points: [],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "diagram",
      layout_format: "ppt",
      visual_mode: "enhanced",
    });

    expect(reportPresentation.briefHeading).toBe("简报");
    expect(reportPresentation.conclusionHeading).toBe("一句话结论");
    expect(reportPresentation.displayForm).toContain("一页简报");
  });
});

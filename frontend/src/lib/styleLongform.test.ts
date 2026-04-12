import { describe, expect, it } from "vitest";

import { buildLongformGuide } from "./styleLongform";

describe("styleLongform", () => {
  it("builds dialogue-oriented guide for interview styles", () => {
    const guide = buildLongformGuide(
      "问：为什么选这个方案？\n答：因为上线更快。\n\n问：风险是什么？\n答：团队需要补齐经验。",
      {
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
    );

    expect(guide.highlightTitle).toBe("关键问答");
    expect(guide.highlights[0]?.label).toBe("问");
    expect(guide.sections[0]).toContain("问：");
    expect(guide.closingLabel).toBe("收束一句");
  });

  it("builds chapter-oriented guide for longform styles", () => {
    const guide = buildLongformGuide(
      "# 标题\n\n## 第一部分\n先交代背景。\n\n## 第二部分\n再展开论点。\n\n## 第三部分\n最后给出收束。",
      {
        name: "书籍风",
        audience: "深度读者",
        tone: "沉稳",
        structure_template: "章节递进",
        emphasis_points: ["章节脉络"],
        citation_policy: "minimal",
        title_policy: "retain",
        image_focus: "narrative",
        layout_format: "book",
        visual_mode: "minimal",
      },
    );

    expect(guide.sectionTitle).toBe("章节脉络");
    expect(guide.sections).toContain("第一部分");
    expect(guide.sections).toContain("第二部分");
    expect(guide.closingLabel).toBe("收束余味");
  });

  it("builds editorial guide with judgement-oriented labels and closing hook", () => {
    const guide = buildLongformGuide(
      "先把判断说清：现在更适合渐进式上线。\n\n## 事实依据\n数据与用户反馈都支持这一点。\n\n## 分析推进\n因为团队还在磨合期。\n\n因此，先稳后快更合理。",
      {
        name: "评论风",
        audience: "决策者",
        tone: "鲜明、克制",
        structure_template: "观点 -> 事实依据 -> 分析推进 -> 结论与建议",
        emphasis_points: ["核心判断"],
        citation_policy: "minimal",
        title_policy: "retain",
        image_focus: "editorial",
        layout_format: "newspaper",
        visual_mode: "minimal",
      },
    );

    expect(guide.introLabel).toBe("导语判断");
    expect(guide.highlightTitle).toBe("论证抓手");
    expect(guide.highlights[0]?.label).toBe("核心判断");
    expect(guide.closingLabel).toBe("结尾落点");
    expect(guide.closingText).toContain("因此");
  });
});

import { describe, expect, it } from "vitest";

import { buildStyleGuideCard, buildStylePreviewCards } from "./stylePreview";
import { createStyleTemplate } from "./styleSkill";

describe("stylePreview", () => {
  it("merges preview items into candidate cards", () => {
    const styles = [
      createStyleTemplate({
        id: "briefing",
        name: "简报风",
        prompt: "写成管理简报。",
        structure_template: "一句话结论 -> 风险 -> 建议",
        layout_format: "ppt",
        visual_mode: "minimal",
        emphasis_points: ["关键判断", "风险提示"],
      }),
      createStyleTemplate({
        id: "poster",
        name: "海报风",
        prompt: "写成长图海报。",
        structure_template: "大标题 -> 重点卡片 -> 行动建议",
        layout_format: "poster",
        visual_mode: "enhanced",
        emphasis_points: ["重点数字", "行动建议"],
      }),
    ];

    const cards = buildStylePreviewCards({
      mode: "text",
      styles,
      candidates: [
        { styleId: "briefing", reason: "适合结论前置。", score: 95, source: "llm" },
        { styleId: "poster", reason: "适合卡片化扫读。", score: 82, source: "heuristic" },
      ],
      previews: [
        {
          style_id: "briefing",
          preview_text: "先给一句话结论：现在最该先看的是风险和动作窗口。",
          focus_points: ["一句话结论", "风险", "动作窗口"],
        },
      ],
      limit: 4,
    });

    expect(cards).toHaveLength(2);
    expect(cards[0].previewText).toContain("一句话结论");
    expect(cards[0].previewFocusPoints[0]).toBe("一句话结论");
    expect(cards[0].outcomeText).toContain("拿到后就能直接使用");
    expect(cards[0].fitText).toBe("");
    expect(cards[1].approachText).toContain("大标题 -> 重点卡片 -> 行动建议");
    expect(cards[1].previewText).toBe("");
    expect(cards[1].displayForm).toContain("海报");
  });

  it("builds product-style copy for a selected style", () => {
    const style = createStyleTemplate({
      id: "poster",
      name: "海报风",
      prompt: "写成长图海报。",
      audience: "管理层",
      tone: "醒目、直接",
      structure_template: "大标题 -> 一句话结论 -> 重点卡片 -> 行动建议",
      layout_format: "poster",
      visual_mode: "enhanced",
      emphasis_points: ["重点数字", "行动建议"],
    });

    const card = buildStyleGuideCard({
      mode: "text",
      style,
      reason: "适合快速扫读。",
      source: "llm",
      preview: {
        style_id: "poster",
        preview_text: "一句话先亮出结论，再把最重要的数字钉住。",
        focus_points: ["一句话结论", "重点数字"],
      },
    });

    expect(card.outcomeText).toContain("海报 / 长图 / 重点卡片");
    expect(card.fitText).toContain("管理层");
    expect(card.fitText).toContain("醒目、直接");
    expect(card.approachText).toContain("大标题 -> 一句话结论 -> 重点卡片 -> 行动建议");
    expect(card.focusText).toContain("重点数字、行动建议");
    expect(card.previewText).toContain("一句话先亮出结论");
  });
});

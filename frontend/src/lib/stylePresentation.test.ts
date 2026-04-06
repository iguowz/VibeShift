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
  });
});

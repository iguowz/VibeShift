import { mount } from "@vue/test-utils";

import PinnedRunsStrip from "./PinnedRunsStrip.vue";
import { createStyleTemplate } from "../lib/styleSkill";

describe("PinnedRunsStrip", () => {
  it("renders pinned runs and emits view/restore actions", async () => {
    const wrapper = mount(PinnedRunsStrip, {
      props: {
        entries: [
          {
            id: "run_1",
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
            result_text: "完整结果",
            result_truncated: false,
            result_too_long: false,
            brief_summary: "已整理研究简报",
            brief_conclusion: "FastAPI 适合高开发效率场景",
            brief_key_findings: ["异步能力强", "类型提示友好"],
            source_preview: [],
            source_count: 4,
            quality_score: 5,
            restore_count: 3,
            pinned_for_style_memory: true,
            run: null,
          },
        ],
      },
    });

    expect(wrapper.text()).toContain("收藏结果");
    expect(wrapper.text()).toContain("FastAPI 适合高开发效率场景");

    const viewButton = wrapper.findAll("button").find((item) => item.text().includes("查看结果"));
    const restoreButton = wrapper.findAll("button").find((item) => item.text().includes("恢复到输入框"));
    expect(viewButton).toBeTruthy();
    expect(restoreButton).toBeTruthy();

    await viewButton!.trigger("click");
    await restoreButton!.trigger("click");

    expect(wrapper.emitted("view")?.[0]?.[0]?.id).toBe("run_1");
    expect(wrapper.emitted("restore")?.[0]?.[0]?.id).toBe("run_1");
  });
});

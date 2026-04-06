import { mount } from "@vue/test-utils";

import RecentRunsPanel from "./RecentRunsPanel.vue";
import { createStyleTemplate } from "../lib/styleSkill";

describe("RecentRunsPanel", () => {
  it("renders quality metadata and emits view/pin/restore actions", async () => {
    const wrapper = mount(RecentRunsPanel, {
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
              prompt: "先给结论，再拆解关键事实和证据来源。",
            }),
            provider: "openai",
            model: "gpt-4o-mini",
            summary: "整理了研究结论",
            result_excerpt: "这里是结果摘要",
            result_text: "## 结论\n这里是完整结果",
            result_truncated: false,
            result_too_long: true,
            brief_summary: "已整理研究简报",
            brief_conclusion: "FastAPI 更适合高开发效率场景",
            brief_key_findings: ["类型提示优势明显"],
            source_preview: [{ id: 1, title: "source", url: "https://example.com", relevance_score: 7.2 }],
            source_count: 4,
            quality_score: 4,
            restore_count: 2,
            pinned_for_style_memory: true,
            run: null,
          },
        ],
      },
    });

    expect(wrapper.text()).toContain("质量 4/5");
    expect(wrapper.text()).toContain("已复用 2 次");
    expect(wrapper.text()).toContain("已收藏为风格参考");
    expect(wrapper.text()).toContain("FastAPI 更适合高开发效率场景");
    expect(wrapper.text()).toContain("长内容");

    const viewButton = wrapper.findAll("button").find((item) => item.text().includes("查看结果"));
    const pinButton = wrapper.findAll("button").find((item) => item.text().includes("取消风格收藏"));
    const restoreButton = wrapper.findAll("button").find((item) => item.text().includes("恢复到输入框"));
    expect(viewButton).toBeTruthy();
    expect(pinButton).toBeTruthy();
    expect(restoreButton).toBeTruthy();

    await viewButton!.trigger("click");
    await pinButton!.trigger("click");
    await restoreButton!.trigger("click");

    expect(wrapper.emitted("view")?.[0]?.[0]?.id).toBe("run_1");
    expect(wrapper.emitted("toggle-pin")?.[0]).toEqual(["run_1"]);
    expect(wrapper.emitted("restore")?.[0]?.[0]?.id).toBe("run_1");
  });
});

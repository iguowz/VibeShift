import { mount } from "@vue/test-utils";

import StyleLibraryPanel from "./StyleLibraryPanel.vue";
import { createStyleTemplate } from "../lib/styleSkill";

describe("StyleLibraryPanel", () => {
  it("preserves structured style fields when saving the selected style", async () => {
    const style = createStyleTemplate({
      id: "paper",
      name: "论文风",
      prompt: "写成论文风。",
      audience: "研究者",
      tone: "严谨、克制",
      structure_template: "摘要 -> 分析 -> 结论",
      emphasis_points: ["关键事实", "证据来源"],
      citation_policy: "strict",
      title_policy: "retain",
      image_focus: "diagram",
      layout_format: "paper",
      visual_mode: "enhanced",
    });

    const wrapper = mount(StyleLibraryPanel, {
      props: {
        styles: [style],
        selectedId: "paper",
      },
    });

    const nameField = wrapper.get('input[placeholder="例如：公众号解读"]');
    const promptField = wrapper.get('textarea[placeholder="输入完整的风格化改写要求"]');
    await nameField.setValue("论文综述");
    await promptField.setValue("改成更稳的论文综述风格。");
    await wrapper.get('button.secondary-button').trigger("click");

    const saves = wrapper.emitted("save");
    expect(saves).toBeTruthy();
    const saved = saves?.[0]?.[0] as ReturnType<typeof createStyleTemplate>;
    expect(saved.name).toBe("论文综述");
    expect(saved.prompt).toBe("改成更稳的论文综述风格。");
    expect(saved.layout_format).toBe("paper");
    expect(saved.visual_mode).toBe("enhanced");
    expect(saved.citation_policy).toBe("strict");
    expect(saved.audience).toBe("研究者");
  });
});

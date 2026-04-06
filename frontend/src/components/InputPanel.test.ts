import { mount } from "@vue/test-utils";

import InputPanel from "./InputPanel.vue";
import type { CostPricingSettings } from "../types";

const pricing: CostPricingSettings = {
  enabled: false,
  prompt_usd_per_1k: 0,
  completion_usd_per_1k: 0,
  image_usd_each: null,
};

describe("InputPanel", () => {
  it("shows URL validation hint and disables submit for invalid url", async () => {
    const wrapper = mount(InputPanel, {
      props: {
        modelValue: "notaurl",
        inputType: "url",
        loading: false,
        estimatingCost: false,
        generatingImages: false,
        costEstimate: null,
        costErrorMessage: "",
        costErrorSuggestion: "",
        pricing,
        cacheEnabled: false,
      },
    });

    expect(wrapper.text()).toContain("URL 需以 http:// 或 https:// 开头");

    const buttons = wrapper.findAll("button");
    const submit = buttons.find((button) => button.text().includes("开始转换"));
    expect(submit).toBeTruthy();
    expect(submit!.attributes("disabled")).toBeDefined();
  });

  it("submits on Enter in url mode", async () => {
    const wrapper = mount(InputPanel, {
      props: {
        modelValue: "https://example.com",
        inputType: "url",
        loading: false,
        estimatingCost: false,
        generatingImages: false,
        costEstimate: null,
        costErrorMessage: "",
        costErrorSuggestion: "",
        pricing,
        cacheEnabled: false,
      },
    });

    const input = wrapper.get("input");
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("submit")).toBeTruthy();
  });

  it("emits cache toggle in url mode", async () => {
    const wrapper = mount(InputPanel, {
      props: {
        modelValue: "https://example.com",
        inputType: "url",
        loading: false,
        estimatingCost: false,
        generatingImages: false,
        costEstimate: null,
        costErrorMessage: "",
        costErrorSuggestion: "",
        pricing,
        cacheEnabled: false,
      },
    });

    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.exists()).toBe(true);
    await checkbox.setValue(true);
    expect(wrapper.emitted("update:cacheEnabled")).toBeTruthy();
    expect(wrapper.emitted("update:cacheEnabled")?.[0]?.[0]).toBe(true);
  });

  it("submits on Ctrl+Enter in text mode", async () => {
    const wrapper = mount(InputPanel, {
      props: {
        modelValue: "这是一段足够长的文本内容，用于触发快捷键测试。",
        inputType: "text",
        loading: false,
        estimatingCost: false,
        generatingImages: false,
        costEstimate: null,
        costErrorMessage: "",
        costErrorSuggestion: "",
        pricing,
        cacheEnabled: false,
      },
    });

    const textarea = wrapper.get("textarea");
    await textarea.trigger("keydown", { key: "Enter", ctrlKey: true });

    expect(wrapper.emitted("submit")).toBeTruthy();
  });
});

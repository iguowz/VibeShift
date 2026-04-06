import { mount } from "@vue/test-utils";
import { vi } from "vitest";

vi.mock("../lib/shareFormats", async () => {
  const actual = await vi.importActual<typeof import("../lib/shareFormats")>("../lib/shareFormats");
  return {
    ...actual,
    exportTransformResultPdf: vi.fn(),
  };
});

import ResultViewer from "./ResultViewer.vue";
import * as shareFormats from "../lib/shareFormats";
import type { TransformResponse } from "../types";

function buildResult(): TransformResponse {
  return {
    request_id: "req_test",
    title: "测试标题",
    raw_excerpt: "摘要",
    transformed_text: "第一段\n\n第二段",
    images: [
      {
        id: "img_1",
        url: "data:image/png;base64,xxx",
        prompt: "最初提示词",
      },
    ],
    meta: {
      input_type: "text",
      provider: "openai",
      model: "gpt-4o-mini",
      duration_ms: 123,
      used_cache: false,
    },
    run: {
      id: "run_test",
      mode: "transform",
      status: "completed",
      workspace_path: "/tmp/vibeshift/run_test",
      started_at: "2025-01-01T00:00:00Z",
      finished_at: "2025-01-01T00:00:01Z",
      duration_ms: 1000,
      title: "测试标题",
      summary: "完成改写任务。",
      steps: [
        {
          id: "step_1",
          label: "获取输入",
          status: "completed",
          started_at: "2025-01-01T00:00:00Z",
          finished_at: "2025-01-01T00:00:00Z",
          duration_ms: 120,
          detail: "加载来源",
        },
      ],
      artifacts: [
        {
          id: "art_1",
          kind: "draft",
          label: "rewrite-draft",
          path: "/tmp/vibeshift/run_test/01-rewrite-draft.md",
          mime_type: "text/markdown",
          size_bytes: 128,
          preview: "# 测试标题\n\n第一段",
          created_at: "2025-01-01T00:00:01Z",
        },
      ],
    },
  };
}

describe("ResultViewer", () => {
  it("emits regenerate-image with edited prompt", async () => {
    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue("新的提示词");

    const buttons = wrapper.findAll("button");
    const regenerate = buttons.find((button) => button.text().includes("重新生成"));
    expect(regenerate).toBeTruthy();

    await regenerate!.trigger("click");

    const emitted = wrapper.emitted("regenerate-image");
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toEqual({ image_id: "img_1", prompt: "新的提示词" });
  });

  it("disables regenerate button while regenerating", async () => {
    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: "img_1",
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    const regenerateButton = wrapper.findAll("button").find((button) => button.text().includes("重新生成"));
    expect(regenerateButton).toBeTruthy();
    expect(regenerateButton!.attributes("disabled")).toBeDefined();
  });

  it("opens modal when clicking image and copies markdown", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    await wrapper.get("img").trigger("click");
    expect(wrapper.text()).toContain("查看图片");
    expect(wrapper.text()).toContain("最初提示词");

    const buttons = wrapper.findAll("button");
    const copyMarkdown = buttons.find((button) => button.text().includes("复制（编辑器用）"));
    expect(copyMarkdown).toBeTruthy();
    await copyMarkdown!.trigger("click");

    expect(vi.isMockFunction(navigator.clipboard.writeText)).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const arg = (navigator.clipboard.writeText as any).mock.calls[0][0] as string;
    expect(arg).toContain("# 测试标题");
    expect(arg).toContain("![最初提示词]");
  });

  it("copies rich text with html + plain fallback payload", async () => {
    (navigator.clipboard.write as any).mockClear?.();
    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "header",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    const buttons = wrapper.findAll("button");
    const copyRich = buttons.find((button) => button.text().includes("复制图文"));
    expect(copyRich).toBeTruthy();
    await copyRich!.trigger("click");

    expect((navigator.clipboard.write as any).mock.calls.length).toBe(1);
    const args = (navigator.clipboard.write as any).mock.calls[0][0] as any[];
    expect(Array.isArray(args)).toBe(true);
    expect(args.length).toBe(1);
    expect(args[0]?.items).toBeTruthy();
    expect(Object.keys(args[0].items)).toContain("text/html");
    expect(Object.keys(args[0].items)).toContain("text/plain");
  });

  it("shows skeleton before image load and hides after load", async () => {
    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    expect(wrapper.find(".image-skeleton").exists()).toBe(true);
    await wrapper.get(".image-media img").trigger("load");
    expect(wrapper.find(".image-skeleton").exists()).toBe(false);
  });

  it("shows image generation progress with ETA", async () => {
    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: null,
        generatingImages: true,
        imageProgress: { completed: 0, total: 3, eta_seconds: 12 },
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    expect(wrapper.text()).toContain("正在生成图片（1/3）");
    expect(wrapper.text()).toContain("预计剩余约 12 秒");
    expect(wrapper.text()).toContain("测试标题");
    expect(wrapper.text()).toContain("第一段");
  });

  it("shows summary-first result view without workflow track", () => {
    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    expect(wrapper.text()).toContain("先看重点");
    expect(wrapper.text()).not.toContain("任务轨迹");
    expect(wrapper.text()).not.toContain("Markdown 源码");
    expect(wrapper.text()).not.toContain("HTML 源码");
  });

  it("prefers a cleaned summary from generated content over raw metadata excerpt", () => {
    const result: TransformResponse = {
      ...buildResult(),
      raw_excerpt:
        "---\ntitle: 测试标题\nurl: https://example.com\nhostname: example.com\ndescription: 原始摘要\n---\n这里是带元信息的原始摘要。",
      transformed_text:
        "# 测试标题\n\n这是一段整理后的导语，先用更自然的方式说明这篇内容最值得关注的结论。\n\n- 第一，要看长期影响。\n- 第二，要看落地条件。\n- 第三，要看风险边界。",
    };

    const wrapper = mount(ResultViewer, {
      props: {
        result,
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    expect(wrapper.text()).toContain("这是一段整理后的导语");
    expect(wrapper.text()).toContain("第一，要看长期影响。");
    expect(wrapper.text()).not.toContain("hostname: example.com");
    expect(wrapper.text()).not.toContain("url: https://example.com");
  });

  it("interleaves images when copying markdown", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    const result: TransformResponse = {
      ...buildResult(),
      transformed_text: "段1\n\n段2\n\n段3\n\n段4",
      images: [
        { id: "img_1", url: "https://example.com/1.png", prompt: "图一提示词" },
        { id: "img_2", url: "https://example.com/2.png", prompt: "图二提示词" },
      ],
    };
    const wrapper = mount(ResultViewer, {
      props: {
        result,
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "interleave",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    const copyMarkdownButton = wrapper.findAll("button").find((button) => button.text().includes("复制（编辑器用）"));
    expect(copyMarkdownButton).toBeTruthy();
    await copyMarkdownButton!.trigger("click");

    const arg = (navigator.clipboard.writeText as any).mock.calls[0][0] as string;
    const idxP2 = arg.indexOf("段2");
    const idxImg1 = arg.indexOf("![图一提示词]");
    const idxP3 = arg.indexOf("段3");
    const idxImg2 = arg.indexOf("![图二提示词]");
    expect(idxP2).toBeGreaterThan(-1);
    expect(idxP3).toBeGreaterThan(-1);
    expect(idxImg1).toBeGreaterThan(idxP2);
    expect(idxImg1).toBeLessThan(idxP3);
    expect(idxImg2).toBeGreaterThan(idxP3);
  });

  it("copies wechat share text, closes share menu and exports pdf", async () => {
    (navigator.clipboard.writeText as any).mockClear?.();
    vi.mocked(shareFormats.exportTransformResultPdf).mockClear();

    const wrapper = mount(ResultViewer, {
      props: {
        result: buildResult(),
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    const menu = wrapper.find("details.copy-more");
    (menu.element as HTMLDetailsElement).open = true;
    const shareButton = wrapper.findAll("button").find((button) => button.text().includes("公众号格式"));
    expect(shareButton).toBeTruthy();
    await shareButton!.trigger("click");

    const arg = (navigator.clipboard.writeText as any).mock.calls.at(-1)?.[0] as string;
    expect(arg).toContain("# 测试标题");
    expect(arg).toContain("导语：摘要");
    expect((menu.element as HTMLDetailsElement).open).toBe(false);

    (menu.element as HTMLDetailsElement).open = true;
    const pdfButton = wrapper.findAll("button").find((button) => button.text().includes("导出 PDF"));
    expect(pdfButton).toBeTruthy();
    await pdfButton!.trigger("click");
    expect(shareFormats.exportTransformResultPdf).toHaveBeenCalled();
    expect((menu.element as HTMLDetailsElement).open).toBe(false);
  });

  it("removes duplicated leading title in preview html", () => {
    const result: TransformResponse = {
      ...buildResult(),
      transformed_text: "# 测试标题\n\n## 第一段\n内容保留",
    };

    const wrapper = mount(ResultViewer, {
      props: {
        result,
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
      },
    });

    const article = wrapper.get(".result-article.markdown");
    expect(article.html()).not.toContain("测试标题</h1>");
    expect(article.text()).toContain("内容保留");
  });

  it("renders pretext chart blocks and layout classes in preview", () => {
    const result: TransformResponse = {
      ...buildResult(),
      transformed_text:
        "## 数据概览\n\n```pretext chart\n{\"title\":\"来源可信度\",\"unit\":\"分\",\"items\":[{\"label\":\"官方资料\",\"value\":9.6,\"note\":\"高可信\"}]}\n```",
    };

    const wrapper = mount(ResultViewer, {
      props: {
        result,
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
        styleProfile: {
          name: "报纸特稿",
          audience: "",
          tone: "",
          structure_template: "",
          emphasis_points: [],
          citation_policy: "auto",
          title_policy: "retain",
          image_focus: "diagram",
          layout_format: "newspaper",
          visual_mode: "enhanced",
        },
      },
    });

    expect(wrapper.get(".result-panel").classes()).toContain("layout-format-newspaper");
    expect(wrapper.html()).toContain("pretext-chart");
    expect(wrapper.text()).toContain("来源可信度");
    expect(wrapper.text()).not.toContain('<article class="pretext-chart-row">');
  });

  it("uses narrative focus copy for poetry-like styles", () => {
    const result: TransformResponse = {
      ...buildResult(),
      transformed_text: "# 测试标题\n\n风从山谷里穿过，像一条缓慢发光的河。\n\n它提醒我们，技术也有温度。",
    };

    const wrapper = mount(ResultViewer, {
      props: {
        result,
        loading: false,
        regeneratingImageId: null,
        generatingImages: false,
        imageProgress: null,
        imagePlacement: "footer",
        errorMessage: "",
        errorSuggestion: "",
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
      },
    });

    expect(wrapper.text()).toContain("先读这一段");
    expect(wrapper.text()).not.toContain("建议优先看");
  });
});

import { describe, expect, it } from "vitest";

import { renderStyleBodyHtml } from "./styleBodyRender";

describe("styleBodyRender", () => {
  it("renders dialogue-like markdown blocks into dialogue sections", () => {
    const html = renderStyleBodyHtml("问：为什么选 FastAPI？\n答：因为开发效率高。", "dialogue");

    expect(html).toContain("dialogue-render-block");
    expect(html).toContain("dialogue-render-speaker");
    expect(html).toContain("为什么选 FastAPI");
  });

  it("falls back to regular rich text rendering for non-dialogue modes", () => {
    const html = renderStyleBodyHtml("## 一句话结论\n- 先看重点", "cards");

    expect(html).toContain("<h2");
    expect(html).toContain("<li>");
    expect(html).not.toContain("dialogue-render-block");
  });

  it("renders decision-like list blocks into card modules", () => {
    const html = renderStyleBodyHtml("## 一句话结论\n\n- 优先选稳定方案\n- 风险先看数据安全\n- 预留迁移成本", "cards");

    expect(html).toContain("body-card-module");
    expect(html).toContain("body-card-grid");
    expect(html).toContain("优先选稳定方案");
  });

  it("renders manual-like list blocks into step modules", () => {
    const html = renderStyleBodyHtml("## 操作步骤\n\n1. 明确目标\n2. 配置参数\n3. 验证结果", "steps");

    expect(html).toContain("body-step-module");
    expect(html).toContain("body-step-index");
    expect(html).toContain("配置参数");
  });

  it("renders editorial-like heading sections into section modules", () => {
    const html = renderStyleBodyHtml(
      "这是一段导语，先把判断讲清。\n\n## 核心判断\n\n这是第一段分析。\n\n## 事实依据\n\n这里是支撑判断的事实。\n\n因此，我们更应该优先处理执行节奏。",
      "cards",
      "editorial",
    );

    expect(html).toContain("body-lead-block");
    expect(html).toContain("body-section-module");
    expect(html).toContain("body-section-editorial");
    expect(html).toContain("body-section-preface-editorial");
    expect(html).toContain("body-closing-editorial");
    expect(html).toContain("核心判断");
  });

  it("renders letter-like paragraphs with opening and closing blocks", () => {
    const html = renderStyleBodyHtml(
      "亲爱的团队：\n\n先把来意说清：这次调整是为了让项目走得更稳。\n\n接下来，我想补充两点需要大家一起注意。\n\n也请大家继续保持耐心与行动力。\n\n祝好",
      "chapters",
      "letter",
    );

    expect(html).toContain("body-narrative-letter");
    expect(html).toContain("body-opening-block");
    expect(html).toContain("body-bridge-letter");
    expect(html).toContain("body-closing-block");
    expect(html).toContain("body-letter-signature");
  });

  it("renders poetry-like paragraphs into stanza blocks", () => {
    const html = renderStyleBodyHtml(
      "# 春夜\n\n风从山谷里穿过\n像一条缓慢发光的河\n\n它提醒我们\n技术也有温度",
      "chapters",
      "poetry",
    );

    expect(html).toContain("body-poetry-stanza");
    expect(html).toContain("风从山谷里穿过");
  });

  it("renders podcast-like middle paragraphs as audio segments", () => {
    const html = renderStyleBodyHtml(
      "大家好，今天我们先聊结论。\n\n## 为什么现在值得看\n\n因为窗口期正在出现。\n\n最后留一个问题给你。",
      "dialogue",
      "podcast",
    );

    expect(html).toContain("body-audio-segment");
    expect(html).toContain("body-audio-podcast");
    expect(html).toContain("为什么现在值得看");
  });

  it("renders speech-like transition paragraphs as bridge blocks", () => {
    const html = renderStyleBodyHtml(
      "各位好，今天先把方向讲清。\n\n接下来，我想先谈为什么现在必须行动。\n\n## 第一部分\n\n窗口期正在打开。\n\n谢谢大家。",
      "dialogue",
      "speech",
    );

    expect(html).toContain("body-bridge-speech");
    expect(html).toContain("承接");
    expect(html).toContain("body-closing-speech");
  });

  it("renders book-like transition paragraphs as bridge blocks", () => {
    const html = renderStyleBodyHtml(
      "这一章先交代问题从哪里来。\n\n## 第一章\n\n先回到起点，解释背景。\n\n换句话说，真正的问题不是工具，而是节奏。\n\n## 第二章\n\n再展开解决路径。\n\n最后，我们回到最初的问题。",
      "chapters",
      "book",
    );

    expect(html).toContain("body-section-book");
    expect(html).toContain("body-section-preface-book");
    expect(html).toContain("body-bridge-book");
    expect(html).toContain("body-closing-book");
  });

  it("renders classical note blocks as note modules", () => {
    const html = renderStyleBodyHtml(
      "题解：此篇先言其旨。\n\n## 纲目\n\n先明其意，再释其事。\n\n按：要点在于缓急得当。",
      "chapters",
      "classical",
    );

    expect(html).toContain("body-classical-note");
    expect(html).toContain("题解");
    expect(html).toContain("按");
  });

  it("renders science-like longform with lead, sections and closing reminders", () => {
    const html = renderStyleBodyHtml(
      "先用一段话把黑洞讲明白。\n\n## 为什么会形成\n\n- 来自恒星坍缩\n- 引力强到连光都难逃脱\n\n## 常见误区\n\n- 不是宇宙吸尘器\n- 不会无差别吞掉一切\n\n最后记住：黑洞首先是极端引力现象。",
      "steps",
      "science",
    );

    expect(html).toContain("body-lead-science");
    expect(html).toContain("body-card-module");
    expect(html).toContain("body-closing-science");
  });
});

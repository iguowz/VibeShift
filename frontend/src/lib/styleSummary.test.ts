import { describe, expect, it } from "vitest";

import {
  buildDiscoverBriefHighlights,
  buildDiscoverQuickView,
  buildTransformFocusSummary,
  buildTransformHighlightBlock,
  getDiscoverDetailOrder,
} from "./styleSummary";
import type { DiscoverResponse, TransformResponse } from "../types";

describe("styleSummary", () => {
  it("extracts poster-like bullets from transform result", () => {
    const result: TransformResponse = {
      request_id: "req_poster",
      title: "AI 选型速览",
      raw_excerpt: "这是原始摘要",
      transformed_text:
        "# AI 选型速览\n\n## 一句话结论\n- 优先选稳定、可落地的方案\n- 风险先看数据安全\n- 需要预留迁移成本",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 100,
        used_cache: false,
      },
    };

    const summary = buildTransformFocusSummary(result, {
      name: "海报风",
      audience: "管理层",
      tone: "直接、醒目",
      structure_template: "大标题 -> 一句话结论 -> 重点卡片 -> 行动建议",
      emphasis_points: ["关键数字", "行动建议"],
      citation_policy: "minimal",
      title_policy: "punchy",
      image_focus: "editorial",
      layout_format: "poster",
      visual_mode: "enhanced",
    });

    expect(summary.lead).toContain("优先选稳定");
    expect(summary.bullets.some((item) => item.includes("风险先看数据安全") || item.includes("迁移成本"))).toBe(true);
  });

  it("builds discover quick view from interview-like content", () => {
    const result: DiscoverResponse = {
      request_id: "disc_interview",
      title: "FastAPI 问答",
      transformed_text:
        "## 引题\n\n问：为什么选 FastAPI？\n答：因为开发效率高。\n\n问：风险是什么？\n答：团队需要熟悉类型提示。",
      brief: {
        summary: "已整理成问答式研究简报",
        conclusion: "FastAPI 更适合追求开发效率的团队",
        key_findings: ["开发速度快", "类型提示友好"],
        evidence: [],
        uncertainties: ["缺少特定业务压测"],
        draft_outline: ["问题背景", "关键问答", "结论建议"],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 100,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 1,
        resumed: false,
        resume_stage: null,
      },
    };

    const quickView = buildDiscoverQuickView(result, {
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
    });

    expect(quickView.lead).toContain("FastAPI 更适合");
    expect(quickView.bullets.some((item) => item.includes("问：为什么选 FastAPI"))).toBe(true);
  });

  it("orders discover detail cards by style family", () => {
    const briefingOrder = getDiscoverDetailOrder({
      name: "商业简报",
      audience: "管理层",
      tone: "冷静、结论先行",
      structure_template: "一句话结论 -> 风险 -> 建议",
      emphasis_points: [],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "diagram",
      layout_format: "ppt",
      visual_mode: "enhanced",
    });
    const bookOrder = getDiscoverDetailOrder({
      name: "书籍风",
      audience: "深度读者",
      tone: "从容、完整、系统梳理",
      structure_template: "章节摘要 -> 分节正文 -> 章节总结",
      emphasis_points: [],
      citation_policy: "minimal",
      title_policy: "retain",
      image_focus: "narrative",
      layout_format: "book",
      visual_mode: "minimal",
    });

    expect(briefingOrder[0]).toBe("uncertainties");
    expect(bookOrder[0]).toBe("outline");
  });

  it("renders poster-style transform highlights as cards", () => {
    const result: TransformResponse = {
      request_id: "req_cards",
      title: "AI 选型速览",
      raw_excerpt: "这是原始摘要",
      transformed_text:
        "# AI 选型速览\n\n## 一句话结论\n- 优先选稳定、可落地的方案\n- 风险先看数据安全\n- 需要预留迁移成本",
      images: [],
      meta: {
        input_type: "text",
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 100,
        used_cache: false,
      },
    };

    const block = buildTransformHighlightBlock(result, {
      name: "海报风",
      audience: "管理层",
      tone: "直接、醒目",
      structure_template: "大标题 -> 一句话结论 -> 重点卡片 -> 行动建议",
      emphasis_points: ["关键数字", "行动建议"],
      citation_policy: "minimal",
      title_policy: "punchy",
      image_focus: "editorial",
      layout_format: "poster",
      visual_mode: "enhanced",
    });

    expect(block.mode).toBe("cards");
    expect(block.items[0].eyebrow).toBe("重点 1");
  });

  it("renders interview-style brief highlights as dialogue", () => {
    const result: DiscoverResponse = {
      request_id: "disc_dialogue",
      title: "FastAPI 问答",
      transformed_text:
        "## 引题\n\n问：为什么选 FastAPI？\n答：因为开发效率高。\n\n问：风险是什么？\n答：团队需要熟悉类型提示。",
      brief: {
        summary: "已整理成问答式研究简报",
        conclusion: "FastAPI 更适合追求开发效率的团队",
        key_findings: ["问：为什么选 FastAPI？", "答：因为开发效率高。"],
        evidence: [],
        uncertainties: ["缺少特定业务压测"],
        draft_outline: ["问：它适合谁？", "答：适合追求开发效率的团队。"],
      },
      sources: [],
      meta: {
        provider: "openai",
        model: "gpt-4o-mini",
        duration_ms: 100,
        used_cache: false,
        followup_used: false,
        sources: 0,
        evidence_items: 0,
        uncertainties: 1,
        resumed: false,
        resume_stage: null,
      },
    };

    const block = buildDiscoverBriefHighlights(result, {
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
    });

    expect(block.mode).toBe("dialogue");
    expect(block.items[0].eyebrow).toContain("问");
  });
});

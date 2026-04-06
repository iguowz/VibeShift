import type { DetectedMode, FunctionSkill, FunctionSkillId, ImageConfig, StyleSkillProfile } from "../types";

type BuildFunctionSkillsParams = {
  mode: DetectedMode;
  input: string;
  styleProfile?: StyleSkillProfile | null;
  imageConfig?: ImageConfig | null;
};

type FunctionSkillSpec = {
  label: string;
  instruction: string;
};

export interface FunctionSkillHit extends FunctionSkill {
  reason: string;
}

const FUNCTION_SKILL_SPECS: Record<FunctionSkillId, FunctionSkillSpec> = {
  summary_first: {
    label: "重点先行",
    instruction: "正文开头先给一句导语和 3~6 条重点，再展开细节；不要把原始元信息或抓取字段直接顶到最前面。",
  },
  multi_source_merge: {
    label: "多源整合",
    instruction: "当输入包含多个链接或多份资料时，先去重、归并和对齐信息，再输出统一结论，避免逐条复制来源表述。",
  },
  long_context_rewrite: {
    label: "长文改写",
    instruction: "面对长内容时先按结构规划，再分段改写并统一合并；合并稿要去重、补过渡，并保留关键事实与数字。",
  },
  evidence_first: {
    label: "证据优先",
    instruction: "调研场景先写直接结论，再列关键证据、待确认点与推荐动作；低可信或仅摘要来源只能作为补充线索。",
  },
  visual_pretext: {
    label: "可视化表达",
    instruction: "只有在内容中存在明确数字、对比关系或步骤链路时，才用 pretext stats/chart/flow 辅助表达，不要为了炫技强行加图表。",
  },
  image_planning: {
    label: "插图规划",
    instruction: "如果需要配图，先结合正文结构规划插图主题、位置和风格，让图片服务于重点而不是重复正文。",
  },
  style_fidelity: {
    label: "风格守真",
    instruction: "优先保持所选风格的结构、节奏和表达方式，不要被通用 TL;DR、列表腔或报告腔冲淡。",
  },
  share_ready: {
    label: "分享导出",
    instruction: "输出应便于复制分享与导出：标题明确、摘要前置、段落层级清楚，避免依赖页面交互才能理解内容。",
  },
};

type StyleBehavior = {
  suppressSummaryFirst: boolean;
  forceStyleFidelity: boolean;
  fidelityInstruction: string | null;
};

function buildStyleFingerprint(styleProfile?: StyleSkillProfile | null) {
  const name = String(styleProfile?.name || "");
  const tone = String(styleProfile?.tone || "");
  const structure = String(styleProfile?.structure_template || "");
  return `${name} ${tone} ${structure}`.toLowerCase();
}

function deriveStyleBehavior(styleProfile?: StyleSkillProfile | null): StyleBehavior {
  if (!styleProfile) {
    return {
      suppressSummaryFirst: false,
      forceStyleFidelity: false,
      fidelityInstruction: null,
    };
  }

  const fingerprint = buildStyleFingerprint(styleProfile);
  const layout = styleProfile.layout_format || "auto";
  const isPoetry = layout === "poetry" || /诗|抒情|意象|留白/.test(fingerprint);
  const isClassical = layout === "classical" || /古文|古籍|书卷|题解|纲目|按语|章回/.test(fingerprint);
  const isRiddle = /猜谜|悬念|谜面|揭晓|线索/.test(fingerprint);
  const isStory = /故事|叙事|场景|冲突|转折/.test(fingerprint);
  const isPpt = layout === "ppt" || /ppt|汇报|投屏|一屏一重点|行动项/.test(fingerprint);
  const isPaper = layout === "paper" || /论文|综述|摘要|研究|讨论|结论边界/.test(fingerprint);
  const isPoster = layout === "poster" || /海报|长图|卡片|标语|重点卡/.test(fingerprint);
  const isBook = layout === "book" || /书籍|章节|长阅读|节中摘要/.test(fingerprint);
  const isInterview = /访谈|对谈|问答|q&a|qa|采访/.test(fingerprint);
  const isSpeech = /演讲|发言|致辞|答辩|开场|收束号召/.test(fingerprint);
  const isPodcast = /播客|口播|主持|节目|串词/.test(fingerprint);
  const isLetter = /书信|来信|致读者|写给|致你|尺牍/.test(fingerprint);
  const isDebate = /辩论|正方|反方|攻防|交锋|驳论/.test(fingerprint);
  const isDocumentary = /纪实|纪录|现场|口述|非虚构|人物群像/.test(fingerprint);
  const isEditorial = /评论|社论|时评|立场|述评|观点/.test(fingerprint);
  const isManual = /教程|手册|指南|步骤|实操|排错|前置条件/.test(fingerprint);
  const isBriefing = /简报|决策|高管|周报|月报|一页纸|brief/.test(fingerprint);

  const suppressSummaryFirst = isPoetry || isClassical || isRiddle || isStory || isSpeech || isPodcast || isLetter || isInterview;

  let fidelityInstruction: string | null = null;
  if (isPoetry) {
    fidelityInstruction = "优先保留诗歌分行、停顿、意象和回响式收束；不要强行改成 TL;DR、报告体或密集 bullet。";
  } else if (isClassical) {
    fidelityInstruction = "优先保留题解、纲目、按语和书卷节奏；语言可以雅致，但仍需可读，不要硬塞现代报告式 TL;DR。";
  } else if (isRiddle) {
    fidelityInstruction = "优先保留谜面、线索、揭晓的顺序，不要一开头就把答案和全部重点说尽。";
  } else if (isStory) {
    fidelityInstruction = "优先保留引子、冲突、转折和收束，不要用生硬的 TL;DR 打断叙事推进。";
  } else if (isPpt) {
    fidelityInstruction = "保持一屏一重点、短句、小标题和行动项结构，避免连续大段正文。";
  } else if (isPaper) {
    fidelityInstruction = "保持摘要、背景、分析、讨论、结论的论文结构；关键判断要交代证据边界与适用范围。";
  } else if (isPoster) {
    fidelityInstruction = "保持海报/长图式短信息块排版，优先一句话结论、重点数字和强视觉层次，避免长段说明。";
  } else if (isBook) {
    fidelityInstruction = "保持章节式长阅读节奏，段间过渡自然，可在小节前后加摘要或总结，不要过度碎片化。";
  } else if (isInterview) {
    fidelityInstruction = "保持问答或对谈结构，用问题驱动展开，必要时保留追问与回应，不要改写成普通报告。";
  } else if (isSpeech) {
    fidelityInstruction = "保持演讲稿的开场定调、论点推进和收束号召，句子要适合朗读，不要写成书面长文。";
  } else if (isPodcast) {
    fidelityInstruction = "保持口播节奏、自然转场和陪伴感表达，句子应适合直接朗读，不要突然切成硬邦邦 bullet。";
  } else if (isLetter) {
    fidelityInstruction = "保持称呼、缘起、展开和收束的书信结构，让对象感贯穿全文，不要改成公告或报告。";
  } else if (isDebate) {
    fidelityInstruction = "保持主张、论点攻防、反方回应和结论收束的辩论结构，观点要鲜明但论据也要站得住。";
  } else if (isDocumentary) {
    fidelityInstruction = "保持纪实写法的事实脉络、时间线和现场细节，优先真实与克制，不要凭空戏剧化。";
  } else if (isEditorial) {
    fidelityInstruction = "保持观点先行、事实依据支撑、分析推进与结论收束的评论结构，避免写成中性百科摘要。";
  } else if (isManual) {
    fidelityInstruction = "保持目标、前置条件、步骤、排错和总结的教程/手册结构，优先让读者能照着操作。";
  } else if (isBriefing) {
    fidelityInstruction = "保持一句话结论、关键数据、风险与决策建议的简报结构，优先服务决策而不是铺陈细节。";
  }

  return {
    suppressSummaryFirst,
    forceStyleFidelity: Boolean(fidelityInstruction),
    fidelityInstruction,
  };
}

function hasAnyUrl(input: string) {
  return /https?:\/\/\S+/i.test(String(input || ""));
}

function countUrls(input: string) {
  return (String(input || "").match(/https?:\/\/\S+/gi) || []).length;
}

function isLongInput(input: string) {
  return String(input || "").trim().length >= 3200;
}

function uniqueSkillIds(ids: FunctionSkillId[]) {
  return Array.from(new Set(ids));
}

export function buildFunctionSkills(params: BuildFunctionSkillsParams): FunctionSkill[] {
  return buildFunctionSkillHits(params).map(({ reason: _reason, ...skill }) => skill);
}

export function buildFunctionSkillHits(params: BuildFunctionSkillsParams): FunctionSkillHit[] {
  const ids: FunctionSkillId[] = ["share_ready"];
  const cleanedInput = String(params.input || "").trim();
  const visualMode = params.styleProfile?.visual_mode || "auto";
  const imageEnabled = Boolean(params.imageConfig?.enabled);
  const styleBehavior = deriveStyleBehavior(params.styleProfile);
  const reasons = new Map<FunctionSkillId, string>([
    ["share_ready", "当前结果支持复制、分享和导出，正文需要保持可复用、可传播的结构。"],
  ]);

  if (!styleBehavior.suppressSummaryFirst) {
    ids.push("summary_first");
    reasons.set("summary_first", "当前风格适合先整理导语和重点，帮助用户快速抓住核心信息。");
  }

  if (styleBehavior.forceStyleFidelity) {
    ids.push("style_fidelity");
    reasons.set("style_fidelity", "当前风格有明确的节奏或版式约束，不能被通用摘要式写法压平。");
  }

  if (params.mode === "discover") {
    ids.push("evidence_first");
    reasons.set("evidence_first", "当前是调研模式，应先结论、再证据、再待确认点。");
  }

  if (params.mode === "url" || countUrls(cleanedInput) >= 2) {
    ids.push("multi_source_merge");
    reasons.set(
      "multi_source_merge",
      countUrls(cleanedInput) >= 2 ? "输入里包含多个链接，需要先归并多源信息再统一输出。" : "URL 内容需要先提取正文，再统一整理来源信息。",
    );
  }

  if (params.mode === "url" || params.mode === "text") {
    if (isLongInput(cleanedInput) || hasAnyUrl(cleanedInput)) {
      ids.push("long_context_rewrite");
      reasons.set(
        "long_context_rewrite",
        isLongInput(cleanedInput) ? "当前输入较长，应该先规划结构，再分段改写和合并。" : "网页正文通常较长，适合走长文规划与分段改写。",
      );
    }
  }

  if (visualMode === "enhanced" || visualMode === "minimal") {
    ids.push("visual_pretext");
    reasons.set(
      "visual_pretext",
      visualMode === "enhanced" ? "当前风格偏好增强可视化，应在必要时加入图表、统计卡或流程图。" : "当前风格允许少量可视化，可在必要时补充图示。",
    );
  }

  if (imageEnabled) {
    ids.push("image_planning");
    reasons.set("image_planning", "当前已开启配图，先规划插图主题和位置能减少正文与图片脱节。");
  }

  return uniqueSkillIds(ids).map((id) => ({
    id,
    label: FUNCTION_SKILL_SPECS[id].label,
    instruction:
      id === "style_fidelity" && styleBehavior.fidelityInstruction
        ? styleBehavior.fidelityInstruction
        : FUNCTION_SKILL_SPECS[id].instruction,
    reason: reasons.get(id) || "已根据当前输入与配置自动匹配。",
  }));
}

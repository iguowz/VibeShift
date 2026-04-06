import type { StyleSkillProfile } from "../types";

export type StyleSummaryMode = "default" | "narrative" | "steps" | "decision" | "dialogue";

export interface ResultFocusPresentation {
  kicker: string;
  helper: string;
  summaryMode: StyleSummaryMode;
}

export interface DiscoverReportPresentation {
  heading: string;
  helper: string;
  sourceHeading: string;
}

function buildFingerprint(styleProfile?: StyleSkillProfile | null) {
  return `${styleProfile?.name || ""} ${styleProfile?.tone || ""} ${styleProfile?.structure_template || ""}`.toLowerCase();
}

function hasAny(fingerprint: string, keywords: string[]) {
  return keywords.some((keyword) => fingerprint.includes(keyword));
}

function classifyStyle(styleProfile?: StyleSkillProfile | null) {
  const fingerprint = buildFingerprint(styleProfile);
  const layout = styleProfile?.layout_format || "auto";

  if (layout === "poetry" || hasAny(fingerprint, ["诗", "抒情", "意象", "留白", "回响"])) return "poetry";
  if (layout === "classical" || hasAny(fingerprint, ["古文", "古籍", "书卷", "题解", "纲目", "按语", "章回"])) return "classical";
  if (hasAny(fingerprint, ["故事", "叙事", "场景", "冲突", "转折"])) return "story";
  if (hasAny(fingerprint, ["猜谜", "悬念", "谜面", "揭晓", "线索"])) return "riddle";
  if (hasAny(fingerprint, ["教程", "手册", "步骤", "排错", "指南", "前置条件"])) return "manual";
  if (layout === "paper" || hasAny(fingerprint, ["论文", "研究", "综述", "摘要", "讨论", "结论边界"])) return "paper";
  if (layout === "ppt" || hasAny(fingerprint, ["简报", "高管", "决策", "汇报", "演讲", "一屏一重点", "行动项"])) return "decision";
  if (hasAny(fingerprint, ["访谈", "问答", "对谈", "采访", "q&a", "qa"])) return "interview";
  if (hasAny(fingerprint, ["播客", "口播", "主持", "节目", "串词"])) return "podcast";
  if (hasAny(fingerprint, ["书信", "来信", "致读者", "写给", "尺牍"])) return "letter";
  if (hasAny(fingerprint, ["辩论", "正方", "反方", "攻防", "交锋"])) return "debate";
  if (hasAny(fingerprint, ["纪实", "纪录", "现场", "人物群像", "口述"])) return "documentary";
  return "default";
}

export function getResultFocusPresentation(styleProfile?: StyleSkillProfile | null): ResultFocusPresentation {
  switch (classifyStyle(styleProfile)) {
    case "poetry":
      return { kicker: "先读这一段", helper: "这一类风格更看重节奏、留白和意象，不适合被压成摘要列表。", summaryMode: "narrative" };
    case "classical":
      return { kicker: "先读题解", helper: "这一类风格更适合顺着题解与正文节奏阅读。", summaryMode: "narrative" };
    case "story":
      return { kicker: "先看开场", helper: "故事风更适合先进入情境，再往后看冲突与转折。", summaryMode: "narrative" };
    case "riddle":
      return { kicker: "先看谜面", helper: "这一类风格会保留悬念节奏，建议顺着正文往下读。", summaryMode: "narrative" };
    case "manual":
      return { kicker: "先看步骤框架", helper: "先抓住步骤顺序和前置条件，再往下看细节更省时间。", summaryMode: "steps" };
    case "paper":
      return { kicker: "先看摘要结论", helper: "这一类风格更适合先看摘要、结论与证据边界。", summaryMode: "decision" };
    case "decision":
      return { kicker: "先看结论", helper: "这一类风格更强调结论前置和可快速扫读。", summaryMode: "decision" };
    case "interview":
      return { kicker: "先看核心问答", helper: "这一类风格更适合先抓住最关键的一问一答，再决定是否阅读全文。", summaryMode: "dialogue" };
    case "podcast":
      return { kicker: "先看开场口播", helper: "这一类风格更适合先进入开场语境，再往下看展开和转折。", summaryMode: "dialogue" };
    case "letter":
      return { kicker: "先看这封信", helper: "这一类风格更重视称呼、缘起和收束语气，适合顺着全文阅读。", summaryMode: "narrative" };
    case "debate":
      return { kicker: "先看主张与交锋点", helper: "这一类风格更适合先抓住立场、论点和反驳关系。", summaryMode: "decision" };
    case "documentary":
      return { kicker: "先看事实脉络", helper: "这一类风格更看重事实线索和现场感，适合先把时间线和人物线索看清。", summaryMode: "decision" };
    default:
      return { kicker: "先看重点", helper: "", summaryMode: "default" };
  }
}

export function getDiscoverReportPresentation(styleProfile?: StyleSkillProfile | null): DiscoverReportPresentation {
  switch (classifyStyle(styleProfile)) {
    case "poetry":
      return {
        heading: "先读这一段",
        helper: "这类风格更重视节奏和意象，建议先顺着正文读第一段，再看后面的证据与结构。",
        sourceHeading: "正文前建议先看",
      };
    case "classical":
      return {
        heading: "先读题解",
        helper: "这类风格更适合顺着题解、纲目和正文节奏阅读，而不是先扫结构化列表。",
        sourceHeading: "正文前建议先看",
      };
    case "story":
      return {
        heading: "先看开场",
        helper: "这类风格更适合先进入叙事场景，再去看来源和后续展开。",
        sourceHeading: "再看事实线索",
      };
    case "manual":
      return {
        heading: "先看步骤框架",
        helper: "这类风格更适合先看结论和步骤框架，再进入细节说明。",
        sourceHeading: "操作前建议先看",
      };
    case "paper":
      return {
        heading: "先看摘要结论",
        helper: "这类风格更适合先读摘要和高分来源，再进入全文论证。",
        sourceHeading: "阅读全文前建议先看",
      };
    case "decision":
      return {
        heading: "先看结论与建议",
        helper: "这类风格更强调结论前置，建议先看简报再读正文。",
        sourceHeading: "决策前建议先看",
      };
    case "interview":
      return {
        heading: "先看核心问答",
        helper: "这类风格适合先抓住最关键的一问一答，再阅读全文。",
        sourceHeading: "问答前建议先看",
      };
    case "podcast":
      return {
        heading: "先看开场口播",
        helper: "这类风格更像一段完整口播，先进入开场，再看来源与扩展更自然。",
        sourceHeading: "口播前建议先看",
      };
    case "letter":
      return {
        heading: "先看这封信",
        helper: "这类风格适合先进入写信对象与情绪，再往下看事实支撑和展开。",
        sourceHeading: "读信前建议先看",
      };
    case "debate":
      return {
        heading: "先看主张与交锋点",
        helper: "这类风格更适合先抓住正反观点与关键论据，再阅读全文。",
        sourceHeading: "交锋前建议先看",
      };
    case "documentary":
      return {
        heading: "先看事实脉络",
        helper: "这类风格更看重事实线索、人物关系和现场感，建议先看高分来源。",
        sourceHeading: "阅读全文前建议先看",
      };
    default:
      return {
        heading: "先看这句结论",
        helper: "先看结论与高分来源，再决定是否阅读全文。",
        sourceHeading: "正文前建议先看",
      };
  }
}

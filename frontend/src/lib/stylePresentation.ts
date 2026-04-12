import type { StyleSkillProfile } from "../types";

export type StyleSummaryMode = "default" | "narrative" | "steps" | "decision" | "dialogue";
export type StyleFamily =
  | "default"
  | "poetry"
  | "classical"
  | "interview"
  | "podcast"
  | "letter"
  | "debate"
  | "documentary"
  | "speech"
  | "editorial"
  | "briefing"
  | "manual"
  | "science"
  | "kids"
  | "plain"
  | "playful"
  | "snack"
  | "elegant"
  | "paper"
  | "decision"
  | "story"
  | "riddle"
  | "newspaper"
  | "poster"
  | "book";

export interface ResultFocusPresentation {
  kicker: string;
  helper: string;
  summaryMode: StyleSummaryMode;
  readingHeading: string;
  readingHint: string;
  structureHeading: string;
  displayHeading: string;
  displayForm: string;
  workflowHeading: string;
  workflowSteps: string[];
}

export interface DiscoverReportPresentation {
  heading: string;
  helper: string;
  sourceHeading: string;
  briefHeading: string;
  briefHelper: string;
  briefBadge: string;
  conclusionHeading: string;
  findingsHeading: string;
  evidenceHeading: string;
  uncertaintyHeading: string;
  outlineHeading: string;
  structureHeading: string;
  displayHeading: string;
  displayForm: string;
  workflowHeading: string;
  workflowSteps: string[];
}

interface WorkflowPresentation {
  displayHeading: string;
  displayForm: string;
  workflowHeading: string;
  workflowSteps: string[];
}

function buildFingerprint(styleProfile?: StyleSkillProfile | null) {
  return `${styleProfile?.name || ""} ${styleProfile?.tone || ""} ${styleProfile?.structure_template || ""}`.toLowerCase();
}

function hasAny(fingerprint: string, keywords: string[]) {
  return keywords.some((keyword) => fingerprint.includes(keyword));
}

export function classifyStyleProfile(styleProfile?: StyleSkillProfile | null): StyleFamily {
  const fingerprint = buildFingerprint(styleProfile);
  const layout = styleProfile?.layout_format || "auto";

  if (layout === "poetry" || hasAny(fingerprint, ["诗", "抒情", "意象", "留白", "回响"])) return "poetry";
  if (layout === "classical" || hasAny(fingerprint, ["古文", "古籍", "书卷", "题解", "纲目", "按语", "章回"])) return "classical";
  if (hasAny(fingerprint, ["访谈", "问答", "对谈", "采访", "q&a", "qa"])) return "interview";
  if (hasAny(fingerprint, ["播客", "口播", "主持", "节目", "串词"])) return "podcast";
  if (hasAny(fingerprint, ["书信", "来信", "致读者", "写给", "尺牍"])) return "letter";
  if (hasAny(fingerprint, ["辩论", "正方", "反方", "攻防", "交锋"])) return "debate";
  if (hasAny(fingerprint, ["纪实", "纪录", "现场", "人物群像", "口述"])) return "documentary";
  if (hasAny(fingerprint, ["演讲", "发言", "致辞", "答辩", "路演", "开场白"])) return "speech";
  if (hasAny(fingerprint, ["评论", "社论", "时评", "观点", "立场", "述评"])) return "editorial";
  if (hasAny(fingerprint, ["简报", "高管", "决策", "周报", "月报", "一页纸", "memo", "brief"])) return "briefing";
  if (hasAny(fingerprint, ["教程", "手册", "步骤", "排错", "指南", "前置条件"])) return "manual";
  if (hasAny(fingerprint, ["科普", "原理", "误区", "讲明白", "怎么回事", "常见问题"])) return "science";
  if (hasAny(fingerprint, ["中学生", "初学者", "入门", "启蒙", "小白", "儿童友好"])) return "kids";
  if (hasAny(fingerprint, ["通俗", "大白话", "易懂", "口语化", "别太复杂"])) return "plain";
  if (hasAny(fingerprint, ["幽默", "欢乐", "轻松", "可爱", "童趣", "分享欲"])) return "playful";
  if (hasAny(fingerprint, ["快餐", "速读", "碎片", "一分钟", "重点速看"])) return "snack";
  if (hasAny(fingerprint, ["文雅", "雅致", "修辞", "余味", "书卷气"])) return "elegant";
  if (layout === "paper" || hasAny(fingerprint, ["论文", "研究", "综述", "摘要", "讨论", "结论边界"])) return "paper";
  if (layout === "newspaper" || hasAny(fingerprint, ["报纸", "专栏", "新闻", "头版", "特稿"])) return "newspaper";
  if (layout === "poster" || hasAny(fingerprint, ["海报", "长图", "封面", "卡片", "标语"])) return "poster";
  if (layout === "book" || hasAny(fingerprint, ["章节", "长阅读", "书籍", "系统梳理"])) return "book";
  if (layout === "ppt" || hasAny(fingerprint, ["高管", "决策", "汇报", "一屏一重点", "行动项"])) return "decision";
  if (hasAny(fingerprint, ["故事", "叙事", "场景", "冲突", "转折"])) return "story";
  if (hasAny(fingerprint, ["猜谜", "悬念", "谜面", "揭晓", "线索"])) return "riddle";
  return "default";
}

const RESULT_WORKFLOWS: Record<StyleFamily, WorkflowPresentation> = {
  default: {
    displayHeading: "展示形式",
    displayForm: "结构清楚的正文结果",
    workflowHeading: "推荐流程",
    workflowSteps: ["先抓重点", "再按结构展开", "最后补建议或提醒"],
  },
  poetry: {
    displayHeading: "展示形式",
    displayForm: "诗歌 / 抒情短章",
    workflowHeading: "推荐流程",
    workflowSteps: ["先定题旨与意象", "再分段推进情绪", "最后回响式收束"],
  },
  classical: {
    displayHeading: "展示形式",
    displayForm: "题解 + 正文 + 按语的书卷式表达",
    workflowHeading: "推荐流程",
    workflowSteps: ["先交代题解", "再按纲目展开", "最后以按语收束"],
  },
  interview: {
    displayHeading: "展示形式",
    displayForm: "问答稿 / 对谈节选",
    workflowHeading: "推荐流程",
    workflowSteps: ["先定关键问题", "再排一问一答", "最后补追问或小结"],
  },
  podcast: {
    displayHeading: "展示形式",
    displayForm: "口播稿 / 播客脚本",
    workflowHeading: "推荐流程",
    workflowSteps: ["先写开场引题", "再顺口展开主线", "最后自然收束或发问"],
  },
  letter: {
    displayHeading: "展示形式",
    displayForm: "书信 / 公开信",
    workflowHeading: "推荐流程",
    workflowSteps: ["先明确写给谁", "再展开主体内容", "最后以致意或叮嘱收束"],
  },
  debate: {
    displayHeading: "展示形式",
    displayForm: "辩论稿 / 攻防稿",
    workflowHeading: "推荐流程",
    workflowSteps: ["先亮主张", "再列论点与证据", "最后回应反方并收束"],
  },
  documentary: {
    displayHeading: "展示形式",
    displayForm: "纪实稿 / 非虚构特写",
    workflowHeading: "推荐流程",
    workflowSteps: ["先抓现场切口", "再排事实脉络", "最后落到余波与判断"],
  },
  speech: {
    displayHeading: "展示形式",
    displayForm: "演讲稿 / 发言稿",
    workflowHeading: "推荐流程",
    workflowSteps: ["先定调开场", "再推进核心论点", "最后用号召或落点收束"],
  },
  editorial: {
    displayHeading: "展示形式",
    displayForm: "评论 / 社论 / 时评",
    workflowHeading: "推荐流程",
    workflowSteps: ["先亮判断", "再铺事实与分析", "最后给建议或结论"],
  },
  briefing: {
    displayHeading: "展示形式",
    displayForm: "一页简报 / 决策摘要",
    workflowHeading: "推荐流程",
    workflowSteps: ["先给一句话结论", "再列关键判断与风险", "最后给行动建议"],
  },
  manual: {
    displayHeading: "展示形式",
    displayForm: "教程 / 操作手册",
    workflowHeading: "推荐流程",
    workflowSteps: ["先看目标与前置条件", "再按步骤执行", "最后回看排错和注意事项"],
  },
  science: {
    displayHeading: "展示形式",
    displayForm: "科普解读 / 原理说明",
    workflowHeading: "推荐流程",
    workflowSteps: ["先一句话讲清", "再解释原理和问题", "最后提醒误区与边界"],
  },
  kids: {
    displayHeading: "展示形式",
    displayForm: "入门解释 / 初学者友好版",
    workflowHeading: "推荐流程",
    workflowSteps: ["先给最短解释", "再分点讲概念", "最后用类比帮理解"],
  },
  plain: {
    displayHeading: "展示形式",
    displayForm: "通俗直白版",
    workflowHeading: "推荐流程",
    workflowSteps: ["先讲结论", "再讲原因和例子", "最后补边界提醒"],
  },
  playful: {
    displayHeading: "展示形式",
    displayForm: "轻快分享版",
    workflowHeading: "推荐流程",
    workflowSteps: ["先做亮眼开头", "再轻快展开重点", "最后留一个记忆点"],
  },
  snack: {
    displayHeading: "展示形式",
    displayForm: "速读卡 / 快扫版",
    workflowHeading: "推荐流程",
    workflowSteps: ["先一句话结论", "再扫 3~5 个重点", "最后看行动建议"],
  },
  elegant: {
    displayHeading: "展示形式",
    displayForm: "文雅长文 / 雅致表达",
    workflowHeading: "推荐流程",
    workflowSteps: ["先看起笔", "再读中段层次", "最后体会收束余味"],
  },
  paper: {
    displayHeading: "展示形式",
    displayForm: "摘要 + 分析 + 结论的研究写法",
    workflowHeading: "推荐流程",
    workflowSteps: ["先看摘要结论", "再看方法和论据", "最后关注边界与结论"],
  },
  decision: {
    displayHeading: "展示形式",
    displayForm: "结论前置的决策型正文",
    workflowHeading: "推荐流程",
    workflowSteps: ["先扫结论", "再看关键判断", "最后决定是否细读"],
  },
  story: {
    displayHeading: "展示形式",
    displayForm: "故事 / 叙事稿",
    workflowHeading: "推荐流程",
    workflowSteps: ["先进入情境", "再跟冲突与转折", "最后看启发和落点"],
  },
  riddle: {
    displayHeading: "展示形式",
    displayForm: "谜面 + 线索 + 揭晓",
    workflowHeading: "推荐流程",
    workflowSteps: ["先看谜面", "再追线索", "最后看揭晓是否回收"],
  },
  newspaper: {
    displayHeading: "展示形式",
    displayForm: "导语 + 分栏分析的新闻特稿",
    workflowHeading: "推荐流程",
    workflowSteps: ["先读导语", "再看核心事实与分栏", "最后看结语判断"],
  },
  poster: {
    displayHeading: "展示形式",
    displayForm: "海报 / 长图 / 重点卡片",
    workflowHeading: "推荐流程",
    workflowSteps: ["先看大标题", "再扫重点卡片", "最后看数字和建议"],
  },
  book: {
    displayHeading: "展示形式",
    displayForm: "章节式长阅读",
    workflowHeading: "推荐流程",
    workflowSteps: ["先看章节摘要", "再读分节正文", "最后回看章节总结"],
  },
};

const DISCOVER_WORKFLOWS: Record<StyleFamily, WorkflowPresentation> = {
  ...RESULT_WORKFLOWS,
  default: {
    displayHeading: "报告形式",
    displayForm: "研究简报 + 调研全文",
    workflowHeading: "生成流程",
    workflowSteps: ["先回答问题", "再整理证据和要点", "最后形成完整报告"],
  },
  poetry: {
    displayHeading: "报告形式",
    displayForm: "题旨简报 + 诗性正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先提炼题旨", "再筛最关键证据", "最后转写成诗性正文"],
  },
  classical: {
    displayHeading: "报告形式",
    displayForm: "题解简报 + 书卷式正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先写题解判断", "再按纲目整理依据", "最后形成书卷式正文"],
  },
  interview: {
    displayHeading: "报告形式",
    displayForm: "问答式研究简报 + 正式问答稿",
    workflowHeading: "生成流程",
    workflowSteps: ["先提炼关键问答", "再补证据与追问", "最后形成完整访谈稿"],
  },
  podcast: {
    displayHeading: "报告形式",
    displayForm: "口播简报 + 播客脚本",
    workflowHeading: "生成流程",
    workflowSteps: ["先抓最适合口播的结论", "再串起事实与转场", "最后形成顺口脚本"],
  },
  letter: {
    displayHeading: "报告形式",
    displayForm: "对象化简报 + 书信正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先明确对象", "再把事实翻译成对话语气", "最后收束成完整书信"],
  },
  debate: {
    displayHeading: "报告形式",
    displayForm: "立场简报 + 辩论稿",
    workflowHeading: "生成流程",
    workflowSteps: ["先给最终立场", "再整理正反依据", "最后排成攻防结构"],
  },
  documentary: {
    displayHeading: "报告形式",
    displayForm: "事实简报 + 纪实正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先确认事实判断", "再整理时间线和人物线", "最后转写成纪实稿"],
  },
  speech: {
    displayHeading: "报告形式",
    displayForm: "发言简报 + 演讲稿",
    workflowHeading: "生成流程",
    workflowSteps: ["先明确立场", "再整理可讲的论点", "最后形成适合朗读的发言稿"],
  },
  editorial: {
    displayHeading: "报告形式",
    displayForm: "观点简报 + 评论稿",
    workflowHeading: "生成流程",
    workflowSteps: ["先给判断", "再排依据和争议点", "最后写成评论成稿"],
  },
  briefing: {
    displayHeading: "报告形式",
    displayForm: "一页简报 / 决策摘要",
    workflowHeading: "生成流程",
    workflowSteps: ["先回答决策问题", "再排关键数据与风险", "最后给建议动作"],
  },
  manual: {
    displayHeading: "报告形式",
    displayForm: "操作简报 + 可执行手册",
    workflowHeading: "生成流程",
    workflowSteps: ["先界定目标", "再整理步骤和条件", "最后补排错与风险"],
  },
  science: {
    displayHeading: "报告形式",
    displayForm: "科普简报 + 原理说明",
    workflowHeading: "生成流程",
    workflowSteps: ["先直接回答问题", "再讲原理和证据", "最后提醒误区与边界"],
  },
  kids: {
    displayHeading: "报告形式",
    displayForm: "入门简报 + 初学者友好正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先给最容易懂的结论", "再做分点解释", "最后用例子或类比收束"],
  },
  plain: {
    displayHeading: "报告形式",
    displayForm: "通俗简报 + 大白话正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先直接回答", "再翻译证据和术语", "最后补限制与建议"],
  },
  playful: {
    displayHeading: "报告形式",
    displayForm: "轻快简报 + 分享版正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先抓最值得分享的点", "再轻快展开重点", "最后留一个记忆点"],
  },
  snack: {
    displayHeading: "报告形式",
    displayForm: "速读简报 + 快扫正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先一句话回答", "再筛少量重点", "最后给动作建议"],
  },
  elegant: {
    displayHeading: "报告形式",
    displayForm: "文雅简报 + 雅致正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先立主旨", "再分层展开证据与判断", "最后以余味收束"],
  },
  paper: {
    displayHeading: "报告形式",
    displayForm: "研究简报 + 研究报告正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先回答研究问题", "再整理比较与证据", "最后写出边界和结论"],
  },
  decision: {
    displayHeading: "报告形式",
    displayForm: "决策摘要 + 结论前置正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先回答问题", "再看关键判断", "最后回到建议动作"],
  },
  story: {
    displayHeading: "报告形式",
    displayForm: "叙事简报 + 故事化正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先提炼故事线", "再把事实嵌入冲突和转折", "最后落到启发"],
  },
  riddle: {
    displayHeading: "报告形式",
    displayForm: "谜面简报 + 悬念式正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先设定谜面", "再安排线索顺序", "最后完成揭晓与解释"],
  },
  newspaper: {
    displayHeading: "报告形式",
    displayForm: "特稿简报 + 导语分栏正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先写导语判断", "再排核心事实与背景", "最后补结语和判断"],
  },
  poster: {
    displayHeading: "报告形式",
    displayForm: "海报简报 + 卡片化正文",
    workflowHeading: "生成流程",
    workflowSteps: ["先回答核心问题", "再筛重点数字和判断", "最后卡片化排版输出"],
  },
  book: {
    displayHeading: "报告形式",
    displayForm: "章节摘要 + 章节式调研全文",
    workflowHeading: "生成流程",
    workflowSteps: ["先给总判断", "再按章节铺开证据", "最后以章节总结收束"],
  },
};

export function getResultFocusPresentation(styleProfile?: StyleSkillProfile | null): ResultFocusPresentation {
  const family = classifyStyleProfile(styleProfile);
  const workflow = RESULT_WORKFLOWS[family] || RESULT_WORKFLOWS.default;
  const base: Omit<ResultFocusPresentation, "displayHeading" | "displayForm" | "workflowHeading" | "workflowSteps"> = (() => {
    switch (family) {
    case "poetry":
      return {
        kicker: "先读这一段",
        helper: "这一类风格更看重节奏、留白和意象，不适合被压成摘要列表。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "先顺着首段和收束去感受题旨，再回来看事实与主旨是否都落住。",
        structureHeading: "风格结构",
      };
    case "classical":
      return {
        kicker: "先读题解",
        helper: "这一类风格更适合顺着题解与正文节奏阅读。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "建议先看题解与纲目，再顺着正文与按语读完整体节奏。",
        structureHeading: "风格结构",
      };
    case "speech":
      return {
        kicker: "先听开场",
        helper: "这一类风格更适合先看定调和号召，再回头看论点推进。",
        summaryMode: "dialogue",
        readingHeading: "建议读法",
        readingHint: "先看开场和结尾是否立得住，再检查中间论点有没有自然推进。",
        structureHeading: "演讲骨架",
      };
    case "story":
      return {
        kicker: "先看开场",
        helper: "故事风更适合先进入情境，再往后看冲突与转折。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "建议先看引子，再抓冲突、转折和最后的启发有没有连起来。",
        structureHeading: "叙事骨架",
      };
    case "riddle":
      return {
        kicker: "先看谜面",
        helper: "这一类风格会保留悬念节奏，建议顺着正文往下读。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "先看谜面和线索，再看最后揭晓是否把关键事实都解释清楚。",
        structureHeading: "悬念结构",
      };
    case "editorial":
      return {
        kicker: "先看判断",
        helper: "这一类风格要先抓住立场，再看事实依据和分析推进。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "先看观点是否明确，再检查依据、推理和结尾建议是否稳得住。",
        structureHeading: "评论结构",
      };
    case "briefing":
      return {
        kicker: "先看一句话结论",
        helper: "这一类风格优先服务决策，应该先扫结论、关键数据和风险。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "先扫一句话结论和关键判断，再看方案、风险与行动建议。",
        structureHeading: "简报结构",
      };
    case "manual":
      return {
        kicker: "先看步骤框架",
        helper: "先抓住步骤顺序和前置条件，再往下看细节更省时间。",
        summaryMode: "steps",
        readingHeading: "建议读法",
        readingHint: "优先确认目标、前置条件和步骤顺序，再进入排错和注意事项。",
        structureHeading: "操作结构",
      };
    case "science":
      return {
        kicker: "先看一句话讲清",
        helper: "这一类风格更适合先抓核心原理，再看常见问题和误区提醒。",
        summaryMode: "steps",
        readingHeading: "建议读法",
        readingHint: "建议先看核心结论，再按“问题-原理-误区”的顺序往下读。",
        structureHeading: "科普结构",
      };
    case "kids":
      return {
        kicker: "先看 5 句话讲清",
        helper: "这一类风格强调降低门槛，先看最容易懂的解释再进细节。",
        summaryMode: "steps",
        readingHeading: "建议读法",
        readingHint: "先看最短解释，再看类比和容易误解的地方有没有讲清楚。",
        structureHeading: "入门结构",
      };
    case "plain":
      return {
        kicker: "先看直接结论",
        helper: "这一类风格强调好懂，适合先抓结论，再看分点解释。",
        summaryMode: "steps",
        readingHeading: "建议读法",
        readingHint: "先看结论和关键解释，再看有没有把术语翻成日常说法。",
        structureHeading: "通俗结构",
      };
    case "playful":
      return {
        kicker: "先看亮眼开头",
        helper: "这一类风格更看重节奏和分享感，适合先看开头是否有记忆点。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "先看开头和收束的情绪，再看中间重点有没有轻快但不失真。",
        structureHeading: "轻快结构",
      };
    case "snack":
      return {
        kicker: "先看速读重点",
        helper: "这一类风格适合手机快扫，先抓一句话结论和 3~5 个重点。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "先扫一句话结论和重点条目，再决定是否深入看正文。",
        structureHeading: "速读结构",
      };
    case "elegant":
      return {
        kicker: "先看起笔",
        helper: "这一类风格更重视铺垫和收束的余味，适合顺着全文阅读。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "先看起笔和收束是否自然，再看中间层次和修辞是否服务内容。",
        structureHeading: "文雅结构",
      };
    case "newspaper":
      return {
        kicker: "先看导语",
        helper: "这一类风格强调导语和分栏分析，适合先抓核心事实再看脉络。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "先看导语和核心事实，再看分栏分析和最后结语。",
        structureHeading: "特稿结构",
      };
    case "poster":
      return {
        kicker: "先看大标题和一句话结论",
        helper: "这一类风格适合快速扫读，应该先抓最醒目的结论和重点数字。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "先看结论和重点卡片，再看流程、数字和行动建议。",
        structureHeading: "海报结构",
      };
    case "book":
      return {
        kicker: "先看章节摘要",
        helper: "这一类风格适合长阅读，先看章节摘要再进入正文更顺。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "先看章节摘要，再顺着分节正文和章节总结慢慢读。",
        structureHeading: "章节结构",
      };
    case "paper":
      return {
        kicker: "先看摘要结论",
        helper: "这一类风格更适合先看摘要、结论与证据边界。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "建议按摘要、分析、讨论、结论的顺序读，重点关注依据和边界。",
        structureHeading: "研究结构",
      };
    case "decision":
      return {
        kicker: "先看结论",
        helper: "这一类风格更强调结论前置和可快速扫读。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "建议先扫一句话结论、关键判断和行动项，再决定是否细读正文。",
        structureHeading: "决策结构",
      };
    case "interview":
      return {
        kicker: "先看核心问答",
        helper: "这一类风格更适合先抓住最关键的一问一答，再决定是否阅读全文。",
        summaryMode: "dialogue",
        readingHeading: "建议读法",
        readingHint: "先抓住最关键的问题，再看回答、追问和补充是否把信息说透。",
        structureHeading: "问答结构",
      };
    case "podcast":
      return {
        kicker: "先看开场口播",
        helper: "这一类风格更适合先进入开场语境，再往下看展开和转折。",
        summaryMode: "dialogue",
        readingHeading: "建议读法",
        readingHint: "建议先看开场是否顺口，再看中段转场和收束问题是否自然。",
        structureHeading: "口播结构",
      };
    case "letter":
      return {
        kicker: "先看这封信",
        helper: "这一类风格更重视称呼、缘起和收束语气，适合顺着全文阅读。",
        summaryMode: "narrative",
        readingHeading: "建议读法",
        readingHint: "先看写给谁、因何而写，再看正文展开和最后的收束语气。",
        structureHeading: "书信结构",
      };
    case "debate":
      return {
        kicker: "先看主张与交锋点",
        helper: "这一类风格更适合先抓住立场、论点和反驳关系。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "优先看主张、论点和回应，再检查证据和逻辑链是否站得住。",
        structureHeading: "攻防结构",
      };
    case "documentary":
      return {
        kicker: "先看事实脉络",
        helper: "这一类风格更看重事实线索和现场感，适合先把时间线和人物线索看清。",
        summaryMode: "decision",
        readingHeading: "建议读法",
        readingHint: "建议先抓时间线、关键节点和人物关系，再回看最后的判断。",
        structureHeading: "事实结构",
      };
    default:
      return {
        kicker: "先看重点",
        helper: "",
        summaryMode: "default",
        readingHeading: "建议读法",
        readingHint: "先看导语和重点，再继续阅读全文。",
        structureHeading: "结果结构",
      };
    }
  })();

  return { ...base, ...workflow };
}

export function getDiscoverReportPresentation(styleProfile?: StyleSkillProfile | null): DiscoverReportPresentation {
  const family = classifyStyleProfile(styleProfile);
  const workflow = DISCOVER_WORKFLOWS[family] || DISCOVER_WORKFLOWS.default;
  const base: Omit<DiscoverReportPresentation, "displayHeading" | "displayForm" | "workflowHeading" | "workflowSteps"> = (() => {
    switch (family) {
    case "poetry":
      return {
        heading: "先读这一段",
        helper: "这类风格更重视节奏和意象，建议先顺着正文读第一段，再看后面的证据与结构。",
        sourceHeading: "正文前建议先看",
        briefHeading: "题旨简报",
        briefHelper: "先看题旨、关键发现和证据，再决定是否展开阅读全文。",
        briefBadge: "风格优先",
        conclusionHeading: "核心题旨",
        findingsHeading: "关键发现",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "转写节奏",
        structureHeading: "风格结构",
      };
    case "classical":
      return {
        heading: "先读题解",
        helper: "这类风格更适合顺着题解、纲目和正文节奏阅读，而不是先扫结构化列表。",
        sourceHeading: "正文前建议先看",
        briefHeading: "题解简报",
        briefHelper: "先看题解、关键发现和证据脉络，再进入正文。",
        briefBadge: "书卷结构",
        conclusionHeading: "题解结论",
        findingsHeading: "纲目要点",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "转写纲目",
        structureHeading: "风格结构",
      };
    case "speech":
      return {
        heading: "先看开场定调",
        helper: "这类风格适合先看开场是否抓人、结尾是否收住，再看中间论点。",
        sourceHeading: "发言前建议先看",
        briefHeading: "发言简报",
        briefHelper: "先看立场、论点和证据，再决定是否进入全文。",
        briefBadge: "适合朗读",
        conclusionHeading: "核心立场",
        findingsHeading: "核心论点",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "发言骨架",
        structureHeading: "演讲结构",
      };
    case "story":
      return {
        heading: "先看开场",
        helper: "这类风格更适合先进入叙事场景，再去看来源和后续展开。",
        sourceHeading: "再看事实线索",
        briefHeading: "叙事简报",
        briefHelper: "先看开场、关键发现和证据，再进入完整叙事。",
        briefBadge: "叙事优先",
        conclusionHeading: "开场结论",
        findingsHeading: "关键转折",
        evidenceHeading: "事实线索",
        uncertaintyHeading: "待确认点",
        outlineHeading: "转写骨架",
        structureHeading: "叙事结构",
      };
    case "editorial":
      return {
        heading: "先看判断与立场",
        helper: "这类风格先抓判断，再看事实依据和分析推进会更顺。",
        sourceHeading: "立场判断前建议先看",
        briefHeading: "评论简报",
        briefHelper: "先看判断、关键依据和证据，再决定是否阅读全文。",
        briefBadge: "立场清楚",
        conclusionHeading: "核心判断",
        findingsHeading: "关键依据",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "争议与待确认点",
        outlineHeading: "评论提纲",
        structureHeading: "评论结构",
      };
    case "briefing":
      return {
        heading: "先看一句话结论与风险",
        helper: "这类风格服务决策，建议先看结论、关键数据和风险。",
        sourceHeading: "决策前建议先看",
        briefHeading: "简报",
        briefHelper: "先看一句话结论、关键判断和风险，再决定是否阅读全文。",
        briefBadge: "适合决策",
        conclusionHeading: "一句话结论",
        findingsHeading: "关键判断",
        evidenceHeading: "数据与依据",
        uncertaintyHeading: "风险与待确认点",
        outlineHeading: "决策提纲",
        structureHeading: "简报结构",
      };
    case "manual":
      return {
        heading: "先看步骤框架",
        helper: "这类风格更适合先看结论和步骤框架，再进入细节说明。",
        sourceHeading: "操作前建议先看",
        briefHeading: "操作简报",
        briefHelper: "先看目标、结论和关键步骤，再决定是否展开阅读全文。",
        briefBadge: "可执行",
        conclusionHeading: "直接结论",
        findingsHeading: "关键步骤",
        evidenceHeading: "依据与说明",
        uncertaintyHeading: "待确认点",
        outlineHeading: "执行提纲",
        structureHeading: "操作结构",
      };
    case "science":
      return {
        heading: "先看核心原理",
        helper: "这类风格更适合先读一句话概括，再看原理、误区和现实意义。",
        sourceHeading: "展开解释前建议先看",
        briefHeading: "科普简报",
        briefHelper: "先看核心结论、关键发现和证据，再决定是否阅读全文。",
        briefBadge: "讲明白",
        conclusionHeading: "一句话概括",
        findingsHeading: "核心原理",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "仍待确认点",
        outlineHeading: "解释提纲",
        structureHeading: "科普结构",
      };
    case "kids":
      return {
        heading: "先看 5 句话讲清",
        helper: "这类风格先看最容易懂的解释，再看类比和延展会更自然。",
        sourceHeading: "解释前建议先看",
        briefHeading: "入门简报",
        briefHelper: "先看最短解释、关键发现和证据，再决定是否阅读全文。",
        briefBadge: "降低门槛",
        conclusionHeading: "最短解释",
        findingsHeading: "重点解释",
        evidenceHeading: "依据与例子",
        uncertaintyHeading: "还需讲清的地方",
        outlineHeading: "入门提纲",
        structureHeading: "入门结构",
      };
    case "plain":
      return {
        heading: "先看直接结论",
        helper: "这类风格强调直白易懂，先看结论和分点解释最省时间。",
        sourceHeading: "展开说明前建议先看",
        briefHeading: "通俗简报",
        briefHelper: "先看结论、分点解释和证据，再决定是否阅读全文。",
        briefBadge: "好懂优先",
        conclusionHeading: "直接结论",
        findingsHeading: "分点解释",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "说明提纲",
        structureHeading: "通俗结构",
      };
    case "playful":
      return {
        heading: "先看亮眼开头",
        helper: "这类风格先看开头和节奏，再看重点有没有保持真实会更合适。",
        sourceHeading: "分享前建议先看",
        briefHeading: "轻快简报",
        briefHelper: "先看记忆点、关键发现和证据，再决定是否阅读全文。",
        briefBadge: "分享感",
        conclusionHeading: "核心看点",
        findingsHeading: "重点亮点",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "展开节奏",
        structureHeading: "轻快结构",
      };
    case "snack":
      return {
        heading: "先看速读重点",
        helper: "这类风格适合快扫，建议先看一句话结论和重点条目。",
        sourceHeading: "速读前建议先看",
        briefHeading: "速读简报",
        briefHelper: "先看一句话结论、重点和证据，再决定是否阅读全文。",
        briefBadge: "手机快扫",
        conclusionHeading: "一句话结论",
        findingsHeading: "速读重点",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "速读提纲",
        structureHeading: "速读结构",
      };
    case "elegant":
      return {
        heading: "先看起笔与收束",
        helper: "这类风格更适合先看起笔、层次和结尾余味，再决定是否阅读全文。",
        sourceHeading: "阅读全文前建议先看",
        briefHeading: "文雅简报",
        briefHelper: "先看主旨、关键发现和证据，再进入完整正文。",
        briefBadge: "修辞质感",
        conclusionHeading: "核心主旨",
        findingsHeading: "层次要点",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "层次提纲",
        structureHeading: "文雅结构",
      };
    case "newspaper":
      return {
        heading: "先看导语与核心事实",
        helper: "这类风格更适合先读导语，再抓事实和分栏分析。",
        sourceHeading: "阅读全文前建议先看",
        briefHeading: "特稿简报",
        briefHelper: "先看导语、关键事实和证据，再决定是否阅读全文。",
        briefBadge: "事实先行",
        conclusionHeading: "导语结论",
        findingsHeading: "核心事实",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "分栏提纲",
        structureHeading: "特稿结构",
      };
    case "poster":
      return {
        heading: "先看一句话结论和重点卡片",
        helper: "这类风格适合快速扫读，先抓结论、重点数字和行动建议。",
        sourceHeading: "展示前建议先看",
        briefHeading: "海报简报",
        briefHelper: "先看一句话结论、重点卡片和证据，再决定是否阅读全文。",
        briefBadge: "可扫读",
        conclusionHeading: "一句话结论",
        findingsHeading: "重点卡片",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "卡片提纲",
        structureHeading: "海报结构",
      };
    case "book":
      return {
        heading: "先看章节摘要",
        helper: "这类风格更适合先看章节摘要，再进入分节正文。",
        sourceHeading: "阅读全文前建议先看",
        briefHeading: "章节简报",
        briefHelper: "先看章节摘要、关键发现和证据，再决定是否阅读全文。",
        briefBadge: "长阅读",
        conclusionHeading: "章节摘要",
        findingsHeading: "分节要点",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "章节提纲",
        structureHeading: "章节结构",
      };
    case "paper":
      return {
        heading: "先看摘要结论",
        helper: "这类风格更适合先读摘要和高分来源，再进入全文论证。",
        sourceHeading: "阅读全文前建议先看",
        briefHeading: "研究简报",
        briefHelper: "先看摘要、关键发现和证据，再进入全文分析。",
        briefBadge: "证据优先",
        conclusionHeading: "摘要结论",
        findingsHeading: "关键发现",
        evidenceHeading: "核心证据",
        uncertaintyHeading: "研究边界",
        outlineHeading: "分析提纲",
        structureHeading: "研究结构",
      };
    case "decision":
      return {
        heading: "先看结论与建议",
        helper: "这类风格更强调结论前置，建议先看简报再读正文。",
        sourceHeading: "决策前建议先看",
        briefHeading: "决策简报",
        briefHelper: "先看结论、方案与风险，再决定是否阅读全文。",
        briefBadge: "结论前置",
        conclusionHeading: "直接结论",
        findingsHeading: "关键判断",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "风险与待确认点",
        outlineHeading: "落地提纲",
        structureHeading: "决策结构",
      };
    case "interview":
      return {
        heading: "先看核心问答",
        helper: "这类风格适合先抓住最关键的一问一答，再阅读全文。",
        sourceHeading: "问答前建议先看",
        briefHeading: "问答简报",
        briefHelper: "先看关键问题、回答和证据，再决定是否阅读全文。",
        briefBadge: "问答优先",
        conclusionHeading: "直接回答",
        findingsHeading: "核心问答",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "问题提纲",
        structureHeading: "问答结构",
      };
    case "podcast":
      return {
        heading: "先看开场口播",
        helper: "这类风格更像一段完整口播，先进入开场，再看来源与扩展更自然。",
        sourceHeading: "口播前建议先看",
        briefHeading: "口播简报",
        briefHelper: "先看开场、主线和证据，再决定是否进入全文。",
        briefBadge: "顺口表达",
        conclusionHeading: "开场结论",
        findingsHeading: "主线要点",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "口播提纲",
        structureHeading: "口播结构",
      };
    case "letter":
      return {
        heading: "先看这封信",
        helper: "这类风格适合先进入写信对象与情绪，再往下看事实支撑和展开。",
        sourceHeading: "读信前建议先看",
        briefHeading: "书信简报",
        briefHelper: "先看对象、核心判断和证据，再决定是否阅读全文。",
        briefBadge: "对象感",
        conclusionHeading: "信中主旨",
        findingsHeading: "重点叮嘱",
        evidenceHeading: "支撑证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "转写结构",
        structureHeading: "书信结构",
      };
    case "debate":
      return {
        heading: "先看主张与交锋点",
        helper: "这类风格更适合先抓住正反观点与关键论据，再阅读全文。",
        sourceHeading: "交锋前建议先看",
        briefHeading: "辩论简报",
        briefHelper: "先看立场、论点和证据，再决定是否进入全文攻防。",
        briefBadge: "攻防清晰",
        conclusionHeading: "结论立场",
        findingsHeading: "核心论点",
        evidenceHeading: "论据基础",
        uncertaintyHeading: "待确认点",
        outlineHeading: "攻防提纲",
        structureHeading: "辩论结构",
      };
    case "documentary":
      return {
        heading: "先看事实脉络",
        helper: "这类风格更看重事实线索、人物关系和现场感，建议先看高分来源。",
        sourceHeading: "阅读全文前建议先看",
        briefHeading: "纪实简报",
        briefHelper: "先看事实脉络、关键人物和证据，再进入全文。",
        briefBadge: "事实优先",
        conclusionHeading: "核心判断",
        findingsHeading: "事实脉络",
        evidenceHeading: "现场证据",
        uncertaintyHeading: "待确认点",
        outlineHeading: "时间线提纲",
        structureHeading: "事实结构",
      };
    default:
      return {
        heading: "先看这句结论",
        helper: "先看结论与高分来源，再决定是否阅读全文。",
        sourceHeading: "正文前建议先看",
        briefHeading: "研究简报",
        briefHelper: "先看结论、关键发现和证据，再决定是否展开阅读全文。",
        briefBadge: "证据优先",
        conclusionHeading: "直接结论",
        findingsHeading: "关键发现",
        evidenceHeading: "关键证据",
        uncertaintyHeading: "待确认问题",
        outlineHeading: "转写提纲",
        structureHeading: "风格结构",
      };
    }
  })();

  return { ...base, ...workflow };
}

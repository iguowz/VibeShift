import type { DetectedMode, RecentRunEntry, StylePromptMemoryHint, StyleTemplate } from "../types";

export interface StyleRecommendation {
  styleId: string;
  reason: string;
  score: number;
}

interface RecommendParams {
  input: string;
  mode: DetectedMode;
  styles: StyleTemplate[];
  recentRuns: RecentRunEntry[];
  styleMemories: StylePromptMemoryHint[];
}

interface StyleHintProfile {
  keywords: string[];
  boosts: string[];
}

const STYLE_HINTS: Record<string, StyleHintProfile> = {
  story: {
    keywords: ["故事", "案例", "人物", "经历", "叙事", "场景", "讲述"],
    boosts: ["故事化表达更容易承接这类内容"],
  },
  ppt: {
    keywords: ["ppt", "汇报", "演示", "路演", "slides", "提案", "一页"],
    boosts: ["内容更像汇报页或演示稿"],
  },
  paper: {
    keywords: ["论文", "研究", "文献", "综述", "实验", "方法", "摘要", "结论与讨论"],
    boosts: ["问题更偏研究或论文体"],
  },
  briefing: {
    keywords: ["简报", "高管", "决策", "周报", "月报", "一页纸", "brief", "memo"],
    boosts: ["内容更像服务决策的简报"],
  },
  manual: {
    keywords: ["教程", "指南", "手册", "步骤", "实操", "排错", "配置", "部署"],
    boosts: ["内容更适合写成教程/手册"],
  },
  speech: {
    keywords: ["演讲", "发言", "致辞", "开场", "答辩", "路演"],
    boosts: ["需求更接近演讲稿或现场表达"],
  },
  interview: {
    keywords: ["访谈", "问答", "采访", "对谈", "q&a", "qa", "提问"],
    boosts: ["内容更适合问答或对谈结构"],
  },
  editorial: {
    keywords: ["评论", "社论", "时评", "观点", "立场", "怎么看", "应不应该"],
    boosts: ["内容更适合观点先行的评论结构"],
  },
  documentary: {
    keywords: ["纪实", "非虚构", "现场", "人物", "口述", "实录", "时间线"],
    boosts: ["内容更适合按事实脉络和现场细节推进"],
  },
  letter: {
    keywords: ["书信", "公开信", "写给", "致读者", "来信", "信件"],
    boosts: ["内容更适合带对象感的书信结构"],
  },
  podcast: {
    keywords: ["播客", "口播", "串词", "主持", "节目", "开麦", "朗读"],
    boosts: ["内容更适合口播或播客表达"],
  },
  debate: {
    keywords: ["辩论", "正方", "反方", "攻防", "立论", "驳论", "交锋"],
    boosts: ["内容更适合论点攻防和立场推进"],
  },
  poetry: {
    keywords: ["诗", "诗歌", "诗意", "抒情", "意象", "emo", "散文诗"],
    boosts: ["内容带有明显诗性表达诉求"],
  },
  science: {
    keywords: ["科普", "原理", "为什么", "怎么回事", "讲明白", "解释", "误区"],
    boosts: ["内容更适合先解释原理再展开"],
  },
  elegant: {
    keywords: ["文雅", "雅致", "高级感", "典雅", "书卷气", "润色"],
    boosts: ["用户更偏好雅致表达"],
  },
  plain: {
    keywords: ["通俗", "大白话", "简单说", "易懂", "别太复杂", "口语化"],
    boosts: ["内容更适合直白好懂的表达"],
  },
  childish: {
    keywords: ["幼稚", "可爱", "小朋友", "儿童", "孩子", "童趣", "萌"],
    boosts: ["目标读者或表达诉求偏童趣"],
  },
  kids: {
    keywords: ["中学生", "初学者", "入门", "启蒙", "小白"],
    boosts: ["内容更像面向初学者的解释"],
  },
  cheerful: {
    keywords: ["欢乐", "有趣", "开心", "轻松", "活泼", "搞笑"],
    boosts: ["内容适合更轻快、更有分享欲的语气"],
  },
  riddle: {
    keywords: ["猜谜", "谜语", "悬念", "反转", "谜面", "揭晓"],
    boosts: ["内容需要保留悬念与揭晓节奏"],
  },
  snack: {
    keywords: ["快餐", "速读", "速览", "一分钟", "碎片", "短内容", "重点速看"],
    boosts: ["用户更像要快速扫读版本"],
  },
  newspaper: {
    keywords: ["新闻", "专栏", "报道", "头版", "特稿", "述评"],
    boosts: ["内容适合新闻特稿式组织"],
  },
  poster: {
    keywords: ["海报", "长图", "封面", "社媒", "海报感", "重点卡片"],
    boosts: ["内容适合海报式分块展示"],
  },
  book: {
    keywords: ["章节", "长文", "书籍", "深度", "系统梳理", "完整讲清"],
    boosts: ["内容需要更从容的长阅读版式"],
  },
  "classical-book": {
    keywords: ["古文", "古风", "文言", "古籍", "书卷", "章回"],
    boosts: ["内容或偏好更贴近书卷/古典表达"],
  },
};

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      (String(value || "").match(/[\u4e00-\u9fffa-zA-Z0-9]{2,}/g) || [])
        .map((token) => token.toLowerCase())
        .filter((token) => token.length >= 2),
    ),
  );
}

function includesKeyword(input: string, keyword: string) {
  const lowered = input.toLowerCase();
  return lowered.includes(keyword.toLowerCase());
}

function buildStyleCorpus(style: StyleTemplate) {
  return [
    style.name,
    style.prompt,
    style.audience,
    style.tone,
    style.structure_template,
    style.layout_format,
    style.visual_mode,
    ...(style.emphasis_points || []),
  ].join(" ");
}

function scorePromptMemories(style: StyleTemplate, memories: StylePromptMemoryHint[]) {
  return memories.reduce((score, memory) => {
    const names = [memory.source_style_name, memory.profile_suggestion.structure_template, memory.profile_suggestion.tone].join(" ");
    const matchedByName = memory.source_style_name && memory.source_style_name.includes(style.name);
    const matchedByStructure =
      style.structure_template &&
      memory.profile_suggestion.structure_template &&
      style.structure_template === memory.profile_suggestion.structure_template;
    return score + (matchedByName || matchedByStructure || names.includes(style.name) ? Math.min(memory.usage_count, 8) * 2 : 0);
  }, 0);
}

function scoreRecentPreference(style: StyleTemplate, recentRuns: RecentRunEntry[]) {
  return recentRuns.reduce((score, entry) => {
    const matched =
      entry.style_id === style.id ||
      entry.style_snapshot?.id === style.id ||
      entry.style_name === style.name ||
      entry.style_snapshot?.name === style.name;
    if (!matched) return score;
    return (
      score +
      entry.quality_score * 4 +
      Math.min(entry.restore_count, 6) * 3 +
      (entry.pinned_for_style_memory ? 14 : 0)
    );
  }, 0);
}

export function recommendStyle(params: RecommendParams): StyleRecommendation | null {
  const cleanedInput = params.input.trim();
  if (!cleanedInput || !params.styles.length) return null;

  const tokens = tokenize(cleanedInput);
  const lowerInput = cleanedInput.toLowerCase();
  const isTechnical = /api|sdk|python|java|typescript|代码|编程|框架|部署|数据库|github|仓库|工程|模型|提示词|agent/i.test(cleanedInput);
  const isAcademic = /论文|研究|综述|实验|文献|method|abstract|benchmark|citation|study/i.test(cleanedInput);
  const isQuestion = /[？?]$/.test(cleanedInput) || /是什么|为什么|怎么|如何|能不能|值不值得/.test(cleanedInput);
  const longForm = cleanedInput.length >= 900;
  const socialIntent = /小红书|朋友圈|公众号|知乎|海报|封面|社媒|爆款|吸睛/.test(cleanedInput);
  const howToIntent = /怎么做|如何做|步骤|教程|指南|手册|部署|配置|排错|搭建/.test(cleanedInput);
  const speechIntent = /演讲|发言|致辞|开场白|答辩|路演/.test(cleanedInput);
  const interviewIntent = /访谈|采访|对谈|问答|q&a|qa|提问/.test(cleanedInput);
  const editorialIntent = /评论|社论|时评|观点|怎么看|值不值得|应不应该|该不该/.test(cleanedInput);
  const briefingIntent = /简报|高管|决策|周报|月报|一页纸|brief|memo|业务摘要/.test(cleanedInput);
  const documentaryIntent = /纪实|非虚构|现场|实录|口述|人物群像|时间线/.test(cleanedInput);
  const letterIntent = /公开信|书信|写给|致读者|致你|一封信/.test(cleanedInput);
  const podcastIntent = /播客|口播|串词|主持稿|节目稿|朗读/.test(cleanedInput);
  const debateIntent = /辩论|正方|反方|立论|驳论|该不该|值不值得/.test(cleanedInput);

  const ranked = params.styles
    .map((style) => {
      const corpusTokens = tokenize(buildStyleCorpus(style));
      const overlap = tokens.filter((token) => corpusTokens.includes(token)).length;
      const hintProfile = STYLE_HINTS[style.id];
      const matchedSignals: string[] = [];
      let score = overlap * 9;

      if (hintProfile) {
        const matchedKeywords = hintProfile.keywords.filter((keyword) => includesKeyword(lowerInput, keyword));
        if (matchedKeywords.length) {
          score += matchedKeywords.length * 14;
          matchedSignals.push(...hintProfile.boosts);
        }
      }

      if (params.mode === "discover") {
        if (style.id === "paper" && (isAcademic || isTechnical)) {
          score += 18;
          matchedSignals.push("当前是调研问题，更适合论文/研究报告结构");
        }
        if (style.id === "editorial" && editorialIntent) {
          score += 14;
          matchedSignals.push("问题带有明显观点判断诉求，更适合评论结构");
        }
        if (style.id === "science" && isQuestion) {
          score += 14;
          matchedSignals.push("提问式内容更适合科普解读");
        }
        if (style.id === "newspaper") score += 4;
      } else {
        if (style.id === "ppt" && /总结|汇报|方案|对比|复盘|提案/.test(cleanedInput)) {
          score += 16;
          matchedSignals.push("内容更像汇报/方案类输出");
        }
        if (style.id === "story" && /经历|人物|品牌故事|案例|复盘/.test(cleanedInput)) {
          score += 14;
          matchedSignals.push("素材适合用故事线组织");
        }
        if (style.id === "speech" && speechIntent) {
          score += 18;
          matchedSignals.push("内容更像现场表达或演讲稿");
        }
        if (style.id === "interview" && interviewIntent) {
          score += 18;
          matchedSignals.push("内容更适合问答或访谈式展开");
        }
        if (style.id === "documentary" && documentaryIntent) {
          score += 18;
          matchedSignals.push("内容更适合按事实脉络和现场线索推进");
        }
        if (style.id === "letter" && letterIntent) {
          score += 18;
          matchedSignals.push("内容更适合写成有对象感的书信表达");
        }
        if (style.id === "podcast" && podcastIntent) {
          score += 18;
          matchedSignals.push("内容更像口播或播客场景，适合更顺口的表达");
        }
        if (style.id === "debate" && debateIntent) {
          score += 18;
          matchedSignals.push("内容更适合立场鲜明、带攻防感的辩论结构");
        }
        if (style.id === "manual" && howToIntent) {
          score += 18;
          matchedSignals.push("内容更像教程/手册，适合按步骤组织");
        }
        if (style.id === "briefing" && briefingIntent) {
          score += 16;
          matchedSignals.push("需求更偏管理简报或决策摘要");
        }
        if (style.id === "editorial" && editorialIntent) {
          score += 14;
          matchedSignals.push("输入里有明显观点表达诉求");
        }
      }

      if (socialIntent && (style.id === "poster" || style.id === "snack" || style.id === "cheerful")) {
        score += 16;
        matchedSignals.push("存在明显社媒传播诉求");
      }

      if (longForm && (style.id === "book" || style.id === "paper")) {
        score += 12;
        matchedSignals.push("输入较长，更适合长阅读结构");
      }

      if (isTechnical && (style.id === "science" || style.id === "plain" || style.id === "paper")) {
        score += 10;
      }

      const memoryScore = scorePromptMemories(style, params.styleMemories);
      if (memoryScore > 0) {
        score += memoryScore;
        matchedSignals.push("已参考你近期接受过的风格记忆");
      }

      const preferenceScore = scoreRecentPreference(style, params.recentRuns);
      if (preferenceScore > 0) {
        score += preferenceScore;
        matchedSignals.push("近期记录里你更常复用这类风格");
      }

      return {
        styleId: style.id,
        name: style.name,
        score,
        matchedSignals,
      };
    })
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0];
  if (!winner || winner.score <= 0) return null;
  return {
    styleId: winner.styleId,
    score: winner.score,
    reason: winner.matchedSignals[0] || `已根据内容特征匹配到更合适的「${winner.name}」风格`,
  };
}

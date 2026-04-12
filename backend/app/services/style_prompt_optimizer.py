from __future__ import annotations

import json
import re

from app.core.errors import AppError
from app.core.schemas import (
    StyleCitationPolicy,
    StyleImageFocus,
    StyleLayoutFormat,
    StyleRecommendCandidate,
    StylePromptMemoryHint,
    StyleProfileSuggestion,
    StylePromptTarget,
    StyleTitlePolicy,
    StyleVisualMode,
)
from app.services.llm_service import LLMService


def _strip_code_fence(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


_TONE_KEYWORDS = [
    "克制",
    "直接",
    "理性",
    "严谨",
    "通俗",
    "专业",
    "有判断",
    "信息密度高",
    "简洁",
    "轻松",
    "有感染力",
    "适合朗读",
    "自然",
    "有立场",
    "务实",
    "雅致",
    "活泼",
    "可爱",
    "顺口",
    "耐心",
    "醒目",
]
_EMPHASIS_CANDIDATES = [
    ("关键事实", ["事实", "数据", "数字", "原理"]),
    ("行动建议", ["建议", "行动", "方案", "落地"]),
    ("风险提示", ["风险", "注意", "限制", "边界"]),
    ("证据来源", ["来源", "引用", "证据", "编号"]),
    ("结构拆解", ["拆解", "结构", "层次", "分节"]),
    ("对比判断", ["对比", "比较", "优缺点", "取舍"]),
]
_LAYOUT_LABELS = {
    StyleLayoutFormat.AUTO: "按内容自适应版式",
    StyleLayoutFormat.NEWSPAPER: "导语 + 分栏分析的报纸 / 特稿版式",
    StyleLayoutFormat.POSTER: "大标题 + 重点卡片的海报 / 长图版式",
    StyleLayoutFormat.BOOK: "章节分明、适合长阅读的书籍版式",
    StyleLayoutFormat.CLASSICAL: "题解、纲目、按语分明的书卷版式",
    StyleLayoutFormat.PPT: "一屏一重点、结论前置的汇报版式",
    StyleLayoutFormat.PAPER: "摘要、分析、结论清晰的研究报告版式",
    StyleLayoutFormat.POETRY: "保留分行、留白和节奏的诗歌版式",
}
_VISUAL_MODE_LABELS = {
    StyleVisualMode.AUTO: "只在确有必要时补充可视化",
    StyleVisualMode.ENHANCED: "优先考虑图表、流程图、统计卡或重点卡片",
    StyleVisualMode.MINIMAL: "只保留少量必要图示，不要喧宾夺主",
    StyleVisualMode.NONE: "纯正文表达，不额外加入图表或图解",
}
_FALLBACK_STYLE_GUIDANCE: dict[str, dict[str, object]] = {
    "poetry": {
        "display": "诗歌 / 抒情短章",
        "rewrite_flow": ["先确定题旨与意象", "再按分节推进情绪与画面", "最后用回响式收束完成余味"],
        "discover_flow": ["先给题旨判断", "再提炼最能支撑题旨的事实线索", "最后转写成有节奏的诗性正文"],
        "guardrails": ["不要先写 TL;DR 或报告腔标题", "保留分行、留白和节奏", "意象要服务原意，不要硬造深奥比喻"],
        "note": "诗歌风",
    },
    "classical": {
        "display": "题解 + 正文 + 按语的书卷式表达",
        "rewrite_flow": ["先交代题解或缘起", "再按纲目展开正文", "最后补按语或收束判断"],
        "discover_flow": ["先用题解说明判断", "再按纲目整理事实与依据", "最后写成带按语的书卷式成稿"],
        "guardrails": ["保留章法与书卷气，不要压平成现代简报", "措辞可古雅，但意思必须清楚", "不要为追求古风牺牲事实准确"],
        "note": "书卷风",
    },
    "interview": {
        "display": "问答稿 / 对谈节选",
        "rewrite_flow": ["先确定最关键的问题", "再按一问一答展开核心信息", "最后补追问或小结收束"],
        "discover_flow": ["先把研究结论改写成关键问答", "再补证据与追问", "最后整理成自然的访谈式成稿"],
        "guardrails": ["问题要真能承接读者关心点", "回答要完整，不要只剩口号", "必要时补一句过渡，避免机械问答"],
        "note": "访谈问答风",
    },
    "podcast": {
        "display": "口播稿 / 播客脚本",
        "rewrite_flow": ["先写顺口的开场引题", "再按主线自然展开", "最后用转场或提问收束"],
        "discover_flow": ["先提炼最适合口播的结论", "再串起事实、判断与转场", "最后整理成适合朗读的播客脚本"],
        "guardrails": ["句子要顺口、自然、可朗读", "允许短句和停顿感，但不要碎到失去信息量", "避免书面报告腔"],
        "note": "播客口播风",
    },
    "letter": {
        "display": "书信 / 公开信",
        "rewrite_flow": ["先明确写给谁和为什么写", "再展开主体内容", "最后用叮嘱、回应或致意收束"],
        "discover_flow": ["先明确对象和核心判断", "再把事实依据转成对对象说的话", "最后收束成完整书信"],
        "guardrails": ["保留对象感与称呼", "语气真诚，但不要空泛煽情", "重要事实和边界要说清楚"],
        "note": "书信风",
    },
    "debate": {
        "display": "辩论稿 / 攻防稿",
        "rewrite_flow": ["先亮出主张", "再排布论点和证据", "最后回应反方并收束立场"],
        "discover_flow": ["先给最终立场", "再整理正反依据和攻防点", "最后形成完整辩论稿"],
        "guardrails": ["论点要分明，证据要能支撑攻防", "必须回应主要反方观点", "不要把辩论稿写成普通说明文"],
        "note": "辩论风",
    },
    "documentary": {
        "display": "纪实稿 / 非虚构特写",
        "rewrite_flow": ["先从现场或关键节点切入", "再铺开事实脉络与人物背景", "最后收束到余波与判断"],
        "discover_flow": ["先给事实判断", "再整理时间线、人物线和证据", "最后转写成纪实正文"],
        "guardrails": ["只写来源能支撑的事实，不虚构场景", "现场感来自细节排序，不来自编造", "判断要建立在事实之后"],
        "note": "纪实风",
    },
    "speech": {
        "display": "演讲稿 / 发言稿",
        "rewrite_flow": ["先写开场定调", "再推进 2~4 个核心论点", "最后以号召或落点收束"],
        "discover_flow": ["先明确立场和听众收益", "再把证据组织成可讲的论点", "最后整理成适合朗读的发言稿"],
        "guardrails": ["要有现场表达感，句子适合朗读", "论点不宜过散", "结尾要有落点或号召"],
        "note": "演讲风",
    },
    "editorial": {
        "display": "评论 / 社论 / 时评",
        "rewrite_flow": ["先亮明判断", "再铺开事实依据与分析", "最后给出结论与建议"],
        "discover_flow": ["先给核心判断", "再整理支撑依据和争议点", "最后形成观点清楚的评论稿"],
        "guardrails": ["立场要明确，但论据不能空", "分析要能体现因果和取舍", "结论要给出判断而非重复事实"],
        "note": "评论风",
    },
    "briefing": {
        "display": "一页简报 / 决策摘要",
        "rewrite_flow": ["先给一句话结论", "再列关键判断、数据与风险", "最后落到建议动作"],
        "discover_flow": ["先回答决策问题", "再整理关键证据、风险与备选方案", "最后输出简报式正文"],
        "guardrails": ["结论前置，不能埋在后文", "风险与建议必须明确分开", "优先服务决策和执行"],
        "note": "简报风",
    },
    "manual": {
        "display": "教程 / 操作手册",
        "rewrite_flow": ["先说明目标与前置条件", "再按步骤推进", "最后补排错和注意事项"],
        "discover_flow": ["先给结论和适用范围", "再整理步骤、条件和风险", "最后形成可执行手册"],
        "guardrails": ["步骤顺序必须稳定", "前置条件和风险不能漏", "不要把教程写成纯概念说明"],
        "note": "教程手册风",
    },
    "science": {
        "display": "科普解读 / 原理说明",
        "rewrite_flow": ["先用一句话讲清核心结论", "再解释原理和常见问题", "最后提醒误区与边界"],
        "discover_flow": ["先回答问题本身", "再按原理、证据和误区整理", "最后转写成讲明白的科普稿"],
        "guardrails": ["先讲明白，再讲专业", "术语出现时要顺手解释", "误区提醒要和正文判断一致"],
        "note": "科普风",
    },
    "kids": {
        "display": "入门解释 / 初学者友好版",
        "rewrite_flow": ["先用最短的话讲清主题", "再分点解释关键概念", "最后用类比或例子帮助理解"],
        "discover_flow": ["先给最容易懂的结论", "再把证据翻译成低门槛解释", "最后整理成初学者友好正文"],
        "guardrails": ["默认读者基础较弱，避免术语堆叠", "可以类比，但类比不能跑偏", "保持耐心和解释性"],
        "note": "入门风",
    },
    "plain": {
        "display": "通俗直白版",
        "rewrite_flow": ["先讲结论", "再分点解释原因和例子", "最后补一句提醒或边界"],
        "discover_flow": ["先直接回答问题", "再把证据翻译成大白话", "最后补限制和建议"],
        "guardrails": ["少术语、少绕弯", "能讲人话就不要上报告腔", "直白不等于粗糙，信息要完整"],
        "note": "通俗风",
    },
    "playful": {
        "display": "轻快分享版",
        "rewrite_flow": ["先用亮眼开头抓住注意力", "再轻快展开重点", "最后用有记忆点的方式收束"],
        "discover_flow": ["先给最值得分享的结论", "再整理亮点和支撑信息", "最后形成轻快但不失真的成稿"],
        "guardrails": ["保持轻快，但不要牺牲事实", "允许更有分享感的表达", "避免过度玩梗导致信息模糊"],
        "note": "轻快风",
    },
    "snack": {
        "display": "速读卡 / 快扫版",
        "rewrite_flow": ["先给一句话结论", "再压缩成 3~5 个重点", "最后补行动建议或提醒"],
        "discover_flow": ["先回答最关键的问题", "再筛出少量最重要的证据和结论", "最后整理成可快扫的速读稿"],
        "guardrails": ["句子更短，重点更少", "优先保留最有决策价值的信息", "不要把快扫版写成长报告"],
        "note": "速读风",
    },
    "elegant": {
        "display": "文雅长文 / 雅致表达",
        "rewrite_flow": ["先以自然起笔铺垫主旨", "再分层展开内容", "最后留出收束余味"],
        "discover_flow": ["先明确主旨判断", "再把证据和分析写得从容有层次", "最后形成有余味的成稿"],
        "guardrails": ["修辞只服务内容，不要为华丽而华丽", "层次要清楚，不能只剩氛围", "保留节奏和收束感"],
        "note": "雅致风",
    },
    "newspaper": {
        "display": "导语 + 分栏分析的新闻特稿",
        "rewrite_flow": ["先写导语交代核心事实", "再按分栏拆解背景、影响和判断", "最后补结语"],
        "discover_flow": ["先给导语式结论", "再整理事实、背景和各方信息", "最后形成特稿式成稿"],
        "guardrails": ["导语必须能带出核心事实", "正文按栏目推进，不要散写", "语气克制，事实优先"],
        "note": "报纸特稿风",
    },
    "poster": {
        "display": "海报 / 长图 / 重点卡片",
        "rewrite_flow": ["先定大标题和一句话结论", "再拆成重点卡片", "最后补行动建议或说明"],
        "discover_flow": ["先回答核心问题", "再筛出最值得展示的数字和判断", "最后形成卡片化海报稿"],
        "guardrails": ["每段尽量短，适合扫读", "多用短标题和重点句", "重点卡片之间要避免重复"],
        "note": "海报风",
    },
    "book": {
        "display": "章节式长阅读",
        "rewrite_flow": ["先给章节摘要", "再按章节展开正文", "最后做章节收束"],
        "discover_flow": ["先给全书式总判断", "再按章节整理证据和分析", "最后形成完整长阅读稿"],
        "guardrails": ["结构要稳，章节边界要清楚", "允许展开，但不要失去主线", "每章都要有小结或落点"],
        "note": "书籍风",
    },
    "paper": {
        "display": "摘要 + 分析 + 结论的研究报告",
        "rewrite_flow": ["先给摘要或核心结论", "再按方法、证据和讨论展开", "最后补结论边界"],
        "discover_flow": ["先回答研究问题", "再整理证据、比较和边界", "最后形成研究报告式正文"],
        "guardrails": ["判断和建议尽量标注来源编号", "必须说明适用边界和不确定性", "避免情绪化表达"],
        "note": "研究报告风",
    },
    "story": {
        "display": "故事 / 叙事稿",
        "rewrite_flow": ["先搭好开场情境", "再推进冲突与转折", "最后落到启发或余味"],
        "discover_flow": ["先提炼最能承载结论的故事线", "再把事实嵌入冲突和转折", "最后形成完整叙事正文"],
        "guardrails": ["叙事不能改写事实", "不要用 TL;DR 打断故事节奏", "场景和人物必须有信息功能"],
        "note": "故事风",
    },
    "riddle": {
        "display": "谜面 + 线索 + 揭晓",
        "rewrite_flow": ["先设定谜面或悬念", "再逐步投放线索", "最后揭晓并解释"],
        "discover_flow": ["先确定最终要揭晓的判断", "再安排线索顺序", "最后整理成有悬念的成稿"],
        "guardrails": ["线索必须能支撑揭晓", "悬念要可回收", "不要一开始就把答案说破"],
        "note": "猜谜风",
    },
    "default": {
        "display": "结构清楚的中文成稿",
        "rewrite_flow": ["先提炼结论", "再分节展开关键内容", "最后补建议或提醒"],
        "discover_flow": ["先回答问题", "再整理关键证据和分析", "最后补建议与待确认点"],
        "guardrails": ["信息密度高、少空话", "保留关键事实和数字", "不确定就明确说明"],
        "note": "通用风格",
    },
}


def _extract_audience(prompt: str, target: StylePromptTarget) -> str:
    cleaned = prompt.strip()
    audience_patterns = [
        r"面向(?P<value>[^，。\n]{2,24})",
        r"给(?P<value>[^，。\n]{2,24})看",
        r"适合(?P<value>[^，。\n]{2,24})(?:阅读|查看|理解)",
    ]
    for pattern in audience_patterns:
        match = re.search(pattern, cleaned)
        if match:
            return match.group("value").strip("：:，,。 ")
    lowered = cleaned.lower()
    if "公众号" in cleaned:
        return "公众号读者"
    if "产品经理" in cleaned:
        return "产品经理"
    if "开发者" in cleaned or "工程师" in cleaned:
        return "开发者"
    if "中学生" in cleaned:
        return "中学生"
    if any(keyword in cleaned for keyword in ["初学者", "入门", "小白"]):
        return "初学者"
    if any(keyword in cleaned for keyword in ["管理层", "高管", "决策者"]):
        return "管理层 / 决策者"
    if any(keyword in cleaned for keyword in ["大众", "普通读者"]):
        return "大众读者"
    return "研究决策者" if target is StylePromptTarget.DISCOVER else ""


def _extract_tone(prompt: str, target: StylePromptTarget) -> str:
    picked = [keyword for keyword in _TONE_KEYWORDS if keyword in prompt]
    if picked:
        return "、".join(picked[:4])
    return "严谨、判断明确、信息密度高" if target is StylePromptTarget.DISCOVER else "清晰、克制、信息密度高"


def _extract_structure(prompt: str, target: StylePromptTarget) -> str:
    cleaned = prompt.strip()
    if any(keyword in cleaned for keyword in ["纪实", "非虚构", "口述", "现场", "实录", "时间线"]):
        return "现场切入 -> 事实脉络 -> 人物/背景 -> 余波与判断"
    if any(keyword in cleaned for keyword in ["书信", "公开信", "来信", "写给", "致读者", "信件"]):
        return "称呼与缘起 -> 主体展开 -> 重点叮嘱 -> 收束致意"
    if any(keyword in cleaned for keyword in ["播客", "口播", "节目稿", "主持稿", "串词", "朗读"]):
        return "开场引题 -> 主线展开 -> 转折补充 -> 收束与提问"
    if any(keyword in cleaned for keyword in ["辩论", "正方", "反方", "立论", "驳论", "攻防"]):
        return "主张 -> 论点一二三 -> 反方回应 -> 结论收束"
    if any(keyword in cleaned for keyword in ["演讲", "发言", "致辞", "答辩", "开场白"]):
        return "开场定调 -> 2~4 个核心论点 -> 例证/转折 -> 收束号召"
    if any(keyword in cleaned for keyword in ["访谈", "问答", "采访", "对谈", "Q&A", "qa"]):
        return "引题 -> 问题 -> 回答 -> 追问 -> 小结"
    if any(keyword in cleaned for keyword in ["教程", "指南", "手册", "步骤", "排错", "配置", "部署"]):
        return "目标 -> 前置条件 -> 步骤 -> 排错 -> 总结"
    if any(keyword in cleaned for keyword in ["科普", "原理", "误区", "讲明白", "怎么回事", "常见问题"]):
        return "一句话概括 -> 常见问题 -> 原理解释 -> 误区提醒"
    if any(keyword in cleaned for keyword in ["中学生", "初学者", "入门", "启蒙", "小白", "儿童友好"]):
        return "5 句话讲清主题 -> 要点列表 -> 生活化类比"
    if any(keyword in cleaned for keyword in ["通俗", "大白话", "易懂", "口语化", "简单说", "讲人话"]):
        return "先讲结论 -> 分点解释 -> 最后提醒"
    if any(keyword in cleaned for keyword in ["幽默", "欢乐", "轻松", "有趣", "可爱", "童趣", "分享欲"]):
        return "亮眼开头 -> 重点展开 -> 轻快收束"
    if any(keyword in cleaned for keyword in ["快餐", "速读", "碎片", "一分钟", "重点速看"]):
        return "一句话结论 -> 3~5 个重点 -> 行动建议"
    if any(keyword in cleaned for keyword in ["文雅", "雅致", "高级感", "典雅", "修辞", "余味"]):
        return "起笔铺垫 -> 分层展开 -> 收束余味"
    if any(keyword in cleaned for keyword in ["报纸", "专栏", "新闻", "头版", "特稿"]):
        return "导语 -> 核心事实 -> 分栏分析 -> 结语"
    if any(keyword in cleaned for keyword in ["海报", "长图", "封面", "卡片", "重点卡"]):
        return "大标题 -> 一句话结论 -> 重点卡片 -> 行动建议"
    if any(keyword in cleaned for keyword in ["书籍", "章节", "长阅读", "系统梳理", "书稿"]):
        return "章节摘要 -> 分节正文 -> 章节总结"
    if any(keyword in cleaned for keyword in ["评论", "社论", "时评", "立场", "观点"]):
        return "观点 -> 事实依据 -> 分析推进 -> 结论与建议"
    if any(keyword in cleaned for keyword in ["简报", "高管", "决策", "周报", "月报", "一页纸", "memo", "brief"]):
        return "一句话结论 -> 关键数据 -> 核心判断 -> 风险与建议"
    if "TL;DR" in cleaned or "tl;dr" in cleaned.lower():
        if "步骤" in cleaned or "落地" in cleaned:
            return "TL;DR -> 分节拆解 -> 落地步骤 -> 风险提示"
        return "TL;DR -> 分节拆解 -> 总结"
    if "问答" in cleaned:
        return "问题 -> 回答 -> 证据 -> 建议"
    if "对比" in cleaned or "优缺点" in cleaned:
        return "背景 -> 对比维度 -> 结论 -> 适用边界"
    if "步骤" in cleaned or "清单" in cleaned:
        return "背景 -> 步骤清单 -> 注意事项"
    return "结论 / TL;DR -> 要点拆解 -> 推荐方案 -> 风险与注意事项" if target is StylePromptTarget.DISCOVER else "TL;DR -> 分节解析 -> 结尾建议"


def _extract_emphasis_points(prompt: str, target: StylePromptTarget) -> list[str]:
    picked: list[str] = []
    for label, keywords in _EMPHASIS_CANDIDATES:
        if any(keyword in prompt for keyword in keywords):
            picked.append(label)
    if target is StylePromptTarget.DISCOVER and "证据来源" not in picked:
        picked.append("证据来源")
    if not picked:
        picked = ["关键事实", "结构拆解", "行动建议"] if target is StylePromptTarget.REWRITE else ["关键事实", "证据来源", "行动建议"]
    return picked[:4]


def _infer_citation_policy(prompt: str, target: StylePromptTarget) -> StyleCitationPolicy:
    cleaned = prompt.lower()
    if any(keyword in prompt for keyword in ["严格引用", "标注来源", "注明来源", "带编号"]):
        return StyleCitationPolicy.STRICT
    if any(keyword in prompt for keyword in ["不引用", "不要引用", "不主动引用"]):
        return StyleCitationPolicy.NONE
    if any(keyword in prompt for keyword in ["关键处引用", "必要时引用", "少量引用"]):
        return StyleCitationPolicy.MINIMAL
    return StyleCitationPolicy.MINIMAL if target is StylePromptTarget.DISCOVER else StyleCitationPolicy.AUTO


def _infer_title_policy(prompt: str) -> StyleTitlePolicy:
    if any(keyword in prompt for keyword in ["张力", "抓人", "更有传播性", "吸引点击"]):
        return StyleTitlePolicy.PUNCHY
    if any(keyword in prompt for keyword in ["重写标题", "改标题", "重新拟题"]):
        return StyleTitlePolicy.REWRITE
    return StyleTitlePolicy.RETAIN


def _infer_image_focus(prompt: str) -> StyleImageFocus:
    if any(keyword in prompt for keyword in ["图解", "结构图", "概念图", "流程图"]):
        return StyleImageFocus.DIAGRAM
    if any(keyword in prompt for keyword in ["故事感", "叙事", "场景感", "人物感"]):
        return StyleImageFocus.NARRATIVE
    if any(keyword in prompt.lower() for keyword in ["editorial", "杂志", "封面", "海报"]):
        return StyleImageFocus.EDITORIAL
    return StyleImageFocus.AUTO


def _infer_layout_format(prompt: str) -> StyleLayoutFormat:
    lowered = prompt.lower()
    if any(keyword in prompt for keyword in ["报纸", "专栏", "新闻稿", "头版"]):
        return StyleLayoutFormat.NEWSPAPER
    if any(keyword in prompt for keyword in ["海报", "长图", "poster", "封面式"]):
        return StyleLayoutFormat.POSTER
    if any(keyword in prompt for keyword in ["书籍", "章节", "chapter", "书稿"]):
        return StyleLayoutFormat.BOOK
    if any(keyword in prompt for keyword in ["古文", "古籍", "书卷", "线装", "章回", "文言"]):
        return StyleLayoutFormat.CLASSICAL
    if any(keyword in prompt for keyword in ["ppt", "演示稿", "幻灯片", "汇报页", "slides"]) or "slide" in lowered:
        return StyleLayoutFormat.PPT
    if any(keyword in prompt for keyword in ["论文", "研究报告", "摘要", "abstract", "method", "结论与讨论"]) or "paper" in lowered:
        return StyleLayoutFormat.PAPER
    if any(keyword in prompt for keyword in ["诗歌", "诗意", "短诗", "组诗", "抒情诗"]) or "poem" in lowered:
        return StyleLayoutFormat.POETRY
    if "newspaper" in lowered:
        return StyleLayoutFormat.NEWSPAPER
    return StyleLayoutFormat.AUTO


def _infer_visual_mode(prompt: str) -> StyleVisualMode:
    lowered = prompt.lower()
    if any(keyword in prompt for keyword in ["纯正文", "不要图表", "不需要图表", "不要流程图"]):
        return StyleVisualMode.NONE
    if any(keyword in prompt for keyword in ["海报", "长图", "重点卡片", "封面式"]):
        return StyleVisualMode.ENHANCED
    if any(keyword in prompt for keyword in ["图表", "统计图", "流程图", "关系图", "可视化", "统计卡", "流程卡"]) or "chart" in lowered:
        return StyleVisualMode.ENHANCED
    if any(keyword in prompt for keyword in ["必要时图解", "少量图解", "适当图示"]):
        return StyleVisualMode.MINIMAL
    return StyleVisualMode.AUTO


def _build_profile_suggestion(prompt: str, target: StylePromptTarget) -> StyleProfileSuggestion:
    return StyleProfileSuggestion(
        audience=_extract_audience(prompt, target),
        tone=_extract_tone(prompt, target),
        structure_template=_extract_structure(prompt, target),
        emphasis_points=_extract_emphasis_points(prompt, target),
        citation_policy=_infer_citation_policy(prompt, target),
        title_policy=_infer_title_policy(prompt),
        image_focus=_infer_image_focus(prompt),
        layout_format=_infer_layout_format(prompt),
        visual_mode=_infer_visual_mode(prompt),
    )


def _detect_style_family(prompt: str, target: StylePromptTarget) -> str:
    cleaned = prompt.strip().lower()
    profile = _build_profile_suggestion(prompt, target)
    if any(keyword in cleaned for keyword in ["诗歌", "诗意", "短诗", "组诗", "poem"]):
        return "poetry"
    if any(keyword in cleaned for keyword in ["古文", "古籍", "文言", "章回", "书卷"]):
        return "classical"
    if any(keyword in cleaned for keyword in ["访谈", "采访", "对谈", "问答", "q&a", "qa"]):
        return "interview"
    if any(keyword in cleaned for keyword in ["播客", "口播", "主持稿", "串词", "节目稿"]):
        return "podcast"
    if any(keyword in cleaned for keyword in ["书信", "公开信", "写给", "致读者", "信件"]):
        return "letter"
    if any(keyword in cleaned for keyword in ["辩论", "正方", "反方", "立论", "驳论"]):
        return "debate"
    if any(keyword in cleaned for keyword in ["纪实", "非虚构", "现场", "实录", "口述"]):
        return "documentary"
    if any(keyword in cleaned for keyword in ["演讲", "发言", "致辞", "答辩", "路演", "开场白"]):
        return "speech"
    if any(keyword in cleaned for keyword in ["评论", "社论", "时评", "观点", "立场"]):
        return "editorial"
    if any(keyword in cleaned for keyword in ["海报", "长图", "封面", "重点卡片", "卡片"]):
        return "poster"
    if any(keyword in cleaned for keyword in ["新闻", "专栏", "报纸", "头版", "特稿", "述评"]):
        return "newspaper"
    if any(keyword in cleaned for keyword in ["书籍", "章节", "长阅读", "系统梳理", "书稿"]):
        return "book"
    if any(keyword in cleaned for keyword in ["简报", "高管", "决策", "周报", "月报", "一页纸", "memo", "brief"]):
        return "briefing"
    if any(keyword in cleaned for keyword in ["教程", "手册", "指南", "步骤", "排错", "配置", "部署"]):
        return "manual"
    if any(keyword in cleaned for keyword in ["科普", "原理", "误区", "讲明白", "怎么回事", "常见问题"]):
        return "science"
    if any(keyword in cleaned for keyword in ["中学生", "初学者", "入门", "启蒙", "小白", "讲给孩子"]):
        return "kids"
    if any(keyword in cleaned for keyword in ["通俗", "大白话", "易懂", "口语化", "简单说", "讲人话"]):
        return "plain"
    if any(keyword in cleaned for keyword in ["幽默", "欢乐", "轻松", "有趣", "可爱", "童趣", "分享欲"]):
        return "playful"
    if any(keyword in cleaned for keyword in ["快餐", "速读", "速览", "一分钟", "碎片", "重点速看"]):
        return "snack"
    if any(keyword in cleaned for keyword in ["文雅", "雅致", "高级感", "典雅", "修辞", "余味"]):
        return "elegant"
    if any(keyword in cleaned for keyword in ["故事", "叙事", "场景", "人物", "经历", "案例"]) and not any(
        keyword in cleaned for keyword in ["纪实", "非虚构"]
    ):
        return "story"
    if any(keyword in cleaned for keyword in ["猜谜", "谜语", "悬念", "谜面", "揭晓"]):
        return "riddle"
    if profile.layout_format == StyleLayoutFormat.PAPER:
        return "paper"
    if profile.layout_format == StyleLayoutFormat.POETRY:
        return "poetry"
    if profile.layout_format == StyleLayoutFormat.CLASSICAL:
        return "classical"
    if profile.layout_format == StyleLayoutFormat.NEWSPAPER:
        return "newspaper"
    if profile.layout_format == StyleLayoutFormat.POSTER:
        return "poster"
    if profile.layout_format == StyleLayoutFormat.BOOK:
        return "book"
    if profile.layout_format == StyleLayoutFormat.PPT:
        return "briefing"
    return "default"


def _citation_requirement(policy: StyleCitationPolicy, target: StylePromptTarget) -> str:
    if policy == StyleCitationPolicy.STRICT:
        return "关键判断、数据、建议和引用处尽量标注来源编号。"
    if policy == StyleCitationPolicy.MINIMAL:
        return "在关键判断、争议点或数据处补充必要来源编号。"
    if policy == StyleCitationPolicy.NONE:
        return "不主动铺陈引用格式，但不要伪造来源。"
    return "如出现关键事实、数据或判断，优先在关键处补充来源编号。" if target is StylePromptTarget.DISCOVER else "必要时保留关键来源信息，但不要为了引用破坏行文。"


def _numbered_lines(items: list[str]) -> str:
    return "\n".join(f"{index}) {item}" for index, item in enumerate(items, start=1))


def _normalize_profile_suggestion(payload: object, prompt: str, target: StylePromptTarget) -> StyleProfileSuggestion:
    fallback = _build_profile_suggestion(prompt, target)
    if not isinstance(payload, dict):
        return fallback
    cleaned_points = payload.get("emphasis_points")
    emphasis_points = (
        [str(item).strip() for item in cleaned_points if str(item).strip()][:6]
        if isinstance(cleaned_points, list)
        else fallback.emphasis_points
    )
    citation_policy = payload.get("citation_policy")
    title_policy = payload.get("title_policy")
    image_focus = payload.get("image_focus")
    layout_format = payload.get("layout_format")
    visual_mode = payload.get("visual_mode")
    return StyleProfileSuggestion(
        audience=str(payload.get("audience") or "").strip() or fallback.audience,
        tone=str(payload.get("tone") or "").strip() or fallback.tone,
        structure_template=str(payload.get("structure_template") or "").strip() or fallback.structure_template,
        emphasis_points=emphasis_points,
        citation_policy=(
            citation_policy
            if citation_policy in {policy.value for policy in StyleCitationPolicy}
            else fallback.citation_policy
        ),
        title_policy=(
            title_policy
            if title_policy in {policy.value for policy in StyleTitlePolicy}
            else fallback.title_policy
        ),
        image_focus=(
            image_focus
            if image_focus in {policy.value for policy in StyleImageFocus}
            else fallback.image_focus
        ),
        layout_format=(
            layout_format
            if layout_format in {policy.value for policy in StyleLayoutFormat}
            else fallback.layout_format
        ),
        visual_mode=(
            visual_mode
            if visual_mode in {policy.value for policy in StyleVisualMode}
            else fallback.visual_mode
        ),
    )


def _fallback_optimize(prompt: str, target: StylePromptTarget) -> tuple[str, list[str], StyleProfileSuggestion]:
    base = prompt.strip()
    family = _detect_style_family(base, target)
    guidance = _FALLBACK_STYLE_GUIDANCE.get(family, _FALLBACK_STYLE_GUIDANCE["default"])
    profile = _build_profile_suggestion(base, target)
    flow_key = "discover_flow" if target is StylePromptTarget.DISCOVER else "rewrite_flow"
    flow_steps = list(guidance.get(flow_key, _FALLBACK_STYLE_GUIDANCE["default"][flow_key]))
    guardrails = list(guidance.get("guardrails", _FALLBACK_STYLE_GUIDANCE["default"]["guardrails"]))
    display_form = str(guidance.get("display") or "结构清楚的中文成稿")
    note_label = str(guidance.get("note") or "当前风格")
    emphasis = "、".join(profile.emphasis_points) or "关键事实、结构拆解、行动建议"
    audience = profile.audience or ("研究决策者" if target is StylePromptTarget.DISCOVER else "当前任务读者")
    tone = profile.tone or ("严谨、判断明确、信息密度高" if target is StylePromptTarget.DISCOVER else "清晰、克制、信息密度高")
    layout = _LAYOUT_LABELS.get(profile.layout_format, "按内容自适应版式")
    visual = _VISUAL_MODE_LABELS.get(profile.visual_mode, "只在必要时补充可视化")
    citation = _citation_requirement(profile.citation_policy, target)

    if target is StylePromptTarget.DISCOVER:
        optimized = (
            f"请以中文输出一份{note_label}调研成稿，最终展示形式优先采用：{display_form}。\n"
            "请按以下流程组织最终结果：\n"
            f"{_numbered_lines(flow_steps)}\n"
            "硬性要求：\n"
            f"- 推荐结构：{profile.structure_template}\n"
            f"- 目标受众：{audience}\n"
            f"- 语气要求：{tone}\n"
            f"- 输出重点：{emphasis}\n"
            f"- 版式策略：{layout}\n"
            f"- 可视化策略：{visual}\n"
            f"- 引用策略：{citation}\n"
            "- 必须明确区分：结论、依据、风险/不确定性、建议动作。\n"
            "- 不确定的信息要明确写出信息不足，不要硬下判断。\n"
            "- 最终正文应直接可读，不要暴露内部推理过程。\n"
            f"- 风格守则：{'；'.join(guardrails)}\n\n"
            f"在以上要求基础上，额外风格要求：{base}"
        )
        return optimized, [f"已按{note_label}补齐调研流程、推荐结构与展示形式约束。"], _build_profile_suggestion(optimized, target)

    optimized = (
        f"请把原文改写为{note_label}中文成稿，最终展示形式优先采用：{display_form}。\n"
        "请按以下流程组织输出：\n"
        f"{_numbered_lines(flow_steps)}\n"
        "硬性要求：\n"
        f"- 推荐结构：{profile.structure_template}\n"
        f"- 目标受众：{audience}\n"
        f"- 语气要求：{tone}\n"
        f"- 输出重点：{emphasis}\n"
        f"- 版式策略：{layout}\n"
        f"- 可视化策略：{visual}\n"
        f"- 引用策略：{citation}\n"
        "- 不编造原文没有的信息；保留关键事实、数字、人名、因果与结论。\n"
        "- 不确定或原文未交代之处，要明确写“原文未说明”或“信息不足”。\n"
        "- Markdown 排版，必要时使用小标题、列表、短段，不要空话与重复。\n"
        f"- 风格守则：{'；'.join(guardrails)}\n\n"
        f"在以上要求基础上，额外风格要求：{base}"
    )
    return optimized, [f"已按{note_label}补齐改写流程、推荐结构与展示形式约束。"], _build_profile_suggestion(optimized, target)


def _render_profile_suggestion(profile: StyleProfileSuggestion | None) -> str:
    if profile is None:
        return "无"
    lines = [
        f"- audience: {profile.audience or '无'}",
        f"- tone: {profile.tone or '无'}",
        f"- structure_template: {profile.structure_template or '无'}",
        f"- emphasis_points: {'；'.join(profile.emphasis_points) or '无'}",
        f"- citation_policy: {profile.citation_policy.value}",
        f"- title_policy: {profile.title_policy.value}",
        f"- image_focus: {profile.image_focus.value}",
        f"- layout_format: {profile.layout_format.value}",
        f"- visual_mode: {profile.visual_mode.value}",
    ]
    return "\n".join(lines)


def _render_memory_hints(memory_hints: list[StylePromptMemoryHint]) -> str:
    if not memory_hints:
        return "无"
    blocks: list[str] = []
    for index, item in enumerate(memory_hints[:3], start=1):
        blocks.append(
            "\n".join(
                [
                    f"记忆 {index}：",
                    f"- source_style_name: {item.source_style_name or '无'}",
                    f"- prompt_excerpt: {item.prompt_excerpt or '无'}",
                    f"- optimized_prompt: {item.optimized_prompt or '无'}",
                    f"- usage_count: {item.usage_count}",
                    f"- accepted_at: {item.accepted_at.isoformat() if item.accepted_at else '无'}",
                    _render_profile_suggestion(item.profile_suggestion),
                ]
            )
        )
    return "\n\n".join(blocks)


def _render_style_candidates(styles: list[StyleRecommendCandidate]) -> str:
    blocks: list[str] = []
    for index, style in enumerate(styles, start=1):
        emphasis = "、".join(style.emphasis_points[:4]) if style.emphasis_points else "无"
        blocks.append(
            "\n".join(
                [
                    f"候选 {index}：",
                    f"- id: {style.id}",
                    f"- name: {style.name}",
                    f"- prompt: {style.prompt or '无'}",
                    f"- audience: {style.audience or '无'}",
                    f"- tone: {style.tone or '无'}",
                    f"- structure_template: {style.structure_template or '无'}",
                    f"- emphasis_points: {emphasis}",
                    f"- layout_format: {style.layout_format.value}",
                    f"- visual_mode: {style.visual_mode.value}",
                ]
            )
        )
    return "\n\n".join(blocks)


def _normalize_recommend_candidates(
    payload: object,
    style_ids: set[str],
    limit: int,
) -> list[tuple[str, str, float | None]]:
    if not isinstance(payload, list):
        return []

    candidates: list[tuple[str, str, float | None]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        style_id = str(item.get("style_id") or "").strip()
        if not style_id or style_id not in style_ids:
            continue
        reason = str(item.get("reason") or "").strip()
        confidence_value = item.get("confidence")
        confidence = None
        if isinstance(confidence_value, (int, float)):
            confidence = max(0.0, min(float(confidence_value), 1.0))
        if any(existing_style_id == style_id for existing_style_id, _, _ in candidates):
            continue
        candidates.append((style_id, reason, confidence))
        if len(candidates) >= limit:
            break
    return candidates


def _normalize_preview_items(
    payload: object,
    style_ids: set[str],
    limit: int,
) -> list[tuple[str, str, list[str]]]:
    if not isinstance(payload, list):
        return []

    previews: list[tuple[str, str, list[str]]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        style_id = str(item.get("style_id") or "").strip()
        if not style_id or style_id not in style_ids:
            continue
        preview_text = str(item.get("preview_text") or "").strip()
        if not preview_text:
            continue
        focus_points_raw = item.get("focus_points")
        focus_points = (
            [str(point).strip() for point in focus_points_raw if str(point).strip()][:3]
            if isinstance(focus_points_raw, list)
            else []
        )
        if any(existing_style_id == style_id for existing_style_id, _, _ in previews):
            continue
        previews.append((style_id, preview_text, focus_points))
        if len(previews) >= limit:
            break
    return previews


class StylePromptOptimizerService:
    def __init__(self) -> None:
        self.llm_service = LLMService()

    async def optimize(
        self,
        prompt: str,
        target: StylePromptTarget,
        llm_config,
        current_profile: StyleProfileSuggestion | None = None,
        memory_hints: list[StylePromptMemoryHint] | None = None,
    ) -> tuple[str, list[str], StyleProfileSuggestion]:
        raw_prompt = prompt.strip()
        if not raw_prompt:
            raise AppError(
                code="empty_prompt",
                message="提示词不能为空。",
                suggestion="请先输入风格指令后再优化。",
                status_code=422,
            )

        messages = [
            {
                "role": "system",
                "content": (
                    "你是资深提示词工程师。你的目标是把用户的风格要求改写为更稳定、可复用的提示词模板。"
                    "请输出 JSON：{ \"optimized_prompt\": \"...\", \"notes\": [\"...\"], \"profile_suggestion\": { ... } }。"
                    "optimized_prompt 必须可直接用于后续生成，不要输出无关解释。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"目标场景：{target.value}\n\n"
                    "用户原始风格要求如下：\n"
                    f"{raw_prompt}\n\n"
                    "请优化：\n"
                    "- 更风格稳定（避免漂移）\n"
                    "- 兼顾主题与细节（信息密度高，但不堆砌）\n"
                    "- 明确输出结构、格式与硬性约束（事实准确、少空话）\n"
                    "- 明确“生成流程”：先怎么组织、再怎么展开、最后如何收束\n"
                    "- 明确“结果展示形式”：问答、步骤、章节、卡片、导语+分栏、朗读稿等要写清楚\n"
                    "- 若用户要求演讲稿、访谈问答、教程手册、商业简报、评论社论等风格，要把结构和语气约束明确写进 optimized_prompt\n"
                    "- 如用户需要报纸、海报、书籍、古文书卷、PPT、论文、诗歌等版式，需提炼到 layout_format\n"
                    "- 如用户需要统计图、图表、流程图、信息图等内容辅助，需提炼到 visual_mode\n"
                    "- 避免过长（建议 140~260 字），但不能因为压缩而丢掉流程、结构和展示形式要求\n"
                    "- 同时抽取结构化风格建议 profile_suggestion，字段包括："
                    "audience, tone, structure_template, emphasis_points, citation_policy, title_policy, image_focus, layout_format, visual_mode\n"
                    "- citation_policy 只能是 auto/strict/minimal/none\n"
                    "- title_policy 只能是 retain/rewrite/punchy\n"
                    "- image_focus 只能是 auto/narrative/diagram/editorial\n"
                    "- layout_format 只能是 auto/newspaper/poster/book/classical/ppt/paper/poetry\n"
                    "- visual_mode 只能是 auto/enhanced/minimal/none\n"
                    "当前已存在的结构化风格：\n"
                    f"{_render_profile_suggestion(current_profile)}\n\n"
                    "以下是本地已接受的历史风格记忆，可在一致时复用，不一致时以本次用户要求为准：\n"
                    f"{_render_memory_hints(memory_hints or [])}\n"
                ),
            },
        ]

        try:
            raw = await self.llm_service.rewrite(messages, llm_config)
        except Exception:
            return _fallback_optimize(raw_prompt, target)

        cleaned = _strip_code_fence(raw)
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and isinstance(parsed.get("optimized_prompt"), str):
                optimized = parsed["optimized_prompt"].strip()
                notes = parsed.get("notes")
                if not optimized:
                    return _fallback_optimize(raw_prompt, target)
                if isinstance(notes, list):
                    note_list = [str(item).strip() for item in notes if str(item).strip()]
                else:
                    note_list = []
                profile_suggestion = _normalize_profile_suggestion(
                    parsed.get("profile_suggestion"),
                    optimized or raw_prompt,
                    target,
                )
                return optimized, note_list[:8], profile_suggestion
        except Exception:
            pass

        # fallback: treat full text as prompt
        optimized_text = cleaned.strip()
        if not optimized_text:
            return _fallback_optimize(raw_prompt, target)
        return (
            optimized_text,
            ["优化输出未返回 JSON，已按纯文本提示词使用。"],
            _build_profile_suggestion(optimized_text, target),
        )

    async def recommend(
        self,
        input_text: str,
        target: StylePromptTarget,
        llm_config,
        styles: list[StyleRecommendCandidate],
        top_k: int = 3,
    ) -> tuple[str | None, str, float | None, list[tuple[str, str, float | None]]]:
        cleaned_input = input_text.strip()
        if not cleaned_input or not styles:
            return None, "", None, []

        style_ids = {item.id for item in styles}
        candidate_limit = max(1, min(int(top_k or 1), 5))
        messages = [
            {
                "role": "system",
                "content": (
                    "你是中文内容风格策划。"
                    "你的任务是根据用户当前输入内容和目标场景，在给定风格卡片中选出最匹配的一张。"
                    "只允许从候选风格中选择，不要发明新的 style_id。"
                    "输出必须是 JSON："
                    '{ "style_id": "候选id或null", "reason": "一句中文理由", "confidence": 0.0, '
                    '"candidates": [{"style_id":"候选id","reason":"一句中文理由","confidence":0.0}] }。'
                    "candidates 需按匹配度从高到低排序，只返回给定候选里的风格。"
                    "reason 需说明为什么这个风格更适合当前输入。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"目标场景：{target.value}\n\n"
                    f"用户当前输入：\n{cleaned_input}\n\n"
                    "可选风格如下：\n"
                    f"{_render_style_candidates(styles)}\n\n"
                    f"请返回最匹配的 style_id，并额外返回前 {candidate_limit} 个最接近的候选 candidates。"
                    "若没有明显合适的，也要从最接近的候选里选一个。"
                ),
            },
        ]

        try:
            raw = await self.llm_service.rewrite(messages, llm_config)
        except Exception:
            return None, "", None, []

        cleaned = _strip_code_fence(raw)
        try:
            parsed = json.loads(cleaned)
        except Exception:
            return None, "", None, []

        if not isinstance(parsed, dict):
            return None, "", None, []
        style_id = parsed.get("style_id")
        if style_id is not None:
            style_id = str(style_id).strip()
        if not style_id or style_id not in style_ids:
            return None, "", None, []

        reason = str(parsed.get("reason") or "").strip()
        confidence_value = parsed.get("confidence")
        confidence = None
        if isinstance(confidence_value, (int, float)):
            confidence = max(0.0, min(float(confidence_value), 1.0))
        candidates = _normalize_recommend_candidates(parsed.get("candidates"), style_ids, candidate_limit)
        if not candidates:
            candidates = [(style_id, reason, confidence)]
        return style_id, reason, confidence, candidates

    async def preview(
        self,
        input_text: str,
        target: StylePromptTarget,
        llm_config,
        styles: list[StyleRecommendCandidate],
        style_ids: list[str] | None = None,
        max_items: int = 3,
    ) -> list[tuple[str, str, list[str]]]:
        cleaned_input = input_text.strip()
        if not cleaned_input or not styles:
            return []

        style_map = {item.id: item for item in styles}
        requested_ids = [item for item in (style_ids or []) if item in style_map]
        if not requested_ids:
            requested_ids = [item.id for item in styles[: max(1, min(max_items, 4))]]
        preview_limit = max(1, min(int(max_items or 1), 4, len(requested_ids)))
        requested_styles = [style_map[item_id] for item_id in requested_ids[:preview_limit]]
        requested_id_set = {item.id for item in requested_styles}

        messages = [
            {
                "role": "system",
                "content": (
                    "你是中文写作风格导演。"
                    "你的任务是针对同一份输入，为多个候选风格各生成一个真实可读的开头预演。"
                    "只允许使用给定候选里的 style_id。"
                    "输出必须是 JSON："
                    '{ "previews": [{"style_id":"候选id","preview_text":"80~180字中文示例","focus_points":["点1","点2"]}] }。'
                    "preview_text 必须像最终成稿的开头，而不是解释。"
                    "focus_points 需概括这一风格开头优先突出的 2~3 个重点。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"目标场景：{target.value}\n\n"
                    f"用户当前输入：\n{cleaned_input}\n\n"
                    "请只针对以下候选风格生成预演：\n"
                    f"{_render_style_candidates(requested_styles)}\n\n"
                    "要求：\n"
                    "- 每个 preview_text 都必须体现该风格的语气、结构和展示形式差异\n"
                    "- rewrite 场景更像最终成稿开头；discover 场景更像研究简报或报告开头\n"
                    "- 不要复制相同句式；不同风格之间必须能看出差别\n"
                    "- 不要杜撰超出用户输入的具体事实；如输入信息不足，可用克制但真实的方式开头\n"
                    f"- 最多返回 {preview_limit} 个 previews\n"
                ),
            },
        ]

        try:
            raw = await self.llm_service.rewrite(messages, llm_config)
        except Exception:
            return []

        cleaned = _strip_code_fence(raw)
        try:
            parsed = json.loads(cleaned)
        except Exception:
            return []

        if not isinstance(parsed, dict):
            return []

        return _normalize_preview_items(parsed.get("previews"), requested_id_set, preview_limit)

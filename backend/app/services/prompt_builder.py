import json
import re

from app.core.schemas import (
    DiscoverBrief,
    DiscoverEvidenceItem,
    ImageConfig,
    SearchSource,
    SourceContent,
    StyleImageFocus,
    StyleLayoutFormat,
    StyleProfile,
    StyleVisualMode,
)


STYLE_VARIABLE_PATTERN = re.compile(r"\{([a-zA-Z0-9_]+)\}")

PRETEXT_GUIDE = (
    "如确有必要，可在 Markdown 中插入 pretext 可视化代码块。\n"
    "允许的代码块只有三种：\n"
    "1) ```pretext stats 后接 JSON：{\"items\":[{\"label\":\"指标\",\"value\":\"12\",\"note\":\"说明\"}]}\n"
    "2) ```pretext chart 后接 JSON：{\"title\":\"标题\",\"unit\":\"分\",\"items\":[{\"label\":\"官方资料\",\"value\":9.5,\"note\":\"高可信\"}]}\n"
    "3) ```pretext flow 后接 JSON：{\"title\":\"流程\",\"steps\":[{\"title\":\"步骤一\",\"detail\":\"说明\"},{\"title\":\"步骤二\",\"detail\":\"说明\"}]}\n"
    "只有在正文里存在明确数字、比较关系、步骤链路时才使用；不要为了炫技强行加入。"
)

DIRECT_DELIVERY_GUIDE = (
    "最终输出必须直接写成用户拿到即可使用的成稿。"
    "不要输出“以下是改写结果”“结构说明”“输出重点”“建议读法”“报告形式”“生成流程”"
    "这类面向作者的元说明，也不要解释你将如何写。"
)


def _style_fingerprint(style_profile: StyleProfile | None) -> str:
    if style_profile is None:
        return ""
    return " ".join(
        [
            style_profile.name or "",
            style_profile.audience or "",
            style_profile.tone or "",
            style_profile.structure_template or "",
            " ".join(style_profile.emphasis_points or []),
        ]
    ).lower()


def _style_has_any(fingerprint: str, keywords: list[str]) -> bool:
    return any(keyword in fingerprint for keyword in keywords)


def _classify_style_family(style_profile: StyleProfile | None) -> str:
    if style_profile is None:
        return "default"

    fingerprint = _style_fingerprint(style_profile)
    layout = style_profile.layout_format

    if layout is StyleLayoutFormat.POETRY or _style_has_any(fingerprint, ["诗", "抒情", "意象", "留白", "回响"]):
        return "poetry"
    if layout is StyleLayoutFormat.CLASSICAL or _style_has_any(
        fingerprint, ["古文", "古籍", "书卷", "题解", "纲目", "按语", "章回"]
    ):
        return "classical"
    if _style_has_any(fingerprint, ["访谈", "问答", "对谈", "采访", "q&a", "qa", "提问"]):
        return "interview"
    if _style_has_any(fingerprint, ["播客", "口播", "主持", "节目", "串词", "朗读"]):
        return "podcast"
    if _style_has_any(fingerprint, ["书信", "来信", "致读者", "写给", "尺牍", "公开信"]):
        return "letter"
    if _style_has_any(fingerprint, ["辩论", "正方", "反方", "攻防", "交锋", "驳论"]):
        return "debate"
    if _style_has_any(fingerprint, ["纪实", "纪录", "现场", "人物群像", "口述", "非虚构", "时间线"]):
        return "documentary"
    if _style_has_any(fingerprint, ["演讲", "发言", "致辞", "答辩", "路演", "开场白"]):
        return "speech"
    if _style_has_any(fingerprint, ["评论", "社论", "时评", "观点", "立场", "述评"]):
        return "editorial"
    if _style_has_any(fingerprint, ["简报", "高管", "决策", "周报", "月报", "一页纸", "memo", "brief"]):
        return "briefing"
    if _style_has_any(fingerprint, ["教程", "手册", "步骤", "排错", "指南", "前置条件", "实操"]):
        return "manual"
    if _style_has_any(fingerprint, ["科普", "原理", "误区", "讲明白", "怎么回事", "常见问题"]):
        return "science"
    if _style_has_any(fingerprint, ["中学生", "初学者", "入门", "启蒙", "小白", "儿童友好"]):
        return "kids"
    if _style_has_any(fingerprint, ["通俗", "大白话", "易懂", "口语化", "别太复杂"]):
        return "plain"
    if _style_has_any(fingerprint, ["幽默", "欢乐", "轻松", "可爱", "童趣", "分享欲"]):
        return "playful"
    if _style_has_any(fingerprint, ["快餐", "速读", "碎片", "一分钟", "重点速看"]):
        return "snack"
    if _style_has_any(fingerprint, ["文雅", "雅致", "修辞", "余味", "书卷气"]):
        return "elegant"
    if layout is StyleLayoutFormat.PAPER or _style_has_any(
        fingerprint, ["论文", "研究", "综述", "摘要", "讨论", "结论边界", "方法"]
    ):
        return "paper"
    if layout is StyleLayoutFormat.PPT or _style_has_any(
        fingerprint,
        ["简报", "高管", "决策", "汇报", "一屏一重点", "行动项", "海报", "长图", "评论", "社论", "时评", "速读"],
    ):
        return "decision"
    if _style_has_any(fingerprint, ["故事", "叙事", "场景", "冲突", "转折", "案例复盘"]):
        return "story"
    if _style_has_any(fingerprint, ["猜谜", "悬念", "谜面", "揭晓", "线索", "反转"]):
        return "riddle"
    if layout is StyleLayoutFormat.NEWSPAPER or _style_has_any(fingerprint, ["报纸", "专栏", "新闻", "头版", "特稿"]):
        return "newspaper"
    if layout is StyleLayoutFormat.POSTER or _style_has_any(fingerprint, ["海报", "长图", "封面", "卡片", "标语"]):
        return "poster"
    if layout is StyleLayoutFormat.BOOK or _style_has_any(fingerprint, ["章节", "长阅读", "书籍", "系统梳理"]):
        return "book"
    return "default"


def _rewrite_structure_guidance(style_profile: StyleProfile | None) -> str:
    family = _classify_style_family(style_profile)
    if family == "poetry":
        return "推荐结构：题旨/意象开场 -> 分段递进 -> 回响式收束；不要强行补 TL;DR、报告体小结或密集 bullet。"
    if family == "classical":
        return "推荐结构：题解 -> 纲目 -> 正文 -> 按语；优先保留书卷节奏，不要强行压成现代报告模板。"
    if family == "speech":
        return "推荐结构：开场定调 -> 2~4 个核心论点 -> 例证/转折 -> 收束号召；首段要能直接开讲，段间要有自然承接，结尾要有可直接落地的号召或收束句。"
    if family == "story":
        return "推荐结构：引子 -> 冲突/问题 -> 过程展开 -> 转折/启发 -> 收束；不要用生硬 TL;DR 打断叙事。"
    if family == "riddle":
        return "推荐结构：抛出谜面 -> 逐步给线索 -> 揭晓答案 -> 点题；不要一开头直接把答案说尽。"
    if family == "manual":
        return "推荐结构：目标 -> 前置条件 -> 步骤 -> 排错/注意事项 -> 完成标准；优先让读者能照着执行。"
    if family == "science":
        return "推荐结构：一句话概括 -> 常见问题 -> 原理解释 -> 误区提醒 -> 现实意义；首段先讲明白“它到底是什么”，中段按问题推进，末段给读者一个记得住的提醒。"
    if family == "kids":
        return "推荐结构：5 句话讲清主题 -> 要点列表 -> 生活化类比 -> 小结；降低门槛但不要失真。"
    if family == "plain":
        return "推荐结构：先讲结论 -> 分点解释 -> 最后提醒；多用短句和日常说法，避免绕弯。"
    if family == "playful":
        return "推荐结构：亮眼开头 -> 重点展开 -> 轻快收束；保持分享感和节奏，但不要夸大事实。"
    if family == "snack":
        return "推荐结构：一句话结论 -> 3~5 个重点 -> 行动建议；删掉铺垫，适合快速扫读。"
    if family == "elegant":
        return "推荐结构：起笔铺垫 -> 分层展开 -> 收束余味；保持修辞质感，但不能牺牲清晰度。"
    if family == "newspaper":
        return "推荐结构：导语 -> 核心事实 -> 分栏分析 -> 结语；小标题短促，段落紧凑，像一篇特稿。"
    if family == "poster":
        return "推荐结构：大标题 -> 一句话结论 -> 重点卡片 -> 行动建议；信息块要短、强、可扫读。"
    if family == "book":
        return "推荐结构：章节摘要 -> 分节正文 -> 案例/图表 -> 章节总结；开篇要像导读，每节开头最好先给一小段前引，章节推进要稳定，结尾要像一节真正收束而不是突然结束。"
    if family == "editorial":
        return "推荐结构：观点 -> 事实依据 -> 分析推进 -> 结论与建议；导语要先亮判断，每节最好先用一小段前引说明本节意图，中段持续论证，结尾要给出清晰落点，不能空喊口号。"
    if family == "briefing":
        return "推荐结构：一句话结论 -> 关键数据 -> 核心判断 -> 风险与建议；优先服务管理层决策。"
    if family == "paper":
        return "推荐结构：摘要 -> 背景/问题 -> 分析 -> 讨论 -> 结论；关键判断要说明证据边界。"
    if family == "interview":
        return "推荐结构：引题 -> 核心问题 -> 回答 -> 追问/补充 -> 小结；优先保持问答推进。"
    if family == "podcast":
        return "推荐结构：开场口播 -> 主线展开 -> 转场补充 -> 收束与提问；句子要顺口、可直接朗读。"
    if family == "letter":
        return "推荐结构：称呼与缘起 -> 主体展开 -> 重点叮嘱 -> 收束致意；开头要有明确对象感，段间承接要自然，末段要自然致意或落款，不要改成公告。"
    if family == "debate":
        return "推荐结构：亮明主张 -> 分点论证 -> 回应反方 -> 结论收束；观点要鲜明，论据也要扎实。"
    if family == "documentary":
        return "推荐结构：现场/时间线切入 -> 事实脉络 -> 人物/背景 -> 余波与判断；优先真实和克制。"
    if family == "decision":
        return "推荐结构：一句话结论 -> 关键判断/数据 -> 方案与建议 -> 行动项；优先服务快速决策。"
    return "推荐结构：先给 TL;DR（3~6 条），再按小标题分节展开，必要时使用列表。"


def _delivery_form_guidance(style_profile: StyleProfile | None) -> str:
    family = _classify_style_family(style_profile)
    if family == "interview":
        return "最终请直接写成问答稿，关键段落用“问：”“答：”展开，不要改写成普通报告。"
    if family == "podcast":
        return "最终请直接写成顺口可读的口播稿，保留开场、转场和收束感。"
    if family == "letter":
        return "最终请直接写成书信正文，要有称呼、缘起、主体展开和收束致意，最好保留自然承接句与落款感，首尾都要完整，不要改成公告。"
    if family == "speech":
        return "最终请直接写成可朗读的发言稿，要有能直接开讲的首段、层层推进且承接自然的中段和有号召力的结尾，段落要短，句子要顺口。"
    if family == "manual":
        return "最终请直接写成可执行指南，优先使用明确步骤、前置条件和排错提醒。"
    if family == "science":
        return "最终请直接写成解释型正文，优先用问题、原理、误区提醒来组织内容，开头先讲明白，中段循序拆解，结尾留下记忆点。"
    if family == "kids":
        return "最终请直接写成低门槛入门稿，用短句和类比帮助理解。"
    if family == "plain":
        return "最终请直接写成大白话说明稿，先讲结论，再讲原因和提醒。"
    if family in {"poster", "snack"}:
        return "最终请直接写成快扫版正文，一句话结论要靠前，重点条目要短促醒目。"
    if family in {"briefing", "decision"}:
        return "最终请直接写成决策型正文，先给结论，再给关键判断、风险和建议动作。"
    if family == "editorial":
        return "最终请直接写成评论正文，导语要先亮判断，各节前引要自然带出论证方向，依据和回应要完整，结尾要能直接作为评论稿收束。"
    if family == "newspaper":
        return "最终请直接写成特稿式正文，要有导语、事实展开和结语判断。"
    if family == "paper":
        return "最终请直接写成研究型正文，摘要、分析、讨论、结论要完整，首段像摘要导读，结尾要明确边界与结论。"
    if family == "book":
        return "最终请直接写成章节式长文，开篇像导读，各节最好先有简短前引，各节之间要有稳定推进和小结，末段要像章节收束而不是摘要回放。"
    if family in {"story", "documentary"}:
        return "最终请直接写成叙事正文，保留时间线、事实线或转折推进，不要被摘要腔打断。"
    if family in {"classical", "elegant", "poetry"}:
        return "最终请直接写成该风格的正文形态，保持节奏、分段和收束，不要退回普通报告腔。"
    return "最终请直接写成可交付正文，不要停留在提纲、说明或半成品。"


def _outline_requirements(style_profile: StyleProfile | None) -> str:
    family = _classify_style_family(style_profile)
    if family == "poetry":
        return (
            "1) 给出一个推荐标题\n"
            "2) 说明题旨、意象推进或段落节奏\n"
            "3) 给出 3~5 个正文段落层次及每段目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "classical":
        return (
            "1) 给出一个推荐标题\n"
            "2) 给出题解与纲目结构\n"
            "3) 给出 3~5 个正文层次及每层主旨\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "speech":
        return (
            "1) 给出一个推荐标题\n"
            "2) 设计开场定调与结尾号召\n"
            "3) 给出 2~4 个核心论点及各自例证目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "story":
        return (
            "1) 给出一个推荐标题\n"
            "2) 设计引子、冲突、转折和收束\n"
            "3) 给出 3~5 个正文分节及每节目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "riddle":
        return (
            "1) 给出一个推荐标题\n"
            "2) 设计谜面、线索与揭晓顺序\n"
            "3) 给出 3~5 个正文层次及每层悬念目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "manual":
        return (
            "1) 给出一个推荐标题\n"
            "2) 列出目标与适用场景\n"
            "3) 给出前置条件、操作步骤、排错提示\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "science":
        return (
            "1) 给出一个推荐标题\n"
            "2) 用一句话讲清核心问题\n"
            "3) 给出常见问题、原理解释、误区提醒等分节\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "kids":
        return (
            "1) 给出一个推荐标题\n"
            "2) 先设计 5 句话讲清主题\n"
            "3) 给出要点解释与生活化类比\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "plain":
        return (
            "1) 给出一个推荐标题\n"
            "2) 先写直接结论\n"
            "3) 给出分点解释和最后提醒\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "playful":
        return (
            "1) 给出一个推荐标题\n"
            "2) 设计亮眼开头和轻快收束\n"
            "3) 给出 3~5 个正文重点及各自记忆点\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "snack":
        return (
            "1) 给出一个推荐标题\n"
            "2) 给出一句话结论与 3~5 个速读重点\n"
            "3) 给出行动建议或最后提醒\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "elegant":
        return (
            "1) 给出一个推荐标题\n"
            "2) 规划起笔铺垫与收束余味\n"
            "3) 给出 3~5 个正文层次及每层主旨\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "newspaper":
        return (
            "1) 给出一个推荐标题\n"
            "2) 写出导语要交代的核心事实\n"
            "3) 给出 3~5 个分栏分析及每栏目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "poster":
        return (
            "1) 给出一个推荐标题\n"
            "2) 给出一句话结论与重点卡片设计\n"
            "3) 列出重点数字、流程或行动建议\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "book":
        return (
            "1) 给出一个推荐标题\n"
            "2) 设计章节摘要与章节总结\n"
            "3) 给出 3~6 个正文分节及每节目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "editorial":
        return (
            "1) 给出一个推荐标题\n"
            "2) 写出核心观点与结论\n"
            "3) 给出事实依据、分析推进与建议等分节\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "briefing":
        return (
            "1) 给出一个推荐标题\n"
            "2) 给出一句话结论与关键数据\n"
            "3) 给出核心判断、风险与建议等分节\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "paper":
        return (
            "1) 给出一个推荐标题\n"
            "2) 给出摘要要点\n"
            "3) 给出背景、分析、讨论、结论等分节及每节目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "interview":
        return (
            "1) 给出一个推荐标题\n"
            "2) 给出引题与 4~6 个关键问题\n"
            "3) 为每个问题标注回答重点或追问方向\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "podcast":
        return (
            "1) 给出一个推荐标题\n"
            "2) 设计开场口播、主线段落与收束提问\n"
            "3) 给出 3~5 个正文段落及每段转场目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "letter":
        return (
            "1) 给出一个推荐标题\n"
            "2) 设计称呼、缘起与收束致意\n"
            "3) 给出 3~5 个正文层次及各层要表达的重点\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "debate":
        return (
            "1) 给出一个推荐标题\n"
            "2) 亮明主张与 2~4 个核心论点\n"
            "3) 规划反方观点与回应顺序\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "documentary":
        return (
            "1) 给出一个推荐标题\n"
            "2) 规划现场切入或时间线开场\n"
            "3) 给出 3~5 个事实段落及每段主旨\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    if family == "decision":
        return (
            "1) 给出一个推荐标题\n"
            "2) 给出一句话结论与 3~5 个关键判断\n"
            "3) 给出方案、风险、行动项等分节及每节目标\n"
            "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
        )
    return (
        "1) 给出一个推荐标题\n"
        "2) 给出 3~6 条 TL;DR 要点\n"
        "3) 给出 3~6 个正文分节及每节目标\n"
        "4) 列出必须保留的关键事实（数字、人名、时间、结论）"
    )


def _verify_focus_guidance(style_profile: StyleProfile | None) -> str:
    family = _classify_style_family(style_profile)
    if family in {"poetry", "classical", "story", "riddle", "podcast", "letter", "speech"}:
        return "重点检查风格节奏是否被摘要腔压平，开场/转折/收束是否自然，且关键事实没有丢失。"
    if family == "manual":
        return "重点检查步骤顺序、前置条件、排错提示和完成标准是否完整且可执行。"
    if family == "science":
        return "重点检查是否真正把原理讲清楚，常见误区是否被纠正，解释是否通俗但不失准。"
    if family == "kids":
        return "重点检查表达是否降低门槛、类比是否具体易懂，同时不能牺牲事实准确性。"
    if family == "plain":
        return "重点检查术语是否被翻成日常说法，是否先讲结论、再讲原因，避免书面腔。"
    if family == "playful":
        return "重点检查节奏和记忆点是否足够轻快，同时不能为了活泼而夸张或失真。"
    if family == "snack":
        return "重点检查是否足够短促可扫读，重点是否前置，是否还残留多余铺垫。"
    if family == "elegant":
        return "重点检查修辞是否服务内容，层次和收束是否自然，不要为了文雅牺牲清晰度。"
    if family == "newspaper":
        return "重点检查导语是否交代核心事实，分栏分析是否清晰，整体是否像特稿而非散文。"
    if family == "poster":
        return "重点检查是否足够卡片化和可扫读，重点数字、流程和行动建议是否醒目。"
    if family == "book":
        return "重点检查章节摘要、分节正文和章节总结是否连贯，长阅读节奏是否稳。"
    if family == "editorial":
        return "重点检查观点是否清楚、依据是否扎实、分析是否推进，不要只剩口号。"
    if family == "briefing":
        return "重点检查一句话结论、关键数据、核心判断和风险建议是否足够前置。"
    if family == "paper":
        return "重点检查摘要、分析、讨论、结论是否闭环，关键判断是否写清依据与边界。"
    if family == "interview":
        return "重点检查问题顺序、回答焦点与追问衔接是否自然，不要把问答稿压成普通报告。"
    if family == "debate":
        return "重点检查立场是否清楚、论点攻防是否完整、反方回应是否被保留。"
    if family == "documentary":
        return "重点检查时间线、事实脉络和人物关系是否清楚，避免失真或过度煽情。"
    if family == "decision":
        return "重点检查结论、关键判断、行动项和风险是否足够前置且便于快速扫读。"
    return "重点检查 TL;DR、分节结构和关键事实是否完整，避免重复和跳跃。"


def _discover_draft_requirements(style_profile: StyleProfile | None) -> str:
    family = _classify_style_family(style_profile)
    if family in {"poetry", "classical", "story", "riddle", "podcast", "letter", "speech"}:
        return (
            "请把下面的研究简报整理成一份可继续润色的调研草稿。"
            "正文结构应优先贴合当前风格，但必须保留证据链与保留态度。固定结构如下：\n"
            "1) 开场题旨 / 引子\n"
            "2) 主体展开（2~4 段）\n"
            "3) 证据与依据（关键判断保留 [编号]）\n"
            "4) 结论 / 收束\n"
            "5) 待确认点"
        )
    if family == "interview":
        return (
            "请把下面的研究简报整理成一份可转写的问答草稿，固定结构如下：\n"
            "1) 引题\n"
            "2) 核心问题与回答（2~5 组）\n"
            "3) 追问 / 分歧补充\n"
            "4) 结论\n"
            "5) 待确认点"
        )
    if family == "manual":
        return (
            "请把下面的研究简报整理成一份可执行草稿，固定结构如下：\n"
            "1) 目标与适用场景\n"
            "2) 前置条件\n"
            "3) 操作步骤\n"
            "4) 风险 / 排错\n"
            "5) 结论与建议"
        )
    if family == "science":
        return (
            "请把下面的研究简报整理成一份科普草稿，固定结构如下：\n"
            "1) 一句话概括\n"
            "2) 常见问题\n"
            "3) 原理解释\n"
            "4) 误区提醒\n"
            "5) 现实意义"
        )
    if family == "kids":
        return (
            "请把下面的研究简报整理成一份入门草稿，固定结构如下：\n"
            "1) 用 5 句话讲清主题\n"
            "2) 重点解释\n"
            "3) 生活化类比\n"
            "4) 容易误解处\n"
            "5) 小结"
        )
    if family == "plain":
        return (
            "请把下面的研究简报整理成一份通俗草稿，固定结构如下：\n"
            "1) 直接结论\n"
            "2) 分点解释\n"
            "3) 例子 / 类比\n"
            "4) 关键提醒\n"
            "5) 待确认点"
        )
    if family in {"playful", "elegant", "book"}:
        return (
            "请把下面的研究简报整理成一份可继续润色的长文草稿。固定结构如下：\n"
            "1) 开场主旨\n"
            "2) 分层展开（2~4 段）\n"
            "3) 证据与依据（关键判断保留 [编号]）\n"
            "4) 收束与启发\n"
            "5) 待确认点"
        )
    if family in {"newspaper", "editorial"}:
        return (
            "请把下面的研究简报整理成一份特稿/评论草稿，固定结构如下：\n"
            "1) 导语 / 判断\n"
            "2) 核心事实\n"
            "3) 分析推进\n"
            "4) 结论与建议\n"
            "5) 待确认点"
        )
    if family in {"poster", "snack", "briefing"}:
        return (
            "请把下面的研究简报整理成一份适合快速扫读的草稿，固定结构如下：\n"
            "1) 一句话结论\n"
            "2) 关键判断 / 重点卡片\n"
            "3) 关键数据 / 证据\n"
            "4) 行动建议\n"
            "5) 风险与待确认点"
        )
    if family == "paper":
        return (
            "请把下面的研究简报整理成一份研究草稿，固定结构如下：\n"
            "1) 摘要\n"
            "2) 问题与背景\n"
            "3) 证据分析\n"
            "4) 讨论与边界\n"
            "5) 结论"
        )
    if family == "debate":
        return (
            "请把下面的研究简报整理成一份辩论草稿，固定结构如下：\n"
            "1) 结论立场\n"
            "2) 主要论点\n"
            "3) 反方可能观点与回应\n"
            "4) 证据基础\n"
            "5) 待确认点"
        )
    if family == "documentary":
        return (
            "请把下面的研究简报整理成一份纪实调研草稿，固定结构如下：\n"
            "1) 主题与时间线\n"
            "2) 关键事实脉络\n"
            "3) 人物 / 机构与证据\n"
            "4) 当前判断\n"
            "5) 待确认点"
        )
    if family == "decision":
        return (
            "请把下面的研究简报整理成一份可继续润色的决策草稿，固定结构如下：\n"
            "1) 一句话结论\n"
            "2) 关键判断\n"
            "3) 方案对比 / 建议\n"
            "4) 落地步骤\n"
            "5) 风险与待确认点"
        )
    return (
        "请把下面的研究简报整理成一份可转写草稿，固定使用这个结构：\n"
        "1) 调研目标\n"
        "2) 初步结论\n"
        "3) 关键证据\n"
        "4) 可执行方案\n"
        "5) 风险与待确认点"
    )


def _discover_brief_requirements(style_profile: StyleProfile | None) -> str:
    family = _classify_style_family(style_profile)
    if family in {"poster", "snack", "briefing", "decision"}:
        return (
            "简报要优先服务快速扫读与直接决策："
            "summary 和 conclusion 要短、直接、可单独成立；"
            "key_findings 每条尽量控制在一句话内，像重点卡片；"
            "draft_outline 应更像执行顺序或阅读顺序。"
        )
    if family in {"interview", "podcast"}:
        return (
            "简报要保留问答推进感："
            "summary 和 conclusion 先交代最关键问题的回答；"
            "key_findings 优先整理成关键问答或关键回应；"
            "draft_outline 要体现问题顺序、追问与收束。"
        )
    if family in {"manual", "science", "kids", "plain"}:
        return (
            "简报要更适合直接解释或执行："
            "summary 和 conclusion 先把问题讲清；"
            "key_findings 优先整理为步骤、原理、误区或最重要提醒；"
            "draft_outline 要体现从理解到执行的顺序。"
        )
    if family in {"book", "story", "classical", "letter", "elegant"}:
        return (
            "简报要保留层次和展开顺序："
            "summary 和 conclusion 先点明主旨；"
            "key_findings 应能看出章节、转折或段落推进；"
            "draft_outline 要像可直接扩成正文的章节线。"
        )
    if family in {"newspaper", "editorial", "paper"}:
        return (
            "简报要强调判断、依据与证据边界："
            "summary 和 conclusion 先给结论；"
            "key_findings 优先写核心判断、事实依据或争议点；"
            "draft_outline 要体现从导语/摘要到分析、结论的推进。"
        )
    return (
        "简报字段必须写得清楚、可直接展示："
        "summary 和 conclusion 要能单独成立；"
        "key_findings 要短、准、少空话；"
        "draft_outline 要能直接转成正文层次。"
    )


def _discover_report_requirements(style_profile: StyleProfile | None) -> str:
    family = _classify_style_family(style_profile)
    if family in {"poetry", "classical", "story", "riddle", "podcast", "letter", "speech"}:
        return (
            "请把研究简报和调研草稿整合成一份可直接使用的正式调研稿。"
            "正文应优先保持当前风格的节奏与结构，但必须显式保留证据链。固定结构如下：\n"
            "1) 开场结论 / 题旨\n"
            "2) 正文展开（覆盖关键维度）\n"
            "3) 证据与依据（关键判断附 [编号]）\n"
            "4) 建议 / 启发\n"
            "5) 风险与待确认点\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "interview":
        return (
            "请把研究简报和调研草稿整合成一份正式问答稿。固定结构如下：\n"
            "1) 引题与直接结论\n"
            "2) 关键问答（2~5 组）\n"
            "3) 证据与依据（关键回答附 [编号]）\n"
            "4) 建议 / 后续动作\n"
            "5) 待确认点\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "manual":
        return (
            "请把研究简报和调研草稿整合成一份正式操作指南。固定结构如下：\n"
            "1) 目标与适用场景\n"
            "2) 关键结论 / TL;DR（3~5 条）\n"
            "3) 前置条件\n"
            "4) 操作步骤\n"
            "5) 风险、排错与注意事项\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "science":
        return (
            "请把研究简报和调研草稿整合成一份正式科普稿。固定结构如下：\n"
            "1) 一句话讲清核心（开头 1 段就让读者明白是什么）\n"
            "2) 常见问题\n"
            "3) 原理解释\n"
            "4) 误区提醒与现实意义\n"
            "5) 待确认问题（没有则写“暂无”）\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "kids":
        return (
            "请把研究简报和调研草稿整合成一份正式入门稿。固定结构如下：\n"
            "1) 用 5 句话讲清主题\n"
            "2) 重点解释\n"
            "3) 生活化类比\n"
            "4) 容易误解处\n"
            "5) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "plain":
        return (
            "请把研究简报和调研草稿整合成一份正式通俗说明稿。固定结构如下：\n"
            "1) 直接结论\n"
            "2) 分点解释\n"
            "3) 关键提醒\n"
            "4) 待确认问题（没有则写“暂无”）\n"
            "5) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family in {"playful", "elegant", "book"}:
        return (
            "请把研究简报和调研草稿整合成一份完整长文。固定结构如下：\n"
            "1) 开场主旨 / 导语（像一段真正的导读）\n"
            "2) 正文展开（覆盖关键维度）\n"
            "3) 证据与依据（关键判断附 [编号]）\n"
            "4) 收束与建议（结尾要完整收束）\n"
            "5) 待确认问题（没有则写“暂无”）\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family in {"newspaper", "editorial"}:
        return (
            "请把研究简报和调研草稿整合成一份正式特稿/评论稿。固定结构如下：\n"
            "1) 导语 / 核心判断（第一段就亮判断）\n"
            "2) 核心事实\n"
            "3) 分析推进\n"
            "4) 结论与建议（末段要有评论稿落点）\n"
            "5) 待确认问题（没有则写“暂无”）\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family in {"poster", "snack", "briefing"}:
        return (
            "请把研究简报和调研草稿整合成一份适合快速扫读的正式报告。固定结构如下：\n"
            "1) 一句话结论 / TL;DR\n"
            "2) 关键判断 / 重点卡片\n"
            "3) 关键数据与证据\n"
            "4) 行动建议\n"
            "5) 风险与待确认问题\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "paper":
        return (
            "请把研究简报和调研草稿整合成一份正式研究报告。固定结构如下：\n"
            "1) 摘要\n"
            "2) 问题与背景\n"
            "3) 分析与证据\n"
            "4) 讨论与边界\n"
            "5) 结论与建议\n"
            "6) 待确认问题（没有则写“暂无”）\n"
            "7) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "debate":
        return (
            "请把研究简报和调研草稿整合成一份正式辩论稿。固定结构如下：\n"
            "1) 结论立场\n"
            "2) 主要论点\n"
            "3) 反方观点与回应\n"
            "4) 证据基础（关键判断附 [编号]）\n"
            "5) 风险与待确认点\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    if family == "documentary":
        return (
            "请把研究简报和调研草稿整合成一份正式纪实调研稿。固定结构如下：\n"
            "1) 核心判断 / 导语\n"
            "2) 事实脉络与时间线\n"
            "3) 人物 / 机构 / 关键节点\n"
            "4) 当前影响与建议\n"
            "5) 风险与待确认点\n"
            "6) 参考链接（逐条列出 [编号] 标题 - URL）"
        )
    return (
        "请把研究简报和调研草稿整合成一份可直接使用的正式调研报告。固定结构如下：\n"
        "1) 结论 / TL;DR（3~6 条）\n"
        "2) 要点（覆盖关键维度）\n"
        "3) 推荐方案（最优方案 + 备选 + 适用场景）\n"
        "4) 落地步骤（按步骤列出）\n"
        "5) 风险与注意事项\n"
        "6) 待确认问题（没有则写“暂无”）\n"
        "7) 参考链接（逐条列出 [编号] 标题 - URL）"
    )


def render_style_prompt(style_prompt: str, source: SourceContent) -> str:
    variables: dict[str, str] = {
        "title": source.title,
        "summary": source.raw_excerpt,
        "raw_excerpt": source.raw_excerpt,
        "source_url": source.source_url or "",
        "url": source.source_url or "",
    }

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        return variables.get(key, match.group(0))

    return STYLE_VARIABLE_PATTERN.sub(replace, style_prompt)


def compose_style_instruction(style_prompt: str, style_profile: StyleProfile | None = None) -> str:
    base_prompt = (style_prompt or "").strip()
    if style_profile is None:
        return "\n".join(part for part in [base_prompt, DIRECT_DELIVERY_GUIDE] if part)

    lines = [base_prompt, "", DIRECT_DELIVERY_GUIDE, "", f"风格技能：{style_profile.name}"]
    if style_profile.audience.strip():
        lines.append(f"- 目标受众：{style_profile.audience.strip()}")
    if style_profile.tone.strip():
        lines.append(f"- 语气与表达：{style_profile.tone.strip()}")
    if style_profile.structure_template.strip():
        lines.append(f"- 推荐结构：{style_profile.structure_template.strip()}")
    if style_profile.emphasis_points:
        emphasis = "；".join(item.strip() for item in style_profile.emphasis_points if item.strip())
        if emphasis:
            lines.append(f"- 输出重点：{emphasis}")
    lines.append(f"- 成稿形式：{_delivery_form_guidance(style_profile)}")

    title_policy_map = {
        "retain": "标题尽量保留原始信息结构，不要过度营销化。",
        "rewrite": "允许重写标题，但必须更清晰准确。",
        "punchy": "标题可更有张力，但不能牺牲事实准确性。",
    }
    citation_policy_map = {
        "auto": "有来源编号时，关键结论尽量标注引用。",
        "strict": "关键判断、建议和结论都应尽量标注来源编号。",
        "minimal": "仅在核心结论或存在争议的信息处标注来源。",
        "none": "不主动输出引用编号，除非用户提示词明确要求。",
    }
    image_focus_map = {
        "auto": "配图风格按正文主题自动决策。",
        "narrative": "若生成配图，优先做叙事感强、场景明确的插画。",
        "diagram": "若生成配图，优先做概念图/结构图，强调信息表达。",
        "editorial": "若生成配图，优先做 editorial / 杂志插画风格。",
    }
    layout_format_map = {
        "auto": "版式按内容自动决定。",
        "newspaper": "整体排版采用报纸特稿/新闻专栏感，导语要先交代核心事实，小标题短促，段落紧凑，避免口语化拖沓。",
        "poster": "整体排版采用海报/长图式阅读感，标题更醒目，信息块要短、强、可扫读，优先一句话结论和重点数字。",
        "book": "整体排版采用书籍章节感，段落与节间过渡更从容，适合长阅读，可加入节中摘要与小结。",
        "classical": "整体排版采用古文书卷感，题解、纲目、按语更重要，语言可雅致但仍要可读，不要强行套现代报告式 TL;DR。",
        "ppt": "整体排版采用 PPT / 演示稿感，一屏一重点，短句、小标题、结论卡和行动项更明确，避免连续大段正文。",
        "paper": "整体排版采用论文/研究报告感，优先摘要、问题、分析、讨论、结论等分节，关键判断要交代证据边界。",
        "poetry": "整体排版采用诗歌/抒情短章感，行文更注重分行、节奏、停顿与留白，不要强塞密集 bullet 或报告腔。",
    }
    visual_mode_map = {
        "auto": "可视化按内容需要自动决定。",
        "enhanced": f"优先考虑用统计卡、图表、流程图辅助表达。{PRETEXT_GUIDE}",
        "minimal": "仅在确有必要时加入少量统计卡或流程图辅助表达。",
        "none": "不要主动加入图表、统计卡或流程图，保持纯正文。",
    }

    lines.append(f"- 标题策略：{title_policy_map[style_profile.title_policy.value]}")
    lines.append(f"- 引用策略：{citation_policy_map[style_profile.citation_policy.value]}")
    lines.append(f"- 配图策略：{image_focus_map[style_profile.image_focus.value]}")
    lines.append(f"- 版式策略：{layout_format_map[style_profile.layout_format.value]}")
    lines.append(f"- 可视化策略：{visual_mode_map[style_profile.visual_mode.value]}")
    fingerprint = " ".join(
        [
            style_profile.name or "",
            style_profile.tone or "",
            style_profile.structure_template or "",
            " ".join(style_profile.emphasis_points or []),
        ]
    ).lower()
    if style_profile.layout_format is StyleLayoutFormat.POETRY:
        lines.append("- 风格守则：优先保持诗歌节奏、分行与意象推进，不要先写 TL;DR 再写正文。")
    elif style_profile.layout_format is StyleLayoutFormat.CLASSICAL:
        lines.append("- 风格守则：优先保持题解、纲目、按语和书卷感，不要被通用摘要式写法压平。")
    elif style_profile.layout_format is StyleLayoutFormat.PPT:
        lines.append("- 风格守则：每一屏或每一节只承载一个重点，长段说明应主动拆成短句和要点。")
    elif style_profile.layout_format is StyleLayoutFormat.PAPER:
        lines.append("- 风格守则：优先采用摘要/背景/分析/讨论/结论结构，关键判断应说明依据与边界。")
    if any(keyword in fingerprint for keyword in ["纪实", "非虚构", "现场", "口述", "时间线"]):
        lines.append("- 纪实守则：优先交代时间线、事实脉络和现场细节；不要虚构情节，也不要过度煽情。")
    if any(keyword in fingerprint for keyword in ["故事", "叙事", "场景", "冲突", "转折"]):
        lines.append("- 叙事守则：优先保留引子、冲突、转折与收束，不要被通用摘要式写法打断叙事推进。")
    if any(keyword in fingerprint for keyword in ["猜谜", "悬念", "谜面", "揭晓", "线索", "反转"]):
        lines.append("- 悬念守则：优先保留铺垫、线索与揭晓顺序，不要在开头直接把答案说尽。")
    if any(keyword in fingerprint for keyword in ["书信", "来信", "写给", "致读者", "尺牍"]):
        lines.append("- 书信守则：保持称呼、缘起、展开和收束的对象感，不要写成普通说明文或报告。")
    if any(keyword in fingerprint for keyword in ["播客", "口播", "主持", "节目", "串词"]):
        lines.append("- 口播守则：句子需要顺口、可直接朗读，适当保留停顿、转场和陪伴感。")
    if any(keyword in fingerprint for keyword in ["演讲", "发言", "致辞", "路演", "答辩"]):
        lines.append("- 演讲守则：开场要定调，论点推进要有层次，结尾要有收束和号召，句子必须适合朗读。")
    if any(keyword in fingerprint for keyword in ["辩论", "正方", "反方", "攻防", "驳论", "交锋"]):
        lines.append("- 辩论守则：先亮明主张，再推进论点攻防和反方回应，最后回到立场与结论。")
    if any(keyword in fingerprint for keyword in ["访谈", "问答", "采访", "对谈", "q&a", "qa"]):
        lines.append("- 问答守则：尽量保持提问、回答、追问的结构，不要全部改写成第三人称报告。")
    if any(keyword in fingerprint for keyword in ["教程", "手册", "指南", "步骤", "排错", "前置条件", "实操"]):
        lines.append("- 教程守则：优先交代目标、前置条件、步骤、排错与完成标准，让读者能照着执行。")
    if any(keyword in fingerprint for keyword in ["评论", "社论", "时评", "观点", "立场", "述评"]):
        lines.append("- 评论守则：立场要清楚，但每个判断都要有事实依据支撑，不要空喊口号。")
    if any(keyword in fingerprint for keyword in ["简报", "决策", "高管", "一页纸", "brief", "memo"]):
        lines.append("- 简报守则：结论与关键判断必须前置，信息块要短促、可扫读，并明确风险与行动项。")
    if style_profile.function_skills:
        lines.append("- 功能技能：")
        for skill in style_profile.function_skills[:8]:
            instruction = (skill.instruction or "").strip()
            if not instruction:
                continue
            lines.append(f"  - [{skill.label}] {instruction}")
    return "\n".join(line for line in lines if line is not None).strip()


def _render_discover_sources_block(sources: list[SearchSource], excerpt_limit: int = 420) -> str:
    ranked_sources = sorted(
        sources,
        key=lambda item: (item.overall_score, item.credibility_score, item.relevance_score),
        reverse=True,
    )
    rendered: list[str] = []
    for item in ranked_sources[:6]:
        excerpt = (item.excerpt or item.snippet or "").strip()
        if len(excerpt) > excerpt_limit:
            excerpt = excerpt[:excerpt_limit].rstrip() + "…"
        rendered.append(
            "\n".join(
                [
                    f"[{item.id}] {item.title}",
                    f"URL: {item.url}",
                    f"SourceType: {item.source_type or 'article'}",
                    f"Credibility: {item.credibility_score:.2f}",
                    f"Relevance: {item.relevance_score:.2f}",
                    f"CaptureMode: {item.capture_mode or 'full'}",
                    f"Snippet: {item.snippet or '无'}",
                    f"Excerpt: {excerpt or '无'}",
                ]
            )
        )
    return "\n\n".join(rendered)


def _render_discover_source_refs_block(sources: list[SearchSource]) -> str:
    ranked_sources = sorted(
        sources,
        key=lambda item: (item.overall_score, item.credibility_score, item.relevance_score),
        reverse=True,
    )
    return "\n".join(
        f"[{item.id}] {item.title} - {item.url} - type={item.source_type or 'article'} - credibility={item.credibility_score:.2f}"
        for item in ranked_sources[:8]
    )


def _render_discover_evidence_block(
    evidence_items: list[DiscoverEvidenceItem],
    *,
    quote_limit: int = 140,
    evidence_limit: int = 180,
) -> str:
    rendered: list[str] = []
    for item in evidence_items[:8]:
        quote = (item.quote or "").strip()
        evidence = (item.evidence or "").strip()
        relevance = (item.relevance or "").strip()
        if len(quote) > quote_limit:
            quote = quote[:quote_limit].rstrip() + "…"
        if len(evidence) > evidence_limit:
            evidence = evidence[:evidence_limit].rstrip() + "…"
        rendered.append(
            "\n".join(
                [
                    f"[{item.source_id}] {item.title}",
                    f"URL: {item.url}",
                    f"Quote: {quote or '无'}",
                    f"Evidence: {evidence or '无'}",
                    f"Relevance: {relevance or '无'}",
                ]
            )
        )
    return "\n\n".join(rendered)


def build_discover_evidence_messages(
    query: str,
    sources: list[SearchSource],
    context_brief: str = "",
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    schema = {
        "evidence": [
            {
                "source_id": 1,
                "title": "来源标题",
                "url": "https://example.com",
                "quote": "来源摘录中的关键原句或短句",
                "evidence": "该摘录能支撑的具体判断",
                "relevance": "为什么这条证据重要",
            }
        ]
    }
    return [
        {
            "role": "system",
            "content": (
                "你是一名严谨的中文研究助理。"
                "你的任务是先抽取可复用的证据项，再交给后续写作阶段使用。"
                "你必须只根据给定来源中的 excerpt/snippet 提炼证据，不得引入来源外事实。"
                "应优先使用可信度高、相关性高、且 capture_mode 为 full 的来源；"
                "如果来源只有 snippet，提炼时必须更保守，不要把摘要误写成确定事实。"
                "输出只能是一个 JSON 对象，不要输出 Markdown、解释或代码块。"
                "evidence 至少给 2 条，最多 8 条；source_id 必须来自给定来源编号；"
                "quote 应尽量使用来源中的原句或紧贴原文的短摘录。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                "请先抽取可复用的证据项。输出 JSON 必须符合这个结构：\n"
                f"{json.dumps(schema, ensure_ascii=False, indent=2)}\n\n"
                "可用来源如下：\n\n"
                f"{_render_discover_sources_block(sources, excerpt_limit=280)}"
            ),
        },
    ]


def build_discover_brief_messages(
    query: str,
    style_prompt: str,
    evidence_items: list[DiscoverEvidenceItem],
    sources: list[SearchSource],
    context_brief: str = "",
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    schema = {
        "summary": "一句话概括本轮调研发现",
        "conclusion": "面向用户问题的直接回答",
        "key_findings": ["发现 1", "发现 2"],
        "evidence": [
            {
                "source_id": 1,
                "title": "来源标题",
                "url": "https://example.com",
                "quote": "来源摘录中的关键原句或短句",
                "evidence": "能直接支撑判断的事实",
                "relevance": "这条证据为什么重要",
            }
        ],
        "uncertainties": ["仍需进一步确认的问题"],
        "draft_outline": ["适合继续转写的段落结构"],
    }
    return [
        {
            "role": "system",
            "content": (
                "你是一名严谨的中文研究分析师。"
                "你必须只根据给定来源提炼证据，不得补充来源外事实。"
                "应优先信任 official / paper / book / wiki 等高可信来源；"
                "来自 qa / social 且 capture_mode=snippet 的信息只能作为补充线索，不应单独支撑强结论。"
                "你的输出只能是一个 JSON 对象，不要输出 Markdown、解释或代码块。"
                "evidence 至少给 2 条，最多 5 条；source_id 必须来自给定来源编号。"
                "uncertainties 只保留真正无法从来源确认的问题。"
                "summary、conclusion、key_findings、draft_outline 都必须写成可直接展示给用户的内容，"
                "不要写“结构如下”“可继续展开”为这类作者说明。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                f"{_discover_brief_requirements(style_profile)}\n\n"
                "请先做证据优先的研究简报。输出 JSON 必须符合这个结构：\n"
                f"{json.dumps(schema, ensure_ascii=False, indent=2)}\n\n"
                "已抽取的证据包如下：\n\n"
                f"{_render_discover_evidence_block(evidence_items)}\n\n"
                "可用来源编号如下：\n"
                f"{_render_discover_source_refs_block(sources)}"
            ),
        },
    ]


def build_discover_draft_messages(
    query: str,
    style_prompt: str,
    evidence_items: list[DiscoverEvidenceItem],
    sources: list[SearchSource],
    research_brief: DiscoverBrief,
    context_brief: str = "",
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    brief_json = json.dumps(research_brief.model_dump(mode="json"), ensure_ascii=False, indent=2)
    return [
        {
            "role": "system",
            "content": (
                "你是一名中文研究编辑，负责把证据简报整理成可继续润色的调研草稿。"
                "你必须只使用给定来源与研究简报中的事实。"
                "输出必须是 Markdown，并保留引用编号 [1] 这样的标注。"
                "草稿要强调结构与证据，不要写成营销文案。"
                "如果某条判断主要来自低可信或仅摘要来源，必须显式写出保留态度。"
                "草稿正文不要附带“以下是草稿”“结构说明”这类元说明。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                f"{_discover_draft_requirements(style_profile)}\n\n"
                f"研究简报：\n{brief_json}\n\n"
                "证据包如下：\n\n"
                f"{_render_discover_evidence_block(evidence_items, quote_limit=120, evidence_limit=150)}\n\n"
                "来源编号如下：\n"
                f"{_render_discover_source_refs_block(sources)}"
            ),
        },
    ]


def build_discover_report_messages(
    query: str,
    style_prompt: str,
    evidence_items: list[DiscoverEvidenceItem],
    sources: list[SearchSource],
    research_brief: DiscoverBrief,
    draft_markdown: str,
    context_brief: str = "",
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    brief_json = json.dumps(research_brief.model_dump(mode="json"), ensure_ascii=False, indent=2)
    return [
        {
            "role": "system",
            "content": (
                "你是一名严谨的中文调研写作助手。"
                "你必须仅基于给定来源、研究简报和草稿写作，不要编造来源中不存在的信息。"
                "所有关键结论、判断和建议尽量在句末标注引用编号，例如 [1]。"
                "输出必须是 Markdown，排版清晰，避免重复和空话。"
                "如果存在未确认信息，要明确写出不确定点。"
                "优先引用高可信度来源；对于社区问答/社区笔记或仅搜索摘要来源，不要把其写成唯一依据。"
                f"{DIRECT_DELIVERY_GUIDE}"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"调研主题：{query}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                f"{_discover_report_requirements(style_profile)}\n\n"
                f"研究简报：\n{brief_json}\n\n"
                f"调研草稿：\n{draft_markdown}\n\n"
                "证据包如下（仅可使用这些信息）：\n\n"
                f"{_render_discover_evidence_block(evidence_items, quote_limit=100, evidence_limit=140)}\n\n"
                "来源编号如下：\n"
                f"{_render_discover_source_refs_block(sources)}"
            ),
        },
    ]


def build_rewrite_messages(
    source: SourceContent,
    style_prompt: str,
    context_brief: str = "",
    outline_text: str = "",
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一个专业内容改写助手，负责把原文改写为高质量中文成稿。"
                "硬性要求：只基于原文写作；不捏造原文没有的信息；"
                "保留关键事实（数字、人名、时间、地点、因果、结论）。"
                "如果原文信息不足，请明确标注“原文未说明/未给出”。"
                "风格要求（用户指令）在不违反事实约束的前提下具有最高优先级，必须严格执行。"
                "输出必须是 Markdown，排版清晰，信息密度高，少空话、少重复。"
                f"{DIRECT_DELIVERY_GUIDE}"
                f"{_rewrite_structure_guidance(style_profile)}"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                "请在不丢失关键信息的前提下完成改写或提炼，并尽量保持结构化表达。\n\n"
                f"原文内容：\n{source.full_text}"
            ),
        },
    ]


def build_chunk_rewrite_messages(
    source: SourceContent,
    style_prompt: str,
    chunk_content: str,
    chunk_index: int,
    total_chunks: int,
    context_brief: str = "",
    outline_text: str = "",
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一个专业内容改写助手。"
                "你将收到一篇长文中的一个分块，请只改写该分块。"
                "硬性要求：不编造；保留关键事实；风格要求在不违反事实的前提下必须执行。"
                "保持风格一致与信息密度，避免重复解释明显背景。"
                f"{DIRECT_DELIVERY_GUIDE}"
                f"{_rewrite_structure_guidance(style_profile)}"
                "输出必须是 Markdown（可含小标题/列表），不要输出与该分块无关的内容。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                f"当前是第 {chunk_index}/{total_chunks} 个分块。\n"
                "请输出该分块的改写结果，保留层次、信息密度与关键细节。\n\n"
                f"原文分块：\n{chunk_content}"
            ),
        },
    ]


def build_merge_messages(
    source: SourceContent,
    style_prompt: str,
    chunk_results: list[str],
    context_brief: str = "",
    outline_text: str = "",
    verify_final: bool = False,
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    joined_chunks = "\n\n".join(
        f"### 分块 {index}\n{content}" for index, content in enumerate(chunk_results, start=1)
    )
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    verify_system = (
        "合并后请顺带完成一次终稿校验：补齐明显遗漏的关键事实，修正结构跳跃，并尽量消除重复。"
        if verify_final
        else ""
    )
    verify_user = (
        "以下是长文分块改写结果，请直接合并并校验为一篇结构清晰、自然流畅、事实完整的最终版本：\n\n"
        if verify_final
        else "以下是长文分块改写结果，请合并为一篇结构清晰、自然流畅的最终版本：\n\n"
    )
    return [
        {
            "role": "system",
            "content": (
                "你是一个专业编辑，负责把多个已改写分块整合成一篇完整成稿。"
                "硬性要求：不引入分块中没有的新事实；去掉重复表达；补足段落衔接；保持统一风格与信息密度。"
                "风格要求（用户指令）在不违反事实约束的前提下具有最高优先级。"
                f"{verify_system}"
                f"{DIRECT_DELIVERY_GUIDE}"
                f"输出必须是 Markdown，排版清晰。{_rewrite_structure_guidance(style_profile)}"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                f"{verify_user}"
                f"{joined_chunks}"
            ),
        },
    ]


def build_rewrite_outline_messages(
    source: SourceContent,
    style_prompt: str,
    context_brief: str = "",
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一名中文内容策划编辑。"
                "你的任务不是直接写正文，而是先规划一篇长文改写稿的结构。"
                "你必须只基于给定原文信息，不得添加来源外事实。"
                "输出必须是 Markdown，包含：推荐标题、TL;DR 要点、分节结构、必须保留的关键事实。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"风格要求：{style_prompt}\n\n"
                "请先规划整篇文章的结构，要求：\n"
                f"{_outline_requirements(style_profile)}\n\n"
                f"原文内容：\n{source.full_text[:6000]}"
            ),
        },
    ]


def build_rewrite_verify_messages(
    source: SourceContent,
    style_prompt: str,
    draft_text: str,
    context_brief: str = "",
    outline_text: str = "",
    style_profile: StyleProfile | None = None,
) -> list[dict[str, str]]:
    context_block = f"工作上下文：\n{context_brief}\n\n" if context_brief.strip() else ""
    outline_block = f"结构规划：\n{outline_text}\n\n" if outline_text.strip() else ""
    return [
        {
            "role": "system",
            "content": (
                "你是一名中文总编，负责在不引入新事实的前提下校验并修正长文改写稿。"
                "你必须检查：关键事实是否遗漏、结构是否贴合规划、是否有明显重复或跳跃。"
                "如果草稿已经足够好，也要输出整理后的最终 Markdown，不要只回答“通过”。"
                f"{PRETEXT_GUIDE}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"文章标题：{source.title}\n\n"
                f"{context_block}"
                f"{outline_block}"
                f"风格要求：{style_prompt}\n\n"
                "请检查下面这篇改写稿，必要时直接修正为最终版本。要求：\n"
                "- 不新增原文没有的事实\n"
                "- 尽量补回遗漏的关键事实\n"
                "- 保持结构完整、语言流畅、减少重复\n"
                f"- {_verify_focus_guidance(style_profile)}\n\n"
                f"当前改写稿：\n{draft_text}"
            ),
        },
    ]


def build_image_prompts(
    source: SourceContent,
    transformed_text: str,
    image_config: ImageConfig,
    style_profile: StyleProfile | None = None,
) -> list[str]:
    forced_style = image_config.custom_prompt.strip() or ""
    style_preset = image_config.style_preset.strip() or ""
    style = forced_style or style_preset or "高质量 editorial illustration"
    count = image_config.count

    image_focus_style = {
        StyleImageFocus.NARRATIVE: "电影感叙事插画",
        StyleImageFocus.DIAGRAM: "概念图",
        StyleImageFocus.EDITORIAL: "高质量 editorial illustration",
    }
    if style_profile is not None and style_profile.image_focus in image_focus_style and not forced_style:
        style = image_focus_style[style_profile.image_focus]

    if image_config.smart_mode:
        style = choose_smart_image_style(source.title, transformed_text)
        if style_profile is not None and style_profile.image_focus in image_focus_style:
            style = image_focus_style[style_profile.image_focus]
        count = choose_smart_image_count(transformed_text, max_count=image_config.smart_max_count)
    summary = transformed_text[:1200]
    prompts: list[str] = []
    for index in range(count):
        prompts.append(
            (
                f"基于以下文章内容生成一张配图。"
                f"文章标题：{source.title}。"
                f"视觉风格：{style}。"
                f"生成目标：突出文章主题、避免文字水印、构图清晰。"
                f"文章摘要：{summary}\n"
                f"第 {index + 1} 张图请保持与整体风格一致，但构图略有变化。"
            )
        )
    return prompts


def choose_smart_image_count(transformed_text: str, max_count: int) -> int:
    cleaned = (transformed_text or "").strip()
    length = len(cleaned)
    if length < 800:
        chosen = 1
    elif length < 1800:
        chosen = 2
    else:
        chosen = 3
    return max(1, min(int(max_count) if max_count else 3, chosen, 3))


def choose_smart_image_style(title: str, transformed_text: str) -> str:
    text = f"{title}\n{transformed_text}".lower()

    def score(keywords: set[str]) -> int:
        total = 0
        for keyword in keywords:
            if keyword in text:
                total += 1
        return total

    tech = {
        "ai",
        "aigc",
        "llm",
        "大模型",
        "模型",
        "算法",
        "开源",
        "推理",
        "训练",
        "部署",
        "编程",
        "代码",
        "软件",
        "系统",
        "数据库",
        "架构",
        "产品",
        "平台",
        "云",
        "芯片",
        "GPU".lower(),
    }
    culture = {"诗", "词", "书", "画", "水墨", "国风", "古典", "文学", "历史", "人文"}
    kids = {"儿童", "孩子", "亲子", "绘本", "童话", "故事", "小朋友", "中学生"}
    finance = {"投资", "股票", "基金", "财报", "营收", "利润", "经济", "通胀", "利率", "创业", "商业"}
    art = {"电影", "动画", "漫画", "综艺", "游戏", "娱乐", "二次元"}

    scores = {
        "科技感": score(tech),
        "水墨画": score(culture),
        "童话绘本": score(kids),
        "概念图": score(finance),
        "卡通": score(art),
    }

    # 默认风格：写实（当其他类别不明显时）
    best = "写实"
    best_score = 0
    for name, value in scores.items():
        if value > best_score:
            best = name
            best_score = value

    if best_score == 0:
        return "写实"
    return best

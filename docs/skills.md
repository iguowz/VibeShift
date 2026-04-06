# VibeShift Skills

VibeShift 当前把传给大模型的能力：

- `style_profile`：风格技能，解决“写成什么样”。

这样做的目标，是把原来分散在自由 prompt 里的流程要求、输出约束和能力选择整理成更稳定的结构，减少长任务里模型忽略约束、跑偏或前后不一致的情况。

## 风格技能

风格技能负责约束：

- 目标受众
- 语气与表达
- 推荐结构
- 重点强调项
- 标题策略
- 引用策略
- 配图策略
- 版式策略
- 可视化策略

典型字段示例：

```json
{
  "name": "论文综述",
  "audience": "研究者 / 技术决策者",
  "tone": "严谨、克制、判断明确",
  "structure_template": "TL;DR -> 关键论点 -> 方法与证据 -> 结论",
  "emphasis_points": ["关键事实", "证据来源", "适用边界"],
  "citation_policy": "strict",
  "title_policy": "retain",
  "image_focus": "diagram",
  "layout_format": "paper",
  "visual_mode": "minimal"
}
```

## 功能技能

功能技能负责约束：

- 本轮任务应优先启用哪些能力
- 输出先后顺序
- 是否需要多源整合
- 是否需要证据优先
- 是否需要可视化表达
- 是否需要分享/导出友好的整理方式

字段结构：

```json
{
  "id": "summary_first",
  "label": "重点先行",
  "instruction": "正文开头先给一句导语和 3~6 条重点，再展开细节。"
}
```

当前内置功能技能：

- `summary_first`
  先整理导语和重点，再展开正文。

- `multi_source_merge`
  多链接或多资料场景，先去重、归并和对齐信息，再统一输出。

- `long_context_rewrite`
  面对长文本时先规划结构，再分段改写并合并，保证去重和事实保留。

- `evidence_first`
  调研任务先输出直接结论、关键证据和待确认点，再进入完整报告。

- `visual_pretext`
  只有在数字、对比或步骤链路明确时，才加入 `pretext stats/chart/flow`。

- `image_planning`
  先做插图规划，再生成配图，让图片服务于正文重点。

- `style_fidelity`
  当风格本身对节奏、结构或版式有强约束时，优先保持该风格，不要被通用 TL;DR、报告腔或列表腔压平。

- `share_ready`
  输出要便于复制、分享和导出，避免依赖页面交互才可理解。

## 自动编排规则

前端会根据当前输入和配置自动整理功能技能：

- `discover` 模式会自动加入 `evidence_first`
- 多链接或多资料会自动加入 `multi_source_merge`
- 长文本或 URL 抓取结果会自动加入 `long_context_rewrite`
- 开启增强/少量可视化时会自动加入 `visual_pretext`
- 开启配图时会自动加入 `image_planning`
- 当风格是诗歌、古文书卷、猜谜、故事，或明显要求保留演讲/教程/简报/访谈等结构时，会自动加入 `style_fidelity`
- 所有结果默认附带 `summary_first` 和 `share_ready`

其中诗歌、古文书卷、猜谜、故事、演讲稿、播客口播、书信风、访谈问答等风格不会再被强制挂上通用 `summary_first`，避免把节奏型或对象感风格直接压成“导语 + bullet”。

新增的 `纪实风 / 书信风 / 播客口播 / 辩论风` 也会通过 `style_fidelity` 把事实脉络、对象感、口播节奏和论点攻防稳定传给大模型。

完整整改记录见 [style-evaluation.md](docs/style-evaluation.md)。

风格设置页会直接展示本轮命中的功能技能与命中原因，便于核对当前看到的 skill 是否和发送给模型的一致。

## 在提示词中的使用

后端会把 `style_profile` 与 `function_skills` 一起拼进提示词。例如：

```text
风格技能：论文综述
- 目标受众：研究者 / 技术决策者
- 推荐结构：TL;DR -> 关键论点 -> 方法与证据 -> 结论
- 引用策略：关键判断、建议和结论都应尽量标注来源编号。
- 版式策略：整体排版采用论文/研究报告感
- 功能技能：
  - [重点先行] 正文开头先给一句导语和 3~6 条重点，再展开细节。
  - [证据优先] 调研场景先写直接结论，再列关键证据、待确认点与推荐动作。
```

这样模型看到的不是一段散乱的 prompt，而是一套明确的“风格约束 + 功能约束”。

# VibeShift Backend

## 启动

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

## 环境变量

示例见 `backend/.env.example`（前缀 `VIBESHIFT_`），生产环境建议至少设置：

- `VIBESHIFT_APP_ENV=production`
- `VIBESHIFT_CORS_ORIGINS`（仅当需要跨域访问时设置白名单）
- `VIBESHIFT_LOCAL_LLM_REQUEST_TIMEOUT_SECONDS`（本地模型长文本单次请求超时，默认 `420` 秒）
- `VIBESHIFT_REWRITE_MAX_CONCURRENCY`（长文本分块改写并发度，默认 `3`）
- `VIBESHIFT_MAX_URL_INPUTS`（单次 URL 改写最多允许输入的链接数量，默认 `8`）
- `VIBESHIFT_RUNS_DIRECTORY`（工作流运行目录，默认 `.runs`）
- `VIBESHIFT_ARTIFACT_PREVIEW_CHARACTERS`（响应中间产物预览长度）

## 本次优化

- 长文本分块改写支持受控并发，减少超长正文的整体等待时间。
- 长文本改写会结合当前模型配置的 `max_tokens` 动态缩小分块窗口，再决定是否分块、规划和合并，减少一次性塞入过长上下文导致的失败。
- 长文本 `transform` 现在会自动走“规划结构 -> 分块改写 -> 校验成稿”链路，只在长文场景增加额外模型调用，短文本仍保持低延迟快路径。
- 对本地模型（如 Ollama）的大段长文改写，后端会自动串行化分块、按阶段收紧 `max_tokens`，并把“合并 + 校验”折成一次调用，减少分块排队超时和总耗时。
- `transform` 的 URL 输入现在支持多个链接；后端会并发抓取、容忍部分失败并聚合成功正文后再统一改写。
- 后端新增更详细的请求日志、`AppError` 日志和转换分块计划日志，便于直接通过 Docker logs 判断是抓取失败、正文提取失败还是模型调用失败。
- `transform`、`cost`、`discover` 共用 URL 解析器；对相同 URL 的并发抓取增加单飞去重，缓存未命中时也不会重复抓网页。
- `discover` 的 follow-up 检索改为并发执行，并对单条补充查询失败做容错，不会轻易拖垮整轮调研。
- 当默认搜索引擎为 `baidu,github` 时，后端会保留百度的原中文查询，同时只在代码/技术相关问题上单独给 GitHub 构造 ASCII 技术关键词查询，并发合并结果；此外还会补充面向百科、知乎、小红书、公开线上图书、公开论文的定向检索。每条检索结果都会标注 `source_type / relevance_score / credibility_score / overall_score`，供后续来源筛选与前端展示使用。
- `discover` 主链路升级为“证据抽取 -> 证据简报 -> 调研草稿 -> 正式报告”；结构化证据包会优先供后续写作阶段消费，并对研究简报 JSON 做了解析兜底，模型偶发跑偏时仍能继续产出结果。
- `discover` 新增 `resume` 能力，可从历史 run 的 `sources / brief / draft` artifact 继续执行后续阶段，避免重复检索与重复整理。
- `/api/transform` 与费用估算接口现在显式拒绝 `discover` 输入类型，避免错误路由到文本改写链路。
- `transform` / `discover` 响应新增 `run`，包含阶段时间线、artifact 列表和本地工作目录；后端会把来源、压缩上下文、草稿等真实落盘。前端虽然不再在结果页直出任务轨迹，但历史恢复和阶段重跑仍依赖这些 artifact。
- `transform` / `discover` / `cost` 请求新增可选 `style_profile`，把风格技能中的受众、语气、结构模板、强调点、标题策略、引用策略和配图倾向传入后端提示词与插图规划。
- `style_profile` 现在还支持携带自动整理的 `function_skills`，把重点先行、多源整合、长文改写、证据优先、可视化表达、插图规划、分享导出等能力打包成稳定的 skill 结构，便于大模型直接消费。
- `style_profile` 现在也支持更细的 `layout_format` 与 `visual_mode`，包括 `newspaper / poster / book / classical / ppt / paper / poetry`，便于前端把版式和可视化偏好稳定传入后端。
- `/api/style-prompts/optimize` 现在除了返回 `optimized_prompt`，还会返回结构化 `profile_suggestion`，便于前端把优化结果直接编译回风格技能字段。
- `/api/style-prompts/optimize` 的兜底逻辑也改成按风格族补齐“生成流程 / 推荐结构 / 结果展示形式”，即使模型优化接口失败，也不会退回单一通用模板。
- `/api/style-prompts/recommend` 支持让前端把当前输入和候选风格发给大模型做自动匹配，失败时前端再回退本地启发式推荐。
- `/api/style-prompts/optimize` 也支持接收 `current_profile` 与 `memory_hints`，可让前端把当前风格、已接受的历史风格记忆，以及从近期成功 run 反推出来的风格线索一起提供给优化器，形成轻量 procedural memory。
- 前端近期任务记忆现在还会记录质量分、恢复次数和显式收藏状态，用这些信号给 `memory_hints` 排序，避免把低价值历史任务和高质量样本等权对待。

## 风格技能入参

前端现在会把风格拆成两层：

- `style_prompt`：原始自由提示词，用于保留用户手写指令。
- `style_profile`：结构化风格技能，用于稳定约束提示词和图片规划。
- 当前内置风格除了故事风、PPT 汇报、论文风、诗歌风等，也补齐了纪实风、书信风、播客口播、辩论风；这类节奏感更强的风格会额外触发 `style_fidelity` 守则。

`style_profile` 示例：

```json
{
  "name": "公众号深读",
  "audience": "产品经理",
  "tone": "克制、判断明确",
  "structure_template": "TL;DR -> 拆解 -> 结论",
  "emphasis_points": ["关键事实", "落地建议"],
  "citation_policy": "strict",
  "title_policy": "punchy",
  "image_focus": "diagram",
  "layout_format": "ppt",
  "visual_mode": "enhanced",
  "function_skills": [
    {
      "id": "summary_first",
      "label": "重点先行",
      "instruction": "正文开头先给一句导语和 3~6 条重点，再展开细节。"
    },
    {
      "id": "visual_pretext",
      "label": "可视化表达",
      "instruction": "只有在正文里存在明确数字、比较关系或步骤链路时，才加入 pretext 统计卡、图表或流程图。"
    }
  ]
}
```

这部分数据会参与：

- 改写提示词拼装，减少长任务里风格漂移。
- `discover` 报告生成，确保调研输出结构更稳定。
- 插图提示词规划，让“概念图 / 编辑配图 / 写实封面”等倾向可控。
- 功能技能编排，让模型明确知道当前任务是否需要多源整合、重点前置、长文改写、证据优先或分享导出友好排版。

## Discover 返回结构

`POST /api/discover` 现在除了最终 `transformed_text`，还会返回结构化 `brief`：

- `summary`：本轮研究的摘要
- `conclusion`：对查询问题的直接回答
- `key_findings`：关键发现列表
- `evidence`：带 `source_id` / `url` / `quote` 的关键证据
- `uncertainties`：仍待确认的问题
- `draft_outline`：从证据到成稿的转写提纲

这让前端可以先展示证据和不确定点，再展示最终报告，提升调研链路的可信度与可恢复性。

如果请求体里带上：

```json
{
  "resume": {
    "run_id": "run_xxx",
    "stage": "brief"
  }
}
```

后端会直接从该 run 的历史 artifact 继续执行：

- `sources`：复用历史来源与上下文，重新生成简报、草稿和正式报告
- `brief`：复用历史来源、上下文与研究简报，只重跑草稿和正式报告
- `draft`：复用历史来源、简报与草稿，只重写正式报告

## 测试

```bash
pytest
```

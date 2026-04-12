# VibeShift

**VibeShift** 是一个内容转换工具：输入一个或多个网页 URL、正文或调研问题，选择目标风格，大模型便会自动改写内容，并可生成配图。支持长文本、多源合并、探索发现（调研报告）等高级能力。

## 核心特性

- **多模式输入**：支持 URL（多个）、直接文本、调研问题
- **风格技能**：内置 20+ 风格（故事风、论文风、通俗风、简报风等），支持自定义受众、语气、结构、配图倾向
- **自动风格匹配**：优先用大模型识别当前输入最合适的风格，失败时回退本地启发式推荐，并同步展示推荐结构、生成流程与结果展示形式
- **风格化速览**：结果页 / 调研页会按风格切换摘要提取方式与卡片排序，例如海报风优先快扫重点，访谈风优先关键问答，书籍风优先章节线索
- **风格化正文与历史页**：结果页、调研详文、历史快照都会按风格切换正文模块，例如问答块、步骤块、章节块、诗节块、开场/收束块
- **多风格预览对比**：输入区会展示模型优先推荐和若干备选风格的结构、展示形式与生成流程差异，可直接一键切换
- **真实风格预演**：多风格预览卡会继续请求后端生成不同风格下的开头示例与预演重点，便于在开始前比较差异
- **自动功能技能**：重点先行、多源合并、长文规划、证据优先、插图规划、分享导出等，自动匹配任务
- **长文本处理**：分块并发改写 + 结构规划 + 成稿校验，降低超长内容失败率
- **探索发现**：检索 → 证据抽取 → 简报 → 调研报告，支持阶段重跑
- **历史与记忆**：按 profile 保存最近结果、风格记忆、高质量结果收藏与推荐
- **图像生成**：可规划插图，支持单图重生成
- **分享导出**：主按钮会直接复制当前风格最适合分发的默认成稿（如 `公众号长文 / 知乎回答 / 小红书笔记`），更多场景成稿和 PDF 导出也都会保留对应风格的可直接使用形态；`speech / letter / briefing / editorial` 等风格在复制分享时会自动转成更像真实发言稿、公开信、对外简报和评论稿的场景化成稿，并进一步按 `wechat / zhihu / xiaohongshu / moments` 调整标题、要点和语气密度；改写页、调研详文和历史详文页都会按风格补充导语判断 / 上手导读 / 开场定调、关键信息块、分段导览、段间转场、章节前引和收束落点，调研页会先展示“可直接发送版”简报，支撑材料后置，调研页与历史调研页也都会随当前 `简报 / 详文` 标签导出对应成稿

## 快速开始

### 本地开发

**后端（FastAPI）**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

**前端（Vue 3 + Vite）**

```bash
cd frontend
npm install
npm run dev
```

前端默认代理 `/api` 到 `http://localhost:8000`，超时已调整为 180 秒（长文本场景）。

**运行前端测试**

```bash
cd frontend
npm test
```

### Docker 启动

```bash
docker compose up --build
```

- 后端：`http://localhost:8000`
- 前端：`http://localhost:5173`（Nginx 托管）
- SearXNG（用于探索发现检索）：`http://localhost:8081`

Docker 环境时区统一为 `Asia/Shanghai`，前端 Nginx 上游超时 1200 秒。

## 配置

### Profile（多用户隔离）

通过 URL 参数 `profile` 切换本地存储命名空间，同一设备多用户互不影响：

```
http://localhost:5173/?profile=alice
http://localhost:5173/?profile=bob
```

模型/插图设置会在默认空间额外备份一份，避免切换后配置丢失。

### 环境变量

后端使用前缀 `VIBESHIFT_`，示例见 `backend/.env.example`。常用变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VIBESHIFT_APP_ENV` | `development` / `production` | `development` |
| `VIBESHIFT_REQUEST_TIMEOUT_SECONDS` | 通用模型请求超时 | 180 |
| `VIBESHIFT_FETCH_TIMEOUT_SECONDS` | 网页抓取超时 | 30 |
| `VIBESHIFT_SEARXNG_ENGINES` | 探索发现搜索引擎 | `baidu,github` |
| `VIBESHIFT_REWRITE_CHUNK_SIZE_CHARACTERS` | 长文本分块大小 | 3000 |
| `VIBESHIFT_RUNS_DIRECTORY` | 工作流运行目录 | `backend/.runs` |

前端环境变量（`frontend/.env.example`）：

- `VITE_API_BASE_URL`：后端 API 地址（默认 `/api`，适用于同域反代）

## API 接口

- `GET /health` – 健康检查
- `POST /api/transform` – 改写（URL/文本，可选插图）
- `POST /api/discover` – 探索发现（关键词 → 调研报告）
- `POST /api/providers/test` – 测试 LLM 连通性
- `POST /api/style-prompts/optimize` – 一键优化风格提示词
- `POST /api/style-prompts/recommend` – 按当前输入推荐最匹配的风格
- `POST /api/images/regenerate` – 单图重生成
- `POST /api/cost/estimate` – 费用/Token 估算（不调用模型）

完整文档启动后端后访问 `http://localhost:8000/docs`（Swagger UI）。

**错误结构**（统一返回）

```json
{
  "error": {
    "code": "xxx",
    "message": "xxx",
    "suggestion": "xxx"
  }
}
```

## 技能系统

VibeShift 将大模型可消费的能力分为两层：

- **`style_prompt`**：自由提示词，保留用户手写要求。
- **`style_profile`**：结构化风格技能，稳定约束受众、语气、结构、标题/引用/配图策略。
- **`style_profile.function_skills`**：自动生成的功能技能，告诉模型本轮任务的重点与输出组织方式。

当前结果页和调研页也会按 `style_profile` 自动切换“建议读法 / 推荐流程 / 展示形式”，让问答、教程、简报、海报、章节长文等风格不再都被压成同一种摘要视图。

内置功能技能示例：

- `summary_first`：重点先行（导语+重点，再展开细节）
- `multi_source_merge`：多源合并（去重、归并对齐）
- `long_context_rewrite`：长文本先规划结构，再分段改写
- `evidence_first`：调研链路优先证据与结论
- `image_planning`：先做插图规划，再生成配图
- `share_ready`：便于复制分享与导出

详细说明见 [docs/skills.md](docs/skills.md)。

## 安全说明

- API Key **仅由前端随请求发送**，后端不做任何持久化存储（不写数据库/缓存）。
- 生产环境请使用 HTTPS，避免在不可信网络下暴露个人 Key。

## 更多文档

- [部署说明](docs/deployment.md)
- [风格评估记录](docs/style-evaluation.md)

---

**注意**：长文本分块参数、并发限制等高级调优项见 `backend/.env.example` 及源码注释。

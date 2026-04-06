# VibeShift

**VibeShift** 是一个内容转换工具：输入一个或多个网页 URL、正文或调研问题，选择目标风格，大模型便会自动改写内容，并可生成配图。支持长文本、多源合并、探索发现（调研报告）等高级能力。

## 核心特性

- **多模式输入**：支持 URL（多个）、直接文本、调研问题
- **风格技能**：内置 20+ 风格（故事风、论文风、通俗风、简报风等），支持自定义受众、语气、结构、配图倾向
- **自动功能技能**：重点先行、多源合并、长文规划、证据优先、插图规划、分享导出等，自动匹配任务
- **长文本处理**：分块并发改写 + 结构规划 + 成稿校验，降低超长内容失败率
- **探索发现**：检索 → 证据抽取 → 简报 → 调研报告，支持阶段重跑
- **历史与记忆**：按 profile 保存最近结果、风格记忆、高质量结果收藏与推荐
- **图像生成**：可规划插图，支持单图重生成
- **分享导出**：一键复制（小红书/朋友圈等格式）、PDF 导出

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
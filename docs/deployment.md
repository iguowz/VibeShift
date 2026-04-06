# 部署与运行指南（T36）

本文档面向“可复现部署”，覆盖本地开发、Docker Compose、以及推荐的同域反代部署方式。

## 1. 本地开发（推荐）

### 1.1 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

### 1.2 启动前端（带 `/api` 代理）

前端默认请求 `/api`，开发模式下由 Vite 代理转发到 `http://localhost:8000`。

```bash
cd frontend
npm install
npm run dev
```

验证：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:8000/health`
- 前端请求应命中：`/api/transform`、`/api/providers/test` 等接口（由代理转发）

## 2. Docker Compose（同域反代：前端容器代理 `/api`）

项目内置了一份前端 Nginx 配置，会把 `/api/*` 反代到后端服务（service 名 `backend`）。

### 2.1 启动

```bash
docker compose up --build
```

默认端口：

- 前端：`http://localhost:5173`（容器内 Nginx:80）
- 后端：`http://localhost:8000`

说明：

- 前端 Nginx 已将 `/api/*` 的 `proxy_read_timeout` / `proxy_send_timeout` 调整到 `1200s`，避免 `transform` / `discover` 这类多阶段长任务在 Docker 部署下被默认网关超时提前中断。

### 2.2 验收点

1. 打开 `http://localhost:5173`，提交一次“文本改写”应成功返回结果。
2. 开启“插图生成”后，文字先返回、图片逐张生成，并显示进度/ETA。
3. 若图像生成失败，按 UI 配置执行“简化提示词/备选模型”重试一次。

## 3. 推荐的生产拓扑

生产环境建议让前端与后端保持同域（避免跨域与 CORS 复杂度）：

- 浏览器访问 `https://your-domain/`
- 同域 `/api/*` 由 Nginx/网关反代到后端 `:8000`

在这种拓扑下：

- 前端无需配置 `VITE_API_BASE_URL`（默认 `/api`）
- 后端无需开放 CORS（浏览器不跨域）

## 4. 环境变量建议

后端（见 `backend/.env.example`）：

- `VIBESHIFT_APP_ENV=production`：生产下 500 错误不返回 `details`
- `VIBESHIFT_CORS_ORIGINS`：若确实需要跨域访问再设置为白名单
- `VIBESHIFT_REQUEST_TIMEOUT_SECONDS`：通用模型请求超时
- `VIBESHIFT_LOCAL_LLM_REQUEST_TIMEOUT_SECONDS`：本地模型（如 Ollama）长文本请求超时
- `VIBESHIFT_FETCH_TIMEOUT_SECONDS`：网页抓取超时
- `VIBESHIFT_SEARXNG_ENGINES`：探索发现默认搜索引擎，当前建议 `baidu,github`；系统会在此基础上自动补充百科 / 问答 / 社区笔记 / 图书 / 论文等定向检索
- `VIBESHIFT_REWRITE_MAX_CONCURRENCY`：长文本分块并发改写上限；本地模型建议从 `2~3` 起调，避免把单机模型打满
- `VIBESHIFT_RUNS_DIRECTORY`：任务工作目录；若要长期保留运行产物，建议挂载到持久卷
- `VIBESHIFT_ARTIFACT_PREVIEW_CHARACTERS`：API 返回给前端的 artifact 预览长度，过大可能增加响应体积

前端（见 `frontend/.env.example`）：

- `VITE_API_BASE_URL=/api`：同域反代场景（默认值）
- 若必须跨域直连后端：`VITE_API_BASE_URL=http://<host>:8000/api`（注意：Vite 环境变量是“构建期注入”，改完需要重新构建前端）

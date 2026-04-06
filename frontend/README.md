# VibeShift Frontend

## 启动

```bash
npm install
npm run dev
```

默认情况下，前端会请求 `/api`；开发模式下 Vite 已内置代理到 `http://localhost:8000`（见 `frontend/vite.config.ts`）。
如需跨域直连后端（不走代理/反代），请在构建前设置 `VITE_API_BASE_URL=http://<host>:8000/api` 并重新构建。

## 构建

```bash
npm run build
```

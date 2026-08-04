# 公司项目管理平台

这是一个可交付使用的全栈项目管理平台，包含前端 Web 应用和后端 API 服务。

## 目录

- `web/`：React + TypeScript 前端应用
- `api/`：Node.js + SQLite 后端 API 服务
- `docs/`：设计文档与实施说明

## 启动

安装依赖：

```bash
npm install
```

开发（API + Vite 代理）：

```bash
npm run dev
```

默认地址：

- 前端（Vite）：http://localhost:5173
- 后端 API：http://localhost:4010

## 内部试用 / 单机生产（同源）

单进程托管 **API + `web/dist` 静态前端**（`/api`、`/ws` 同源）：

```bash
npm run build -w web
# 必填生产密钥（≥16，且 AI_CONFIG_ENCRYPTION_KEY ≠ JWT_SECRET）
export JWT_SECRET='replace-me-16chars'
export AI_CONFIG_ENCRYPTION_KEY='replace-me-ai-16'
export NODE_ENV=production
export SEED_DEMO_DATA=0
export SEED_ADMIN_EMAIL='owner@company.com'
export SEED_ADMIN_PASSWORD='replace-with-one-time-strong-password'
npm run start:prod
```

浏览器打开：http://localhost:4010/  
健康检查（含 DB / 迁移 readiness）：`GET /api/health`

部署、备份与回滚见 [docs/16-sqlite-trial-deploy.md](./docs/16-sqlite-trial-deploy.md)。

## 构建与门禁

```bash
npm run build
npm run check          # audit+lint+test+build+preflight+drills+prod smoke
npm run check:rc       # check + disposable SQLite E2E
```

正式登录页不会展示或预填任何账号、邮箱或密码。全新数据库首次启动时，必须同时配置
`SEED_ADMIN_EMAIL` 和 `SEED_ADMIN_PASSWORD` 创建首位管理员；首次登录并修改密码后，移除这两个环境变量再重启。

## 开发测试账号

以下账号只用于本地开发和自动化测试，不用于生产交付，业务数据默认为空：

- 管理员：`admin@example.com` / `Admin@123`
- 项目经理：`pm@example.com` / `Pm@12345`
- 产品经理：`pdm@example.com` / `Pdm@12345`
- 开发：`dev@example.com` / `Dev@12345`
- 测试：`qa@example.com` / `Qa@12345`

生产环境禁止 `SEED_DEMO_DATA=1` 和其他角色的 `SEED_*_PASSWORD`。若需在管理端持久化 AI 供应商 API Key，还必须单独配置 `AI_CONFIG_ENCRYPTION_KEY`（≥16 字符，且不得与 `JWT_SECRET` 相同）。

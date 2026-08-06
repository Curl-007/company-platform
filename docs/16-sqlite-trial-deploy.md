# 单机 SQLite 内部试用部署与回滚

> **文档版本**：v1.0（2026-07-23）  
> **范围**：单进程 Node 托管 API + 前端静态资源 + 默认 SQLite；**非**多实例/负载均衡/PostgreSQL 生产切库。  
> **分支基线**：`main`

## 1. 目标形态

| 项 | as-built |
|----|----------|
| 进程 | 单一 `node`：`api/server.js`（或 `npm run start:prod`） |
| 前端 | `web/dist` 由 API 同源托管（`SERVE_WEB=1` / 生产默认有 dist 时开启） |
| API / WS | `/api/*`、`/ws/collab` 与页面同 origin（前端 `BASE_URL=''`、协作 WS 用 `location.host`） |
| 数据库 | 默认 SQLite 文件（`DATABASE_FILE` 或 `api/app.db`） |
| 健康检查 | `GET /api/health`：DB `SELECT 1` + SQLite 迁移 ledger；失败 **503** |

开发仍用 `npm run dev`（API + Vite 代理）。`npm start` 保留「API + Vite dev」联调；**试用/生产入口是 `npm run start:prod`**。

## 2. 前置条件

- Node `>=22 <26`，`npm >=10`
- 已 `npm ci` 或 `npm install`
- 已构建前端：`npm run build -w web`（产出 `web/dist/index.html`）
- 生产强制环境变量（缺则进程退出）：
  - `JWT_SECRET`（≥16）
  - `AI_CONFIG_ENCRYPTION_KEY`（≥16，且 **不得** 等于 `JWT_SECRET`）
- 禁止生产：`ENABLE_HTTP_SHUTDOWN=1`、`RATE_LIMIT_TRUST_LOCAL=1`

## 3. 推荐环境变量

```bash
export NODE_ENV=production
export PORT=4010
export JWT_SECRET='replace-with-long-random'
export AI_CONFIG_ENCRYPTION_KEY='replace-with-other-long-random'
export DATABASE_FILE='/var/lib/pm/app.db'   # 持久卷路径
export SERVE_WEB=1                          # start:prod 默认开启
export WEB_DIST='/path/to/web/dist'         # 可选；默认 monorepo web/dist
export CORS_ORIGIN='http://localhost:4010'  # 同源可留默认；若反代域名需写入
export SEED_DEMO_DATA=0                     # 生产强制关闭演示业务数据
export SEED_ADMIN_EMAIL='owner@company.com' # 仅全新空库首次启动使用
export SEED_ADMIN_PASSWORD='one-time-strong-password'
export AI_ENABLED=false                     # 无外网模型时可关
# 纯 HTTP 部署不要开 HSTS / 不要让 CSP upgrade-insecure-requests
# （Helmet 默认项已在 SERVE_WEB 路径关闭；仅 TLS 终止后可设 ENABLE_HSTS=1）
# export ENABLE_HSTS=1
```

Windows PowerShell 示例：

```powershell
$env:NODE_ENV='production'
$env:PORT='4010'
$env:JWT_SECRET='replace-with-long-random'
$env:AI_CONFIG_ENCRYPTION_KEY='replace-with-other-long-random'
$env:DATABASE_FILE='D:\data\pm\app.db'
$env:SERVE_WEB='1'
$env:SEED_DEMO_DATA='0'
$env:SEED_ADMIN_EMAIL='owner@company.com'
$env:SEED_ADMIN_PASSWORD='one-time-strong-password'
```

## 4. 启动 / 停止

```bash
# 构建 + 门禁（可选，发布前）
npm run check

# 生产单进程（含静态前端）
npm run start:prod
# 等价：node scripts/start-prod.js
```

浏览器访问：`http://<host>:<PORT>/`（HashRouter，如 `/#/login`）。

停止：

- Linux/macOS：对进程发 **SIGTERM** / **SIGINT**（会关 WSS、HTTP、`closeDatabase`）
- Windows 服务/任务管理器结束进程；**不要**依赖 `ENABLE_HTTP_SHUTDOWN`（生产禁止）

本地运维演练（非生产）：

```bash
npm run drill:graceful-shutdown
npm run smoke:prod
```

## 5. 部署检查清单

1. `npm run preflight:env`（生产 secrets 齐全）
2. 确认 `DATABASE_FILE` 父目录可写
3. `npm run build -w web`
4. `npm run start:prod`
5. `curl -sf http://127.0.0.1:$PORT/api/health | jq .data.checks`
   - `checks.database.ok == true`
   - `checks.migrations.ok == true`（SQLite）
   - `serveWeb == true`
6. 确认响应头无 `upgrade-insecure-requests`、无 HSTS（纯 HTTP）：
   - `curl -sI http://127.0.0.1:$PORT/ | rg -i "content-security-policy|strict-transport"`
7. 浏览器打开首页；登录页应为空，且不显示任何演示账号或密码。
8. 全新空库使用 `SEED_ADMIN_EMAIL` 与 `SEED_ADMIN_PASSWORD` 登录，立即修改密码；随后停止服务、移除这两个变量并重启。
9. （可选）`npm run preflight:database -w api -- --database "$DATABASE_FILE"`

## 6. 备份与回滚

### 6.1 备份（发布前 / 每日）

```bash
npm run backup:sqlite -w api -- --database "$DATABASE_FILE" --out /var/backups/pm --label pre-release
```

备份目录含主库副本、wal/shm（若有）与 `manifest.json`（sha256）。

### 6.2 应用回滚（代码）

1. 停进程（SIGTERM）
2. 检出上一 RC 标签或 commit（例：`rc-2026.07.23-startup`）
3. `npm ci && npm run build -w web`
4. `npm run start:prod`

### 6.3 数据回滚（SQLite）

**先停进程**，再恢复，避免覆盖打开中的库：

```bash
# 确认备份目录
npm run restore:sqlite -w api -- --from /var/backups/pm/<backup-dir> --database "$DATABASE_FILE" --force
npm run preflight:database -w api -- --database "$DATABASE_FILE"
npm run start:prod
```

自动化演练（临时库，不碰生产文件）：

```bash
npm run drill:sqlite-backup
```

## 7. 反向代理（可选）

若前置 Nginx/Caddy **并终止 TLS**：可在本进程设 `ENABLE_HSTS=1`，或由反代统一下发 HSTS；**切勿**在纯 HTTP 直连场景开启。

若前置 Nginx/Caddy：

- `location /` → `proxy_pass http://127.0.0.1:4010`
- WebSocket：`/ws/` 升级头（`Upgrade`、`Connection`）
- TLS 终止后可设 `X-Forwarded-Proto`；应用当前主要看同源路径，不强制 trust proxy

## 8. 已知边界（试用）

- 单机文件锁：不要多进程写同一 `DATABASE_FILE`
- 无内置对象存储：上传落在 `api/storage`（随进程盘）
- Git remote 未配置时 RC 标签仅本地；发布需自行 `git remote` + push 标签
- PostgreSQL 仅为可选验证路径，见 `docs/postgresql-migration-runbook.md`

## 9. 相关命令速查

| 命令 | 用途 |
|------|------|
| `npm run start:prod` | 单机生产/试用 |
| `npm run smoke:prod` | 临时库 + 静态 + readiness 冒烟 |
| `npm run drill:graceful-shutdown` | 优雅停机演练 |
| `npm run drill:sqlite-backup` | 备份→改数→恢复 |
| `npm run preflight:env` | 环境变量预检 |
| `npm run preflight:database` | 库 integrity + 迁移 ledger |
| `npm run check` | 本地全量门禁（含 smoke:prod） |

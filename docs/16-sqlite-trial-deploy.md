# 单机 SQLite 内部试用部署与回滚

> **文档版本**：v1.1（2026-08-14）  
> **范围**：单机 API 服务实例托管前端静态资源、默认 SQLite，以及由 API 受管的 DeepSeek Harness JSON-RPC 子进程；**非**多实例/负载均衡/PostgreSQL 生产切库。  
> **分支基线**：`main`

## 1. 目标形态

| 项 | as-built |
|----|----------|
| 进程 | 单一 `node`：`api/server.js`（或 `npm run start:prod`） |
| 前端 | `web/dist` 由 API 同源托管（`SERVE_WEB=1` / 生产默认有 dist 时开启） |
| API / WS | `/api/*`、`/ws/collab` 与页面同 origin（前端 `BASE_URL=''`、协作 WS 用 `location.host`） |
| 数据库 | 默认 SQLite 文件（`DATABASE_FILE` 或 `api/app.db`） |
| AI 推理内核 | 所有 LLM 推理由 API 受管的 **DeepSeek Harness** JSON-RPC runtime 执行；业务 API、RBAC、审计、AI Job、人工确认和业务写入仍由平台控制面负责 |
| Provider 出站 | Harness 仅访问 API 在 `127.0.0.1` 随机端口启动的 loopback 代理；每个 runtime 使用短生命周期随机 token，真实 Provider Key 只在 API 控制面内存/加密配置中出现 |
| 健康检查 | `GET /api/health`：DB `SELECT 1` + SQLite 迁移 ledger；失败 **503**。它表示控制面 readiness，**不等同于** Provider 或 Harness 推理 readiness |

开发仍用 `npm run dev`（API + Vite 代理）。`npm start` 保留「API + Vite dev」联调；**试用/生产入口是 `npm run start:prod`**。

## 2. 前置条件

- Node `>=22.19 <26`，`npm >=10`（Harness RC 依赖当前 Node 22.19+ 运行时）
- 已 `npm ci` 或 `npm install`
- 已构建前端：`npm run build -w web`（产出 `web/dist/index.html`）
- 已为 API 服务账户准备独立、持久、不可由 Web 访问的 `HARNESS_HOME`；该目录保存 Harness JSONL session 与已接收图片附件，必须限制为该服务账户可读写
- 已确认 `api/config/harness/cordis.yml` 为受审查的随包配置，且 `npm ci` 安装了锁定版本的 Harness runtime 包；不要用全局安装或未锁定的 RC 覆盖它
- 生产强制环境变量（缺则进程退出）：
  - `JWT_SECRET`（≥16）
  - `AI_CONFIG_ENCRYPTION_KEY`（≥16，且 **不得** 等于 `JWT_SECRET`）
- 禁止生产：`ENABLE_HTTP_SHUTDOWN=1`、`RATE_LIMIT_TRUST_LOCAL=1`
- Harness composition 默认关闭 `workspaceContext`、skills、bash、jobs 与 goals；在业务 MCP 工具经过平台 RBAC、审计和审批边界接入前，不得在生产配置中打开它们

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
export SEED_ADMIN_EMAIL='admin@company.com' # 交付包内置初始管理员（仅全新空库首次启动使用）
export SEED_ADMIN_PASSWORD='Admin@123456'   # 固定初始密码，首次登录后立即修改
export AI_ENABLED=true                      # false 时仅走平台本地规则降级，不会启动 LLM 推理
# 以下是 API 控制面的 Provider 默认值；数据库中的已加密活动 Provider 配置可覆盖它们。
export AI_PROVIDER='openai-compatible'
export AI_BASE_URL='https://api.openai.com/v1'
export AI_MODEL='gpt-4o-mini'
export AI_WIRE_API='chat_completions'
export AI_TIMEOUT_MS=30000
# 仅供 API 父进程读取的初始 Provider Key；Harness 子进程永远拿不到它。
# export AI_API_KEY='replace-with-provider-key'
# 如果 Provider 是受信任的私网/本地模型，需显式允许精确主机或 IP。值不含协议、端口或路径，多个值以逗号分隔；不支持通配符或 CIDR。
# 对 http://192.168.3.18:8000/v1 的示例：
# export AI_PROVIDER_PRIVATE_HOST_ALLOWLIST='192.168.3.18'
# Harness 自身的隔离持久目录。不要使用服务账户默认 ~/.dsh，也不要放到 web/dist。
export HARNESS_HOME='/var/lib/pm/harness'
# 默认是 api/config/harness/cordis.yml；仅在变更管理批准后覆盖。
# export HARNESS_RUNTIME_CONFIG='/opt/company-platform/api/config/harness/cordis.yml'
# 可选：完整替换 runtime 启动命令；这两个变量必须成对设置。ARGS 必须是 JSON 字符串数组。
# 仅当自定义 bin 自行读取注入的 DSH_CORDIS_CONFIG 时才可使用空数组。
# export HARNESS_RUNTIME_COMMAND='/opt/company-platform/bin/dsh-jsonrpc-agent'
# export HARNESS_RUNTIME_ARGS='[]'
export HARNESS_MAX_RUNS_PER_RUNTIME=20
export HARNESS_DEFAULT_MAX_TOKENS=4096
# 不要设置 DSH_API_KEY、DSH_BASE_URL、DSH_HOME 或 DSH_CORDIS_CONFIG：
# API 会为每个 runtime 生成受限的 child-only DSH_* 环境和随机 loopback token。
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
$env:SEED_ADMIN_EMAIL='admin@company.com'
$env:SEED_ADMIN_PASSWORD='Admin@123456'
$env:AI_ENABLED='true'
# 只在接入受信任的私网 Provider 时设置；不含 :8000 或 /v1。
# $env:AI_PROVIDER_PRIVATE_HOST_ALLOWLIST='192.168.3.18'
$env:HARNESS_HOME='D:\data\pm\harness'
$env:HARNESS_MAX_RUNS_PER_RUNTIME='20'
$env:HARNESS_DEFAULT_MAX_TOKENS='4096'
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

- Linux/macOS：对进程发 **SIGTERM** / **SIGINT**（会停止 AI 接收队列、关闭 Harness runtime 与 loopback proxy、再关 WSS、HTTP、`closeDatabase`）
- Windows 服务/任务管理器结束进程；**不要**依赖 `ENABLE_HTTP_SHUTDOWN`（生产禁止）

本地运维演练（非生产）：

```bash
npm run drill:graceful-shutdown
npm run smoke:prod
```

## 5. 部署检查清单

1. `npm run preflight:env`（生产 secrets 齐全）
2. 确认 `DATABASE_FILE` 父目录可写
3. 确认 `HARNESS_HOME` 可由 API 服务账户创建/写入，位于持久卷且不在静态资源根目录；确认 `HARNESS_RUNTIME_CONFIG`（若设置）为受审查的可读文件
4. `npm run build -w web`
5. `npm run start:prod`
6. `curl -sf http://127.0.0.1:$PORT/api/health | jq .data.checks`
   - `checks.database.ok == true`
   - `checks.migrations.ok == true`（SQLite）
   - `serveWeb == true`
   - 该检查只验证 API 控制面与数据层；Provider 不可用、Harness 尚未首次按需启动，均不应单独把它解释为 AI 推理成功或失败
7. 以管理员身份在系统设置执行 Provider 连接测试，确认推理结果、Provider 健康证据和审计均写回平台；不要把这一测试替换为直接暴露 Harness runtime 或 Web UI。
   - 接入 `http://192.168.3.18:8000/v1` 这类私网地址前，先在 **API 服务进程** 的环境中设置 `AI_PROVIDER_PRIVATE_HOST_ALLOWLIST=192.168.3.18`，然后重启 API。系统设置的“测试连接”由 API/Harness 发起，不使用浏览器的网络连通性；因此该地址还必须能被部署 API 的主机或容器访问。
8. 确认响应头无 `upgrade-insecure-requests`、无 HSTS（纯 HTTP）：
   - `curl -sI http://127.0.0.1:$PORT/ | rg -i "content-security-policy|strict-transport"`
9. 浏览器打开首页；登录页应为空，且不显示任何演示账号或密码。
10. 全新空库使用内置初始管理员 `admin@company.com` / `Admin@123456` 登录，立即修改密码；随后停止服务、移除这两个变量并重启。
11. （可选）`npm run preflight:database -w api -- --database "$DATABASE_FILE"`

### 5.1 Harness 运行与安全边界

- Harness 进程的 stdout 是 JSON-RPC 协议通道，配置中不得添加 stdout logger、终端 UI 或任何额外输出；诊断只写 stderr 并由 API 进程收集。
- API 按需启动只监听 `127.0.0.1` 随机端口的代理，并为每个活跃 Harness runtime 生成随机 Bearer token；该代理只接受与当前 wire API 对应的 `POST /responses` 或 `POST /chat/completions`。该端口不得配置反向代理、端口映射或防火墙放行。
- 真实 Provider API Key 仅由 API 控制面读取并在该 loopback 代理向上游请求时加入。Harness 子进程只有随机 token；其环境采用 allowlist，不继承 `JWT_SECRET`、`AI_CONFIG_ENCRYPTION_KEY`、数据库 URL、种子账号密码或父进程 Provider Key。
- `DSH_HOME` 和 `DSH_SESSION_ROOT` 由 API 从 `HARNESS_HOME` 派生，不能由服务环境中的 `DSH_*` 覆盖。JSONL session、提示词、模型输出和图片附件可能包含业务敏感内容，应按同级数据分级、权限和保留期管理。
- JSON-RPC 协议没有单 prompt 取消或单 session close。平台把调用串行化；超时、传输异常或切换 Provider 时会关闭并重建 runtime，因此不要把长时推理和并发批量任务直接接到同一单机实例。
- 图片会写入 Harness 的本地受控 attachment store，受 5 MiB/张、6 张/消息、12 MiB/消息和 4000 万像素限制。存储不可用时应明确失败，不能静默把图片降级为文本。
- `/api/admin/ai-provider/models` 的 `/models` 查询是**控制面元数据发现例外**，不是推理路径；它仍使用 API 的出站 URL 策略和真实 Key。所有聊天、摘要、文档分析等 LLM 推理由 Harness 唯一执行。

## 6. 备份与回滚

### 6.1 备份（发布前 / 每日）

```bash
npm run backup:sqlite -w api -- --database "$DATABASE_FILE" --out /var/backups/pm --label pre-release
```

备份目录含主库副本、wal/shm（若有）与 `manifest.json`（sha256）。

若需要保留 Harness 会话回放或图片分析上下文，还要把 `HARNESS_HOME` 纳入受控备份与保留策略；它不替代 SQLite 业务数据备份。该目录中的 JSONL 和附件可能含敏感业务文本/图片，备份介质、访问权限和删除周期必须与业务数据同级管理。

### 6.2 应用回滚（代码）

1. 停进程（SIGTERM，等待 Harness runtime 与 loopback proxy 完全关闭）
2. 检出上一 RC 标签或 commit（例：`rc-2026.07.23-startup`）
3. `npm ci && npm run build -w web`
4. `npm run start:prod`

Harness 依赖为锁定的 RC 版本，应用回滚必须连同 `package-lock.json` 一起恢复；不要只替换 `cordis.yml`、全局升级 Harness 或复用未审查的 `DSH_HOME` 配置。若回滚版本不兼容已有 Harness session 格式，保留该目录副本供取证，再按数据保留策略新建或迁移运行目录。

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
- Harness session 与图片附件也为本地文件状态（`HARNESS_HOME`）；当前没有跨实例共享存储或多实例会话协调，不可让多个 API 实例共用同一目录
- Harness 是无头、受 API 管理的执行内核，不提供面向最终用户的 Web UI、公开 JSON-RPC 端口、shell、workspace、skills 或 jobs 工具
- `GET /api/health` 只代表控制面/数据库 readiness；AI Provider 健康须通过控制面状态与受权限保护的连接测试观察，不能作为公网 liveness 探针的硬依赖
- Provider `/models` 发现是控制面元数据例外；不得据此恢复 API 到直连 `/responses` 或 `/chat/completions` 的推理实现
- Provider 出站默认拒绝 localhost、私网与保留地址。只有经变更审批的精确主机/IP 才可加入 `AI_PROVIDER_PRIVATE_HOST_ALLOWLIST`；不要为了方便而允许整个网段或 `localhost`
- Git remote 未配置时 RC 标签仅本地；发布需自行 `git remote` + push 标签
- PostgreSQL 仅为可选验证路径，见 `docs/postgresql-migration-runbook.md`

## 9. 相关命令速查

| 命令 | 用途 |
|------|------|
| `npm run start:prod` | 单机生产/试用 |
| `npm run smoke:prod` | 临时库 + 静态 + 控制面 readiness 冒烟（不替代真实 Harness/Provider 连接测试） |
| `npm run drill:graceful-shutdown` | 优雅停机演练 |
| `npm run drill:sqlite-backup` | 备份→改数→恢复 |
| `npm run preflight:env` | 环境变量预检 |
| `npm run preflight:database` | 库 integrity + 迁移 ledger |
| `npm run check` | 本地全量门禁（含 smoke:prod） |

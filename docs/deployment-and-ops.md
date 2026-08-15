# 部署与运维手册

> 本文为原 16 号试用部署手册的重排版,并合并交付手册(DELIVERY.md)的 env/凭据要点、消除重复。范围:单机 API 实例托管前端静态资源、默认 SQLite、API 受管的 DeepSeek Harness(dsh)JSON-RPC 子进程;**非**多实例/负载均衡/PostgreSQL 生产切库(PG 见 [postgresql-migration-runbook.md](./postgresql-migration-runbook.md))。
> 架构与边界原理见 [design-and-architecture.md](./design-and-architecture.md);权衡见 [trade-offs-and-decisions.md](./trade-offs-and-decisions.md)。

## 1. 目标形态

| 项 | as-built |
|----|----------|
| 进程 | 单一 node:`api/server.js`(或 `npm run start:prod`) |
| 前端 | `web/dist` 由 API 同源托管(SERVE_WEB=1 / 生产默认有 dist 时开启) |
| API / WS | `/api/*`、`/ws/collab`、`/ws/agent` 与页面同 origin(前端 BASE_URL='',WS 用 location.host) |
| 数据库 | 默认 SQLite 文件(`DATABASE_FILE`,默认 `api/app.db`) |
| AI 推理内核 | 所有 LLM 推理由 API 受管的 dsh JSON-RPC runtime 执行;业务 API、RBAC、审计、AI Job、人工确认和业务写入仍由平台控制面负责 |
| Provider 出站 | dsh 仅访问 API 在 127.0.0.1 随机端口启动的 loopback 代理;每 runtime 短生命周期随机 token,真实 Provider Key 只在控制面内存/加密配置出现 |
| 健康检查 | `GET /api/health`:DB `SELECT 1` + SQLite 迁移 ledger;失败 503。仅表示控制面 readiness,**不等于** Provider 或 dsh 推理 readiness |

开发用 `npm run dev`(API + Vite 代理);`npm start` 保留联调;**试用/生产入口是 `npm run start:prod`**。

## 2. 环境要求

- Node `>=22.19 <26`、npm `>=10`(Harness RC 依赖 Node 22.19+ 运行时)
- `npm ci`(或交付包 `npm ci --omit=dev`)
- 已构建前端:`npm run build -w web`(产出 `web/dist/index.html`)
- 为 API 服务账户准备独立、持久、不可由 Web 访问的 `HARNESS_HOME`(保存 dsh 会话与图片附件,仅限该账户读写)
- `api/config/harness/cordis.yml` 为受审查随包配置;`npm ci` 安装锁定版本的 Harness 包,不要用全局安装或未锁定 RC 覆盖
- SQLite 数据库、上传目录(`api/storage`)、`HARNESS_HOME` 均须位于持久存储,不得放容器临时文件系统

## 3. 环境变量

### 3.1 生产强制(缺则进程退出)

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | ≥16 高熵随机值 |
| `AI_CONFIG_ENCRYPTION_KEY` | ≥16,且**不得**等于 JWT_SECRET |

生产禁止:`ENABLE_HTTP_SHUTDOWN=1`、`RATE_LIMIT_TRUST_LOCAL=1`、`SEED_DEMO_DATA=1`(演示种子会被启动预检拒绝)。

### 3.2 基础配置

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | — | production |
| `PORT` | 4010 | 端口占用直接 FATAL 退出 |
| `DATABASE_FILE` | api/app.db | 持久卷路径;**多分支/多实例务必各自独立文件**(如 app-p0p4.db),SQLite 单机文件锁不可多进程写 |
| `SERVE_WEB` / `WEB_DIST` | 1 / monorepo web/dist | 同源托管静态前端 |
| `CORS_ORIGIN` | 同源默认 | 反代域名需写入 |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | admin@company.com / Admin@123456 | 仅全新空库首次启动创建一次性初始管理员;首登后立即改密并移除这两变量重启 |
| `ENABLE_HSTS` | 关 | 纯 HTTP 禁开;仅 TLS 终止后可设 1 |

### 3.3 AI Provider(控制面默认值,库内加密配置可覆盖)

| 变量 | 说明 |
| --- | --- |
| `AI_ENABLED` | false 时仅走平台本地规则降级,不启动 LLM 推理 |
| `AI_PROVIDER` / `AI_BASE_URL` / `AI_MODEL` / `AI_WIRE_API` | 默认 openai-compatible / gpt-4o-mini / chat_completions |
| `AI_TIMEOUT_MS` | 模型调用超时(默认 30000) |
| `AI_CAPABILITY_TIMEOUT_MS` | 能力调用经 dsh 的部署级超时(capabilityAdapter 读取,非法值回默认并告警) |
| `AI_API_KEY` | **仅 API 父进程**读取的初始 Key;dsh 子进程永远拿不到 |
| `AI_PROVIDER_PRIVATE_HOST_ALLOWLIST` | 私网/本地 Provider 精确主机或 IP(逗号分隔,无通配符/CIDR);例 `192.168.3.18` |

### 3.4 dsh 底座(HARNESS_*)

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HARNESS_HOME` | — | dsh 隔离持久根(DSH_HOME/DSH_SESSION_ROOT 由此派生);不要用 ~/.dsh,不要放 web/dist |
| `HARNESS_SESSION_DB` | `<HARNESS_HOME>/sessions.db`(as-built 落 `api/storage/harness/sessions.db`) | 会话 SQLite 库(WAL),与业务库分离;admin 回放只读面 |
| `HARNESS_RUNTIME_CONFIG` | api/config/harness/cordis.yml | 仅变更管理批准后覆盖 |
| `HARNESS_RUNTIME_COMMAND` / `HARNESS_RUNTIME_ARGS` | — | 成对设置,ARGS 为 JSON 数组;仅自定义 bin 自行读取注入配置时用 |
| `HARNESS_MAX_RUNS_PER_RUNTIME` | 0(常驻不限) | 0=常驻;正数恢复按次销毁上限 |
| `HARNESS_RUNTIME_IDLE_TTL_MS` | 0(永不) | 空闲回收阈值(可选) |
| `HARNESS_DEFAULT_MAX_TOKENS` | 4096 | 单次推理默认 token 预算 |
| `HARNESS_ALLOW_COMPOSITION_VARIANTS` | 0 | 生产组合变体(draft/review)显式 opt-in;生产 launcher 默认钉死 cordis.yml |

**不要**在服务环境设置 `DSH_API_KEY`、`DSH_BASE_URL`、`DSH_HOME`、`DSH_CORDIS_CONFIG`:API 为每 runtime 生成受限 child-only DSH_* 环境与随机 loopback token,手工 DSH_* 会被拒绝或造成不一致。

### 3.5 Windows PowerShell 示例

```powershell
$env:NODE_ENV='production'
$env:PORT='4010'
$env:JWT_SECRET='replace-with-long-random'
$env:AI_CONFIG_ENCRYPTION_KEY='replace-with-other-long-random'
$env:DATABASE_FILE='D:\data\pm\app.db'
$env:SERVE_WEB='1'
$env:SEED_DEMO_DATA='0'
$env:AI_ENABLED='true'
# 私网 Provider 才设;不含端口与路径
# $env:AI_PROVIDER_PRIVATE_HOST_ALLOWLIST='192.168.3.18'
$env:HARNESS_HOME='D:\data\pm\harness'
```

## 4. 启动与健康检查

```bash
npm run check        # 发布前全链门禁(audit+lint+test+build+preflight+drill+smoke)
npm run start:prod   # 生产单进程(含静态前端);等价 node scripts/start-prod.js
```

浏览器访问 `http://<host>:4010/`(HashRouter,如 `/#/login`)。首次登录用初始管理员(见 3.2),改密后移除 SEED_ADMIN_* 再重启。

部署检查清单:

1. `npm run preflight:env`(生产 secrets 齐全,fail-closed)
2. 确认 `DATABASE_FILE` 父目录、`HARNESS_HOME` 可由 API 服务账户写,且在持久卷、不在静态资源根
3. `curl -sf http://127.0.0.1:$PORT/api/health | jq .data.checks`:`checks.database.ok`、`checks.migrations.ok`、`serveWeb == true`
4. 以管理员身份在系统设置执行 Provider 连接测试(由 API/Harness 发起,不用浏览器连通性);私网地址先在 **API 进程**环境设 allowlist 并重启
5. 确认响应头无 `upgrade-insecure-requests`、无 HSTS(纯 HTTP):`curl -sI http://127.0.0.1:$PORT/`
6. 登录页应为空,不显示任何演示账号或密码

停止:Linux/macOS 发 SIGTERM/SIGINT(会停 AI 接收队列、关闭 Harness runtime 与 loopback proxy、再关 WSS、HTTP、closeDatabase);Windows 服务/任务管理器结束进程,不要依赖 ENABLE_HTTP_SHUTDOWN。

## 5. dsh 底座运维

- **状态观察**:`GET /api/ai/harness/status`(admin/pm):组合名、SDK 版本、插件管线、runtime 实时状态(active/复用/队列、totalCalls/totalRuns、第 N 代)。前端 AI 页底座卡片(AiRuntimePanel)15s 轮询同源数据。
- **常驻语义**:runtime 常驻不限次数(`累计 N 次调用 · 常驻 / 第 N 代 runtime`);指纹失效(换组合/模型)自动换血;事件静默超阈值进 /api/health 的 aiRuntime 检查项。
- **组合变体**:cordis.yml(21 插件)为生产默认;company-draft-v1 / company-review-v1 预设需 `HARNESS_ALLOW_COMPOSITION_VARIANTS=1` 显式 opt-in,变更管理批准后才开。
- **会话库**:`HARNESS_SESSION_DB`(默认 api/storage/harness/sessions.db,WAL)存全部 dsh 会话与事件;admin 可经 `GET /api/ai/sessions` 只读回放。库损坏时回放降级为空列表,不影响业务库。
- **loopback 边界**:dsh stdout 仅 JSON-RPC,不得加 stdout logger/终端 UI;loopback 随机端口不得反代/映射/防火墙放行;子进程环境 allowlist,不继承 JWT、加密 Key、数据库 URL、种子凭据、Provider Key。
- **交互桥运维**:ask-user/审批等待默认 30 分钟超时(env 可调);通道不可达一律 fail-closed。
- **健康边界**:`/api/health` 不探测 Provider/dsh;dsh 按需启动;AI 可用性以受权限保护的管理端连接测试为准。`/api/admin/ai-provider/models` 的 /models 查询是控制面元数据发现例外,不是推理直连通道。

## 6. 备份与恢复

### 6.1 备份(发布前/每日)

```bash
npm run backup:sqlite -w api -- --database "$DATABASE_FILE" --out /var/backups/pm --label pre-release
```

备份目录含主库副本、wal/shm(若有)与 manifest.json(sha256)。需保留会话回放或图片分析上下文时,把 `HARNESS_HOME` 一并纳入受控备份——其中 JSONL 与附件可能含敏感业务内容,备份介质、访问权限、删除周期与业务数据同级管理;它不替代业务库备份。

### 6.2 恢复(先停进程,避免覆盖打开中的库)

```bash
npm run restore:sqlite -w api -- --from /var/backups/pm/<backup-dir> --database "$DATABASE_FILE" --force
npm run preflight:database -w api -- --database "$DATABASE_FILE"
npm run start:prod
```

### 6.3 应用回滚(代码)

1. 停进程(SIGTERM,等 Harness runtime 与 loopback proxy 完全关闭)
2. 检出上一 RC 标签/commit;`npm ci && npm run build -w web`(Harness 依赖为锁定 RC,必须连 package-lock.json 一起恢复)
3. 不要只替换 cordis.yml、全局升级 Harness 或复用未审查 DSH_HOME;回滚版本不兼容已有会话格式时,保留 HARNESS_HOME 副本供取证

## 7. 常用运维脚本

| 命令 | 用途 |
|------|------|
| `npm run start:prod` | 单机生产/试用 |
| `npm run smoke:prod` | 临时库 + 静态 + 控制面 readiness 冒烟(不替代真实 Harness/Provider 连接测试) |
| `npm run preflight:env` | 环境变量预检(密钥/PORT/危险 opt-in fail-closed) |
| `npm run preflight:database -w api` | 库 integrity + 引用/JSON + 迁移 ledger |
| `npm run backup:sqlite` / `restore:sqlite` | 备份 / 恢复 |
| `npm run drill:sqlite-backup` | 备份→改数→恢复演练(临时库,不碰生产文件) |
| `npm run drill:graceful-shutdown` | 优雅停机演练 |
| `npm run smoke:roles -w api` | 多角色全流程写操作冒烟(需 API 在 :4010) |
| `npm run check` | 本地全量门禁(含 smoke:prod) |
| `npm run check:rc` | check + 一次性 SQLite RC E2E |

## 8. Windows 注意事项

- **残留 node 进程占端口**:start:prod 异常退出可能残留子进程占用 4010。排查:
  ```powershell
  netstat -ano | findstr :4010
  taskkill /PID <pid> /F
  ```
- **多分支并行开发**:每个分支用独立 `DATABASE_FILE`(如 `api/app-p0p4.db`;`api/app-*.db*` 已入 .gitignore),避免分支间迁移/种子互相污染;演示数据(如 INV-DEMO-0001)随库保留。
- 优雅停机演练在 Windows 走 HTTP 触发共享 shutdown(drill 脚本已适配)。
- Git Bash 环境下 PowerShell 示例变量语法不同,以 3.5 为准。

## 9. 反向代理(可选)

前置 Nginx/Caddy 并终止 TLS 时:`location /` → `proxy_pass http://127.0.0.1:4010`;WebSocket `/ws/`(collab 与 agent 两通道)需 Upgrade/Connection 头;TLS 终止后可设 `ENABLE_HSTS=1` 或由反代统一下发。纯 HTTP 直连**切勿**开启 HSTS/upgrade-insecure-requests(白屏问题,Helmet 默认项已在 SERVE_WEB 路径关闭)。

## 10. 已知边界(试用)

- 单机文件锁:不要多进程写同一 DATABASE_FILE;水平扩展需 PG + worker/queue 专项
- 无内置对象存储:上传落 `api/storage`(随进程盘);dsh 会话与附件为本地文件状态,多实例不可共用同一 HARNESS_HOME
- dsh 是无头执行内核:无面向最终用户的 Web UI、公开 JSON-RPC 端口;workspace context、skills(平台技能白名单除外)、bash、jobs、goals 默认关闭,未过 RBAC/审计/审批边界的 MCP 工具不得打开
- Provider 出站默认拒绝 localhost/私网/保留地址;仅经变更审批的精确主机进 allowlist
- 图片附件受 5 MiB/张、6 张/消息、12 MiB/消息、4000 万像素限制;存储不可用时明确失败,不静默降级为文本
- 提醒调度为 at-least-once(投递与标记间宕机可能重投)
- Git remote 未配置时 RC 标签仅本地;发布需自行 remote + push

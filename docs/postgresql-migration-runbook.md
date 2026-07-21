# PostgreSQL 迁移执行手册

## 目的与边界

此手册定义从当前 SQLite 试点数据迁移至 PostgreSQL 的可回滚路径。迁移期间保持现有 REST URL、`{ data, meta }` 成功响应和权限语义不变；SQLite 不会被原地替换或删除。

**默认运行数据源仍是 SQLite**（`DATABASE_DIALECT` 未设置或为 `sqlite`）。W5 已解除进程级 fail-closed；W6 本地真库导入/对账/API 冒烟已验；W7 提供开发机读路径切换演练（`drill:postgres-switch`）。**生产维护窗口切换与 CI 真 PG service 仍未做。**

## 运行时方言选择（W5）

| 环境变量 | 含义 |
|----------|------|
| `DATABASE_DIALECT` | `sqlite`（默认）或 `postgres` / `postgresql` |
| `DATABASE_URL` | 进程 runtime 使用的 PostgreSQL 连接串（也可用 `POSTGRES_TARGET_URL` 作为回退） |
| `POSTGRES_TARGET_URL` | 迁移脚本目标库连接串（可与 runtime 相同） |
| `DATABASE_FILE` | 仅 sqlite：数据库文件路径 |

### 用 PostgreSQL 启动 API（隔离/灰度环境）

**前置**：目标库已执行 baseline schema（及可选 NDJSON 导入与对账）。API 在 postgres 模式下 **不会** 跑 SQLite `PRAGMA` / `CREATE` 堆 / JS migrations / seed。

```powershell
# 1) 应用最终态 schema（空库或确认可重复执行的 baseline）
$env:POSTGRES_TARGET_URL = "postgres://USER:PASS@HOST:5432/DB"   # 勿写入仓库
npm run apply:postgres-schema -w api -- --connection $env:POSTGRES_TARGET_URL

# 2) （可选）导入已校验的 NDJSON 导出包
npm run import:postgres -w api -- --dir C:\migration\project-management-20260713 --connection $env:POSTGRES_TARGET_URL

# 3) 启动 API 指向同一库
$env:DATABASE_DIALECT = "postgres"
$env:DATABASE_URL = $env:POSTGRES_TARGET_URL
npm run start -w api
```

启动时 postgres 路径会：`ping` pool，并检查 `schema_migrations` / `users` / `projects` 是否存在；缺失则 fail-fast，并提示先 `apply:postgres-schema`。  
`GET /api/health` 的 `data.database` 为当前 dialect（`sqlite` 或 `postgres`），可用于确认是否已切库。

### 回滚到 SQLite

```powershell
# 停止 postgres 写流量后，恢复默认方言与文件库
Remove-Item Env:DATABASE_DIALECT -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
# 如需显式：
$env:DATABASE_DIALECT = "sqlite"
# $env:DATABASE_FILE = "C:\path\to\frozen\app.db"   # 可选：指向冻结副本
npm run start -w api
```

切换后发现数据、权限或 API 契约不一致时，停止 PostgreSQL 写流量并恢复到冻结时的 SQLite 只读副本；根据 audit log 和导出 manifest 定位差异。不得通过覆盖源库或手工删除审计记录来回滚。

### 自动化切换/回滚读路径演练（W7）

在已导入数据的 PostgreSQL 目标库与本地 SQLite 文件均可用时：

```powershell
$env:POSTGRES_TARGET_URL = "postgres://USER:PASS@HOST:5432/DB"
# 可选：冻结副本
# $env:DATABASE_FILE = "C:\path\to\frozen\app.db"
npm run drill:postgres-switch -w api
```

脚本会依次：

1. 用 `DATABASE_DIALECT=sqlite` 起临时 API → 登录 + 列表  
2. 停止后用 `DATABASE_DIALECT=postgres` 起临时 API → 登录 + 列表  
3. 再切回 sqlite，确认仍可登录且项目数量一致  

这是**读路径契约演练**，不替代生产维护窗口的写冻结与副本保留流程。

## 迁移前置条件

1. 在维护窗口冻结写操作，并保留 SQLite 文件和本地对象存储目录的只读副本。
2. 在源库执行预检：

   ```powershell
   npm run preflight:database -w api -- --json
   ```

   预检必须为 `ok: true`。它验证 SQLite 完整性、逻辑外键关系和 JSON 字段可解析性；任何孤儿记录必须在源库按审计流程修复后重新执行。

3. 生成一次可校验、不可覆盖的 NDJSON 导出：

   ```powershell
   npm run export:postgres -w api -- --out C:\migration\project-management-20260713
   ```

   输出目录必须为空。导出会拒绝完整性、逻辑引用或 JSON 校验不通过的源库。`manifest.json` 记录每张表的行数、SHA-256、SQLite DDL、已应用迁移的校验和、目标导入顺序及循环引用的延迟校验规则，作为导入、验收和回滚对照依据。
4. 独立校验导出包，确认 manifest 与 NDJSON 文件未被篡改：
   ```powershell
   npm run verify:postgres-export -w api -- --dir C:\migration\project-management-20260713 --json
   ```

   校验会复核 `manifest.json` 格式、每个表文件的 SHA-256、行数、逐行 JSON、导入顺序覆盖范围、引用规则表名以及源库预检结果。任何错误都必须重新生成导出包，不得手工修改 manifest 或 NDJSON。

## PostgreSQL 目标态

- 使用 PostgreSQL 作为事务主库；后端 Repository 保持 REST 契约不变。
- 以 `schema_migrations` 记录版本，使用正式 migration，而不是继续在启动路径累积 `try ALTER TABLE`。
- 目标库以 `postgres-baseline.sql` 为准：保持**无 SQL FK**（逻辑引用由 preflight / deferred 校验）；可补唯一约束与项目/状态/时间维度索引；导入前处理 SQLite 中已存在的逻辑孤儿数据。
- 文档对象先保留原 `storage_key`，对象存储迁移独立进行，不能混入关系库切换窗口。
- AI Worker、Redis 和 RAG 只在 PostgreSQL 数据校验和 API 回归稳定后引入。
- Canonical DDL：`api/src/db/schema/postgres-baseline.sql`（无 SQL FK；JSON 列保持 TEXT；含 `leave_records`）。
- SQLite 路径仍使用 `api/db.js` initDb + `api/migrations/*.js`（含 `20260720_17_leave_records`）。PG **不**跑逐条 JS migration 的 DDL。

## 本地真库冒烟（W6 已验证路径）

以下在开发机用独立数据目录起 PostgreSQL（示例端口 `55432`、库名 `pm_w6`，`trust` 仅限本机临时集群）已跑通：

```powershell
# 假设本机 PG 可连，且 POSTGRES_TARGET_URL 指向空库
$env:POSTGRES_TARGET_URL = "postgres://postgres@127.0.0.1:55432/pm_w6"

npm run preflight:database -w api -- --json
npm run export:postgres -w api -- --out C:\tmp\pm-export
npm run verify:postgres-export -w api -- --dir C:\tmp\pm-export --json
npm run apply:postgres-schema -w api -- --connection $env:POSTGRES_TARGET_URL
npm run import:postgres -w api -- --dir C:\tmp\pm-export --connection $env:POSTGRES_TARGET_URL
npm run generate:postgres-target-report -w api -- --dir C:\tmp\pm-export --out C:\tmp\pm-report.json --connection $env:POSTGRES_TARGET_URL
npm run reconcile:postgres-import -w api -- --dir C:\tmp\pm-export --target-report C:\tmp\pm-report.json --json

$env:DATABASE_DIALECT = "postgres"
$env:DATABASE_URL = $env:POSTGRES_TARGET_URL
npm run start -w api
# 使用已导入用户登录（demo 种子 admin@example.com / Admin@123，若库来自默认 seed）
```

**已知修复**：`apply-postgres-schema` 的 SQL 拆分须剥离语句前的 `--` 文件头注释，否则会丢掉第一条 `CREATE TABLE schema_migrations` 并导致整事务回滚。

**预检说明**：`audit_logs.actor_id` 允许 `system` / `system:%` 合成主体（如 migration repair），不强制对应用户行。

## 导入与验收门禁

> **注意**：以下步骤用于隔离目标库的数据迁移与对账。完成后再按上文「用 PostgreSQL 启动 API」切换读写。本地/CI 默认仍为 sqlite。

1. 在隔离 PostgreSQL 环境先应用最终态 baseline schema（无 SQL FK；JSON 列保持 TEXT）：

   ```powershell
   npm run apply:postgres-schema -w api -- --connection $env:POSTGRES_TARGET_URL
   ```

   等价地，可在导入时加 `--apply-schema`。Canonical DDL：`api/src/db/schema/postgres-baseline.sql`。SQLite 路径仍使用 `api/db.js` + `api/migrations/*.js`；PG 不跑逐条 JS migration 的 DDL，只按需把迁移 id/checksum 记入 `schema_migrations` 以便与 export manifest 对账。

2. 导入 NDJSON（按 `manifest.postgresImport.tableOrder`；缺连接串 fail-closed）：

   ```powershell
   npm run import:postgres -w api -- --dir C:\migration\project-management-20260713 --connection $env:POSTGRES_TARGET_URL
   # 或一步：... --apply-schema
   ```

   `app_settings` 以 `key` 为冲突目标 upsert；导入失败整事务 `ROLLBACK` 并以非 0 退出。日志中的连接串已脱敏。
   未提供 `--connection` 且环境变量 `DATABASE_URL` / `POSTGRES_TARGET_URL` 均未设置时，脚本拒绝运行。

3. 按 `manifest.postgresImport.tableOrder` 导入；`deferredReferenceRules` 中的循环/自引用在导入后做应用层计数校验（本阶段不添加 SQL FK，故无 `VALIDATE CONSTRAINT`）。
4. 校验每张表的导入行数与 manifest 相等，并核对文件 SHA-256、`appliedMigrations` 及源库预检结果。
5. 将目标 PostgreSQL 的导入结果导出为 target report JSON，并与 manifest 对账。真实隔离 PostgreSQL 环境使用：
   ```powershell
   npm run generate:postgres-target-report -w api -- --dir C:\migration\project-management-20260713 --out C:\migration\postgres-target-report.json --connection $env:POSTGRES_TARGET_URL
   ```

   该命令需要显式传入 `--connection` 或设置 `POSTGRES_TARGET_URL`，未提供连接串时会拒绝运行，避免误连默认环境。生成的 target report 格式如下：
   ```json
   {
     "tableCounts": { "projects": 3 },
     "appliedMigrations": [{ "id": "20260713_09_project_objective", "checksum": "..." }],
     "foreignKeyViolations": [],
     "referenceViolations": [],
     "constraintViolations": [],
     "jsonViolations": []
   }
   ```

   ```powershell
   npm run reconcile:postgres-import -w api -- --dir C:\migration\project-management-20260713 --target-report C:\migration\postgres-target-report.json --json
   ```

   对账必须显示表数量、行数、迁移校验和全部匹配，且目标库无外键、引用、约束或 JSON 违规。CI 中的 `create-postgres-target-report-fixture.js` 仅用于脚本自检，不代表真实 PostgreSQL 导入验收。
6. 执行目标库迁移版本检查和关键索引检查（本阶段无 SQL FK 强制约束）。
7. 使用同一套测试数据执行 API 回归：登录与禁用用户、项目数据范围、项目激活、交付门禁、容量访问、AI 人工确认（`DATABASE_DIALECT=postgres` + 已 apply/import 的库）。
8. 在灰度环境以只读影子比对确认仪表盘、项目流和交付统计的聚合结果一致后，才允许切换写流量。

### 推荐完整链路

```text
preflight → export:postgres → verify:postgres-export
  → apply:postgres-schema → import:postgres
  → generate:postgres-target-report → reconcile:postgres-import
  → DATABASE_DIALECT=postgres DATABASE_URL=... npm run start -w api
```

> **诚实说明（as-built，2026-07-21）**  
> - 仓库默认 CI / 无 `DATABASE_URL` 时：单测仍以 **sqlite** 为主；门控 PG 测试 **skip**。  
> - 本机有可达 PG 时：W6 全链路与 W7 drill **已在开发机验证**（见 [w2-postgres-plan.md](./w2-postgres-plan.md)）。  
> - **未做**：CI 挂 Postgres service；生产冻结写 / 灰度切写 / 运维签字回滚。

## 回滚

见上文「回滚到 SQLite」。切换后发现数据、权限或 API 契约不一致时，停止 PostgreSQL 写流量并恢复到冻结时的 SQLite 只读副本；根据 audit log 和导出 manifest 定位差异。不得通过覆盖源库或手工删除审计记录来回滚。

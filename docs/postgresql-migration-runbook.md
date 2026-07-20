# PostgreSQL 迁移执行手册

## 目的与边界

此手册定义从当前 SQLite 试点数据迁移至 PostgreSQL 的可回滚路径。迁移期间保持现有 REST URL、`{ data, meta }` 成功响应和权限语义不变；SQLite 不会被原地替换或删除。

当前代码仍以 SQLite 为运行数据源。以下步骤是切换前置条件，不代表已启用 PostgreSQL。

> 运行时保护：当前可设置 `DATABASE_DIALECT=sqlite`（默认）。若显式设置为 `postgres`，服务会在启动时拒绝运行（W5 前 fail-closed），而不会把同步 SQLite 仓储误连到 PostgreSQL。待 W5 异步 Repository 适配层和双环境验收完成后，才允许解除该保护并实际切换。

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
- 在目标库补齐主外键、唯一约束、检查约束及项目/状态/时间维度索引；导入前处理 SQLite 中已存在的逻辑孤儿数据。
- 文档对象先保留原 `storage_key`，对象存储迁移独立进行，不能混入关系库切换窗口。
- AI Worker、Redis 和 RAG 只在 PostgreSQL 数据校验和 API 回归稳定后引入。

## 导入与验收门禁

> **注意**：当前 API **runtime 仍未启用** PostgreSQL（`DATABASE_DIALECT=postgres` 会在启动时 fail-closed）。以下步骤仅用于隔离目标库的数据迁移与对账，不切换线上读写。

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
7. 使用同一套测试数据执行 API 回归：登录与禁用用户、项目数据范围、项目激活、交付门禁、容量访问、AI 人工确认（需 W5 解除 runtime fail-closed 之后）。
8. 在灰度环境以只读影子比对确认仪表盘、项目流和交付统计的聚合结果一致后，才允许切换写流量。

### 推荐完整链路

```text
preflight → export:postgres → verify:postgres-export
  → apply:postgres-schema → import:postgres
  → generate:postgres-target-report → reconcile:postgres-import
```

> **重要**：即使在隔离 PG 环境执行完整链路并完成对账，API runtime 仍未启用 PostgreSQL。设置 `DATABASE_DIALECT=postgres` 仍会导致进程启动时拒绝运行（W5 前 fail-closed）。本链路的唯一目的是数据迁移与对账，不切换线上读写。

## 回滚

切换后发现数据、权限或 API 契约不一致时，停止 PostgreSQL 写流量并恢复到冻结时的 SQLite 只读副本；根据 audit log 和导出 manifest 定位差异。不得通过覆盖源库或手工删除审计记录来回滚。

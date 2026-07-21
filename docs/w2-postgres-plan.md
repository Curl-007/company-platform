# W2 真 PostgreSQL 运行时切换计划

> **状态**：执行中（W0–W5 代码完成；**默认仍 sqlite**；真库端到端门控归 **W6**）  
> **分支**：`codex/project-review`  
> **范围外**：pgvector / embedding、长期双写、强制删 SQLite、ORM、MinIO/Redis Worker 

## 0. 已锁定默认决策（用户 123 一并采纳）

| # | 决策 | 锁定值 |
|---|------|--------|
| 1 | SQL FK | **否**（继续应用层 preflight） |
| 2 | JSON 列 | **保持 TEXT**（不强制 jsonb） |
| 3 | CI 真 PG | 本地/门控集成 **必须**；CI service **推荐、可阶段 B** |
| 4 | Async 策略 | **先 SQLite 全量 async API，再开 PG runtime** |
| 5 | 生产回滚 | 切换后保留冻结 SQLite 副本至回归稳定 |
| 6 | pgvector | **W2 不做** |

## 1. 目标 / 非目标

**目标**

- `DATABASE_DIALECT=postgres` + `DATABASE_URL` 可创建 runtime（W5 已解除 fail-closed；真库验收归 W6）
- 默认 `sqlite` 本地/dev/CI 无回归
- NDJSON：`export → verify → import（新建）→ target-report → reconcile`
- REST / 权限 / 审计语义不变
- 更新 `postgresql-migration-runbook.md` 为可执行切换+回滚

**非目标**

- pgvector、双写、ORM、对象存储迁移、强制 SQL FK/jsonb

## 2. 架构

```
routes/services
  → async insert | row | rows | run | transaction
  → sql dialect (@name → $n, OR REPLACE/IGNORE)
  → sqlite runtime | pg.Pool
```

关键模块：

| 模块 | 路径 | 职责 |
|------|------|------|
| Runtime | `api/src/db/runtime.js` | dialect 选择；postgres 走 `createPostgresRuntime`（需 URL） |
| Pool | `api/src/db/postgres.js` | `pg.Pool`、ping、close、URL 脱敏 |
| Dialect | `api/src/db/sql.js` | 参数与 SQLite 方言翻译 |
| Access | `api/src/db/access.js` | 统一异步访问 API（sqlite + postgres；PG 事务 ALS 同连接） |
| Import | `api/scripts/import-ndjson-to-postgres.js` | NDJSON → PG（脚本路径；非 runtime seed） |
| Schema | `api/src/db/schema/postgres-baseline.sql` + `apply-postgres-schema.js` | 空库最终态建表 + `schema_migrations` 记账 |

## 3. Wave 与进度

| Wave | 内容 | 状态 |
|------|------|------|
| W0 | 决策与契约 | **完成**（本文件） |
| W1 | `pg` 依赖 + pool + env 边界 | **完成** |
| W2 | SQL 方言 helpers + 单测 | **完成**（含 COLLATE NOCASE / app_settings key upsert） |
| W3 | PG baseline schema + dual migrations | **完成**（`postgres-baseline.sql` + SQLite `initDb`/JS migrations） |
| W4 | import NDJSON | **完成**（`import-ndjson-to-postgres.js` + fake-pool 单测；真库集成验收待 W6） |
| W5 | 全路径 async + 解除 fail-closed + schema 对齐 | **完成（代码）**（见下；真 PG 端到端仍归 W6） |
| W6 | 门控 PG 集成 + 可选 CI service | **完成（本地真库）**：export→apply→import→reconcile 对账 PASS；`DATABASE_DIALECT=postgres` API 登录/列表 smoke PASS；门控单测有 URL 时跑真库；CI service 仍可选 |
| W7 | runbook 生产切换/回滚演练 | **完成（开发机读路径演练）**：`npm run drill:postgres-switch` 覆盖 sqlite→postgres→回滚 sqlite；生产维护窗口演练仍按 runbook 人工执行 |

粗估合计：**9–16 人日**（主风险在 W5；代码路径已落地）。

### W5 交付摘要（本波次）

- `createPostgresAccess` + `createAccess(runtime)`：公共契约 `row/rows/run/insert/transaction`；PG 事务用 `AsyncLocalStorage` 绑定同一 client
- `createDatabaseRuntime`：`DATABASE_DIALECT=postgres` 时创建 PG runtime（缺 URL 明确报错）；默认 sqlite
- `api/db.js` 双路径：sqlite 保持 `_sync` + CREATE/migrations/seed；postgres 仅 ping + 关键表检查（不跑 PRAGMA / JS migrations / seed）
- `server.js`：`await Promise.resolve(initDb())` 后再 listen
- schema：`leave_records` 纳入 `initDb` + `CORE_TABLES` + migration `20260720_17_leave_records`；`capacity_plans.leave_hours` 对齐 baseline
- 单测：`database-runtime`（注入 FakePool）、`postgres-access`（fake pool 契约）；默认 `npm run test -w api` 仍为 sqlite 全绿

## 4. 异步 DB 契约（目标签名）

```js
row(sql, params?) → Promise<object|undefined>
rows(sql, params?) → Promise<object[]>
run(sql, params?) → Promise<{ changes: number }>
insert(table, row) → Promise<void>
transaction(work) → Promise<T>  // work 可为 async
```

SQLite 侧用 Promise 包装现有 sync；Postgres 侧 `changes` ← `rowCount`。

## 5. 方言差异（实施检查表）

| SQLite as-built | PostgreSQL |
|-----------------|------------|
| `@name` | `$1..$n` |
| `INSERT OR REPLACE` | `ON CONFLICT (pk) DO UPDATE` |
| `INSERT OR IGNORE` | `ON CONFLICT DO NOTHING`；`changes`←`rowCount` |
| `BEGIN IMMEDIATE` | `BEGIN` |
| JSON TEXT | **保持 TEXT** |
| 无 SQL FK | **维持** |
| `datetime('now')` | 优先应用层 `now()` |

## 6. 数据路径

```
preflight → export:postgres → verify
  → apply:postgres-schema   # 或 import:postgres -- --apply-schema
  → import:postgres
  → generate:postgres-target-report
  → reconcile:postgres-import
  → API smoke（W5 代码已可启动；真库门控 W6）
```

脚本：

- `npm run apply:postgres-schema -w api -- --connection $env:POSTGRES_TARGET_URL`
- `npm run import:postgres -w api -- --dir <export> --connection $env:POSTGRES_TARGET_URL [--apply-schema]`

## 7. 安全

- 仅 env：`DATABASE_URL` / `POSTGRES_TARGET_URL`（脚本）
- 日志脱敏；不入库密钥
- 生产：`JWT_SECRET` 与 `AI_CONFIG_ENCRYPTION_KEY` 规则不变

## 8. 验收（DoD）

- [x] 默认 SQLite：`npm run test -w api` 全绿（含 access-contract、sql-dialect、database-runtime、postgres-access）
- [x] 真 PG：init + import 对账 + smoke（本地 PG 17 端口 55432 / `pm_w6`；40 表 359 行 reconcile ok；API login+projects 200）
- [x] W5：`createDatabaseRuntime` 允许 postgres（需 URL；可注入 Pool 单测证明）
- [x] 无 pgvector 蔓延；runbook 可回滚 SQLite（基线 SQL 确认无 JSONB/VECTOR/FK）
- [x] `leave_records`：`initDb` / `CORE_TABLES` / migration `20260720_17_leave_records` + preflight 引用规则已对齐
- [x] W6 门控测试：`api/test/postgres-gated-integration.test.js`（有可达 URL 时真库 schema+CRUD）
- [x] `apply-postgres-schema` 修复：leading `--` 注释后的 `CREATE schema_migrations` 不再被丢弃

## 9. 建议 commit 切片

1. `docs: add W2 postgres runtime plan with locked defaults`
2. `db: add pg pool module and DATABASE_URL boundary`
3. `db: introduce SQL dialect helpers for postgres`
4. `db: async access + enable postgres runtime (W5) + leave_records alignment`

## 10. 参考

- [postgresql-migration-runbook.md](./postgresql-migration-runbook.md)
- [architecture-refactor-plan.md](./architecture-refactor-plan.md)
- [15-项目审查一页摘要.md](./15-项目审查一页摘要.md)

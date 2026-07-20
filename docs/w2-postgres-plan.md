# W2 真 PostgreSQL 运行时切换计划

> **状态**：执行中（W0 决策已锁定；W1–W2 代码起步）  
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

- `DATABASE_DIALECT=postgres` + `DATABASE_URL` 可安全启动真库（在 W5 验收后解除 fail-closed）
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
| Runtime | `api/src/db/runtime.js` | dialect 选择；W5 前 postgres 仍 fail-closed |
| Pool | `api/src/db/postgres.js` | `pg.Pool`、ping、close、URL 脱敏 |
| Dialect | `api/src/db/sql.js` | 参数与 SQLite 方言翻译 |
| Access | `api/src/db/access.js`（后续） | 统一异步访问 API |
| Import | `api/scripts/import-ndjson-to-postgres.js`（后续） | NDJSON → PG |
| Schema | PG baseline + dual migrations（后续） | 空库建表 |

## 3. Wave 与进度

| Wave | 内容 | 状态 |
|------|------|------|
| W0 | 决策与契约 | **完成**（本文件） |
| W1 | `pg` 依赖 + pool + env 边界 | **进行中** |
| W2 | SQL 方言 helpers + 单测 | **进行中** |
| W3 | PG baseline schema + dual migrations | 待办 |
| W4 | import NDJSON | 待办 |
| W5 | 全路径 async + 解除 fail-closed | 待办（主工期） |
| W6 | 门控 PG 集成 + 可选 CI service | 待办 |
| W7 | runbook 切换/回滚 | 待办 |

粗估合计：**9–16 人日**（主风险在 W5）。

## 4. 异步 DB 契约（目标签名）

```js
row(sql, params?) → Promise<object|undefined>
rows(sql, params?) → Promise<object[]>
run(sql, params?) → Promise<{ changes: number }>
insert(table, row) → Promise<void>
transaction(work) → Promise<T>  // work 可为 async
```

SQLite 侧可用 Promise 包装现有 sync，保证双 dialect 同一 API。

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
  → PG init/migrate
  → import:postgres   # 新建
  → generate:postgres-target-report
  → reconcile:postgres-import
  → API smoke
```

## 7. 安全

- 仅 env：`DATABASE_URL` / `POSTGRES_TARGET_URL`（脚本）
- 日志脱敏；不入库密钥
- 生产：`JWT_SECRET` 与 `AI_CONFIG_ENCRYPTION_KEY` 规则不变

## 8. 验收（DoD）

- [ ] 默认 SQLite：`npm run test -w api` 全绿
- [ ] 真 PG：init + import 对账 + smoke
- [ ] 仅 W5 验收后 `createDatabaseRuntime` 允许 postgres
- [ ] 无 pgvector 蔓延；runbook 可回滚 SQLite

## 9. 建议 commit 切片

1. `docs: add W2 postgres runtime plan with locked defaults`
2. `db: add pg pool module and DATABASE_URL boundary`
3. `db: introduce SQL dialect helpers for postgres`
4. （后续）async access / schema / import / enable runtime / CI / runbook

## 10. 参考

- [postgresql-migration-runbook.md](./postgresql-migration-runbook.md)
- [architecture-refactor-plan.md](./architecture-refactor-plan.md)
- [15-项目审查一页摘要.md](./15-项目审查一页摘要.md)

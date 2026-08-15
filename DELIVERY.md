# 公司管理平台交付与运维手册

## 1. 交付内容

本交付包包含 API 服务、Web 生产构建、SQLite 数据库迁移、生产依赖锁文件和部署说明。默认数据库为 SQLite；PostgreSQL 仅作为可选验证路径，不是默认部署方案。所有 LLM 推理由 API 受管的 DeepSeek Harness JSON-RPC runtime 执行，平台 API 保留 Provider 配置、权限、审计、AI Job 和业务写入控制面。

交付目录中的关键文件：

- `api/.env.example`：环境变量模板。
- `api/server.js`：服务入口。
- `api/config/harness/cordis.yml`：受审查的无头 Harness 推理组合（不可放入 stdout logger 或终端 UI）。
- `web/dist/`：已构建的单页应用。
- `api/migrations/`：数据库迁移。
- `docs/deployment-and-ops.md`：SQLite 部署、备份、恢复与回滚手册。

## 2. 部署前准备

运行环境要求：Node.js 22.19 至 25、npm 10 或更高版本，以及可持久化的数据库和文件存储目录。不要将 SQLite 数据库、上传文件或 Harness 持久目录放在容器的临时文件系统中。

在交付目录执行：

```bash
npm ci --omit=dev
```

复制 `api/.env.example` 为 `api/.env`，至少设置以下变量：

```dotenv
NODE_ENV=production
SEED_DEMO_DATA=0
JWT_SECRET=<独立的高熵随机值>
AI_CONFIG_ENCRYPTION_KEY=<与 JWT_SECRET 不同的高熵随机值>
SEED_ADMIN_EMAIL=admin@company.com
SEED_ADMIN_PASSWORD=Admin@123456
HARNESS_HOME=/var/lib/pm/harness
```

`SEED_ADMIN_EMAIL` 和 `SEED_ADMIN_PASSWORD` 已内置固定初始管理员账号（见第 3 节），`api/.env.example` 中已预填，复制后无需修改即可首次登录。

建议将 `JWT_SECRET` 和 `AI_CONFIG_ENCRYPTION_KEY` 存放在部署平台的密钥管理服务中，而不是提交到源代码或镜像。生产环境禁止开启演示数据。

AI Provider 的真实 API Key 只能由 API 控制面保存/读取（环境默认值或受 `AI_CONFIG_ENCRYPTION_KEY` 加密的管理端配置）。API 按需启动只监听 `127.0.0.1` 的随机端口代理，并为每个 Harness runtime 下发一次性 token；不要在部署环境配置、记录或公开 `DSH_API_KEY`、`DSH_BASE_URL`、`DSH_HOME`、`DSH_CORDIS_CONFIG`。`HARNESS_HOME` 应由 API 服务账户独占，位于 Web 根目录外；其中的 JSONL session 与图片附件按敏感业务数据执行访问控制、备份与保留。

## 3. 首次启动与初始管理员账号

启动命令：

```bash
npm run start:prod
```

浏览器访问 `http://<主机>:4010/`，健康检查为 `GET /api/health`。该端点只表示 API/数据库控制面 readiness；Harness 按需启动，Provider 推理可用性须通过受权限保护的管理端连接测试确认。

交付包内置**固定初始管理员账号**（仅首次启动创建，之后重启不会覆盖或重置）：

| 项 | 值 |
| --- | --- |
| 登录邮箱 | `admin@company.com` |
| 初始密码 | `Admin@123456`（12 位） |

首次登录后，初始管理员应完成以下操作：

1. 使用上述固定账号登录。
2. **立即修改初始密码**（12 至 128 个字符）。初始密码随交付包分发，属于公开凭据，修改前请勿开启对外访问。
3. 通过团队管理创建其余用户并分配角色。
4. 删除 `api/.env` 中的 `SEED_ADMIN_EMAIL` 和 `SEED_ADMIN_PASSWORD`，然后重启服务，避免后续启动持续保留引导凭据。

管理员创建或重置的密码必须为 12 至 128 个字符。重置密码会立即撤销该用户既有登录令牌和协作 WebSocket 连接。

## 4. 角色分工与默认权限

服务端是权限的最终裁决者；前端按钮只用于引导，不能替代 API 鉴权。以下为系统默认角色权限，管理员可结合岗位和最小权限原则调整：

| 角色 | 典型职责 | 默认能力 |
| --- | --- | --- |
| `admin` | 平台管理员、账号与全局配置负责人 | 全部权限；创建、编辑、禁用用户；管理 AI 供应商和系统设置。 |
| `pm` | 项目经理 | 管理项目、成员、需求、文档、AI、审计和源码浏览；管理团队、工时与容量。 |
| `pdm` | 产品经理 | 管理产品、需求和产品文档；查看项目和审计信息。 |
| `dev` | 开发成员 | 查看项目和需求；处理构建、文档及与本人工作相关的事项。 |
| `qa` | 测试成员 | 管理测试与缺陷；查看文档及审计信息。 |

建议的职责分离：

- `admin` 仅负责平台治理、账号与密钥配置，不参与日常项目审批。
- `pm` 负责项目立项、成员配置、排期、交付协调和发布决策。
- `pdm` 负责产品、需求澄清和验收范围。
- `dev` 负责任务实现、构建记录和开发交接。
- `qa` 负责测试用例、缺陷验证和测试交接。

## 5. 项目成员与交接配置

创建项目后，项目经理必须将实际参与人员加入项目并赋予项目内角色。项目成员角色决定项目范围内的协作与交接目标：

- 开发交接只能指定项目中的 `dev` 成员。
- 测试交接只能指定项目中的 `qa` 成员。
- 即使全局账号角色为管理员或项目经理，也不能伪装成未配置的开发或测试成员接收交接。

建议在项目启动会完成以下配置：项目经理、产品经理、开发成员、测试成员、流程模板、里程碑、容量与工作日历。系统当前仅提供“固定交付”和“轻量交付”两种内置流程模板，并在项目上绑定。

## 6. 日常运维

建议至少每日备份 SQLite 数据库、上传文件和按保留策略需要的 `HARNESS_HOME`，并在每次版本升级前执行一次备份。使用交付包提供的命令：

```bash
npm run backup:sqlite
npm run restore:sqlite
npm run drill:sqlite-backup
```

升级时依次执行：备份、停止服务（等待 Harness runtime 与 loopback proxy 关闭）、替换交付目录、`npm ci --omit=dev`、检查环境变量和 `api/config/harness/cordis.yml`、启动服务、检查 `/api/health`、执行管理员 Provider 连接测试、执行关键业务登录与项目读写验证。详细回滚步骤见 `docs/deployment-and-ops.md`。

## 7. 交付验收清单

- 已使用生产环境变量启动，且 `SEED_DEMO_DATA=0`。
- 健康检查返回正常，数据库与迁移状态正常。
- 首位管理员可登录，初始密码已修改，引导凭据已删除。
- 已创建项目经理、产品经理、开发和测试账号，并完成项目成员配置。
- 已验证项目、需求、任务、测试和缺陷的最小闭环。
- 已执行 SQLite 备份并验证可恢复。
- 已确认日志、数据库、上传目录和 `HARNESS_HOME` 位于可持久化存储中。
- 已确认 Harness 默认关闭 workspace context、skills、bash、jobs、goals，且 stdout 未混入日志；Provider `/models` 仅作为控制面元数据发现，不是推理直连通道。

## 8. 常见问题

**无法启动或健康检查失败**：检查 `NODE_ENV`、密钥变量、数据库路径写权限和迁移日志；不要在生产环境使用演示数据变量。

**AI 连接测试失败但健康检查正常**：这是预期的不同边界。`/api/health` 不探测 Provider 或 Harness。检查活动 Provider 配置、`HARNESS_HOME` 写权限、锁定的 Harness 依赖与 `api/config/harness/cordis.yml`，并查看 API stderr；不要将 Harness JSON-RPC stdout 接到日志程序，也不要公开 loopback 端口。

**无法创建初始管理员**：确认 `SEED_ADMIN_EMAIL` 与 `SEED_ADMIN_PASSWORD` 同时配置（交付包 `.env.example` 已预填 `admin@company.com` / `Admin@123456`），且数据库是首次初始化或不存在同邮箱用户。已存在用户不会被覆盖，即使修改了这两个变量也不会重置密码。

**忘记初始密码**：初始密码为交付文档公开的 `Admin@123456`；若已修改后忘记，请通过团队管理界面由其他管理员重置，或使用备份数据库恢复。

**交接时找不到目标人员**：确认该人员已加入当前项目，并具有与交接类型匹配的项目内 `dev` 或 `qa` 角色。

**恢复后数据异常**：停止写入后再恢复；使用同一时点的数据库和文件存储备份，并保留恢复前副本以便回滚。

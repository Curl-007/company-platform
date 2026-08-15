# dsh 底座化完整实施计划

> 状态:执行中(Sprint 1)
> 创建:2026-08-14
> 范围分支:`remove-remote-docs`
> 关联讨论:前端凸显 dsh 方案、dsh 可集成能力清单、双底座架构评估(会话结论,未单独成文)

## 目标

把公司管理平台从「业务系统内嵌一个隐形推理管道」升级为「业务底座 + 常驻 agent 底座」的双底座架构:dsh(DeepSeek Harness)成为一等运行时,其能力(事件流、工具、技能、审批、定时)对用户**可见、可用、可治理**;平台鉴权、审计、权限体系保持唯一权威。

## 架构原则

```
┌────────────────────────── 浏览器 ──────────────────────────┐
│  平台 SPA(业务页面)      │  Agent 视图(dsh client 插件)   │
└───────────┬───────────────────────────────┬────────────────┘
            │ HTTPS/WSS(平台 JWT)          │ dsh 双流(HTTP↑/WS↓)
┌───────────▼───────────────────────────────▼────────────────┐
│ 平台主进程 Express(业务底座 = 治理层)                      │
│   鉴权 · 五角色权限 · 审计 · 业务表 · 备份                  │
│   agent-gateway:会话绑定、工具作用域 token 签发、事件回流   │
└───────────┬────────────────────────────────────────────────┘
            │ SDK JSON-RPC(回环,永不直接暴露)
┌───────────▼────────────────────────────────────────────────┐
│ 常驻 dsh host(agent 底座 = 能力层)cordis 组合              │
│   事件日志 session · 领域 tools(requirement/task/defect)    │
│   skills(交付方法论)· user-approval · schedule · subagent  │
└─────────────────────────────────────────────────────────────┘
```

- dsh host 只绑 127.0.0.1,永不直接对外,由平台 agent-gateway 做唯一入口(安全不变量,写入部署手册与 envPreflight)。
- 领域数据与操作注册为 dsh 工具,全部经 executionGateway 签发 scoped token;平台用户成为 dsh 的审批人。
- 不做「完全反转」(业务全迁 cordis 插件):dsh 为 RC 期框架、Host 层无认证体系、业务与 agent 演进节奏不同。仅当产品定位转向 agent 优先工作台时重新评估。

## Sprint 1 · 地基:稳定性 + 计量 + 投影(约 3 人日)

目标:不改变产品行为,runtime 更稳、成本可算、事件可聚合。

| # | 工作项 | 改动点 | 验收 |
| --- | --- | --- | --- |
| 1.1 | 组合加固:接入 `timeout-policy`、`repeat-tool-reminder`、`session-checkpoint-policy`、`compaction-basic` | `api/config/harness/cordis.yml`;锁死依赖版本 | 现有 AI 功能回归全绿 |
| 1.2 | token 计量:`dsh-token-meter`,按 job/能力/项目归集 | llm 组合层挂计量;新迁移 `20260814_25_ai_token_usage`(job_id、capability_id、project_id、prompt/completion/total_tokens、created_at);capabilityService 完成时落账;`GET /api/ai/usage/summary` | mock 事件下单测覆盖落账与汇总 |
| 1.3 | 会话投影:`session-projection` 注册 token 汇总、工具调用摘要、turn 统计 | cordis.yml + 投影定义文件(纯函数 init/apply/view) | 投影快照随事件流更新,供 Sprint 2 时间线消费 |

说明:当前环境未配置真实 AI 供应商 key(`AI_ENABLED=false`),1.2/1.3 验收以 vitest + mock 事件为准,不端到端跑真实推理。

## Sprint 2 · 前端可见:底座卡片 + 执行轨迹(约 4 人日)

| # | 工作项 | 改动点 | 验收 |
| --- | --- | --- | --- |
| 2.1 | 底座状态卡片 `AiRuntimePanel` | 新组件挂 `AiView.tsx`;status 接口附组合清单(company-runtime-v1、插件管线、SDK 版本、active/复用/队列) | admin/pm 可见运行时实时状态 |
| 2.2 | invocation 查询 API | `capabilityRoutes.js` 加 `GET /api/ai/capabilities/invocations`(项目范围校验)+ `GET .../:id`(详情含 harness_events,沿用 redactExecutionToken 脱敏) | 数据已在库,零迁移 |
| 2.3 | 执行轨迹抽屉 `AiInvocationTimeline` | `AiCapabilityTray` 调用后按 invocationId 拉详情;按 SessionEvent.type 映射渲染;project_snapshot 工具高亮;usage 汇总条;失败红标带 providerCode | 调用完成后可展开逐步轨迹 |
| 2.4 | 文案与样式 | 约 50 个 i18n 双语 key;时间线样式对齐动态中心 | lint / typecheck / e2e 全绿 |

## Sprint 3 · 常驻化:双底座成形 + 事件实时流(约 6 人日,关键路径)

| # | 工作项 | 改动点 | 验收 |
| --- | --- | --- | --- |
| 3.1 | harnessRuntime 常驻化:保留 FIFO 语义,不再按 20 次销毁;`HarnessClient.subscribe()` 订阅 session.event / session.status / subagent.* | `harnessRuntime.js` 核心改造;指纹失效时优雅换血 | 连续 500 次调用无泄漏;模型切换不断流 |
| 3.2 | 会话持久化升级 | 迁 `session-persistence-sqlite`(独立 db,与业务库分离);保留 JSONL 导出 | 重启后会话可恢复 |
| 3.3 | agent-gateway 雏形:平台 WebSocket 桥 | `server.js` 协作 ws 通道扩展 `agent.event` 消息(invocationId 绑定、项目范围过滤、入审计) | 前端按 invocationId 收到实时事件 |
| 3.4 | 时间线实时化 | `AiInvocationTimeline` 改 ws 驱动增量渲染 | 用户看着 AI 逐步调工具出结论 |

风险:常驻进程内存/句柄监控进 `/api/health` 的 aiRuntime 检查项;事件静默超阈值自动换血。

## Sprint 4 · 能力面:领域工具 + 技能体系(约 6 人日)

| # | 工作项 | 改动点 | 验收 |
| --- | --- | --- | --- |
| 4.1 | 领域工具集:requirements/tasks/defects 注册为 dsh 工具(先读后写),声明权限与项目范围,经 executionGateway 签发 scoped token;capabilityId 白名单从 1 个扩到 N 个并版本化 | 新 company-execution-tool 系列定义;normalizeExecution 白名单扩展;写操作强制审计 | AI 起草需求→创建任务最小闭环;越权被拒并落审计 |
| 4.2 | 技能体系:skill-filesystem + tool-skill,首批技能「固定交付检查单」「轻量交付准入」「缺陷根因分析」 | `api/config/harness/skills/` 目录;运营文档 | AI 按方法论输出;技能可热更 |
| 4.3 | agent-presets 按能力差异化组合(草稿轻量 / 文档 RAG / 评审全量) | cordis 预设文件 + 组合选择参数 | 组合可切换,用量可对比 |
| 4.4 | 会话回放前端(P3) | 复用 3.2 存储;新「会话回放」Tab;项目范围过滤 + token 脱敏 | admin 可回看任意会话 |

## Sprint 5 · 交互与主动:审批桥 + 定时提醒(约 7 人日)

| # | 工作项 | 改动点 | 验收 |
| --- | --- | --- | --- |
| 5.1 | tool-ask-user + user-approval 桥:SDK 通知 → 平台 ws → 目标角色作答 → 回填 agent;fail-closed;全程审计 | agent-gateway 扩展请求/应答;前端审批弹层;默认 30 分钟超时取消 | AI 起草前反问验收标准;敏感写操作需 pm 批准 |
| 5.2 | schedule 定时提醒(超期预警、站会摘要、交付检查),事件日志持有状态可重放 | 常驻会话 + 平台调度接线;送达走动态中心 + ws | 「3 天后提醒验证缺陷修复」端到端;重启不丢 |
| 5.3 | AI 用量看板(1.2 数据前端呈现) | 报表中心或 AI 页面板 | 管理员可看月度成本分布 |

## Sprint 6 · 战略观察(不排期,按信号启动)

- subagent + tool-workflow:批量需求分析、多项目周报汇总(依赖 5.1 稳定)。
- mcp-client:企业微信/GitLab/CI 的 MCP 服务(先过 outboundUrlPolicy 安全评审)。
- 反转评估:仅当产品定位转向 agent 优先工作台时启动。

## 贯穿事项(每个 Sprint 的 DoD 一部分)

1. 版本与契约:`@deepseek-ai/*` 精确锁版;CI 增加 SDK 协议面契约测试(run() 返回结构、通知类型枚举),升级显式评审。
2. 安全不变量:dsh host 只绑回环写进部署手册与 envPreflight;新工具全部 scoped token + 审计;Windows 禁用代码执行类能力。
3. 权限:新 API 与 ws 消息全部声明权限位过 accessControl;会话回放/用量看板默认 admin(+项目范围校验)。
4. 工程门禁:每 Sprint 过 `npm run check` 全链;新增 e2e 覆盖 AI 轨迹与审批流。
5. i18n:新增文案双语 key,与现有体系合并。
6. 数据库:新迁移 SQLite/PG 双方言验证照旧。

## 里程碑与度量

| 里程碑 | 交付判据 |
| --- | --- |
| M1(Sprint 1-2,约 1.5 周) | 用户可见底座状态与执行轨迹;AI 成本可查 |
| M2(Sprint 3,约 1.5 周) | 常驻 host + 实时事件流;双底座成形 |
| M3(Sprint 4-5,约 3 周) | AI 权限内闭环干活 + 方法论技能 + 审批/提醒 |
| 成功度量 | AI 任务事件可追溯率 100%;tool 调用 100% 带审计;需求→任务 AI 闭环 ≥1 条真实项目跑通;长文档分析单位成本下降 ≥30% |

## 执行记录

- 2026-08-14:计划成文;Sprint 1 启动(1.1 组合加固由主代理实施;1.2 token 计量、1.3 会话投影由子代理并行实施)。
- 2026-08-14:Sprint 1 完成。交付物与验证:
  - 1.1 组合加固:6 个插件包锁版 rc.6(`timeout-policy`、`repeat-tool-reminder`、`session-checkpoint-policy`、`compaction-basic`、`token-meter`、`session-projection`),cordis.yml 条目 7 → 14。
  - 1.2 token 计量:迁移 `20260814_25_ai_token_usage`;`src/modules/ai/tokenUsage.js`(提取/仓储);capabilityService 完成路径落账(容错不影响 invocation);`GET /api/ai/usage/summary`(ai:* 权限 + 项目范围校验)。事件结构结论:rc.6 中 `turn/end` 不带 usage,真实用量在 `assistant/message` 的 `data.usage`(`inputTokens/outputTokens/cacheRead/cacheWrite`,prompt 口径 = input+cacheRead+cacheWrite)与 `assistant/chunk` 的 usage 采样(同 turn:step 替换不累加);as-built 适配器事件暂不携带,先落 0 值行,提取函数就绪。
  - 1.3 会话投影:`config/harness/company-projections.mjs` 注册 `company.token-usage`、`company.tool-calls`、`company.turn-stats` 三个投影单元;zod schema(该包自身依赖,经提升 node_modules 使用,后续可显式声明)。
  - 验证:api 全量测试(处理 .env 干扰后)除 phase1-security 1 例外全过;该例外经对照实验(还原原版 cordis.yml 复跑)确认为本分支既有问题——`waitForAiJobStatus` 仅等 5 秒而 document_analysis job 走真实 harness 推理无法在窗口内完成,与 Sprint 1 改动无关。lint 全绿;生产服务重启验证:迁移 25/25、aiRuntime 正常、usage/summary 鉴权与空数据结构正确。
  - 遗留:① `api/test/phase1-security.test.js` 的 AI job 等待窗口在本机必超时(建议改长等待或 mock 推理,单独修复);② 本地 `api/.env` 的 SEED_ADMIN_PASSWORD 会经 dotenv 注入测试 server 导致集成测试 401(测试期移开 .env 可绕过,建议测试 server 显式覆盖 seed 变量);③ 迁移计数断言 atomic-upsert/postgres-import 已随 25 号更新,后续加迁移需同步;④ zod 传递依赖显式化;⑤ `ai_token_usage.job_id` 恒 null(为 AI job 计量预留)。
- 2026-08-14:Sprint 2(2.1/2.2/2.3/2.4)完成,前后端子代理并行实施 + 主代理联调收口。交付物与验证:
  - 后端:`src/modules/ai/harnessComposition.js`(cordis.yml 顶层插件解析,mtime 缓存;SDK 版本三级降级读取);`GET /api/ai/harness/status`(组合清单 + runtime 实时状态);`GET /api/ai/capabilities/invocations` 列表(limit 默认 20 上限 100、status 过滤、无 projectId 时用 resolveAccessScope 按可访问项目集合过滤)与 `/:id` 详情(events、tokenUsage、result;六类 snapshot 不外泄);capabilityRepository 新增 list 查询。
  - 前端:`AiRuntimePanel`(AI 页顶部底座卡片:组合名/SDK 版本/14 插件两色管线/runtime 呼吸点与队列,15s 轮询);`AiInvocationTimeline`(侧滑轨迹抽屉:事件按类型渲染——工具调用高亮并翻译 `project_snapshot` 为「读取项目快照」、模型消息带 token 增量、turn/end 按 reason 着色、未知类型降级;运行中 8s 轮询);能力托盘新增「最近调用」列表(limit 5,15s 轮询);i18n 中英各 +57 key;组件测试 11 个(mock fetch)。
  - 联调(主代理,真实浏览器):登录 → AI 页底座卡片渲染 14 插件与 runtime 状态;演示 invocation(`INV-DEMO-0001`,挂在真实项目 PRJ-MST5W5TQ 下)轨迹抽屉 6 事件全部正确渲染、token 增量行正确。联调修复两处:① 演示数据需挂真实项目 id(详情端点按项目范围校验,不存在项目会被 403——符合设计);② 详情 tokenUsage 字段名后端偏离冻结契约(prompt/completion/total vs promptTokens/...),已改回契约字段并同步测试。
  - 验证:api 新路由测试(node --test)全过、lint 全绿;web typecheck/lint/99 单测全过;生产服务重启后健康检查 ok。
  - 遗留:① 演示数据 `INV-DEMO-0001` 与演示项目保留在 app-p0p4.db 供界面查看,可随时删除;② runtime 未初始化时 status 的 maxRunsPerRuntime 上报编译期默认值,首次推理后精确;③ phase1-security 既有失败与 .env 测试隔离问题沿用 Sprint 1 遗留清单。
- 2026-08-15:Sprint 3(3.1/3.2/3.3/3.4)完成,前后端子代理并行实施 + 主代理收口修复。M2 达成:
  - 3.1 常驻化:`DEFAULT_MAX_RUNS_PER_RUNTIME` 20→0(0=常驻不限,env 可恢复上限);可选 `HARNESS_RUNTIME_IDLE_TTL_MS` 空闲回收(默认 0 永不);status 新增 totalCalls/totalRuns/idleTtlMs;SDK 事件透传采用官方 `DeepSeekHarness.run(input, { onNotification })`,过滤 `session.event` 经 run 级 onEvent 回调 → agentEventBus,run 结束即摘除,事件不跨 invocation 泄漏。
  - 3.2 会话持久化:sessions 插件换 `@deepseek-ai/dsh-session-persistence-sqlite`(WAL),`DSH_SESSION_DB` 默认 api/storage/harness/sessions.db;组合测试验证真实往返后 sessions.db 生成;JSONL 依赖保留供回滚。
  - 3.3 ws 桥:独立 `/ws/agent` 通道(同 http server、同 authenticateSocket JWT);连接级订阅 Map,断连自动清理;subscribe 校验 ai:* + invocation 存在 + canAccessProject;审计仅记 subscribe/unsubscribe(`ai.agent_event_stream`);优雅停机纳入 serverLifecycle(agentWss)。
  - 3.4 前端实时化:`agentEventSocket.ts`(单连接多订阅、指数退避重连自动重订阅、5s ack 预算、agent.error 致命);时间线 ws 驱动增量渲染(seq 去重、终态退订 + 最后详情拉取补 result/tokenUsage、「实时」徽标、失败静默回落轮询);RuntimePanel 常驻语义(`累计 N 次调用 · 常驻`、`第 N 代 runtime`);i18n 各 +7 key;web 112 单测全过。
  - **收口修复(主代理)**:
    ① 双 WSS 握手竞争——ws 库 `{server, path}` 模式对不匹配 path 的 upgrade 会 abortHandshake(400),新增第二个 WSS 后 /ws/agent 与 /ws/collab 互相拒绝握手(phase1 ws 用例 RSV_1/400)。修复:两处工厂(agentEventBridge、documents/collaboration)改 noServer + 各自 upgrade 监听只认领自己的 path、其余静默忽略。复现与验证:完整 server 场景下 /ws/agent 握手成功、消息收发正常。
    ② 测试环境基建——根因:宿主 api/.env 经 dotenv 注入测试 server(`NODE_ENV=production` → 生产禁 seed demo / 管理员密码被覆盖)。统一修复 8 处 spawn 测试显式 `NODE_ENV: "test"` + 清空全部 SEED_*(phase1-security、ai-capabilities-integration、graceful-shutdown-drill、organization-management、product-images、strategy-management、data-consistency-closure、requirement-access-and-defect-handoff);phase1 的 waitForAiJobStatus 窗口 5s→60s。期间一次批量补丁因 CRLF 行尾假阳性,已用容错正则重打并逐文件验证。
    ③ OpenAPI 登记:4 条 Sprint 2 路由补进 openapi.json(136→140 paths);enums 生成文件 CRLF 重生成对齐。
  - 验证:api 全量 **365/365 通过(0 失败,本机首次全绿)**;lint 全仓零警告;生产重启后 health ok(迁移 25/25)、harness/status 常驻契约字段在线;浏览器实测 RuntimePanel 显示「累计 0 次调用 · 常驻 / 第 1 代 runtime」,轨迹抽屉 6 事件 + token 汇总渲染正常。
  - 遗留:① 实时事件流的端到端演示需真实 AI 供应商 key(当前无 key,capability 不产生真实事件;ws 通道已用临时 server 端到端验证);② live 期间保留 8s 详情轮询作为对账兜底,后续可降频;③ graceful-shutdown drill 已修复但未跑 `npm run check` 全链。
- 2026-08-15:Sprint 4(4.1/4.2/4.3)完成,前后端子代理并行实施 + 主代理合并态验证收口。4.4 会话回放推迟(待真实会话数据积累):
  - 4.1 领域工具集:新 `executionCapabilities.js` 集中注册表(7 能力,权限字串按 accessControl 实际值校准——如 requirement-create 实为 `requirement:*`、task-create 实为 `project:*`,平台无 `requirement:create` 字面权限);`harnessRuntime.normalizeExecution` 白名单改注册表查询;gateway 新路由 `POST /v1/execution` 四层裁决(注册表精确匹配→token 能力精确绑定+单次防重放→平台权限→项目范围,写类加 canWriteProject);子进程 `company-execution-tool.mjs` 注册 7 工具(requirements_list/requirement_get/tasks_list/defects_list 读 + requirement_create/task_create 写),工具层本地校验零外呼;写操作与审计同事务原子(无事务时先审计后创建)。真实 dsh 子进程往返测试:脚本化 provider 发起 requirements_list 工具调用→回环 gateway 真实内存库取数→回流模型→二次推理完成。
  - 4.2 技能体系:cordis.yml 挂 dsh-skill → skill-filesystem(隔离根 customSkillDirs=DSH_SKILL_ROOT、watch 热更)→ tool-skill(14→17 插件);`api/config/harness/skills/` 3 个中文技能(fixed-delivery-checklist 六关卡检查、lightweight-delivery-gate 准入判断、defect-root-cause 三步根因);真实子进程验证 provider 请求体含 skill 工具与 `<available_skills>` 目录(3 技能在列)。
  - 4.3 组合预设:固定注册表 `HARNESS_COMPOSITIONS`(company-runtime-v1=默认钉死 cordis.yml、company-draft-v1=轻量草稿、company-review-v1=评审全量);run() 接受 compositionKey 进指纹(不同组合不共享常驻 runtime);未知键任何环境抛错,HARNESS_RUNTIME_CONFIG 旧行为保留;组合变体相对路径需 `../` 前缀已处理。
  - 合并态验证(主代理):全量 **396/396(0 失败,394 过 + 2 个 postgres-gated 跳过)**、全仓 lint 零警告;生产重启 health ok,组合 17 插件在线(技能三件套可见),常驻语义保持;浏览器底座卡片显示 skills/skill-filesystem/tool-skill。
  - 遗留:① capabilityRegistry manifest 仍只有 project-snapshot——领域能力经真实 invocation 启用需后续为它们加 manifest 并扩 CAPABILITY_RISKS 风险模型(当前 gateway/工具面/注册表链路已就绪且有直连测试覆盖);② PM 对 defects-list 403(持 project:* 无 defect:*),如需放开改声明为 project:read;③ 生产 launcher 钉死 cordis.yml,draft/review 组合生产启用需改 company-runtime.mjs 守卫;④ 4.4 会话回放待真实会话数据积累后实施。
- 2026-08-15:Sprint 5(5.1/5.2/5.3)完成,M3 达成,**五 Sprint 计划收官**:
  - 5.1 交互桥:装 3 个交互包(user-questions、user-approval、tool-ask-user),cordis.yml 17→21 插件(组合镜像字节级同步);子进程插件 `company-ask-bridge.mjs` 复用 DSH_EXECUTION_TOKEN/URL 挂 executionGateway 回环(零 harnessRuntime 改动);协议:POST /v1/interaction(创建)→ GET /v1/interaction/:id/wait(25s 空轮询 continue、总超时 30 分钟 env 可调);**waitToken(256bit)+ 10 分钟 grace** 解决执行 token 60s TTL 与长等待的矛盾及轮询竞态(测试复现后修复);fail-closed:通道不可达问题抛错、审批 unavailable、取消/超时 cancelled。服务端 `agentInteractionsService.js`(迁移 26 ai_interactions 表、原子认领、审计先行)+ REST(列表/respond/cancel,发起人或同项目 ai:*)+ ws `agent.interaction` 目标投递;前端 `AiInteractionCard`(选项作答/审批双按钮/取消,15s 轮询兜底)。**验收亮点:真实子进程全链路测试——脚本化模型调 ask_user_question → 回环桥接 → 平台人类作答 → 模型以人类答复收尾(1.9s)**。
  - 5.2 定时提醒(平台侧调度,dsh 原生 schedule 留待常驻 live agent 阶段):迁移 27 ai_reminders;`reminders-list`/`reminder-create` 能力(创建按写操作审计、事务原子);工具校验(60s~180 天窗口);`reminderScheduler.js` 30s 扫描、幂等、单条失败不阻塞、重启即补发;送达写动态中心 objects(bucket ai-reminder)。at-least-once 语义(投递与标记间宕机可能重投)。
  - 5.3 用量看板:usage/summary 加 `groupBy=day`(向后兼容);前端 `AiUsagePanel`(能力/按日双视图、项目与时间过滤、30s 刷新、纯 CSS 条形)。
  - 收口(主代理):合并态全量 **419/417 过 + 2 既有跳过,0 失败**;全仓 lint 0;build 重启后迁移 27/27、usage groupBy 与 interactions 端点在线、看板与常驻语义浏览器实测正常;修正演示项目名(当初 Git Bash curl 创建时中文编码损坏,数据库直改)。
  - 遗留:① 前端未监听 ws `agent.interaction` 加速刷新(轮询兜底可用,提速在 agentEventSocket 接一行);② 正式 capability 接入 ask 能力需放宽 capabilityAdapter 的 30s timeoutMs 与提示词(当前多工具被禁);③ 提醒重投语义见上;④ Sprint 6 战略观察项(subagent、MCP、反转评估)按信号启动。
  - 运维发现(2026-08-15 晚):`npm run start:prod` 后台运行时,harness 子进程 spawn/dispose 的 stdio 干扰会使 **npm 外壳进程**退出(exit 1)而 node 服务本体继续运行(孤儿进程)——表象是「服务崩溃」实为外壳退出。已验证修复:部署命令改为 `set -a && source api/.env && set +a && node scripts/start-prod.js`(绕过 npm 中间层),连续两轮 harness 30s 超时压力后服务稳定。生产部署建议同步更新 DELIVERY.md 启动命令或引入进程守护(PM2/NSSM)。
- 2026-08-15(第二批):**五 Sprint 全部遗留项收口 + 用户新需求六项**(主代理统筹,五波子代理并行实施 + 主代理联调修复与全链验证):
  - 遗留收口(Sprint 4 遗留①②③、Sprint 5 遗留①② 全部闭环):manifest 从 1 个扩到 9 个(requiredPermissions 从 executionCapabilities 派生防漂移,风险模型扩展 `project_write`);defects-list 放开为 `project:read`(PM 可调,经 accessControl 核实无授权回退);`AI_CAPABILITY_TIMEOUT_MS` env 可配(默认 120s,非法回退+单次告警);`HARNESS_ALLOW_COMPOSITION_VARIANTS=1` 组合变体生产 opt-in(父子进程双层守卫,默认拒绝);adapter prompt 改 manifest 驱动(工具清单+指引);前端 ws `agent.interaction` 加速交互卡刷新(pushInteraction 同时镜像到 ui 订阅连接)。
  - **AI 防泄密**(用户新需求):迁移 28 `ai_masking_rules`(block/replace、正则、大小写、启用开关、name 唯一);**harnessProxy 唯一出口双向脱敏**——请求方向深度遍历字符串(含 messages 分段),block 命中 403 `masking_policy_violation` fail-closed 不外发,replace 改写后更新 Content-Length,响应方向 maskText 防模型回显;admin CRUD + `/masking/test` 测试端点(`admin:*` + 审计);3 条幂等种子规则(API 密钥/JWT 令牌拦截默认启用、代号替换示例默认禁用)。
  - **dsh 操控前端 UI**(用户新需求):`ui-control` 能力(permission ai:*,mode write,projectScoped=false 走网关非项目域豁免)+ `ui_control` dsh 工具(9 种指令:主题/字号/字体/密度/强调色/内容边距/减弱动效/页面跳转/AI 侧栏,本地校验+服务端 uiDirectives.js 白名单共校);执行 token 增 `userId` claim(additive);agentEventBridge 新增用户级 ui 通道(`agent.subscribeUi`/`agent.subscribedUi`/`agent.ui`,`pushUiDirective` 定向送达,审计 `ai.agent_ui_stream`);REST `POST /api/ai/ui-directives`(ai:* 自发自收,运维验证通道)。前端 uiCommandBus + useUiCommandExecutor(App.tsx 挂载)消费指令——workTheme CSS 变量注入/权限校验后导航/侧栏开关/Toast 反馈。
  - **会话回放(4.4)落地**:sessionReplay.js(sessions.db STRICT 表优先、旧 JSONL 兜底、只读打开)+ `GET /api/ai/sessions(/:id)`(admin);前端 AiSessionReplay 复用 AiInvocationEventList 事件渲染。
  - **adapter 通用分发**:invoke 不再只支持 project-snapshot——manifest 驱动通用路径(prompt→modelClient/runtime→getCaptured 证据→executeDomain 兜底,封闭 outputSchema),9 个领域能力均可经真实 capability invocation 调用。
  - **前端分层重构**(用户新需求):features/ai 四层(api/ 六模块 + barrel、models/ 含 aiActionExecutor 拆四文件、hooks/ 三个编排 hook、components/),AiView 415→237 行,AI 页三 Tab(能力/用量/治理),AiSidebar 附件逻辑去重;治理 Tab 三面板(AiMaskingAdmin 规则 CRUD+规则测试、AiSessionReplay、AiUiDirectiveConsole 指令试发台)。
  - **瘦身与文档重构**(用户新需求):删 reactbits 4 个未用组件、prototype/、失效 CLAUDE.md;.gitignore 补 `api/app-*.db*`;文档三件套成文——`design-and-architecture.md`(201 行)、`trade-offs-and-decisions.md`(150 行)、`deployment-and-ops.md`(186 行),删 14 份被取代旧文档(01/03/04/08/11/12/13/14/16/17-old/18/architecture-refactor-plan/w2-postgres-plan/superpowers),全仓引用修复,docs/README 索引重写。注:fallback.ts 与 GradientText 经引用核实为活代码,保留。
  - **验证**:api 全量 463(461 过 + 2 postgres-gated 跳过)0 失败、lint 0;web typecheck/lint 0、vitest 148 全过;`npm run check` 全链绿(audit:prod 需 `--registry=https://registry.npmjs.org`——npmmirror 不实现 audit API,环境问题);浏览器 GUI 全流程 9 测试点全过(登录/底座卡片 21 插件/三 Tab/屏蔽规则 CRUD+双向脱敏测试/会话回放/UI 指令实测 4 种含深色主题即时切换/执行轨迹/用量/i18n),截图存 gui-test-screenshots/。
  - **GUI 测试发现并修复 1 个真 bug**:masking POST/PATCH 响应按冻结契约为 `{data:{item}}` 包裹,前端直接 normalize 整体导致 TypeError→catch 吞掉→invalidate 永不执行→开关 UI 不刷新且连点可能误发;修复 masking.ts 解包 + 有状态 mock 回归测试 + 生产复验(连续切换/新建/删除全通)。
  - 遗留:① 模型在真实推理中调用 ui_control 需为某个 assistant 组合绑定 ui-control execution 上下文(单能力 token 语义;运维台 REST 与网关直连路径已实测覆盖);② 无真实 AI 供应商 key,adapter 通用分发与多工具链路的端到端模型行为待有 key 后验证;③ audit:prod 在 npmmirror 镜像源下不可用(需切官方源跑);④ 会话回放前端事件类型多为原始类型名(如 agent/inbox/spliced),可在 harnessModel 增量补充友好映射。
- 2026-08-15(第三批):**dsh × 公司管理框架统一 —— 全站 Copilot 侧栏 + 聊天/能力归一**(纯前端重构,不动后端/WS 契约;agentEventBridge 头注释标记冻结未触碰)。动机:全局 AiSidebar 只走传统 /api/ai/chat 无 harness 能力;dsh 托盘/轨迹/交互卡割裂在 AI 页;交互卡只在 AI 页挂载时有人应答,用户在其它页面时 dsh 被挂起;侧栏对所有角色可见而 AI 接口全要求 ai:* 权限,dev/qa/pdm 打开即 403。交付物:
  - **共享层(纯新增)**:`agentPageContext.ts` 页面上下文桥(仿 uiCommandBus 的 window 事件;publish/subscribe/get + `useAgentPageContextPublisher` 挂载发布/卸载清除,消费侧按 page key 防串页);`hooks/useHarnessStatus`(queryKey ['ai','harness-status'] 原样抽出,AiRuntimePanel 改消费,侧栏 chip 与 AI 页卡片共享一次 15s 轮询);`hooks/useCapabilityRunner`(从 AiView 抽 invoke 流程:invoking/latest/invocationProjectId/timelineInvocationId + toast + queryClient 失效,onInvocationQueued/onSummaryChanged 回调化);`hooks/usePendingInteractions`(共享 queryKey ['ai','interactions','pending'] + agent.interaction ws 推送加速 + 数量上升 toast——首屏数据为基线不算上升,403 静默为空)。
  - **聊天件归一**:AiChatPanel 中消息列表/输入区抽为 `components/agent/AgentMessages.tsx`(含 proposedActions 草稿卡、附件、来源徽标)与 `AgentComposer.tsx`(placeholder/Enter 发送/附件chips 与 AI 页一致,e2e 兼容);AiChatPanel 薄壳化为 Panel + provider 头 + 托盘 slot(before prop)+ 两个共享件,AI 页行为不变。
  - **AgentSidebar 全站 Copilot 侧栏**(`components/agent/AgentSidebar.tsx` 替换并删除 `components/common/AiSidebar.tsx`):头部标题 + dsh 状态 chip(运行中/空闲 + 队列 + proxy,复用 aiRuntimePanel key)+ 关闭;上下文条(当前页面 + 项目名,来自上下文桥);pending>0 时内嵌 AiInteractionCard(单点挂载,任何页面可应答,能力托盘上方);聊天 useAiChatState({scope:'global-assistant'})(仍走 /api/ai/chat)紧凑模式;能力托盘复用 AiCapabilityTray、invocationProjectId 由上下文桥预填(用户可改);轨迹 AiInvocationTimeline 抽屉(fixed,z-index 81 > 侧栏 60,CSS 核实无叠加问题)。Layout 挂 usePendingInteractions(toast)+ 按 canOperate(user,'ai:analyze') 门控侧栏与 openAiSidebar 指令;AppHeader Bot 按钮加 pending 徽标、无 AI 权限不渲染;`ai-sidebar-open` shell class 保留;CSS 扩展(状态 chip 呼吸点/上下文条/托盘与消息紧凑适配/徽标,全部沿用现有 token);i18n 中英各 +8 key(features.ai.agentSidebar.* + aiView.interactionsMovedToSidebar),清理孤儿 key 6 个(aiWelcome/askPageQuestion/currentView/fallback/aiThinking/maxAttachments)。
  - **页面上下文发布**:RequirementsView(filters.projectId)、DefectsTab(filters.projectId)、TestCasesTab(projectFilter)、ProjectDetailView(选中项目 id+name)调用 useAgentPageContextPublisher。
  - **AiView 收敛**:改用 useCapabilityRunner(回调挂 jobReview.openJob/reload);页内 AiInteractionCard 移除换指向侧栏的提示条(usage/governance/job review 不动)。
  - **行为变化点**:dev/qa/pdm 不再看到侧栏入口(原先可见但 403)——按设计收口,交付说明标注。
  - **验证**:web typecheck/lint 0 警告、vitest 160 全过(新增 12:上下文桥 5 / usePendingInteractions 4 / useCapabilityRunner 3)、build 通过;e2e full-ui-flow 新增 M3(Bot 开关→侧栏可见→上下文条显示当前页面→侧栏内关闭)与 DEV 无 Bot 入口断言,针对受影响页面(B/C/D/M/M3/DEV)6 用例全过(隔离 API 4011 + 演示种子,SEED_* 清空避免 .env 污染);浏览器目检:需求管理选项目后侧栏上下文条显示「当前页面:需求管理 / 项目:Work Platform Optimization」、状态 chip「空闲 · 队列 0 · 已启动」、7 能力托盘 300px 宽无横向溢出、切到工作台后项目行不残留(防串页守卫生效)。测试过程中修正 e2e 关闭路径:固定定位侧栏覆盖顶栏右缘(与旧侧栏一致),关闭走侧栏内 X 按钮。
  - 遗留:① 侧栏聊天仍走 /api/ai/chat,直连 dsh harness 会话需后端会话型端点(超出纯前端范围,按计划不做);② 页面级能力入口植入按用户决策仅保留侧栏方案;③ 交互卡在侧栏关闭时不显示(仅顶栏徽标 + toast 提醒),打开侧栏即见——如需关闭侧栏也能应答,后续可把交互卡提升为全局浮层。

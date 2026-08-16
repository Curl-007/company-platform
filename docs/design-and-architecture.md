# 设计思路与架构(as-built)

> 本文描述平台当前真实架构与设计思路,吸收并取代原 01/03/04 设计方案与 17/18 Harness 计划中仍准确的部分。
> 实现进度差异见 [10 实现状态与差异清单](./10-实现状态与差异清单.md);权衡与决策依据见 [trade-offs-and-decisions.md](./trade-offs-and-decisions.md);部署运维见 [deployment-and-ops.md](./deployment-and-ops.md);dsh 底座化执行计划见 [17-dsh-foundation-plan.md](./17-dsh-foundation-plan.md)。

## 1. 平台定位与业务分层

平台面向公司内部研发与交付,统一管理个人工作、项目、需求、任务、测试缺陷、文档、团队与 AI 分析。核心产品主线:

- **A 个人可见**:员工清楚"今天做什么、卡在哪里、产出是什么"。
- **B AI 串链**:需求、任务、测试、文档、日志经 AI 形成可追溯链,输出规划、风险、拆解与完成度。
- **C 管理可见**:管理层实时看到项目、人员负载、风险与里程碑。

业务对象分层(战略组合 → 交付项目 → 执行任务 → 证据数据):

```text
Program 项目集          Portfolio 产品集(产品/项目集/组合 三 Tab)
  └─ Project 项目         └─ Product 产品 → 模块 → 版本 → 需求池
       ├─ Milestone / Sprint / WBS
       ├─ Requirement 需求 ←── 产品价值与项目交付的连接点
       │    └─ Test Case / Test Run / Defect
       └─ Task 任务(执行单元,WBS 父子 + Kanban 流转)
Document / Work Log / AI Invocation = 证据层,支撑完成度计算与审计
```

状态机唯一真源是 [00 数据字典](./00-数据字典与术语统一.md):项目五态、需求八态、任务八态、缺陷状态。流程模板 as-built 收窄为「固定交付 + 轻量交付」两个内置模板与项目绑定,不含可配置流程引擎(目标态)。

## 2. 双底座架构

平台由两个底座组成:**业务底座(治理层)**与 **dsh 底座(能力层)**。业务底座是权限、审计、数据的唯一权威;dsh(DeepSeek Harness)是一等 agent 运行时,其能力(事件流、工具、技能、审批、定时)对用户可见、可用、可治理。

```text
┌────────────────────────── 浏览器 ──────────────────────────┐
│  平台 SPA(业务页面/详情 surface/DSH 声明式视图)             │
└───────────┬───────────────────────────────┬────────────────┘
            │ HTTPS/WSS(平台 JWT)          │ /ws/agent 事件流
┌───────────▼───────────────────────────────▼────────────────┐
│ 平台主进程 Express(业务底座 = 治理层)                      │
│   鉴权 · 五角色权限 · 审计 · 业务表 · 备份                  │
│   agent-gateway:会话绑定、工具作用域 token 签发、事件回流   │
└───────────┬────────────────────────────────────────────────┘
            │ SDK JSON-RPC(子进程,只绑 127.0.0.1 回环)
┌───────────▼────────────────────────────────────────────────┐
│ 常驻 dsh host(agent 底座 = 能力层)cordis 组合              │
│   session · 19 域/152 项业务操作 · 独立 UI 工具插件         │
│   skills(交付方法论)· user-approval · schedule · subagent  │
└─────────────────────────────────────────────────────────────┘
```

请求链路(一次 AI 能力调用的完整路径):

```text
浏览器(平台 JWT)
  → 平台 REST(POST /api/ai/capabilities/:id/invocations)
    → RBAC + 项目范围 + 审计 + masking → AI Job
      → harnessRuntime(SDK JSON-RPC 子进程)
        → dsh host 推理;需要业务数据时经 executionGateway 签发的
          scoped token 回环调用平台自身(POST /v1/execution)
        → 需要 LLM 时仅能走 harnessProxy(127.0.0.1 随机端口回环代理)
  → 事件经 agentEventBus → /ws/agent 实时推回浏览器
  → 结果落 ai_capability_invocations + 审计 + token 计量
```

两条安全不变量贯穿全链路:

1. dsh host 只绑回环,永不直接对外;平台 agent-gateway 是唯一入口(写入部署手册与 envPreflight)。
2. 符合准入规则的 JSON 业务操作注册为受治理工具,经 executionGateway 签发 scoped token;平台用户是 dsh 写操作的审批人。认证、密钥/运行时控制面、健康/元数据和对象/二进制传输保持不可调用。

## 3. 代码分层

### 3.1 web(React 19 + Vite + HashRouter)

```text
web/src/
  app/         lazyWithRetry + pageRegistry(17 项分组导航的唯一登记点)
  pages/       薄壳页(多为 7-8 行,仅装配;BuildsPage/ReleasesPage 等为别名页)
  features/<domain>/   域 UI,内部按四层组织:
    api/       领域 API 封装(fetch、错误信封)
    models/    类型/纯函数模型(可单测,不依赖 React)
    hooks/     状态编排(useAsync、useInvocationTrace、useUiCommandExecutor…)
    components/展示组件(DashboardView、RequirementsView…)
  components/  跨域公共组件(DataTable、StatusBadge、reactbits 动效等)
  styles/      全局视觉系统(见下「样式与主题」)
```

**样式与主题**(2026-08-15 重设计):样式真源分三层——`theme/workTheme.ts`(运行时真相,唯一内置主题「液态玻璃」:深色玻璃 + 光谱蓝 `#6F9EE8`,参考 Liquid Glass orb 色板;默认深色,浅色为白玻璃伴侣,持久化于 localStorage)、`src/index.css`(Tailwind v4 入口 + no-JS 回退调色板,注释约定与 workTheme 同步)、`styles/global.css`(~13k 行,含 token 别名块、组件族、工作台样式与**玻璃质感层**——文件末尾追加,背景光谱辉光 + 磨砂半透明面 `backdrop-filter: blur(18px) saturate(140%)` + 内高光边 + 主按钮/焦点辉光)。详情页布局统一为「顶栏 hero + 分节卡片」:`.detail-hero`(标题/徽标/操作)、`.detail-strip`(指标条)、`.detail-section`(分节卡)、`.detail-grid`(双列发丝线字段网格,被任务/缺陷/我的工作等十余处复用)。

治理面板集中在 `features/settings/components/`(Provider、AI 助手、偏好等 Panel)与 `features/ai/`(底座卡片、轨迹抽屉、交互卡、用量看板)。KPI 统一经 MetricCard + MetricStrip(grid/bar/hero)。

### 3.2 api(Express,composition root 显式装配)

```text
api/src/
  db/          runtime(sqlite/postgres 方言)+ access 异步契约 + schema
  security/    JWT、accessControl(权限位真源)
  modules/<domain>/  auth/organization/audit/projects/requirements/tasks/
                    testing/delivery/documents/flow/products/reports/capacity…
  modules/ai/  见 3.3
  ops/         serverLifecycle、优雅停机
server.js      显式装配根(依赖注入,不放业务逻辑)
```

### 3.3 ai 模块(按职责分六面)

| 面 | 模块 | 职责 |
| --- | --- | --- |
| 能力面 | capabilityRegistry / capabilityRepository / capabilityRoutes / capabilityService / capabilityAdapter / capabilityControls / executionCapabilities | manifest 注册表与校验、invocation 生命周期、能力→adapter 映射、approved 默认启用与 kill switch |
| 执行面 | harnessRuntime / harnessComposition / harnessProxy / modelClient / modelComposition / outboundUrlPolicy / executionGateway / executionToken / assistantExecutionService / platformOperationRegistry / platformOperationProxy / timeoutMonitor | dsh 子进程管理、组合解析、回环代理、普通助手工具会话、OpenAPI 业务目录、原 REST 代理与 scoped token |
| 事件面 | agentEventBus / agentEventBridge / uiDirectives / uiSurfaceRegistry / agentInteractionsService / agentInteractionsRoutes / interactionsService / interactionsRoutes / chatService / chatActions | 进程内事件总线、/ws/agent 桥、UI 指令与 surface 白名单、ask-user/审批交互、聊天编排 |
| 治理面 | maskingRules / maskingRoutes / providerStore / providerAdminService(Routes) / assistantStore / assistantAdminService(Routes) / sessionReplay(Routes) / targetAccess | 防泄密规则、Provider/助手配置治理、会话回放只读面 |
| 计量与调度面 | tokenUsage / reminderScheduler / jobDispatcher / jobRunner / jobRecovery | token 落账与汇总、平台侧定时提醒、AI Job 队列/恢复 |
| 领域服务 | adviceService / documentAnalysis / summaryService / ragIndex / ragSearch / ragMaintenance / embedding / repository / service / routes | 文档分析、hybrid RAG(本地 hash 向量+关键词)、摘要、业务建议等 AI 应用 |

## 4. 能力体系(execution capabilities)

### 4.1 两层工具面

平台保留两种互补的 dsh 工具入口,不要把它们混为同一注册表:

| 工具面 | 注册与用途 | 当前规模 | 裁决方式 |
| --- | --- | --- | --- |
| 普通助手业务工具 | `platform-assistant` 会话装载 `company-platform-tool.mjs`;模型先查 `company_platform_catalog`,再调用 `company_<domain>` | 19 个业务域、152 个 JSON REST 操作;1 个 catalog + 19 个领域工具 | 回环 `/v1/platform-operation` 恢复当前 actor,再调用原 REST;原 RBAC/项目范围/业务校验生效;写操作要求 dsh `allowed-once` 确认并在执行前审计 |
| 冻结 capability manifest | `capabilityRegistry` 面向能力托盘/独立 invocation 的版本化输入输出契约 | 10 个 approved manifest;`executionCapabilities` 另登记 `platform-assistant`、`ui-control` 等 12 个内部执行身份 | id@version、风险、权限、项目范围、一次性 token/确认按 manifest 路径裁决 |

approved capability 在没有持久化覆盖时默认 `enabled=true`;管理员 kill switch 仍可禁用。前端隐藏人工能力工具栏只是交互收敛,不改变服务端控制面、`ai:*` 门槛和确认规则。

### 4.2 OpenAPI 派生的业务操作目录

`platformOperationRegistry.js` 以 `api/openapi.json` 为真源,仅收录 `GET/POST/PUT/PATCH/DELETE` 且可用 JSON 表达的业务操作。每项生成稳定 action id、domain、method/path、read/write 标记和精确请求契约:

| domain | 操作数 | domain | 操作数 |
| --- | ---: | --- | ---: |
| capacity | 12 | dashboard | 2 |
| defects | 7 | delivery | 16 |
| documents | 5 | flow | 3 |
| governance | 1 | organization | 11 |
| products | 6 | projects | 27 |
| reports | 2 | requirements | 9 |
| sprints | 7 | strategy | 14 |
| tasks | 9 | team | 1 |
| testing | 10 | time-entries | 4 |
| work-logs | 6 | **合计** | **152** |

- path/query 参数保留 required、description 与公开 schema;
- JSON body 保留 required 与递归展开的公开 schema(`properties/required/enum/items/allOf/anyOf/oneOf` 等);
- 模型调用只允许 `{path,query,body}`,未知字段、未知 path 参数、危险对象 key、超量 query/body 在回环前拒绝;
- 认证、`/api/ai/*`、AI Provider/助手管理、`/api/health`、`/api/meta/*`、对象存储、文档/产品二进制上传下载与页面访问遥测明确排除。

目录的“全量”含义是**所有符合安全准入的业务 JSON API**,不是把平台控制面和文件传输面暴露给模型。业务数据仍只有平台数据库一份,工具没有直连数据库能力。

### 4.3 manifest、风险模型与 AI Job 生命周期

面向浏览器的能力经 `capabilityRegistry` 声明式 manifest(id/version/status/scopes/inputSchema/outputSchema/risk/runtime.toolName),风险分 `read_only`、`project_write`、`external_action` 三档;`project_write` 能力产生的业务写必须走 AI Job 草稿 → 人工确认 → 平台业务 API 落库,模型永不能直写数据库。

需要人工复核后落业务写的 AI 分析沿用 `ai_job` 状态机,前端不直接把模型输出写入业务表:

```text
queued → running → awaiting_review → confirmed(人工确认写入)
                          └→ rejected(驳回,不写入)
running → failed → retried(重试任务)
```

冻结 capability 与普通助手工具会话均在 `ai_capability_invocations` 留 invocation 记录(事件、token 用量、结果;敏感 snapshot 不外泄,execution token 脱敏),可经 `GET /api/ai/capabilities/invocations` 按项目范围查询。普通 `/api/ai/chat` 工具写另走 dsh `allowed-once` 确认 + 原 REST,不伪装成上述 AI Job 状态机。

### 4.4 四层裁决(executionGateway)

冻结 capability 工具回环调用 `POST /v1/execution`,网关依次:

1. **注册表匹配**:能力 id@version 未注册直接 400;
2. **token 绑定与防重放**:executionToken 与能力精确绑定、单次使用、短 TTL(60s),防跨能力/重放;
3. **平台权限**:恢复 actor,校验 ai:* 基线 + 注册表声明权限(hasPermission);
4. **项目范围**:canAccessProject;写类再加 canWriteProject;ui-control 豁免项目门(声明为写、强制审计)。

冻结 capability 的写操作与审计同事务原子。普通助手的 152 项业务操作走独立 `/v1/platform-operation`:可复用会话 token 仍绑定 invocation/actor,写操作先记 `ai.platform_operation_requested`,随后由原 REST 执行业务事务和权限校验;任一前置审计失败均不执行写入。裁决失败一律返回受控 4xx/5xx 并记拒绝/失败证据。

## 5. 事件体系

```text
harnessRuntime(SDK session.event 通知,run 级回调,结束即摘除)
  → agentEventBus.publish()(进程内 fan-out,坏订阅者隔离)
    → agentEventBridge(/ws/agent,JWT 鉴权,连接级订阅 Map)
      → 浏览器 agentEventSocket.ts(单连接多订阅、指数退避重连、5s ack 预算)
```

/ws/agent 下行消息四类:

| 消息 | 内容 | 前端消费 |
| --- | --- | --- |
| agent.event | invocationId 绑定的会话事件(工具调用/模型消息/turn) | AiInvocationTimeline 增量渲染(seq 去重,终态退订后拉详情补 result/tokenUsage) |
| agent.interaction | ask-user 问题/审批请求(目标用户投递) | AiInteractionCard(选项作答/审批双按钮,15s 轮询兜底) |
| agent.ui | 白名单 UI 指令(theme/fontSize/density/accentColor/navigate/openAiSidebar 等) | useUiCommandExecutor + uiCommandBus 执行 |
| agent.error | 订阅无效/通道错误 | 致命断开处理 |

订阅需 ai:* 权限 + invocation 存在 + 项目可访问;审计记 subscribe/unsubscribe。交互应答链:SDK 通知 → company-ask-bridge 子进程回环 → 平台人类作答(REST /ws 双通道)→ 回填 agent;通道不可达一律 fail-closed。

## 6. DSH UI 插件与前端 surface

### 6.1 独立工具插件与协议

`company-ui-tool.mjs` 与业务工具插件分离,在普通 `platform-assistant` 会话中注册 7 个工具:

| 工具 | 作用 |
| --- | --- |
| `company_ui_catalog` | 返回所有 page/detail surface、可排序 block、7 类声明式区块、14 类指令和安全边界 |
| `company_ui_control` | 执行主题、字号、字体、密度、强调色、内容边距、减弱动效、内部导航、AI 侧栏 9 类既有 UI 指令 |
| `company_ui_layout` | 调整登记详情 surface 的区块顺序 |
| `company_ui_style` | 应用 `default|quiet|contrast`、1-3 列、8-32px 间距的有限设计 token |
| `company_ui_view_upsert/remove/open` | 创建/更新、删除、打开当前用户的声明式视图 |

服务端 `uiDirectives.js` 先按登记 surface、区块 id、页面 id、类型和数值范围归一化;浏览器 `uiDirectiveModel.ts` 再校验一次。`navigate` 和 links 只能去 `pageRegistry` 已登记的内部页面,未知页面由服务端拒绝;`navigate.focus` 只接受有界平台实体 id,用于打开现有详情路由,不接受路径、查询串或 URL。

### 6.2 surface、布局编辑与持久化

`uiSurfaceRegistry.js` 当前登记 **34 个 surface**:

- 19 个 page surface:17 个可见导航页 + `builds`/`releases` 别名;`App.tsx` 在登录后的页面根统一输出 `data-layout-surface={currentPage}`,支持受限 style,不承诺整页任意重排;
- 15 个 detail surface:`projects.detail`、`projects.task-detail`、`requirements.detail`、`documents.detail`、`delivery.build-detail`、`delivery.release-detail`、`team.member-detail`、`flow.project-detail`、`products.detail`、`programs.detail`、`portfolios.detail`、`mywork.task-detail`、`mywork.requirement-detail`、`mywork.defect-detail`、`teamlogs.member-summary`;均接 `SortableSectionLayout`,同时支持 layout 与 style。

布局控件默认隐藏,用户进入“布局编辑”后才显示拖拽手柄、上下移动和重置;键盘与 aria live 公告可用。人工移动和 dsh 指令按 userId + surface 写浏览器 `localStorage`,刷新恢复;新版本新增区块自动追加,未知或重复 id 被丢弃。页面/详情 style、声明式视图和 active view 同样按当前用户隔离持久化。该状态目前不是服务端跨设备配置。

### 6.3 新建 UI 的封闭声明式边界

新视图由受信 React 渲染器解释,只接受 `stat/text/list/table/progress/notice/links` 七类 JSON block;有视图数、区块数、文本、表格行列和链接数上限。HTML、Markdown 执行、JavaScript、CSS、选择器、外部 URL、未知字段和任意 fetch 均不可表达。AI 如需呈现业务数据,先通过 `company_platform_catalog`/领域工具读取,再把受控标量映射为 block;view spec 自身不会在浏览器后台调用业务 API。

## 7. AI 防泄密

- **唯一出口**:所有 LLM 出站走 `harnessProxy`——API 在 127.0.0.1 随机端口启动的回环代理,每 runtime 一次性随机 Bearer;真实 Provider Key 只在控制面内存/加密配置出现,子进程环境为 allowlist(不继承 JWT_SECRET、加密 Key、数据库 URL)。
- **双向 masking**:`maskingRules` 规则引擎(ai_masking_rules 持久化)对请求体字符串递归脱敏(maskPayloadStrings),对 Provider 响应文本再脱敏(maskResponseText);规则不可用时 fail-open(可用性控制),但 **block 规则命中即 403**(maskingViolation,防泄密控制 fail-closed)。
- **出站策略**:outboundUrlPolicy 禁止 URL 凭据/query/hash、localhost、私网与保留地址和重定向;DNS 校验固定到实际 socket;私有 Provider 仅显式精确主机 allowlist。

## 8. 会话与运行时

- **常驻 runtime**:harnessRuntime 不再按 20 次销毁(DEFAULT_MAX_RUNS_PER_RUNTIME=0,env 可恢复上限;可选 HARNESS_RUNTIME_IDLE_TTL_MS 空闲回收);指纹失效(换组合/模型)时优雅换血。
- **会话持久化**:sessions 插件写独立 SQLite(WAL),`HARNESS_SESSION_DB` 默认 `api/storage/harness/sessions.db`,与业务库分离;旧 JSONL 保留可回滚。
- **会话回放**:GET /api/ai/sessions(admin)只读读取 sessions.db(优先)或 JSONL 树,事件形状与前端 AiInvocationEvent 契约一致;损坏存储降级为空列表而非 500。
- **组合**:cordis.yml 21 插件(会话/事件/审批/技能/计量/投影);HARNESS_COMPOSITIONS 提供 draft/review 预设,生产默认钉死 cordis.yml。

## 9. 产品边界(dsh 在浏览器可见什么)

**浏览器可见**:已批准能力的名称、版本、用途、风险等级、健康状态、声明式输入表单、输出 schema、确认要求;底座运行时状态(AiRuntimePanel:组合名/SDK 版本/插件管线/常驻语义);执行轨迹与 token 用量;交互卡;登记 page/detail surface;当前用户的声明式 DSH 视图与白名单 UI 指令。

**浏览器永不可见**:Provider Key、Harness/execution token、原始 Cordis YAML、动态 JavaScript/CSS、直连 Harness RPC 端点。冻结 capability invocation 必经 BFF 的 manifest/风险/AI Job 策略;普通助手业务工具必经工具确认 + platform-operation gateway + 原 REST;两条路径都不能绕过 RBAC、项目范围和审计边界。

AI 分析页不再展示人工能力工具栏:approved 能力默认启用,模型按需选择工具。首载摘要通过 `useAsync` 执行两次有界重试(800ms 间隔),最终首载错误再自动 reload 一次;已有缓存采用 stale-while-revalidate,模型后台刷新最多再安排一次 30s 跟进。硬刷新 E2E 断言页面无需出现手工重试按钮;这不把 Provider 故障伪装为成功,不可恢复错误仍按现有错误/本地降级路径处理。

## 10. 关键不变量(变更时不得破坏)

1. 服务端是权限唯一裁决者;前端按钮仅引导。
2. dsh host 只绑回环;Provider Key 永不进子进程;AI 写必经人工确认。
3. 工具会话、写操作、拒绝/失败必须留审计或 invocation 证据;写前审计失败时 fail-closed。不要宣称每个成功只读 REST 都单独写审计行。
4. SQLite 默认;PG 可选验证路径,不改变上述任何边界。
5. 冻结 capability 新增必须先进 manifest/执行注册表;普通业务操作新增必须进入 OpenAPI 且通过准入/排除测试;两条路径都不可绕过原 REST 权限。

# 架构权衡与优缺点

> 记录平台演进中已锁定的关键决策、各方案优缺点与代价,以及已知遗留风险。历史素材:17-dsh 双底座原则、18 rebuild blueprint 决策、w2 PostgreSQL 计划决策表、15 审查摘要结论。
> 架构本身见 [design-and-architecture.md](./design-and-architecture.md);dsh 底座化执行记录见 [17-dsh-foundation-plan.md](./17-dsh-foundation-plan.md)。

## 1. 运行时形态:双底座 vs 单底座 vs 完全反转

| 维度 | A. 单底座(业务系统内嵌隐形推理管道) | B. 双底座(as-built:业务治理层 + dsh 能力层) | C. 完全反转(业务全迁 cordis 插件) |
| --- | --- | --- | --- |
| 权威与审计 | AI 是隐藏实现细节,治理难落地 | 平台保留身份/RBAC/审计/事务/状态机唯一权威;dsh 只做能力层 | 权威迁入 Host 层,需重建认证与审计体系 |
| agent 能力上限 | 低:事件流/工具/技能/审批难以一等暴露 | 高:dsh 会话、工具、技能、审批、定时对用户可见可用可治理 | 最高:原生工作台体验 |
| 风险 | 演进受限,能力增长靠平台重复造轮子 | 双进程边界需持续维护(回环、token、事件桥) | dsh 为 RC 期框架、Host 层无认证体系,业务与 agent 演进节奏不同 |
| 迁移成本 | — | 增量演进而非重写,strangler 方式按能力切换 | 全量重写,业务回归风险极大 |

**不做完全反转的三条理由**(17-dsh 锁定):dsh 尚处 RC 期;Host 层无成熟认证/多租户体系;业务系统与 agent 运行时的演进节奏不同。仅当产品定位转向「agent 优先工作台」时重新评估(Sprint 6 战略观察项)。

**18 blueprint 的同等决策**:这是 rebuild 运行时而不是又接一个模型——Harness 拥有 agent 会话/插件组合/工具分发/模型执行/可重放事件;公司插件拥有身份、RBAC、项目范围、审计、业务写确认、状态机、事务、Provider 与发布策略。React 客户端始终是编译产物可信客户端,不是模型生成的浏览器插件。

**迁移方式**:strangler(绞杀者)而非一步重写——现有服务在完整垂直切片通过 parity 检查前保持权威;任一聚合同一时刻只有一个写入方;切写前排水任务、拒绝新写、只读切换窗口。业务事实留在公司数据库,`HARNESS_HOME` 只存敏感执行证据(会话、提示词、输出、附件),由 API 服务账户独占。

## 2. 前端扩展机制:封闭声明式 UI vs 动态代码

**决策(as-built)**:React 客户端始终是编译产物可信客户端。dsh 通过独立 `company-ui-tool` 产生封闭 JSON 声明,由受信 React 渲染器解释;现有页面只接受登记过的 surface/layout/style 指令,新视图只接受 7 类 block 和内部页面链接。模型生成 HTML、JavaScript、CSS、选择器、外部 URL 或任意 fetch 均不进入生产浏览器。

| 维度 | 封闭声明式 UI(as-built) | 动态插件/模型生成代码 |
| --- | --- | --- |
| 安全边界 | 服务端 + 前端双重白名单;无 eval、脚本、任意样式或网络地址 | Harness VM 不是浏览器安全边界,运行时行为难静态审查 |
| 状态与回滚 | 当前按 userId 存浏览器 localStorage;view 可 upsert/remove,布局可重置 | 动态副作用难复原,且可能绕过平台状态 |
| 表达能力 | `stat/text/list/table/progress/notice/links` + 有限 surface token;业务数据先经平台工具读取后物化到 block | 任意,同时带来任意代码与出站能力 |
| 适用面 | 个人工作视图、页面风格和详情区块排序 | 仅隔离开发/设计沙箱,不进生产 |

当前**没有**服务端共享发布、版本审批、组织级插件市场或跨设备同步;此前蓝图中的“预览→管理员批准→发布/回滚”仍是未来共享视图的准入条件,不能写成已实现。若以后增加 live 数据绑定,必须使用批准的数据源/operation id,不能让 view spec 携带 URL。

**非目标**:不用 prompt 指令替代 RBAC/审计/事务/状态机;不做浏览器直连 Harness/Provider;不把模型生成或第三方动态插件当可信生产代码;不把 PG/Redis/微服务拆分设为前提。

## 3. 数据库:SQLite 默认 / PostgreSQL 可选

**决策**:默认 SQLite;PG 是可选验证路径,不作为默认「生产收口」叙事。

| 收益 | 代价 |
| --- | --- |
| 单文件零运维,备份/恢复/演练一条命令 | 单机文件锁:不可多进程写同一 DATABASE_FILE |
| 与单机 start:prod 形态完全匹配 | 水平扩展需 PG + worker/queue 专项项目 |
| 全量测试与 RC 门禁以 sqlite 为主路径跑通 | 真 PG 验证 opt-in(需显式 URL),CI 未挂 PG service |

w2 已锁定的技术决策(用户采纳):不加 SQL FK(继续应用层 preflight)、JSON 列保持 TEXT(不强制 jsonb)、pgvector/ORM/双写/MinIO 明确范围外、切换后保留冻结 SQLite 副本至回归稳定。W0–W7 开发/验证完成(可启 PG、NDJSON 导入对账、drill 回滚),**生产维护窗口切换与 CI PG service 未做**。

方言差异要点(`@name`→`$n`、`INSERT OR REPLACE`→`ON CONFLICT DO UPDATE`、`datetime('now')` 优先应用层 now()):业务代码写同一套异步 access 契约(row/rows/run/insert/transaction),方言翻译集中在 db 层,业务模块不感知 dialect。

## 4. dsh 只绑回环(安全不变量)

**决策**:dsh host 子进程只监听 127.0.0.1,由平台 agent-gateway 做唯一入口;写入部署手册与 envPreflight。

- 优点:Provider Key/业务库/权限体系完全不暴露给 agent 运行时;网络层即边界,配置错误面最小。
- 代价:所有 agent↔业务交互必须回环一次(签名/验签/审计开销);无法把 dsh 直接暴露给外部编排工具。
- 伴生决策:回环走 scoped execution token(见 §7),stdout 仅 JSON-RPC,禁 stdout logger/终端 UI。

## 5. 常驻 runtime vs 按次销毁

**决策**:harnessRuntime 常驻(不按 20 次销毁),保留 FIFO;指纹失效优雅换血;可选空闲 TTL 回收(env 默认永不)。

| 常驻(as-built) | 按次销毁 |
| --- | --- |
| 会话上下文/技能加载一次复用,延迟低 | 每次冷启动,组合解析+技能注入重复成本 |
| 支持事件流订阅、交互等待、定时提醒等长会话语义 | 会话状态难延续,交互桥要跨进程重连 |
| 内存/句柄需监控(已进 /api/health 的 aiRuntime 检查项,事件静默超阈值自动换血) | 进程边界即回收,内存确定性好 |

已知代价:JSON-RPC 协议无单 prompt 取消/单 session close,调用串行化;超时/传输异常/切换 Provider 时关闭重建 runtime——不要把长时推理和并发批量任务接到同一单机实例。

## 6. 提醒调度:平台侧 vs dsh 原生 schedule

**决策**(Sprint 5.2):用平台调度(reminderScheduler 30s 扫描、幂等、重启补发、送达写动态中心),dsh 原生 schedule 留待常驻 live agent 阶段。

- 平台侧优点:提醒落业务库可审计、可随备份恢复、重启即补发;权限/项目范围天然复用。
- dsh 原生优点(暂缓的原因):事件日志持有状态可重放、与 agent 会话上下文紧耦合。
- 语义取舍:at-least-once(投递与标记间宕机可能重投);工具校验限制 60s~180 天窗口。

## 7. 能力 token 单绑定

**决策**:executionToken 与单个能力精确绑定、单次使用、60s TTL。

- 优点:token 泄露/重放的影响面收敛到一个能力一次调用;四层裁决第二层即拦截跨能力滥用。
- 代价:一次推理内多工具链路需为每个工具分别签发 token;长交互(如 ask-user 等待 30 分钟)与 60s TTL 冲突,需 waitToken(256bit + 10 分钟 grace)补丁方案——已按此实施,复杂度转移到交互桥。

## 8. masking 挂在 proxy 单点

**决策**:请求/响应双向脱敏在 harnessProxy(harness 唯一出站口)实施,block 规则命中 403 fail-closed;规则库不可用时 fail-open。

- 优点:覆盖全流量(无论哪个调用方、哪条代码路径出站,都被同一策略拦截),运维只需维护一处规则。
- 代价:无法按调用方/能力/项目区分策略粒度;所有出站文本都要过一遍规则引擎,proxy 成为吞吐与延迟单点;fail-open 意味着规则表损坏时脱敏降级(可用性优先),只有 block 语义保持硬失败。

## 9. 业务工具目录:OpenAPI 派生 + 显式排除

**决策(as-built)**:普通 AI 助手的业务工具不再手写逐端点 wrapper;`platformOperationRegistry` 从 OpenAPI 派生所有符合准入的 JSON 业务操作,再用 denylist 排除敏感/传输面。当前结果是 19 个领域、152 个操作,由 1 个 catalog + 19 个领域工具承载。

| 收益 | 代价/控制 |
| --- | --- |
| OpenAPI 与 AI 请求 schema 同源,新增字段/枚举不需再维护第二份工具参数 | OpenAPI 的错误会直接影响工具面;契约测试必须锁定操作数、schema 和关键排除项 |
| catalog 可按需发现 method/path/path-query-body 精确契约,避免把 152 个 schema 全塞进提示词 | 工具目录较宽,模型选错 action 的概率上升;按领域分工具并要求先 catalog discovery |
| 调用原 REST,自然复用 RBAC、项目范围、状态机与业务校验 | 新 OpenAPI 端点可能自动进入目录;评审时必须判断是否应加入 excluded prefix/operation |
| 无需让 dsh 直连数据库或复制业务服务 | 多一次回环与 JSON 序列化;响应限制 512KiB、请求 body 限 64KiB |

认证、AI Provider/助手/runtime 管理、health/meta、对象存储、二进制上传下载和页面访问遥测保持排除。写操作还需 dsh `allowed-once` 确认并先审计;这两层控制不能因“全量纳管”而放宽。

## 10. 已知遗留与风险清单

汇总自 17-dsh 各 Sprint 执行记录,按域归并(状态以 17-dsh 执行记录为准):

**能力与业务工具面**
- 普通助手工具会话需要 `ai:*`、可用助手和一个可访问项目作为 invocation 归属锚点;无项目用户继续得到模型/本地对话,不会获得无法审计归属的业务工具。
- OpenAPI 新增 JSON 路由默认可能进入业务工具目录;代码评审必须同步检查敏感 prefix/operation 排除与 catalog contract 测试。
- `company_platform_catalog` 给出精确请求 schema,但模型仍可能选错合法操作;原 REST 权限/版本冲突/状态机是最终保护,不能依赖提示词正确性。
- 工具面与模型提示已对齐(2026-08-16 修正):`skill` 工具(tool-skill 插件对所有会话注册,方法论技能目录)此前被窄域能力调用的系统提示误标为不存在,现提示已改为如实声明;助手会话提示同时声明无浏览器/shell/subagent。若新增模型可见工具,必须同步更新两处提示(company-execution-tool / company-platform-tool)。
- browser_control 只注册在窄域能力调用路径(company-execution-tool 对 platform-assistant 会话跳过);普通助手会话无浏览器外联能力,这是有意的安全收敛——助手工具面保持纯平台 REST 目录,外联能力须走带 scoped token 与 invocation 审计的能力调用。若未来要放开,需先过 outboundUrlPolicy/browser 白名单评审并同步助手提示。

**DSH UI**
- 视图、surface style 与布局目前按用户存浏览器 localStorage,没有服务端跨设备同步、共享发布、版本审批与集中回滚。
- 新建视图是数据物化后的封闭 block,没有自主 live query;实时数据必须由 AI 再调用业务工具并 upsert。未来若做绑定,只允许批准的 operation id/参数模板。
- 19 个 page surface 只承诺受限 style;仅 15 个登记 detail surface 支持区块排序,不把“全部页面纳管”解释为任意 DOM 重排。

**运行时与组合**
- 生产默认钉死 cordis.yml;draft/review 组合只有显式 `HARNESS_ALLOW_COMPOSITION_VARIANTS=1` 才启用,部署时不得把 opt-in 当默认值。
- runtime 未初始化时 status 的 maxRunsPerRuntime 上报编译期默认值,首次推理后精确。

**事件与交互**
- live 期间保留 8s 详情轮询作为对账兜底,后续可降频。
- Provider 可用性独立于 API readiness;实时流断开时前端会回落到轮询,不能只凭 `/api/health` 判断真实模型链路健康。

**计量与数据**
- ai_token_usage.job_id 恒 null(为 AI job 计量预留);as-built 适配器事件暂不带 usage,先落 0 值行。
- 演示数据 INV-DEMO-0001 与演示项目保留在运行库供界面查看,可随时删除。

**测试与工程**
- 迁移计数断言(atomic-upsert/postgres-import)在新增迁移时仍需同步。
- zod 为传递依赖使用,待显式声明。
- Sprint 3 曾出现双 WSS 握手竞争(ws 库 abortHandshake 400),已改 noServer + 各自 upgrade 认领;后续若再增 ws 通道需沿用该模式。
- CI 挂 PG service、生产 PG 切换窗口:见 §3。

**产品边界外的观察项**(Sprint 6,按信号启动)
- subagent + tool-workflow 批量需求分析/多项目周报(依赖交互桥稳定)。
- MCP client:企业微信/GitLab/CI 的 MCP 服务(须先过 outboundUrlPolicy 安全评审)。
- 完全反转评估:仅当产品定位转向 agent 优先工作台时启动。

## 11. 决策时间线(关键锁定点)

| 时间 | 决策 | 落点 |
| --- | --- | --- |
| 2026-07(早期) | 三阶段路线图取代「一期全量企业愿景」;as-built 为主 + 阶段标注 | docs/README 阅读路径 |
| 2026-07-23 | RC 安全/稳定性整改收口(出站 URL 策略、审计隔离、上传/DOCX/容量窗口) | 15 §2 |
| 2026-07-20 前后 | w2 PG 决策表锁定:无 FK、JSON TEXT、pgvector 范围外、SQLite 默认 | 本文 §3 |
| 2026-08-14 | Harness 成为唯一 LLM 推理内核(回环代理 + 随机 token + 隔离 DSH_HOME) | 15 v1.23;本文 §4 |
| 2026-08-14 | P0-P4 架构重构收口(数据边界/装配根/组件边界/契约验证) | 10 台账 |
| 2026-08-14 | 双底座原则成文:不做完全反转三理由、回环安全不变量 | 17-dsh;本文 §1 |
| 2026-08-14~15 | dsh 底座化 Sprint 1-5:计量/投影→可见→常驻→能力面→交互与提醒;常驻 runtime、平台侧调度、token 单绑定、waitToken 补丁相继锁定 | 17-dsh 执行记录;本文 §5-§7 |
| 2026-08-15 | masking 双向脱敏挂 harnessProxy、block 403 fail-closed | 本文 §8 |
| 2026-08-16 | OpenAPI 派生 19 域/152 项业务工具(含任务移交 POST);独立 UI 插件纳管 19 page + 15 detail surface,新建 UI 锁定封闭 JSON schema | 本文 §2、§9 |

> 时间线仅为索引;每条决策的执行证据与验收细节以 10/15 台账和 17-dsh 执行记录为准,不在本文重复。

## 12. 决策变更的触发条件

下表是「重新打开某项决策」的信号,不是待办:出现左侧信号前,对应决策视为已锁定,实现与文档均不应偏离。

| 决策 | 重新评估信号 |
| --- | --- |
| 不做完全反转 | 产品定位转向 agent 优先工作台 |
| SQLite 默认 | 多实例写/上云/合规强制 PG |
| 平台侧调度 | 常驻 live agent 落地,dsh schedule 需要会话内状态 |
| token 单绑定 | 多工具单事务链路成为主流调用形态 |
| masking 单点 | 按租户/项目差异化脱敏成为合规要求 |
| 声明式前端扩展 | 高信任隔离环境建成且通过安全评审(在此之前动态插件永不进生产) |
| OpenAPI 派生业务工具 | OpenAPI 无法稳定表达请求契约,或自动准入审查成本持续高于手写注册表 |

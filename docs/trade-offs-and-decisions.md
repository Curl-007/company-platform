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

## 2. 前端扩展机制:声明式 manifest vs 动态插件

**决策**(18 blueprint / 17-old 一致):React 客户端始终是编译产物可信客户端;扩展走「声明式 UI manifest(版本化)→ 受信 React 渲染器 → 预览 → 管理员批准 → 发布/回滚」。模型可以产出 manifest 或源码补丁两种工件,但两者都不在生产浏览器直接执行。

| 维度 | 声明式 manifest(as-built 方向) | 动态插件/模型生成代码 |
| --- | --- | --- |
| 安全边界 | 渲染器白名单解释,无 eval/动态脚本 | Harness VM 明确不是安全边界,定义仅进程内存 |
| 审批与回滚 | manifest 版本化,预览-批准-发布-kill switch 全链可控 | 运行时行为难静态审查 |
| 表达能力 | 受限(已批准的字段/视图/动作块) | 任意 |
| 适用面 | 业务块、字段、表单、动作的受控扩展 | 仅隔离设计沙箱,不进生产 |

**非目标**(18 明确):不用 prompt 指令替代 RBAC/审计/事务/状态机;不做浏览器直连 Harness/Provider;不把模型生成或第三方动态插件当可信生产代码;不把 PG/Redis/微服务拆分设为前提。

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

## 9. 已知遗留与风险清单

汇总自 17-dsh 各 Sprint 执行记录,按域归并(状态以 17-dsh 执行记录为准):

**能力面**
- capabilityRegistry manifest 仍只有 project-snapshot:领域能力经真实 invocation 启用需补 manifest 并扩 CAPABILITY_RISKS 风险模型(gateway/工具面/注册表链路已就绪,有直连测试)。
- PM 对 defects-list 403(持 project:* 无 defect:*);如需放开改声明为 project:read。
- 正式 capability 接入 ask 能力需放宽 capabilityAdapter 30s timeoutMs 与提示词(当前多工具被禁)。

**运行时与组合**
- 生产 launcher 钉死 cordis.yml;draft/review 组合生产启用需改 company-runtime.mjs 守卫(HARNESS_ALLOW_COMPOSITION_VARIANTS=1 opt-in)。
- runtime 未初始化时 status 的 maxRunsPerRuntime 上报编译期默认值,首次推理后精确。

**事件与交互**
- 前端未监听 ws agent.interaction 加速刷新(轮询兜底可用,提速只需在 agentEventSocket 接一行)。
- live 期间保留 8s 详情轮询作为对账兜底,后续可降频。
- 实时事件流端到端演示需真实 AI 供应商 key(当前无 key;ws 通道已用临时 server 端到端验证)。

**计量与数据**
- ai_token_usage.job_id 恒 null(为 AI job 计量预留);as-built 适配器事件暂不带 usage,先落 0 值行。
- 演示数据 INV-DEMO-0001 与演示项目保留在运行库供界面查看,可随时删除。

**测试与工程**
- 迁移计数断言(atomic-upsert/postgres-import)已随 25/26/27 号迁移更新,后续加迁移需同步。
- zod 为传递依赖使用,待显式声明。
- graceful-shutdown drill 在 Sprint 3 修复后未重跑 `npm run check` 全链验证。
- Sprint 3 曾出现双 WSS 握手竞争(ws 库 abortHandshake 400),已改 noServer + 各自 upgrade 认领;后续若再增 ws 通道需沿用该模式。
- CI 挂 PG service、生产 PG 切换窗口:见 §3。

**产品边界外的观察项**(Sprint 6,按信号启动)
- subagent + tool-workflow 批量需求分析/多项目周报(依赖交互桥稳定)。
- MCP client:企业微信/GitLab/CI 的 MCP 服务(须先过 outboundUrlPolicy 安全评审)。
- 完全反转评估:仅当产品定位转向 agent 优先工作台时启动。

## 10. 决策时间线(关键锁定点)

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

> 时间线仅为索引;每条决策的执行证据与验收细节以 10/15 台账和 17-dsh 执行记录为准,不在本文重复。

## 11. 决策变更的触发条件

下表是「重新打开某项决策」的信号,不是待办:出现左侧信号前,对应决策视为已锁定,实现与文档均不应偏离。

| 决策 | 重新评估信号 |
| --- | --- |
| 不做完全反转 | 产品定位转向 agent 优先工作台 |
| SQLite 默认 | 多实例写/上云/合规强制 PG |
| 平台侧调度 | 常驻 live agent 落地,dsh schedule 需要会话内状态 |
| token 单绑定 | 多工具单事务链路成为主流调用形态 |
| masking 单点 | 按租户/项目差异化脱敏成为合规要求 |
| 声明式前端扩展 | 高信任隔离环境建成且通过安全评审(在此之前动态插件永不进生产) |

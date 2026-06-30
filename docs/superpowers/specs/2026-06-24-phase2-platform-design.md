# 阶段二 · 平台能力设计方案

> **文档版本**：v1.1
> **适用阶段**：阶段二（AI 文档闭环 + 协作）
> **状态**：设计待审
>
> 本文档是阶段二的设计方案，仅包含 AI Job 异步框架（不含 AI 引擎）、报表与驾驶舱、WebSocket 协同与通知系统三大块。AI 文档分析引擎与 RAG 检索属于独立 AI 开发阶段，不在本方案范围内。

**目录**

- §1 范围与定位
- §2 块一：AI Job 框架（状态机 / API / 模拟 Worker / 场景 / 数据表 / 前端页面）
- §3 块二：报表与驾驶舱（三层架构 / API / 图表组件 / 导出）
- §4 块三：WebSocket + 通知（架构 / 事件协议 / 通知系统 / 前端集成）
- §5 导航菜单更新
- §6 实施顺序
- §7 数据表变更汇总
- §8 UI 设计方案（AI 分析中心 / 报表驾驶舱 / 通知 / 导航 / 交互状态）
- §9 跨模块联动场景（文档→AI / AI→需求 / 通知→目标 / 多Tab / 断线恢复）
- §10 错误处理与边界情况（超时 / 崩溃恢复 / 重复确认 / 并发 / WebSocket / 去重 / 导出 / 权限）
- §11 前端文件改动清单（新增文件 / 修改文件 / 组件树）
- §12 权限设计明细（Resource / 角色映射 / 中间件用法）

---

## 1. 范围与定位

### 1.1 阶段二路线

```
阶段一（已完成）     ──▶   阶段二（本方案）     ──▶   阶段三
核心闭环 MVP              平台能力 + 基础设施         企业级扩展
                           AI Job 框架（预留AI接口）
                           报表与驾驶舱
                           WebSocket + 通知
```

### 1.2 三大建设内容

| 序号 | 模块 | 说明 |
|------|------|------|
| 块一 | AI Job 框架 | 完整异步 Job 状态机、前后端管理、模拟 Worker |
| 块二 | 报表与驾驶舱 | 个人/项目/管理三层次报表、数据导出 |
| 块三 | WebSocket + 通知 | 实时推送、通知持久化、前端消费 |

AI 分析引擎与 RAG 检索在本阶段仅预留接口，不实现。

---

## 2. 块一：AI Job 框架

### 2.1 状态机

严格遵循 [00 数据字典 §2.5](../../00-数据字典与术语统一.md) 定义：

```
queued ──▶ running ──▶ awaiting_review ──▶ confirmed
                  │                    └─▶ rejected
                  └─▶ failed ──▶ retried ──▶ queued
```

| 状态 | 含义 |
|------|------|
| `queued` | 已入队，等待 Worker 处理 |
| `running` | 执行中，progress 递增 |
| `awaiting_review` | 结果已就绪，待人工确认 |
| `confirmed` | 人工确认，结果已写入业务数据 |
| `rejected` | 人工驳回，结果不落库 |
| `failed` | 执行失败 |
| `retried` | 重试后回到 queued |

### 2.2 后端 API

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/ai/jobs` | GET | `ai:list` | 分页获取 Job 列表，支持 `?scene=&status=` 筛选 |
| `/api/ai/jobs` | POST | `ai:create` | 创建 Job（body: `{ scene, sourceType, sourceId, goals? }`），返回 queued Job |
| `/api/ai/jobs/:id` | GET | `ai:view` | 获取单 Job 详情（含 result/evidence） |
| `/api/ai/jobs/:id/confirm` | POST | `ai:confirm` | 确认 Job（body: `{ projectId, edits? }`），写入需求 |
| `/api/ai/jobs/:id/reject` | POST | `ai:confirm` | 驳回 Job，status → rejected |
| `/api/ai/jobs/:id/retry` | POST | `ai:create` | 重试失败 Job，status → queued |

### 2.3 模拟 Worker

在 `server.js` 中用 `setInterval` + 数据库轮询模拟异步 Worker：

- 每 3 秒扫描 `status='queued'` 的 Job
- 逐个标记为 `running`，progress 每 2 秒递增 20%
- 到达 100% 后标记为 `awaiting_review`
- result 使用预设模拟数据结构（与真实 AI 输出 schema 一致）
- 模拟失败概率 5%（用于测试 retry 流程）

**预留接口**：所有 result/evidence 字段与真实 API 结构相同，后续替换 Worker 实现时前端无需改动。

### 2.4 场景与模拟数据

| scene | 模拟 result 结构 | 写入动作 |
|-------|-----------------|----------|
| `document_analysis` | `{ summary, requirements[], risks[], tasks[] }` | 确认时创建需求 + 可选任务 |
| `log_analysis` | `{ completedItems[], blockers[], suggestions[] }` | 确认时更新工作日志完成度 |

### 2.5 新增数据表字段

`ai_jobs` 表新增字段（与现有字段兼容）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `job_id` | TEXT PK | JOB 序列号 |
| `scene` | TEXT | 场景标识 |
| `status` | TEXT | 当前状态 |
| `progress` | INTEGER | 0-100 |
| `current_step` | TEXT | 当前步骤描述 |
| `source_type` | TEXT | document / work_log |
| `source_id` | TEXT | 来源 ID |
| `goals` | JSON | 分析目标 |
| `result` | JSON | 分析结果 |
| `evidence` | JSON | 证据引用 |
| `error_message` | TEXT | 失败原因 |
| `written_requirement_id` | TEXT | 确认后写入的需求 ID |
| `created_at` | TEXT | 创建时间 |
| `confirmed_at` | TEXT | 确认时间 |

### 2.6 前端：AI 分析中心页面

**路由**：`/ai-center`

**布局**：

```
┌─────────────────────────────────────────────┐
│  AI 分析中心  │  [场景筛选] [状态筛选] [新建] │
├─────────────────────────────────────────────┤
│  Job ID │ 场景 │ 状态 │ 进度 │ 来源 │ 操作  │
│  ────── │ ──── │ ─── │ ─── │ ─── │ ───  │
│  JOB001 │ 文档 │ ✅ 待确认 │ ██████ │ doc1 │ [确认][驳回] │
│  JOB002 │ 文档 │ ⏳ 执行中 │ ████░░ │ doc2 │  -  │
│  JOB003 │ 日志 │ ❌ 失败   │ ██████ │ log1 │ [重试] │
├─────────────────────────────────────────────┤
│  点击行展开详情面板                          │
│  ┌─────────────────────────────────────────┐ │
│  │ 结果摘要                                │ │
│  │ - 生成需求: XXX (可编辑)                │ │
│  │ - 风险项: [...]                         │ │
│  │ - 证据引用: [原文引用]                   │ │
│  │ 目标项目: [下拉选择]                     │ │
│  │ [确认写入] [编辑后写入] [驳回]            │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**交互**：
- 列表行点击展开详情面板（不是新页面，遮罩/侧边栏均可）
- 确认时可通过下拉框选择目标项目
- "编辑后写入" 允许修改生成的需求标题/描述后再确认
- 确认/驳回后列表自动刷新
- 进度条实时更新（基于 WebSocket 推送或轮询）

**状态 Badge 颜色映射**：

| status | 颜色 | 中文 |
|--------|------|------|
| queued | gray | 排队中 |
| running | blue | 执行中 |
| awaiting_review | orange | 待确认 |
| confirmed | green | 已确认 |
| rejected | red | 已驳回 |
| failed | red | 失败 |
| retried | yellow | 重试中 |

---

## 3. 块二：报表与驾驶舱

### 3.1 三层架构

```
┌─────────────────────────────────────────────────────┐
│  个人驾驶舱（增强现有 DashboardPage）                  │
│  指标卡 + 个人任务 + 风险项目 + 需求进度 + AI 摘要    │
├─────────────────────────────────────────────────────┤
│  项目报表（新增 ProjectReport 嵌入项目详情）           │
│  健康度趋势 + 缺陷趋势 + 成员负载 + 里程碑进度         │
├─────────────────────────────────────────────────────┤
│  管理驾驶舱（新增 ManagementDashboardPage）            │
│  跨项目健康度矩阵 + 部门负载 + 交付趋势 + 组织指标     │
└─────────────────────────────────────────────────────┘
```

### 3.2 后端 API

#### 3.2.1 现有端点增强

`GET /api/dashboard` 增强，新增响应字段：

```typescript
interface DashboardData {
  metrics: DashboardMetrics;        // 现有
  focusTasks: Task[];               // 现有
  riskyProjects: Project[];         // 现有
  requirementProgress: RequirementProgress[]; // 现有
  ai: AiSummary;                    // 现有
  // 新增：
  taskTrend: { date: string; completed: number; created: number }[];
  projectComparison: { id: string; name: string; health: number; progress: number }[];
  defectTrend: { date: string; opened: number; closed: number }[];
}
```

#### 3.2.2 新增端点

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/reports/projects/:id` | GET | `report:view` | 项目级报表：进度趋势、风险分布、缺陷趋势、成员负载、里程碑进度 |
| `/api/reports/overview` | GET | `report:overview` | 管理驾驶舱：跨项目健康度矩阵、组织交付趋势 |
| `/api/reports/export/:scope` | GET | `report:export` | CSV 导出（projects \| requirements \| tasks），支持日期筛选 |

`GET /api/reports/projects/:id` 响应结构：

```typescript
interface ProjectReport {
  project: Project;
  progressTrend: { date: string; value: number }[];
  riskDistribution: { type: string; count: number }[];
  defectTrend: { date: string; opened: number; closed: number }[];
  memberLoad: { name: string; taskCount: number; completedCount: number }[];
  milestoneProgress: { id: string; name: string; progress: number; deadline: string }[];
}
```

### 3.3 前端组件

#### 图表组件（纯 CSS/SVG，不引入第三方图表库）

| 组件 | 说明 |
|------|------|
| `SimpleBarChart` | 柱状图：柱形 + 数值标签，支持分组 |
| `SimpleLineChart` | 折线图：折线 + 数据点 + 面积填充 |
| `ProgressRing` | 进度环：环形百分比显示（用于健康度等） |
| `HealthMatrix` | 健康度矩阵：卡片网格，每项有颜色/数值/趋势箭头 |
| `StatusPie` | 简易饼图：圆形分段显示分布 |

所有图表组件通过响应式 SVG 实现，支持可选的动画入场。

#### 现有页面增强

**DashboardPage**：
- MetricCard 增加趋势指示（↑5%、→、↓3%）
- 新增「项目对比」区块（横向柱状图）
- 新增「近期完成趋势」区块（折线图）

**项目详情页新增 Tab**：
- 在 `ProjectDetail` 页签新增「报表」Tab
- 包含进度趋势图、风险分布、缺陷趋势、成员负载、里程碑进度

**新增页面**：

`ManagementDashboardPage`（路由 `/reports`）：
- 页面顶部：组织级 KPI 卡片（项目总数、进行中、逾期、健康度均值）
- 中间：跨项目健康度矩阵（每个项目一个卡片，含健康度/进度/风险数）
- 底部：组织交付趋势折线图、部门负载分布

### 3.4 数据导出

`GET /api/reports/export/:scope` 返回 CSV 文件：

| scope | 包含字段 |
|-------|---------|
| `projects` | ID, 名称, 状态, 健康度, 进度, 风险数, 负责人, 创建时间 |
| `requirements` | ID, 标题, 状态, 优先级, 完成度, 项目, 负责人 |
| `tasks` | ID, 标题, 状态, 进度, 负责人, 项目, 截止日期 |

导出格式：UTF-8 BOM CSV（Excel 直接打开不乱码）。

---

## 4. 块三：WebSocket 协同 + 通知系统

### 4.1 架构

```
┌──────────┐     WebSocket (ws://)     ┌───────────┐
│  前端     │ ◄──────────────────────► │  后端      │
│  React    │    事件双向推送            │  Express   │
│  useWS()  │                          │  + ws lib  │
└──────────┘                          └─────┬─────┘
                                            │
                                   ┌────────▼────────┐
                                   │  notifications   │
                                   │  表（持久化）     │
                                   └─────────────────┘
```

WebSocket 与 Express 共享同一 HTTP 端口，通过 `server.upgrade()` 路由。

### 4.2 WebSocket 连接

```
ws://host/?token=<JWT>
```

- 建立连接时后端校验 JWT token
- 校验通过后注册到 `WsHub`（内存 Map: userId → WebSocket[]）
- 断线自动清理，同一用户支持多 Tab 连接
- 心跳：每 60s ping/pong

### 4.3 事件协议

```typescript
interface WsEvent {
  type: string;       // 事件类型
  payload: unknown;   // 事件数据
  timestamp: string;  // ISO 时间
}
```

| type | payload | 触发场景 |
|------|---------|---------|
| `job.status_changed` | `{ jobId, scene, status, progress }` | AI Job 状态/进度变更 |
| `task.assigned` | `{ taskId, title, projectId }` | 任务被分配给自己 |
| `task.updated` | `{ taskId, title, changes }` | 有权限的任务被更新 |
| `notification.new` | `{ id, type, title, link }` | 新通知产生 |

### 4.4 通知系统

#### 数据表 `notifications`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 通知 ID |
| `user_id` | TEXT | 接收用户 |
| `type` | TEXT | 通知类型 |
| `title` | TEXT | 标题 |
| `content` | TEXT | 内容 |
| `link` | TEXT | 点击跳转链接 |
| `is_read` | INTEGER | 0/1 |
| `created_at` | TEXT | 创建时间 |

#### 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/notifications` | GET | 分页获取通知，`?unread=true` 仅未读 |
| `/api/notifications/count` | GET | 返回 `{ total, unread }` |
| `/api/notifications/:id/read` | PATCH | 标记单条已读 |
| `/api/notifications/read-all` | POST | 全部标记已读 |

#### 通知生成规则

| 触发事件 | 通知内容 | 链接 |
|---------|---------|------|
| AI Job → awaiting_review | 文档「{title}」分析已完成，请确认。 | /ai-center?job={id} |
| 任务创建/分配 | 你被分配了任务「{title}」。 | /projects/{pid}/tasks/{tid} |
| 任务状态变更 | 任务「{title}」状态变为 {status}。 | /projects/{pid}/tasks/{tid} |
| 缺陷分配 | 缺陷「{title}」指派给你处理。 | /testing?defect={id} |

通知生成入口：在 server.js 的 `insert("notifications", ...)` + WebSocket 推送 `notification.new`。

### 4.5 前端集成

#### WebSocket Hook

```typescript
// hooks/useWebSocket.ts
function useWebSocket(): {
  connected: boolean;
  subscribe: (event: string, handler: Handler) => () => void;
}
```

- 应用顶层的 `App` 组件初始化 WebSocket 连接
- 自动从 localStorage 获取 JWT token
- 断线自动重连（指数退避 1s → 2s → 4s → ... → 30s max）
- 页面注销/Token 过期时主动断开

#### 导航栏通知铃铛

在 `NavBar` 或 `AppHeader` 新增铃铛图标：

```
[工作台] [项目] [需求] [测试] [文档] [AI分析]      🔔(3)  [用户]
```

- 未读数通过 `GET /api/notifications/count` + WebSocket 实时更新
- 点击展开 `NotificationPanel` 下拉面板（最近 10 条）
- 底部「查看全部」链接到 `/notifications`

#### 通知页面

路由 `/notifications`：

- 分页列表：类型图标 + 标题 + 时间 + 已读状态
- 点击通知跳转到对应链接
- 顶部「全部标记已读」按钮
- 筛选：全部 / 未读

---

## 5. 导航菜单更新

阶段二导航从阶段一的 6 项扩展为 9 项：

| 菜单 | 路由 | 阶段 |
|------|------|------|
| 工作台 | / | 一 |
| 项目 | /projects | 一 |
| 需求 | /requirements | 一 |
| 测试 | /testing | 一 |
| 文档 | /documents | 一 |
| **AI 分析** | **/ai-center** | **二（新增）** |
| **报表** | **/reports** | **二（新增）** |
| **通知** | **/notifications** | **二（新增）** |
| 设置 | /settings | 一 |

---

## 6. 实施顺序

按依赖关系排列：

```
块一 AI Job 框架（基础设施，块三的推送来源）
  └── worker stub（模拟异步）
  └── AI 分析中心页面

块二 报表与驾驶舱（无外部依赖，可与块一并行）
  ├── 后端报表 API
  ├── 图表组件库
  ├── DashboardPage 增强
  ├── 项目报表页签
  └── 管理驾驶舱页面

块三 WebSocket + 通知（依赖块一的 Job 状态推送）
  ├── ws 服务端
  ├── useWebSocket hook
  ├── 通知数据表 + API
  ├── 通知铃铛 + 面板
  └── 通知页面
```

---

## 7. 数据表变更汇总

| 表 | 操作 | 说明 |
|----|------|------|
| `ai_jobs` | 增强 | 新增 `error_message` 字段（TEXT） |
| `notifications` | 新建 | 通知表见 §4.4 |

---

---

## 8. UI 设计方案

UI 整体遵循 [07-UI交互设计方案](../../07-UI交互设计方案.md) 定义的风格：Codex 风格、简洁克制、低饱和色为主、状态色仅用于标签和关键数字。本节补充阶段二三大模块的具体 UI 设计。

### 8.1 AI 分析中心页面

#### 8.1.1 页面布局

```
┌─────────────────────────────────────────────────────────┐
│  PageHeader: AI 分析中心  [场景筛选] [状态筛选] [新建分析] │
├─────────────────────────────────────────────────────────┤
│  Panel: 分析任务列表                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ DataTable                                          │  │
│  │ 任务ID│场景  │当前状态    │进度 │来源  │创建时间  │操作│  │
│  │ ─────│──────│───────────│─────│─────│─────────│───│  │
│  │ J001 │文档  │ ✅ 待确认  │█████│doc-1│06-25 14:│[确│  │
│  │ J002 │文档  │ ⏳ 执行中  │██░░░│doc-2│06-25 14:│ — │  │
│  │ J003 │日志  │ ❌ 失败    │█████│log-1│06-24 09:│[重│  │
│  │ J004 │文档  │ ◐ 排队中   │░░░░░│doc-3│06-25 15:│ — │  │
│  │ J005 │文档  │ 🟢 已确认  │█████│doc-4│06-23 16:│ — │  │
│  └────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  下方：WebSocket 实时更新进度条和状态                     │
└─────────────────────────────────────────────────────────┘
```

#### 8.1.2 状态 Badge 设计

| status | 颜色值 | 图标 | 标签文字 |
|--------|--------|------|---------|
| queued | `#656D76` 灰 | ◐ | 排队中 |
| running | `#0969DA` 蓝 | ⏳ + 动态 | 执行中 (72%) |
| awaiting_review | `#BF8700` 橙 | ✅ | 待确认 |
| confirmed | `#2DA44E` 绿 | 🟢 | 已确认 |
| rejected | `#CF222E` 红 | ✕ | 已驳回 |
| failed | `#CF222E` 红 | ❌ | 失败 |
| retried | `#8250DF` 紫 | ↻ | 重试中 |

- 所有 Badge 使用 `StatusBadge` 组件渲染
- running 状态在进度条旁显示百分比数值
- confirmed/rejected 显示确认时间和确认人 tooltip

#### 8.1.3 进度条设计

running 状态的 Job 在表格进度列展示实时进度条：

```
██░░░░░░░░  20%  (刚刚开始)
██████░░░░  60%  (正在分析结构)
██████████  100% (分析完成，待确认)
```

- 使用现有的 `ProgressBar` 组件
- 高度 6px，无圆角（与阶段一风格一致）
- running 时颜色使用 `#0969DA`
- 完成时（awaiting_review）颜色使用 `#BF8700`（橙色，提示需要操作）

#### 8.1.4 操作列

| Job 状态 | 可操作按钮 |
|----------|-----------|
| queued | —（无操作） |
| running | —（无操作） |
| awaiting_review | [确认] [编辑并确认] [驳回] |
| confirmed | —（已确认） |
| rejected | [重试] |
| failed | [重试] |
| retried | —（重试中） |

- [确认] = 直接确认，写入需求
- [编辑并确认] = 打开编辑弹窗（见 8.1.6）
- [驳回] = 确认后 status → rejected
- [重试] = 重新入队

#### 8.1.5 详情展开面板

点击 `awaiting_review` 状态的行，展开详情面板（使用现有 `Overlay` 或侧边 `DetailDrawer`）：

```
┌──────────────────────────────────────────┐
│  Panel: 分析结果确认                      │
│  来源：设计文档 - 《数据库设计 v2》        │
│  目标项目：[下拉选择 v]                    │
├──────────────────────────────────────────┤
│  ▓ 生成的需求                               │
│  ┌──────────────────────────────────────┐ │
│  │ 标题: [数据库表结构设计（可编辑）]     │ │
│  │ 描述: [自动生成的需求描述...（可编辑）] │ │
│  │ 优先级: [medium ▼]                    │ │
│  └──────────────────────────────────────┘ │
│                                           │
│  ▓ 风险识别                               │
│  • 缺少主键设计说明                       │
│  • 未定义索引策略                         │
│                                           │
│  ▓ 证据引用                               │
│  ┌──────────────────────────────────────┐ │
│  │ "数据库应采用 InnoDB 引擎..."         │ │
│  │ — 设计文档 §3.1 (点击跳转原文)        │ │
│  └──────────────────────────────────────┘ │
│                                           │
│  [确认写入] [编辑后写入] [驳回]            │
└──────────────────────────────────────────┘
```

#### 8.1.6 编辑确认弹窗

点击「编辑并确认」打开编辑弹窗（使用 `Overlay`）：

```
┌──────────────────────────────────────────┐
│  Panel: 编辑并确认分析结果                │
├──────────────────────────────────────────┤
│  目标项目：[下拉选择 v]                    │
│                                           │
│  需求标题                                 │
│  ┌──────────────────────────────────────┐ │
│  │ 数据库表结构设计                       │ │
│  └──────────────────────────────────────┘ │
│                                           │
│  需求描述                                 │
│  ┌──────────────────────────────────────┐ │
│  │ 根据设计文档分析，需要完成...          │ │
│  │ (多行文本区)                          │ │
│  └──────────────────────────────────────┘ │
│                                           │
│  优先级  [medium ▼]                       │
│                                           │
│  [取消]  [确认写入]                        │
└──────────────────────────────────────────┘
```

#### 8.1.7 空状态

- 无任何 Job 时：「暂无分析任务。上传文档后可创建分析。→ 前往文档中心」
- 筛选无结果：「没有匹配的分析任务。尝试调整筛选条件。」
- 所有 Job 已确认：「全部分析任务已完成。」（可选展示最近 5 条已确认记录）

---

### 8.2 报表与驾驶舱 UI

#### 8.2.1 个人驾驶舱增强

在现有 DashboardPage 基础上新增：

**a. 指标卡增强**

每个 MetricCard 增加趋势指示器：

```
┌─────────────────────┐
│  项目健康度          │
│  72                  │  ← 大号数字
│  ↑ 5% 较上周        │  ← 绿色上升 / 红色下降 / 灰色持平
└─────────────────────┘
```

趋势指示规则：
- 当前周期值较上周期变化 >5% → 显示 `↑` / `↓` 及百分比
- ≤5% → 显示 `→ 持平`
- 无上周数据 → 不显示趋势

**b. 新增「项目对比」区块**

```
┌─ Panel: 项目健康度对比 ─────────────────────┐
│                                             │
│  项目A  ████████████████░░░  78              │
│  项目B  ██████████░░░░░░░░░  52  ← 红色     │
│  项目C  ██████████████████░  92              │
│  项目D  ██████████████░░░░░  65              │
│                                             │
│  水平柱状图，每项：名称 + 条形 + 数值         │
│  低于 60 的条形使用风险色 #CF222E            │
└─────────────────────────────────────────────┘
```

**c. 新增「近期完成趋势」区块**

```
┌─ Panel: 任务完成趋势（近 7 天） ─────────────┐
│                                             │
│  ██                                          │
│  ██ ██                                       │
│  ██ ██ ██     ██                             │
│  ██ ██ ██  ██ ██ ██                         │
│  └──┴──┴──┴──┴──┴──┴──                     │
│   06/18 06/19 06/20 06/21 06/22 06/23 06/24 │
│   ■ 已完成    □ 新增                         │
└─────────────────────────────────────────────┘
```

- SVG 折线图 + 柱状组合，面积浅色填充
- X 轴日期，Y 轴数量
- 图例位于右下角

#### 8.2.2 项目报表页签

在项目详情页（ProjectDetail）新增「报表」Tab：

```
┌─────────────────────────────────────────────┐
│  [概览] [WBS] [看板] [迭代] [报表] ← 新增    │
├─────────────────────────────────────────────┤
│  ┌─ 指标行 ───────────────────────────────┐ │
│  │ 进度 78%│ 风险 5项│ 成员 8人│ 逾期 2项  │ │
│  └───────────────────────────────────────┘ │
│                                              │
│  ┌─ Panel: 进度趋势 ─────────  [7天▼]  ───┐ │
│  │  ▁▃▅▇▆▇█ 折线图                        │ │
│  │  近 7 天进度变化                         │ │
│  └───────────────────────────────────────┘ │
│                                              │
│  ┌─ Panel: 风险分布 ──────────────── ────┐  │
│  │  进度风险 ████████ 3                    │ │
│  │  质量风险 ██ 1                          │ │
│  │  资源风险 ██ 1                          │ │
│  └───────────────────────────────────────┘ │
│                                              │
│  ┌─ Panel: 成员负载 ────────────── ────┐   │
│  │  张三  ██████████████  8/12          │   │
│  │  李四  ██████████      5/12          │   │
│  │  王五  ████████████████████  14/12 ⚠️ │  │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- 指标行使用 4 个 `MetricCard`
- 图表卡片使用 `Panel` 包裹
- 时间范围筛选器统一在页面右上角

#### 8.2.3 管理驾驶舱页面

路由 `/reports`：

**顶部：组织级 KPI 条**

```
┌──────────────────────────────────────────────────────┐
│  项目总数│ 进行中  │ 已逾期  │ 健康度均值  │ 需求完成率 │
│    23    │   12    │   3     │     71     │    68%    │
└──────────────────────────────────────────────────────┘
```

- 5 个 MetricCard 横向排列
- 逾期数字使用红色

**中部：项目健康度矩阵**

```
┌─ Panel: 项目健康度矩阵 ────────────────────────────┐
│                                                      │
│  项目名称    │ 健康度 │ 进度  │ 风险 │ 状态  │ 负责人 │
│  ────────── │ ───── │ ──── │ ─── │ ──── │ ───── │
│  平台V2     │  78 🟢 │ 65%  │  2  │ active │ 张三  │
│  数据迁移   │  45 🔴 │ 30%  │  5  │ active │ 李四  │
│  官网改版   │  92 🟢 │ 90%  │  0  │ active │ 王五  │
│  Legacy维护 │  60 🟡 │ 50%  │  1  │ active │ 赵六  │
│                                                      │
│  每行可点击跳转到项目详情                            │
│  健康度 < 60 整行或健康度单元格用浅红背景             │
└──────────────────────────────────────────────────────┘
```

**底部：趋势图**

两个并排 Panel：

```
┌─ Panel: 交付趋势 ───┐  ┌─ Panel: 部门负载 ────┐
│  近 3 月完成项目     │  │  各部门任务分布       │
│  折线图              │  │  水平柱状图           │
│  面积填充            │  │  研发 ██████████ 45   │
│                      │  │  测试 ██████    28    │
│                      │  │  产品 ████      18    │
└──────────────────────┘  └──────────────────────┘
```

#### 8.2.4 图表组件规格

所有图表使用纯 SVG 实现，不引入第三方图表库：

**SimpleBarChart Props**：
```typescript
interface SimpleBarChartProps<D> {
  data: D[];
  xKey: keyof D;          // X 轴字段
  yKey: keyof D;          // Y 轴数值字段
  labelKey?: keyof D;     // 数值标签字段（默认 = yKey）
  height?: number;        // 默认 200
  barColor?: string;      // 默认 #0969DA
  threshold?: number;     // 阈值线（可选，低于此值变红色）
  groupKey?: keyof D;     // 分组字段（可选，分组柱状图）
}
```

**SimpleLineChart Props**：
```typescript
interface SimpleLineChartProps<D> {
  data: D[];
  xKey: keyof D;
  yKeys: { key: keyof D; color: string; label: string }[];  // 多条线
  height?: number;
  area?: boolean;         // 是否面积填充
}
```

**ProgressRing Props**：
```typescript
interface ProgressRingProps {
  percent: number;
  size?: number;          // 直径，默认 80
  strokeWidth?: number;   // 默认 6
  color?: string;
  label?: string;         // 中央文字
}
```

**HealthMatrix Props**：
```typescript
interface HealthMatrixItem {
  id: string;
  name: string;
  healthScore: number;
  progress: number;
  riskCount: number;
  status: string;
  owner: string;
}
interface HealthMatrixProps {
  items: HealthMatrixItem[];
  onRowClick?: (id: string) => void;
}
```

#### 8.2.5 数据导出按钮

放在页面右上角工具栏，样式与 "新建" 按钮对称：

```
[导出 CSV ▼]  [新建分析]
```
- 点击展开下拉：导出项目 / 导出需求 / 导出任务
- 导出时浏览器下载 `.csv` 文件
- 使用 `<a download>` 或 Blob URL 触发下载

---

### 8.3 通知系统 UI

#### 8.3.1 导航栏铃铛

位置：导航栏右侧，用户头像左侧。

```
[工作台] [项目] [需求] [测试] [文档] [AI分析] [报表]    🔔 3  [管理员▼]
```

- 使用线性风格铃铛图标（lucide `Bell`）
- 未读数 > 0 时右侧红点 + 数字，> 99 显示 "99+"
- 数字背景色 `#CF222E`，字号 11px，白色文字
- 未读数 = 0 时不显示红点

**连接态指示**：铃铛图标右下角小绿点表示 WebSocket 已连接，灰色表示未连接。

#### 8.3.2 通知下拉面板

点击铃铛展开下拉面板（使用 Portal + click outside to close）：

```
┌─ 通知 ──── [全部标记已读] ─────────────┐
│                                         │
│  🔵 AI分析  文档「数据库设计」分析完成   │
│              待确认。  — 2 分钟前       │
│  ─────────────────────────────────────  │
│  🔵 任务    你被分配了任务「用户权限」   │
│               — 15 分钟前              │
│  ─────────────────────────────────────  │
│  ⚪ 缺陷    缺陷「登录白屏」已解决。    │
│               — 昨天 14:23            │
│  ─────────────────────────────────────  │
│  ⚪ 系统     系统将于今晚 22:00 维护。  │
│               — 昨天 09:00            │
│                                         │
│  ──────────────────────────────────     │
│  [查看全部通知 →]                       │
└─────────────────────────────────────────┘
```

- 最多显示最近 10 条
- 未读项左侧蓝色圆点 `🔵`，已读项灰色圆点 `⚪`
- 通知类型前加类型图标
- 点击通知行跳转到对应链接，并标记已读
- 面板宽度 380px
- 最多高度 480px，超出滚动
- 点击面板外部或按 Escape 关闭

#### 8.3.3 通知页面

路由 `/notifications`：

```
┌── PageHeader: 通知中心 ───────────────────────────┐
│  [全部] [未读]    [全部标记已读]                    │
├───────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐  │
│  │  今天                                         │  │
│  │  🔵 AI分析  文档「数据库设计」分析完成待确认   │  │
│  │              — 14:23  | 点击确认              │  │
│  │  🔵 任务    你被分配了任务「用户权限模块」      │  │
│  │              — 10:15  | 前往任务              │  │
│  │  ─────────────────────────────────────────   │  │
│  │  昨天                                         │  │
│  │  ⚪ 缺陷    缺陷「登录白屏」已解决。           │  │
│  │              — 06-24 16:30  | 查看缺陷         │  │
│  │  ⚪ 系统     系统维护通知                      │  │
│  │              — 06-24 09:00                    │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  负载更多...（分页加载）                            │
└────────────────────────────────────────────────────┘
```

- 按日期分组（今天 / 昨天 / 本周 / 更早）
- 未读项整行浅灰背景 `#F6F8FA`
- 点击行 → 标记已读 + 跳转链接（如有）
- 右侧操作按钮：「前往确认」「前往任务」「查看缺陷」
- 顶部 Tab：全部 / 未读
- 列表无限滚动（IntersectionObserver 触发加载更多）

---

### 8.4 导航菜单更新 UI

导航从阶段一 6 项扩展为 9 项，新增菜单的图标和样式：

| 菜单 | 图标 (lucide) | 路由 |
|------|--------------|------|
| AI 分析 | `BrainCircuit` | /ai-center |
| 报表 | `BarChart3` | /reports |
| 通知 | `Bell`（已整合入顶部栏） | /notifications |

导航高亮规则：
- 当前路由匹配菜单时，菜单项使用浅灰背景 `#F3F4F6` + 左侧 3px 深灰边线
- 非活跃菜单：无背景，文字色 `#656D76`

AI 分析菜单旁可添加小徽标（可选）：有新 Job 待确认时显示橙色小圆点。

---

### 8.5 交互状态汇总

#### 8.5.1 按钮状态

所有操作按钮需覆盖以下状态：

| 状态 | 样式 |
|------|------|
| default | 正常显示 |
| hover | 背景微深 5% |
| active/click | 背景更深 10% |
| disabled | 不透明度 40%，cursor: not-allowed |
| loading | 显示 spinner + 文案「保存中…」「确认中…」|

#### 8.5.2 加载骨架

表格和图表加载时使用骨架屏：

- 表格：5 行灰色横条，每行高度 40px，背景渐变动画（shimmer effect）
- 图表：200px 高的灰色区块，中间显示「加载中…」
- 指标卡：数字位置显示灰色长条

#### 8.5.3 错误状态

- 表格加载失败：显示 `PageState` 错误组件 + [重试] 按钮
- WebSocket 断连：铃铛图标右下角灰色点；鼠标悬停 tooltip「实时连接已断开」
- Job 执行失败：行内红色 badge + [重试] 按钮；详情面板显示错误信息

#### 8.5.4 WebSocket 连接提示

- 连接中：导航栏右下角弹出轻提示「正在建立实时连接…」（toast，3s 后消失）
- 连接成功：无提示（静默成功）
- 断线重连：弹出轻提示「实时连接断开，正在重连…」（toast，不自动消失，重连成功后消失）

- `POST /api/ai/documents/analyze` 保留向后兼容，但改为调用新的异步流程
- `AiJob` 接口不变，仅新增 `errorMessage` 可选字段
- `DashboardData` 接口扩展，现有字段不变
- 不影响阶段一已有的所有 CRUD 功能

---

## 9. 跨模块联动场景

### 9.1 文档 → AI 分析联动

```
文档中心 → 点击文档行「AI 分析」按钮
    │
    ▼
POST /api/ai/jobs { scene: "document_analysis", sourceId: doc.id }
    │ status=queued
    ▼
前端跳转 /ai-center?highlight=JOB001
    │ WebSocket 实时推送 job.status_changed
    ▼
Job 到达 awaiting_review → 通知栏铃铛更新 + 推送 notification.new
    │
    ▼
用户在 AI 中心确认/编辑后确认 → POST /api/ai/jobs/:id/confirm
    │
    ├──→ 创建需求（如果生成了需求）
    ├──→ 更新 document.ai_status = 'analyzed'
    ├──→ 插入 notification（"文档分析结果已写入需求"）
    └──→ WebSocket 推送 notification.new + job.status_changed
```

**页面间跳转参数**：
- `/ai-center?highlight=JOB001` — 高亮对应行 3 秒后消失
- `/ai-center?filter=awaiting_review` — 自动筛选待确认
- 从 AI 中心点击来源 ID → 跳转到对应文档/日志详情

### 9.2 AI 分析 → 需求联动

- 确认 Job 时选择的 `projectId` 决定需求归属项目
- 生成的需求以 `draft` 状态写入，可在需求管理页面继续编辑
- Job 的 `written_requirement_id` 建立双向关联
- 从需求详情可追溯来源 AI Job（待后续补充关联 UI）

### 9.3 通知 → 目标页面联动

每种通知类型的 `link` 字段定义：

| 通知类型 | link 值 | 点击行为 |
|---------|---------|---------|
| `job_ready` | `/ai-center?highlight={jobId}` | AI 中心，高亮对应 Job |
| `task_assigned` | `/projects/{projectId}?task={taskId}` | 项目详情，展开任务 |
| `task_updated` | `/projects/{projectId}?task={taskId}` | 项目详情，展开任务 |
| `defect_assigned` | `/testing?defect={defectId}` | 测试管理，切换到缺陷 tab |

### 9.4 多 Tab 通知同步

- 用户在 Tab A 阅读通知 → `PATCH /api/notifications/:id/read`
- 后端通过 WebSocket 广播 `notification.read` 事件（含 userId + notificationId）
- 同一用户的其他 Tab 收到事件 → 更新对应通知行的已读状态 + 更新未读数
- 未读数发生变化时广播 `notification.count_updated { unread: number }`

### 9.5 连接中断后的状态恢复

- 页面加载时先通过 `GET /api/notifications/count` 获取初始未读数
- WebSocket 连接成功后订阅事件
- 断线重连后不重置未读数（服务端未读数已持久化）
- 重连后前端主动请求 `GET /api/ai/jobs` 刷新进行中的 Job 进度

---

## 10. 错误处理与边界情况

### 10.1 AI Job 超时

- 模拟 Worker 检测到 Job `created_at` 超过 5 分钟仍处于 running → 自动标记为 `failed`
- error_message: "分析超时，请重试。"
- 超时阈值在 server.js 顶部配置项 `AI_JOB_TIMEOUT_MS`（默认 300000）

### 10.2 Worker 崩溃恢复

- server.js 启动时扫描 `status IN ('queued', 'running')` 的 Job
- 超过 30 秒前启动的 running Job → 标记为 `failed`，error_message = "服务重启，任务中断。"
- queued Job 保持不变（等待 Worker 重新消费）
- 使用 `setInterval` 每 3 秒轮询，重启时自动恢复

### 10.3 重复确认防御

- `POST /api/ai/jobs/:id/confirm` 检测 `job.status !== 'awaiting_review'`
- 如果已确认 → 返回 `409 Conflict`，error code `JOB_ALREADY_CONFIRMED`
- 如果已驳回 → 返回 `409 Conflict`，error code `JOB_ALREADY_REJECTED`
- 前端收到 409 后提示「该任务已被处理」并刷新列表

### 10.4 并发创建限制

- 同一 `source_type` + `source_id` 不允许有两个 `status IN ('queued','running','awaiting_review')` 的 Job
- `POST /api/ai/jobs` 时先检查 → 存在活跃 Job 则返回 `409 Conflict`，error code `JOB_ALREADY_EXISTS`
- 前端在文档详情页的「AI 分析」按钮上显示「分析中」状态

### 10.5 WebSocket 断线重连防护

- 前端指数退避：1s → 2s → 4s → 8s → 16s → 30s（封顶）
- 重连后自动重新订阅所有事件
- 事件 handler 注册时返回取消函数，防止重复注册
- 连接期间收到的消息按序处理，不丢弃

### 10.6 通知去重

- 同一 `type` + 同一 `link` + 同一 `title` 在 5 分钟内不重复插入
- 后端 `INSERT INTO notifications` 前做排重查询
- WebSocket 推送 `notification.new` 仅在插入成功后推送

### 10.7 导出超时与流式响应

- 大数据量导出设置 `res.setTimeout(60000)`（60 秒超时）
- 使用 `res.write()` 流式写入 CSV，避免内存溢出
- 前端导出请求不超时（`fetch` 不设 timeout）

### 10.8 用户无权限时的 UI 处理

| 场景 | UI 表现 |
|------|---------|
| 无 `ai:list` 权限 | AI 分析菜单隐藏 |
| 无 `report:view` 权限 | 报表菜单隐藏 |
| 无 `ai:confirm` 权限 | Job 详情面板隐藏确认/驳回按钮，仅只读 |
| 无 `notification:read` 权限 | 铃铛图标隐藏 |

---

## 11. 前端文件改动清单

### 11.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `web/src/pages/AiCenterPage.tsx` | AI 分析中心页面（Job 列表 + 详情展开 + 确认/驳回） |
| `web/src/pages/ManagementDashboardPage.tsx` | 管理驾驶舱页面 |
| `web/src/pages/NotificationsPage.tsx` | 通知列表页面 |
| `web/src/components/common/SimpleBarChart.tsx` | SVG 柱状图组件 |
| `web/src/components/common/SimpleLineChart.tsx` | SVG 折线图组件 |
| `web/src/components/common/ProgressRing.tsx` | SVG 环形进度组件 |
| `web/src/components/common/HealthMatrix.tsx` | 项目健康度矩阵表格组件 |
| `web/src/components/common/NotificationBell.tsx` | 导航栏铃铛图标 + 未读数角标 |
| `web/src/components/common/NotificationPanel.tsx` | 铃铛下拉通知面板 |
| `web/src/components/ai/AiJobDetailPanel.tsx` | AI Job 详情展开面板（含确认/驳回操作） |
| `web/src/components/ai/AiJobConfirmForm.tsx` | 编辑并确认弹窗表单 |
| `web/src/hooks/useWebSocket.ts` | WebSocket 连接管理 Hook |
| `web/src/hooks/useNotifications.ts` | 通知状态管理 Hook（未读数、列表、标记已读） |
| `web/src/services/notifications.ts` | 通知 API 函数（可选拆出） |

### 11.2 修改文件

| 文件路径 | 改动内容 |
|---------|---------|
| `web/src/App.tsx` | 添加 3 个新路由 `/ai-center` `/reports` `/notifications` + 更新导航菜单 |
| `web/src/types/index.ts` | 新增 `AiJobListItem`、`NotificationItem`、`ProjectReport`、`DashboardData` 扩展字段、图表组件 Props 类型 |
| `web/src/services/resources.ts` | 新增 AI Job 相关 API：`createAiJob`、`fetchAiJobs`、`rejectAiJob`、`retryAiJob`；新增报表 API：`fetchProjectReport`、`fetchOverviewReport`、`exportReport`；新增通知 API：`fetchNotifications`、`fetchNotificationCount`、`markNotificationRead`、`markAllNotificationsRead` |
| `web/src/pages/DashboardPage.tsx` | 增强指标卡（趋势指示）、新增「项目对比」区块、「完成趋势」区块 |
| `web/src/pages/projects/ProjectDetail.tsx` | 新增「报表」Tab，集成 `ProjectReport` 视图 |
| `web/src/components/common/NavBar.tsx` | 新增 3 个导航菜单项 + 集成 `NotificationBell` |
| `api/server.js` | 新增 10+ 个端点、Worker 轮询逻辑、WebSocket 服务、通知生成 hooks |

### 11.3 组件树

```
App
├── NavBar
│   ├── NavItem: AI 分析 → /ai-center
│   ├── NavItem: 报表 → /reports
│   └── NotificationBell (铃铛 + 未读数)
│       └── NotificationPanel (下拉面板)
│
├── Route /ai-center → AiCenterPage
│   ├── DataTable (Job 列表)
│   ├── AiJobDetailPanel (Overlay, 行展开)
│   └── AiJobConfirmForm (Overlay, 编辑确认)
│
├── Route /reports → ManagementDashboardPage
│   ├── MetricCard × 5 (KPI 行)
│   ├── HealthMatrix (项目矩阵)
│   ├── SimpleLineChart (交付趋势)
│   └── SimpleBarChart (部门负载)
│
├── Route /notifications → NotificationsPage
│   └── 按日期分组的通知列表
│
├── DashboardPage (增强)
│   ├── MetricCard + TrendIndicator
│   ├── SimpleBarChart (项目对比)
│   └── SimpleLineChart (完成趋势)
│
└── ProjectDetail (新增 Tab)
    └── SimpleBarChart / SimpleLineChart / ProgressRing
```

---

## 12. 权限设计明细

### 12.1 新增 Permission Resource

| Resource | Action | 说明 |
|----------|--------|------|
| `ai` | `list` | 查看 AI Job 列表 |
| `ai` | `view` | 查看单个 Job 详情 |
| `ai` | `create` | 创建 AI Job |
| `ai` | `confirm` | 确认/驳回 Job |
| `report` | `view` | 查看项目级报表 |
| `report` | `overview` | 查看管理驾驶舱 |
| `report` | `export` | 导出 CSV |
| `notification` | `read` | 查看通知列表 |
| `notification` | `write` | 标记已读 |

### 12.2 权限映射（默认角色）

| resource:action | 管理员 | PM | 员工 | 只读 |
|----------------|--------|-----|------|------|
| `ai:list` | ✓ | ✓ | ✓ | o |
| `ai:view` | ✓ | ✓ | ✓ | o |
| `ai:create` | ✓ | ✓ | — | — |
| `ai:confirm` | ✓ | ✓ | — | — |
| `report:view` | ✓ | ✓ | o | — |
| `report:overview` | ✓ | ✓ | — | — |
| `report:export` | ✓ | ✓ | — | — |
| `notification:read` | ✓ | ✓ | ✓ | — |
| `notification:write` | ✓ | ✓ | ✓ | — |

（✓=默认拥有，o=可选，—=无权限）

### 12.3 中间件用法

沿用阶段一的 `requirePermission` 中间件模式：

```javascript
app.get("/api/ai/jobs", requirePermission("ai:list"), (req, res) => { ... });
app.post("/api/ai/jobs", requirePermission("ai:create"), (req, res) => { ... });
app.post("/api/ai/jobs/:id/confirm", requirePermission("ai:confirm"), (req, res) => { ... });
```

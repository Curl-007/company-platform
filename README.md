# 公司项目管理平台

> AI 原生的全栈项目管理平台：项目管理业务闭环 × 可审计的智能体运行时 × 液态玻璃界面

[![Node](https://img.shields.io/badge/node-%3E%3D22%20%3C26-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> [English](README.en.md) | [中文](README.md)

---

## 为什么选它

**1. AI 不是贴皮，而是带安全边界的智能体运行时**

- 内置 DeepSeek Harness（dsh）JSON-RPC 推理子进程：会话持久化与重放、上下文压缩、检查点、token 计量一应俱全
- 三层 AI 工具面：助手会话获得 **19 个业务域工具（152 个平台操作）**；能力调用走**单能力 scoped token**（12 个窄域工具）；前端管理是**封闭声明式指令**（不接受可执行代码）
- 每一次 AI 写操作都强制**用户批准 + 审计先行**（审计写失败即拒绝执行）；浏览器操控带 DNS 钉扎/防重绑定/主机白名单；页面文本先脱敏再进模型

**2. 企业级安全纵深**

- 5 角色 RBAC（admin/pm/pdm/dev/qa）× 19 页面 × 操作矩阵，服务端逐请求校验
- AI 执行链路：HMAC 签名作用域 token（单次/会话两类）、仅回环网关、token_version 会话吊销（改密即全端下线）
- 全量操作审计与动态追踪；OpenAPI 契约与路由覆盖测试防止权限面悄悄漂移

**3. 工程质量可验证**

- **API 520 + Web 196 单元/集成测试**、Playwright 多角色 E2E、RC 全链演练（SQLite 备份恢复、优雅关停、生产冒烟）一条命令跑完
- `npm run check:rc` = audit + lint + test + build + preflight + 演练 + 冒烟 + 一次性数据库 E2E

**4. 现代前后端，开箱即用**

- 前端：React 19 + TypeScript + Vite + Tailwind，**中英双语**（2700+ key），液态玻璃设计系统，详情区块可拖拽排序，AI 可驱动界面指令
- 后端：Express + SQLite（默认零外部依赖），单机生产模式**一个进程同源服务 API + 前端**，含按需启动的推理子进程

## 功能一览

| 分组 | 页面 | 能力要点 |
| --- | --- | --- |
| 日常工作 | 工作台 / 我的工作 / 团队管理 / 团队日报 / 团队容量 / 动态中心 | 个人队列与交接、成员画像、容量与过载预警、审计动态时间线 |
| 项目交付 | 项目执行 / 需求管理 / 测试质量 / 交付中心 | WBS·看板·燃尽图、需求状态机与版本乐观锁、测试用例执行矩阵、构建-发布门禁 |
| 知识与智能 | 文档中心 / AI 分析 / DSH 界面 / 报表中心 | 文档协作与 AI 分析、AI 对话助手（工具调用）、声明式自定义视图、经营报表 |
| 管理配置 | 产品管理 / 研发流程 / 系统设置 | 产品-项目集-组合、固定/轻量双交付模板、AI 供应商与用户管理 |

提醒调度、AI 需求评分、工作日志智能解读、RAG 混合检索等能力贯穿各页面。

## 界面预览

以下截图基于本地开发环境（开发测试账号 `admin@example.com` 登录），完整截图位于 `docs/screenshots/`。

### 登录与工作台

| 登录页 | 工作台总览 |
| --- | --- |
| ![登录页](docs/screenshots/01-login.png) | ![工作台](docs/screenshots/02-dashboard.png) |

### 日常工作

| 我的工作 | 团队管理 |
| --- | --- |
| ![我的工作](docs/screenshots/03-mywork.png) | ![团队管理](docs/screenshots/04-team.png) |

| 团队日报 | 团队容量 |
| --- | --- |
| ![团队日报](docs/screenshots/05-teamlogs.png) | ![团队容量](docs/screenshots/06-capacity.png) |

| 动态中心 |
| --- |
| ![动态中心](docs/screenshots/07-dynamic.png) |

### 项目交付

| 项目执行 | 需求管理 |
| --- | --- |
| ![项目执行](docs/screenshots/08-projects.png) | ![需求管理](docs/screenshots/09-requirements.png) |

| 测试质量 | 交付中心 |
| --- | --- |
| ![测试质量](docs/screenshots/10-testing.png) | ![交付中心](docs/screenshots/11-delivery.png) |

### 知识与智能

| 文档中心 | AI 分析 |
| --- | --- |
| ![文档中心](docs/screenshots/12-documents.png) | ![AI 分析](docs/screenshots/13-ai.png) |

| 报表中心 |
| --- |
| ![报表中心](docs/screenshots/14-reports.png) |

### 管理配置

| 产品管理 | 研发流程 |
| --- | --- |
| ![产品管理](docs/screenshots/15-products.png) | ![研发流程](docs/screenshots/16-flow.png) |

| 系统设置 |
| --- |
| ![系统设置](docs/screenshots/17-settings.png) |

## 架构

```
┌────────────────────────── 浏览器 ──────────────────────────┐
│  React 19 SPA（液态玻璃 UI · i18n · 可排序区块 · WS 实时推送）│
└───────────────┬────────────────────────────────────────────┘
                │ HTTPS（同源 /api /ws）
┌───────────────▼────────────────────────────────────────────┐
│  API 控制面（Express）                                      │
│  RBAC · 审计 · 幂等 · REST(OpenAPI) · 提醒调度 · SQLite      │
│  ┌──────────────────────────────────────────────┐          │
│  │ 执行网关（仅 127.0.0.1，HMAC scoped token）    │          │
│  │ 平台操作代理 → 自身 REST（短时 token + 审计）   │          │
│  └──────────────┬───────────────────────────────┘          │
└─────────────────┼──────────────────────────────────────────┘
                  │ JSON-RPC（stdio，安全 env 子集 + 单能力 token）
┌─────────────────▼──────────────────────────────────────────┐
│  Harness 推理子进程（dsh/cordis 组合运行时）                  │
│  公司工具插件(19 域) · 技能目录 · ask-user/审批桥 · 会话投影   │
└────────────────────────────────────────────────────────────┘
```

关键边界：Provider Key 只存在于 API 控制面；推理子进程只持有短生命周期回环 token，无法接触用户凭据或数据库。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS · react-i18next · Playwright（E2E） |
| 后端 | Node.js ≥22 · Express 4 · SQLite（node:sqlite）· JWT · bcrypt · ws |
| AI 运行时 | @deepseek-ai/dsh SDK（cordis 组合运行时、会话持久化/投影、token 计量、上下文压缩） |
| 质量工程 | node:test（API 520 用例）· Vitest（Web 196 用例）· Playwright 多角色 E2E · OpenAPI 契约测试 |

## 快速开始（开发）

```bash
npm install          # 安装 monorepo 依赖（api + web workspaces）
npm run dev          # 并行启动 API(4010) + Vite(5173)
```

- 前端：http://localhost:5173 （Vite 代理 `/api` → 4010）
- API 健康检查：`GET http://localhost:4010/api/health`

开发测试账号（仅本地，业务数据默认为空）：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 管理员 | `admin@example.com` | `Admin@123` |
| 项目经理 | `pm@example.com` | `Pm@12345` |
| 产品经理 | `pdm@example.com` | `Pdm@12345` |
| 开发 | `dev@example.com` | `Dev@12345` |
| 测试 | `qa@example.com` | `Qa@12345` |

## 内部试用 / 单机生产（同源）

单机实例同时托管 **API + `web/dist` 静态前端**（`/api`、`/ws` 同源），并按需启动 Harness 推理子进程：

```bash
npm run build -w web
export JWT_SECRET='replace-me-16chars'                       # ≥16 字符
export AI_CONFIG_ENCRYPTION_KEY='replace-me-ai-16'           # ≥16，且 ≠ JWT_SECRET
export NODE_ENV=production
export SEED_ADMIN_EMAIL='owner@company.com'                  # 首位管理员
export SEED_ADMIN_PASSWORD='one-time-strong-password'
export HARNESS_HOME='/var/lib/pm/harness'                    # API 账户独占、持久、不在 Web 根
npm run start:prod     # http://localhost:4010/
```

- 健康检查 `GET /api/health` 仅代表控制面/数据库 readiness，不代表 Provider 或推理可用
- 正式登录页不展示/预填任何账号；首次登录并修改密码后移除 `SEED_ADMIN_*` 再重启
- 生产禁止 `SEED_DEMO_DATA=1` 与其他角色的 `SEED_*_PASSWORD`
- 深入的部署、Harness 边界、备份与回滚见 [docs/deployment-and-ops.md](./docs/deployment-and-ops.md)

## 构建与质量门禁

```bash
npm run build        # 前端生产构建（含类型检查）
npm run test         # API + Web 全部单元/集成测试
npm run lint         # ESLint（api + web）
npm run check        # audit + lint + test + build + preflight + 备份/关停演练 + 生产冒烟
npm run check:rc     # check + 一次性 SQLite 数据库 RC E2E（多角色全流程）
```

## 目录结构

```
├── api/                    # Express API
│   ├── config/harness/     # dsh 组合运行时与公司工具插件、方法论技能
│   ├── src/modules/        # 业务模块（projects/requirements/testing/ai/...）
│   ├── src/security/       # RBAC、项目访问、上传/URL 策略
│   └── test/               # 520 个 node:test 用例（含契约与安全回归）
├── web/                    # React SPA
│   ├── src/features/       # 按领域组织的功能组件
│   ├── src/styles/global/  # 分层样式（基础→组件→特性→覆盖层）
│   └── e2e/                # Playwright 多角色 E2E
├── docs/                   # 设计文档、实施台账、运维手册、页面截图
└── scripts/                # RC E2E、运行时打包、视觉审计等工程脚本
```

## 文档

- [设计总览](./docs/design-and-architecture.md) · [权衡与决策记录](./docs/trade-offs-and-decisions.md) · [部署运维](./docs/deployment-and-ops.md)
- [实现状态与差异清单](./docs/10-实现状态与差异清单.md) · [项目审查一页摘要](./docs/15-项目审查一页摘要.md) · [dsh 底座执行计划](./docs/17-dsh-foundation-plan.md)
- [文档索引](./docs/README.md)

## 贡献与许可

- 贡献指引见 [CONTRIBUTING.md](./CONTRIBUTING.md)，安全披露见 [SECURITY.md](./SECURITY.md)
- [MIT License](./LICENSE) © 2026

# 公司管理平台

> ZCode / 本地 agent 工作空间说明

## 子项目

- monorepo workspaces：`api`（Express API）、`web`（React + Vite）
- 文档台账：`docs/10-实现状态与差异清单.md`、`docs/15-项目审查一页摘要.md`
- 当前主开发分支（as-built）：`feature/configurable-workflow`

## 约束提示

- 默认数据库 SQLite；PostgreSQL 为可选验证路径，不作为默认「生产收口」叙事
- 流程模板 as-built：仅固定交付 + 轻量交付两个内置模板与项目绑定
- 产品管理页 as-built：产品 / 项目集 / 组合 三 Tab（公司目标 API 保留、页面入口已移除）

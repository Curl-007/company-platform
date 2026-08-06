# 贡献指南

欢迎参与「公司项目管理平台」的开发。在提交代码前，请先阅读本指南与仓库约定。

## 仓库约定（必读）

- [`AGENTS.md`](./AGENTS.md)：工作空间说明与约束（子项目结构、默认数据库、流程模板等）。
- [`CLAUDE.md`](./CLAUDE.md)：开发代理协作约定。
- [`docs/10-实现状态与差异清单.md`](./docs/10-实现状态与差异清单.md)：实现状态与差异清单。

## 项目结构

monorepo workspaces：

- `api/`：Express + SQLite 后端 API
- `web/`：React + Vite 前端

## 开发流程

1. 从 `main` 新建功能分支：`git checkout -b feat/your-feature`
2. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)（`feat:` / `fix:` / `chore:` / `docs:` / `test:` 等）。
3. 本地验证必须全部通过：

```bash
npm install
npm run dev            # 开发启动（前端 5173，代理到 API 4010）
npm run test -w api    # 后端测试（如适用）
npm run test -w web    # 前端 typecheck + 单测
npm run lint           # 零 lint 预算
```

4. 提交 Pull Request 到 `main`，说明改动内容与验证结果。

## 质量门槛

- TypeScript `tsc -b` 零错误；ESLint 零警告。
- 不引入新的未测试路径；涉及权限/会话的改动需补充测试。
- 默认数据库为 SQLite；PostgreSQL 仅作为可选验证路径，不作为默认叙事。

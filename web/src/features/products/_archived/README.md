# Archived (2026-07-21)

公司目标 / OKR 前端入口已从产品页移除。

- API 仍保留：`/api/strategic-goals`（`web/src/features/products/api.ts` 客户端也仍在）
- 本目录组件不再被页面引用，避免孤儿 UI 误接
- 若以后恢复入口：移回 `components/` 并挂到 `ProductsPage` 或其它导航

# AI 驱动项目管理平台

这是一个公司项目管理平台全栈项目，包含设计文档、前端 Web、后端 API。

平台按三阶段交付：阶段一为可上线的核心闭环 MVP，阶段二补 AI 文档闭环与协作，阶段三承接完整企业级愿景。范围与术语以 `docs/00-数据字典与术语统一.md` 为唯一真源，路线图见 `docs/README.md`。

## 目录

- `docs/`：总体设计、PRD、AI 方案、数据模型、UI 方案、全栈蓝图与数据字典。
- `web/`：React + TypeScript 前端应用。
- `api/`：Node.js 后端 API 服务。
- `prototype/`：**已归档的早期静态原型**，功能已由 `web/` 取代，仅作历史参考，不参与构建。

## 运行

安装依赖：

```bash
npm install
```

同时启动前后端：

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:4010`

## 验证

```bash
npm run build
npm run test
```


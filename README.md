# 公司项目管理平台

这是一个可交付使用的全栈项目管理平台，包含前端 Web 应用和后端 API 服务。

## 目录

- `web/`：React + TypeScript 前端应用
- `api/`：Node.js + SQLite 后端 API 服务
- `docs/`：设计文档与实施说明

## 启动

安装依赖：

```bash
npm install
```

同时启动前后端：

```bash
npm run dev
```

默认地址：

- 前端：http://localhost:5173
- 后端：http://localhost:4010

## 构建

```bash
npm run build
```

## 初始账号

本地开发环境会自动创建基础角色账号，业务数据为空：

- 管理员：`admin@example.com` / `Admin@123`
- 项目经理：`pm@example.com` / `Pm@12345`
- 产品经理：`pdm@example.com` / `Pdm@12345`
- 开发：`dev@example.com` / `Dev@12345`
- 测试：`qa@example.com` / `Qa@12345`

生产部署时建议通过环境变量设置 `SEED_*_PASSWORD`，并配置 `JWT_SECRET`。

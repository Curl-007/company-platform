const DEMO_SEED_ACCOUNTS = Object.freeze([
  {
    id: "USR-ADMIN",
    name: "系统管理员",
    email: "admin@example.com",
    passwordEnv: "SEED_ADMIN_PASSWORD",
    defaultPassword: "Admin@123",
    role: "admin",
    permissions: ["*"],
  },
  {
    id: "USR-PM",
    name: "项目经理",
    email: "pm@example.com",
    passwordEnv: "SEED_PM_PASSWORD",
    defaultPassword: "Pm@12345",
    role: "pm",
    permissions: ["project:*", "requirement:*", "document:*", "ai:*", "audit:read", "source:read"],
  },
  {
    id: "USR-DEV",
    name: "开发工程师",
    email: "dev@example.com",
    passwordEnv: "SEED_DEV_PASSWORD",
    defaultPassword: "Dev@12345",
    role: "dev",
    permissions: ["project:read", "requirement:read", "build:*", "document:*", "audit:read"],
  },
  {
    id: "USR-QA",
    name: "测试工程师",
    email: "qa@example.com",
    passwordEnv: "SEED_QA_PASSWORD",
    defaultPassword: "Qa@12345",
    role: "qa",
    permissions: ["test:*", "defect:*", "document:read", "audit:read"],
  },
  {
    id: "USR-PDM",
    name: "产品经理",
    email: "pdm@example.com",
    passwordEnv: "SEED_PDM_PASSWORD",
    defaultPassword: "Pdm@12345",
    role: "pdm",
    permissions: ["product:*", "document:*", "project:read", "requirement:*", "audit:read"],
  },
]);

function resolveDemoSeedAccounts(env = process.env) {
  return DEMO_SEED_ACCOUNTS.map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    password: String(env[account.passwordEnv] || account.defaultPassword),
    role: account.role,
    permissions: [...account.permissions],
  }));
}

module.exports = { resolveDemoSeedAccounts };

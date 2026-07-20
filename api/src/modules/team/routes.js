const bcrypt = require("bcryptjs");
const express = require("express");

const USER_STATUSES = new Set(["active", "disabled"]);

function createTeamRouter({
  audit,
  buildTeamMembers,
  canViewTeamLogs,
  defaultPermissionsForRole,
  fail,
  insert,
  isSystemRole,
  json,
  mapUser,
  nextId,
  now,
  ok,
  paginatedResponse,
  requirePermission,
  row,
  rows,
  run,
  systemRoles,
  organizationRepository,
}) {
  const router = express.Router();

  router.get("/team/members", (req, res) => {
    if (!canViewTeamLogs(req.user)) return fail(res, 403, "PERMISSION_DENIED", "只有项目经理和管理员可以查看团队成员。");
    res.json(ok(buildTeamMembers()));
  });

  router.get("/users", requirePermission("admin:*"), (req, res) => {
    const { keyword, role, status } = req.query;
    let list = rows("SELECT * FROM users").map(mapUser);
    if (role) list = list.filter((u) => u.role === role);
    if (status) list = list.filter((u) => u.status === status);
    if (keyword) {
      const kw = String(keyword).toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw));
    }
    res.json(ok(paginatedResponse(list, req.query)));
  });

  router.get("/users/:id", requirePermission("admin:*"), (req, res) => {
    const user = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
    if (!user) return fail(res, 404, "RESOURCE_NOT_FOUND", "用户不存在。");
    res.json(ok(mapUser(user)));
  });

  router.post("/users", requirePermission("admin:*"), (req, res) => {
    const { name, email, password, role, status, phone, position, department, departmentId, bio } = req.body || {};
    if (!name || !email || !password || !role) {
      return fail(res, 400, "VALIDATION_FAILED", "name、email、password、role 均为必填项。");
    }
    if (!isSystemRole(role)) {
      return fail(res, 400, "VALIDATION_FAILED", `role must be one of: ${systemRoles.join(", ")}`);
    }
    if (status !== undefined && !USER_STATUSES.has(status)) {
      return fail(res, 400, "VALIDATION_FAILED", "status must be active or disabled.");
    }
    const nextEmail = String(email).trim();
    const existing = row("SELECT id FROM users WHERE email = @email", { email: nextEmail });
    if (existing) return fail(res, 409, "CONFLICT", "该邮箱已被使用。");
    const requestedDepartmentId = String(departmentId || "").trim() || null;
    const requestedDepartmentName = department === undefined ? "" : String(department).trim();
    const selectedDepartment = requestedDepartmentId
      ? organizationRepository?.findUnit(requestedDepartmentId)
      : requestedDepartmentName ? organizationRepository?.findUnitByName(requestedDepartmentName) : null;
    if ((requestedDepartmentId || requestedDepartmentName) && !selectedDepartment) return fail(res, 400, "VALIDATION_FAILED", "Department does not exist.");
    const defaultPermissions = defaultPermissionsForRole(role);
    const user = {
      id: nextId("USR", "users"),
      name: String(name).trim(),
      email: nextEmail,
      password_hash: bcrypt.hashSync(String(password), 10),
      role,
      permissions: json(defaultPermissions),
      status: status || "active",
      phone: phone !== undefined ? String(phone).trim() : "",
      position: position !== undefined ? String(position).trim() : "",
      department: selectedDepartment?.name || "",
      department_id: selectedDepartment?.id || null,
      bio: bio !== undefined ? String(bio).trim() : "",
      created_at: now(),
    };
    insert("users", user);
    audit(req.user, "user.create", "user", user.id, null, mapUser(user), req.ip);
    res.status(201).json(ok(mapUser(user)));
  });

  router.patch("/users/:id", requirePermission("admin:*"), (req, res) => {
    const before = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "用户不存在。");
    const { name, email, role, status, password, phone, position, department, departmentId, bio } = req.body || {};
    if (
      name === undefined &&
      email === undefined &&
      role === undefined &&
      status === undefined &&
      password === undefined &&
      phone === undefined &&
      position === undefined &&
      department === undefined &&
      departmentId === undefined &&
      bio === undefined
    ) {
      return fail(res, 400, "VALIDATION_FAILED", "至少需要提供一个要更新的字段。");
    }
    if (email !== undefined) {
      const nextEmail = String(email).trim();
      if (!nextEmail) return fail(res, 400, "VALIDATION_FAILED", "email must not be empty");
      const duplicate = row("SELECT id FROM users WHERE email = @email AND id != @id", { email: nextEmail, id: req.params.id });
      if (duplicate) return fail(res, 409, "CONFLICT", "该邮箱已被其他用户使用。");
    }
    const requestedDepartmentId = departmentId === undefined && department === undefined
      ? before.department_id || null
      : departmentId === undefined ? null : String(departmentId || "").trim() || null;
    const requestedDepartmentName = department === undefined ? null : String(department).trim();
    const selectedDepartment = requestedDepartmentId
      ? organizationRepository?.findUnit(requestedDepartmentId)
      : requestedDepartmentName ? organizationRepository?.findUnitByName(requestedDepartmentName) : null;
    if ((requestedDepartmentId || requestedDepartmentName) && !selectedDepartment) return fail(res, 400, "VALIDATION_FAILED", "Department does not exist.");
    if (status === "disabled" && before.id === req.user.id) {
      return fail(res, 400, "VALIDATION_FAILED", "不能禁用自己。");
    }
    if (role !== undefined && !isSystemRole(role)) {
      return fail(res, 400, "VALIDATION_FAILED", `role must be one of: ${systemRoles.join(", ")}`);
    }
    if (status !== undefined && !USER_STATUSES.has(status)) {
      return fail(res, 400, "VALIDATION_FAILED", "status must be active or disabled.");
    }
    if (role !== undefined && before.id === req.user.id && role !== before.role) {
      return fail(res, 400, "VALIDATION_FAILED", "不能修改自己的角色。");
    }
    const sameName = name === undefined || String(name).trim() === before.name;
    const sameEmail = email === undefined || String(email).trim() === before.email;
    const sameRole = role === undefined || role === before.role;
    const sameStatus = status === undefined || status === before.status;
    const samePassword = password === undefined;
    const samePhone = phone === undefined || String(phone).trim() === (before.phone || "");
    const samePosition = position === undefined || String(position).trim() === (before.position || "");
    const nextDepartmentName = selectedDepartment?.name || (departmentId !== undefined || department !== undefined ? "" : (before.department || ""));
    const sameDepartment = nextDepartmentName === (before.department || "") && requestedDepartmentId === (before.department_id || null);
    const sameBio = bio === undefined || String(bio).trim() === (before.bio || "");
    if (sameName && sameEmail && sameRole && sameStatus && samePassword && samePhone && samePosition && sameDepartment && sameBio) {
      return res.json(ok(mapUser(before)));
    }
    if (name !== undefined) run("UPDATE users SET name = @val WHERE id = @id", { id: req.params.id, val: String(name).trim() });
    if (email !== undefined) run("UPDATE users SET email = @val WHERE id = @id", { id: req.params.id, val: String(email).trim() });
    if (role !== undefined) {
      run("UPDATE users SET role = @val WHERE id = @id", { id: req.params.id, val: role });
      run("UPDATE users SET permissions = @permissions WHERE id = @id", {
        id: req.params.id,
        permissions: json(defaultPermissionsForRole(role)),
      });
    }
    if (status !== undefined) run("UPDATE users SET status = @val WHERE id = @id", { id: req.params.id, val: status });
    if (password !== undefined) run("UPDATE users SET password_hash = @val WHERE id = @id", { id: req.params.id, val: bcrypt.hashSync(String(password), 10) });
    if (phone !== undefined) run("UPDATE users SET phone = @val WHERE id = @id", { id: req.params.id, val: String(phone).trim() });
    if (position !== undefined) run("UPDATE users SET position = @val WHERE id = @id", { id: req.params.id, val: String(position).trim() });
    if (department !== undefined || departmentId !== undefined) run("UPDATE users SET department = @department, department_id = @departmentId WHERE id = @id", { id: req.params.id, department: nextDepartmentName, departmentId: requestedDepartmentId });
    if (bio !== undefined) run("UPDATE users SET bio = @val WHERE id = @id", { id: req.params.id, val: String(bio).trim() });
    const after = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
    audit(req.user, "user.update", "user", req.params.id, mapUser(before), mapUser(after), req.ip);
    res.json(ok(mapUser(after)));
  });

  router.delete("/users/:id", requirePermission("admin:*"), (req, res) => {
    const before = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "用户不存在。");
    if (before.id === req.user.id) return fail(res, 400, "VALIDATION_FAILED", "不能禁用当前登录用户。");
    if (before.status === "disabled") return res.json(ok({ disabled: true, id: req.params.id }));
    run("UPDATE users SET status = @status WHERE id = @id", { id: req.params.id, status: "disabled" });
    const after = row("SELECT * FROM users WHERE id = @id", { id: req.params.id });
    audit(req.user, "user.disable", "user", req.params.id, mapUser(before), mapUser(after), req.ip);
    res.json(ok({ disabled: true, id: req.params.id }));
  });

  return router;
}

module.exports = {
  createTeamRouter,
};

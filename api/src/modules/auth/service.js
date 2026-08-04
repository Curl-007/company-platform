const { conflictError, isUniqueConstraintError } = require("../../lib/databaseErrors");

function authError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function createAuthService({ comparePassword, issueToken, publicUser, repository }) {
  return {
    async login({ email, password }) {
      if (typeof password !== "string" || password.length === 0) {
        throw authError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
      }
      const user = await repository.findByEmail(email);
      if (!user || !comparePassword(password, user.password_hash)) {
        throw authError("INVALID_CREDENTIALS", "账号或密码错误。", 401);
      }
      if (user.status === "disabled") throw authError("ACCOUNT_DISABLED", "该账号已被禁用，请联系管理员。", 403);
      return { token: issueToken(user), user: publicUser(user) };
    },
    async updateProfile(userId, input) {
      const before = await repository.findById(userId);
      if (!before) throw authError("RESOURCE_NOT_FOUND", "用户不存在。", 404);
      if (input?.department !== undefined && String(input.department).trim() !== (before.department || "")) {
        throw authError("DEPARTMENT_MANAGED_BY_ADMIN", "部门归属由管理员在团队管理中维护。", 403);
      }
      const profile = {
        name: input?.name !== undefined ? String(input.name).trim() : before.name,
        email: input?.email !== undefined ? String(input.email).trim() : before.email,
        phone: input?.phone !== undefined ? String(input.phone).trim() : before.phone || "",
        position: input?.position !== undefined ? String(input.position).trim() : before.position || "",
        department: before.department || "",
        bio: input?.bio !== undefined ? String(input.bio).trim() : before.bio || "",
      };
      if (!profile.name) throw authError("VALIDATION_FAILED", "姓名不能为空。", 400);
      if (!profile.email) throw authError("VALIDATION_FAILED", "邮箱不能为空。", 400);
      if (await repository.findOtherByEmail(profile.email, userId)) throw authError("CONFLICT", "该邮箱已被其他用户使用。", 409);
      let after;
      try {
        after = await repository.updateProfile(userId, profile);
      } catch (error) {
        if (isUniqueConstraintError(error)) throw conflictError("The email address is already in use.");
        throw error;
      }
      return { before, after };
    },
  };
}

module.exports = { createAuthService };

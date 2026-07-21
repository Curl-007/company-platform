const jwt = require("jsonwebtoken");
const { hasPermission, publicUser } = require("../security/accessControl");

function createAuthMiddleware({ jwtSecret, fail, row }) {
  async function authenticate(req, res, next) {
    if (req.path === "/api/health" || req.path === "/api/auth/login") return next();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return fail(res, 401, "UNAUTHENTICATED", "请先登录。");
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = await row("SELECT * FROM users WHERE id = @id", { id: payload.sub });
      if (!user) return fail(res, 401, "UNAUTHENTICATED", "登录已失效。");
      if (user.status === "disabled") return fail(res, 403, "ACCOUNT_DISABLED", "该账号已被禁用。");
      req.user = publicUser(user);
      return next();
    } catch {
      return fail(res, 401, "UNAUTHENTICATED", "登录已失效。");
    }
  }

  function requirePermission(permission) {
    return (req, res, next) => {
      if (!hasPermission(req.user, permission)) return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
      return next();
    };
  }

  function requireAnyPermission(permissions) {
    return (req, res, next) => {
      if (!permissions.some((permission) => hasPermission(req.user, permission))) {
        return fail(res, 403, "PERMISSION_DENIED", "无权执行该操作。");
      }
      return next();
    };
  }

  function extractSocketToken(req) {
    const header = req.headers["sec-websocket-protocol"] || req.headers["Sec-WebSocket-Protocol"] || "";
    const protocols = String(header)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const markerIndex = protocols.findIndex((part) => part === "pm.jwt");
    if (markerIndex >= 0 && protocols[markerIndex + 1]) {
      return protocols[markerIndex + 1];
    }
    const jwtLike = protocols.find((part) => part !== "pm.jwt" && part.includes("."));
    if (jwtLike) return jwtLike;

    // Query-string tokens are rejected in production to avoid JWT leakage via logs/proxies.
    // Non-production still accepts them with a deprecation warning for local smoke/tests.
    const url = new URL(req.url, "http://localhost");
    const queryToken = url.searchParams.get("token") || "";
    if (!queryToken) return "";
    if (process.env.NODE_ENV === "production") {
      console.warn("REJECTED: WebSocket auth via ?token= is disabled in production; use Sec-WebSocket-Protocol with ['pm.jwt', token].");
      return "";
    }
    console.warn("DEPRECATED: WebSocket auth via ?token= query is deprecated; use Sec-WebSocket-Protocol with ['pm.jwt', token].");
    return queryToken;
  }

  async function authenticateSocket(req) {
    const token = extractSocketToken(req);
    if (!token) return null;
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = await row("SELECT * FROM users WHERE id = @id", { id: payload.sub });
      return user && user.status === "active" ? publicUser(user) : null;
    } catch {
      return null;
    }
  }

  return {
    authenticate,
    authenticateSocket,
    requireAnyPermission,
    requirePermission,
  };
}

module.exports = {
  createAuthMiddleware,
};

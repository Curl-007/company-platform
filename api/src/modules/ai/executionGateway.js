const http = require("node:http");

const MAX_GATEWAY_BODY_BYTES = 128 * 1024;

function gatewayError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function readBearerToken(header) {
  const source = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(String(source || "").trim());
  return match ? match[1] : "";
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("error", rejectOnce);
    req.on("data", (chunk) => {
      if (settled) return;
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += data.length;
      if (size > maxBytes) {
        rejectOnce(gatewayError("AI_CAPABILITY_GATEWAY_BODY_TOO_LARGE", "Execution gateway request is too large.", 413));
        req.resume();
        return;
      }
      chunks.push(data);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        resolve(parsed);
      } catch {
        reject(gatewayError("AI_CAPABILITY_GATEWAY_INVALID_JSON", "Execution gateway request must be a JSON object.", 400));
      }
    });
  });
}

function writeJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function publicGatewayError(error) {
  return {
    error: {
      code: String(error?.code || "AI_CAPABILITY_GATEWAY_FAILED"),
      message: String(error?.message || "Execution gateway request failed.").replace(/\s+/g, " ").slice(0, 240),
    },
  };
}

function countOf(value) {
  return Number(value?.count || value?.c || 0);
}

function compactRisk(row) {
  const severity = String(row.severity || "medium");
  const title = String(row.title || "Untitled risk").replace(/\s+/g, " ").trim().slice(0, 180);
  return `[${severity}] ${title}`;
}

function buildSnapshotSummary(snapshot) {
  const project = snapshot.project;
  const metrics = snapshot.metrics;
  const blockers = [
    metrics.blockedTasks ? `${metrics.blockedTasks} blocked task${metrics.blockedTasks === 1 ? "" : "s"}` : "",
    metrics.openDefects ? `${metrics.openDefects} open defect${metrics.openDefects === 1 ? "" : "s"}` : "",
    metrics.openRisks ? `${metrics.openRisks} open risk${metrics.openRisks === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const status = project.status || "unknown";
  const health = Number.isFinite(project.healthScore) ? `health ${project.healthScore}` : "health unavailable";
  return `${project.name} is ${status} (${health}). ${blockers.length ? `Attention: ${blockers.join(", ")}.` : "No current blocking count was found."}`;
}

function createExecutionGateway({
  canAccessProject,
  controlStore,
  hasPermission,
  maxBodyBytes = MAX_GATEWAY_BODY_BYTES,
  now = () => new Date().toISOString(),
  publicUser,
  registry,
  row,
  rows,
  serverFactory = http.createServer,
  tokenService,
}) {
  if (!registry || !controlStore || !tokenService) throw new Error("Execution gateway policy dependencies are required.");
  if (typeof row !== "function" || typeof rows !== "function" || typeof canAccessProject !== "function" || typeof publicUser !== "function" || typeof hasPermission !== "function") {
    throw new Error("Execution gateway data and access dependencies are required.");
  }

  const capturedByInvocation = new Map();
  const consumedTokenIds = new Map();
  let baseUrl = null;
  let closeTask;
  let server;
  let startTask;

  function pruneConsumed() {
    const time = Date.now();
    for (const [tokenId, expiresAt] of consumedTokenIds) {
      if (expiresAt <= time) consumedTokenIds.delete(tokenId);
    }
  }

  async function loadSnapshot(projectId) {
    const project = await row(
      `SELECT id, name, objective, status, health_score, owner, progress, start_date, end_date, updated_at
         FROM projects
        WHERE id = @projectId AND deleted_at IS NULL`,
      { projectId },
    );
    if (!project) throw gatewayError("RESOURCE_NOT_FOUND", "Project not found.", 404);
    const [requirements, tasks, blockedTasks, defects, failingTests, risks, riskRows] = await Promise.all([
      row("SELECT COUNT(*) AS count FROM requirements WHERE project_id = @projectId AND deleted_at IS NULL", { projectId }),
      row("SELECT COUNT(*) AS count FROM tasks WHERE project_id = @projectId", { projectId }),
      row("SELECT COUNT(*) AS count FROM tasks WHERE project_id = @projectId AND (status = 'blocked' OR COALESCE(blocker, '') != '')", { projectId }),
      row("SELECT COUNT(*) AS count FROM defects WHERE project_id = @projectId AND status NOT IN ('verified', 'closed', 'rejected')", { projectId }),
      row("SELECT COUNT(*) AS count FROM test_cases WHERE project_id = @projectId AND (status IN ('failed', 'blocked') OR failed_cases > 0 OR blocked_cases > 0)", { projectId }),
      row("SELECT COUNT(*) AS count FROM project_risks WHERE project_id = @projectId AND status != 'closed'", { projectId }),
      rows(
        `SELECT title, severity, status, owner_name
           FROM project_risks
          WHERE project_id = @projectId AND status != 'closed'
          ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updated_at DESC
          LIMIT 8`,
        { projectId },
      ),
    ]);
    const snapshot = {
      project: {
        id: project.id,
        name: project.name,
        objective: String(project.objective || "").slice(0, 1200),
        status: project.status,
        healthScore: Number(project.health_score),
        owner: project.owner,
        progress: Number(project.progress),
        startDate: project.start_date || null,
        endDate: project.end_date || null,
        updatedAt: project.updated_at || null,
      },
      metrics: {
        requirements: countOf(requirements),
        tasks: countOf(tasks),
        blockedTasks: countOf(blockedTasks),
        openDefects: countOf(defects),
        failingTestCases: countOf(failingTests),
        openRisks: countOf(risks),
      },
      risks: (riskRows || []).map(compactRisk),
      evidence: [],
    };
    snapshot.evidence = [
      `Project ${snapshot.project.id} is scoped to this invocation.`,
      `${snapshot.metrics.requirements} active requirements and ${snapshot.metrics.tasks} tasks were included.`,
      `${snapshot.metrics.openDefects} open defects, ${snapshot.metrics.failingTestCases} failing or blocked test cases, and ${snapshot.metrics.openRisks} open risks were included.`,
    ];
    return snapshot;
  }

  async function execute({ input, source = "adapter-fallback", token }) {
    const claims = tokenService.verify(token, { capabilityId: "project-snapshot" });
    const manifest = registry.get(claims.capabilityId);
    if (!manifest || manifest.version !== claims.capabilityVersion || manifest.status !== "approved") {
      throw gatewayError("AI_CAPABILITY_UNAPPROVED", "AI capability is not approved.", 503);
    }
    const control = await controlStore.get(manifest.id);
    if (!control.enabled) throw gatewayError("AI_CAPABILITY_DISABLED", "AI capability is disabled.", 503);
    const normalizedInput = registry.normalizeInvocationInput(manifest.id, input);
    if (normalizedInput.projectId !== claims.projectId) {
      throw gatewayError("AI_CAPABILITY_TOKEN_SCOPE_MISMATCH", "Execution token scope does not match this project.", 403);
    }
    pruneConsumed();
    if (consumedTokenIds.has(claims.jti)) {
      throw gatewayError("AI_CAPABILITY_TOKEN_REPLAYED", "Execution token was already used.", 409);
    }
    // Reserve the token before any database work. A pair of concurrent requests
    // otherwise could both pass the replay check while one is awaiting policy
    // verification or the compact snapshot query.
    consumedTokenIds.set(claims.jti, claims.exp);
    const actor = await row("SELECT * FROM users WHERE id = @id", { id: claims.actorId });
    if (!actor || actor.status !== "active") {
      throw gatewayError("AI_CAPABILITY_ACTOR_UNAVAILABLE", "Execution actor is unavailable.", 403);
    }
    const user = publicUser(actor);
    if (!hasPermission(user, "ai:*")) {
      throw gatewayError("PERMISSION_DENIED", "Execution actor cannot use AI capabilities.", 403);
    }
    if (!(await canAccessProject(user, claims.projectId))) {
      throw gatewayError("PERMISSION_DENIED", "Execution actor cannot access this project.", 403);
    }
    const snapshot = await loadSnapshot(claims.projectId);
    const evidence = {
      at: now(),
      capabilityId: manifest.id,
      capabilityVersion: manifest.version,
      event: "execution-gateway.project-snapshot",
      projectId: claims.projectId,
      source: source === "runtime-tool" ? "runtime-tool" : "adapter-fallback",
    };
    const captured = { claims: tokenService.publicClaims(claims), evidence, snapshot };
    // Only a successful Harness tool call needs a temporary hand-off to the
    // adapter. Local fallback already owns the returned value directly.
    if (source === "runtime-tool") capturedByInvocation.set(claims.invocationId, captured);
    return captured;
  }

  async function handle(req, res) {
    const parsed = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method !== "POST" || parsed.pathname !== "/v1/project-snapshot" || parsed.search || parsed.hash) {
      writeJson(res, 404, { error: { code: "AI_CAPABILITY_GATEWAY_ROUTE_FORBIDDEN", message: "Execution gateway route is not allowed." } });
      return;
    }
    try {
      const result = await execute({
        input: await readJsonBody(req, maxBodyBytes),
        source: "runtime-tool",
        token: readBearerToken(req.headers.authorization),
      });
      writeJson(res, 200, { data: { evidence: result.evidence, snapshot: result.snapshot } });
    } catch (error) {
      writeJson(res, Number(error?.status) || 502, publicGatewayError(error));
    }
  }

  async function start() {
    if (baseUrl) return baseUrl;
    startTask ||= new Promise((resolve, reject) => {
      server = serverFactory((req, res) => { void handle(req, res); });
      const onError = (error) => {
        server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server?.off("error", onError);
        const address = server?.address();
        if (!address || typeof address === "string") {
          reject(gatewayError("AI_CAPABILITY_GATEWAY_START_FAILED", "Execution gateway did not expose a loopback port.", 500));
          return;
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve(baseUrl);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
    try {
      return await startTask;
    } catch (error) {
      startTask = undefined;
      throw error;
    }
  }

  async function close() {
    if (closeTask) return closeTask;
    closeTask = new Promise((resolve) => {
      if (!server) return resolve();
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
    await closeTask;
    baseUrl = null;
    server = undefined;
    startTask = undefined;
  }

  return {
    close,
    execute,
    getCaptured(invocationId) {
      const key = String(invocationId || "");
      const captured = capturedByInvocation.get(key) || null;
      if (captured) capturedByInvocation.delete(key);
      return captured;
    },
    start,
    status: () => ({ capturedInvocations: capturedByInvocation.size, started: Boolean(baseUrl) }),
  };
}

module.exports = {
  MAX_GATEWAY_BODY_BYTES,
  buildSnapshotSummary,
  createExecutionGateway,
  gatewayError,
};

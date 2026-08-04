/**
 * Local smoke checks against a running API (and optional Vite).
 * Usage: node api/scripts/smoke-local.js
 */
const BASE = process.env.SMOKE_API_BASE || "http://127.0.0.1:4010";
const WEB = process.env.SMOKE_WEB_BASE || "http://127.0.0.1:5173";
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail: String(detail || "").slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + String(detail).slice(0, 220) : ""}`);
}

async function req(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { res, json, status: res.status };
}

function printSummary() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log("\n========== SMOKE SUMMARY ==========");
  console.log(`PASS ${pass}  FAIL ${fail}  TOTAL ${results.length}`);
  if (fail) {
    console.log("Failed:");
    results.filter((r) => !r.ok).forEach((r) => console.log(` - ${r.name}: ${r.detail}`));
  }
  return fail;
}

async function main() {
  {
    const { status, json } = await req("GET", "/api/health");
    record("GET /api/health", status === 200 && json?.data?.status === "ok", `status=${status}`);
  }

  {
    const { status, json } = await req("GET", "/api/auth/me");
    record("GET /api/auth/me without token → 401", status === 401, `status=${status} code=${json?.errorCode}`);
  }

  let token = null;
  let user = null;
  {
    const { status, json } = await req("POST", "/api/auth/login", {
      body: { email: "admin@example.com", password: "Admin@123" },
    });
    token = json?.data?.token || null;
    user = json?.data?.user || null;
    record(
      "POST /api/auth/login admin",
      status === 200 && Boolean(token),
      `status=${status} role=${user?.role || "?"} name=${user?.name || "?"}`,
    );
  }

  if (!token) {
    printSummary();
    process.exit(1);
  }

  {
    const { status, json } = await req("GET", "/api/auth/me", { token });
    record("GET /api/auth/me", status === 200 && Boolean(json?.data?.email), `status=${status} email=${json?.data?.email}`);
  }

  {
    const { status, json } = await req("GET", "/api/auth/capabilities", { token });
    record("GET /api/auth/capabilities", status === 200 && Boolean(json?.data), `status=${status} keys=${Object.keys(json?.data || {}).join(",")}`);
  }

  {
    const { status, json } = await req("GET", "/api/dashboard", { token });
    record("GET /api/dashboard", status === 200 && Boolean(json?.data?.metrics), `status=${status}`);
  }

  {
    const { status, json } = await req("GET", "/api/reports/summary", { token });
    record(
      "GET /api/reports/summary",
      status === 200 && json?.data?.mode === "dashboard_projection",
      `status=${status} mode=${json?.data?.mode}`,
    );
  }

  {
    const { status, json } = await req("GET", "/api/reports/personal", { token });
    record(
      "GET /api/reports/personal",
      status === 200 && json?.data?.mode === "dashboard_projection",
      `status=${status} mode=${json?.data?.mode}`,
    );
  }

  {
    const { status } = await req("GET", "/api/projects", { token });
    record("GET /api/projects", status === 200, `status=${status}`);
  }

  {
    const { status, json } = await req("GET", "/api/meta/enums", { token });
    record("GET /api/meta/enums", status === 200 && Boolean(json?.data), `status=${status}`);
  }

  let docId = null;
  {
    const content = Buffer.from("# smoke test\nhello").toString("base64");
    const payload = {
      title: `Smoke Doc ${Date.now()}`,
      type: "note",
      owner: user?.name || "管理员",
      fileName: "smoke.md",
      fileType: "text/markdown",
      contentBase64: `data:text/markdown;base64,${content}`,
    };
    let { status, json } = await req("POST", "/api/documents", { token, body: payload });
    if (status >= 400) {
      const retry = await req("POST", "/api/documents", {
        token,
        body: { ...payload, category: "general" },
      });
      status = retry.status;
      json = retry.json;
    }
    if (status === 201 && json?.data?.id) docId = json.data.id;
    record("POST /api/documents allowed .md", status === 201 && Boolean(docId), `status=${status} id=${docId || "?"} msg=${json?.message || ""}`);
  }

  {
    const content = Buffer.from("MZ fake exe").toString("base64");
    const { status, json } = await req("POST", "/api/documents", {
      token,
      body: {
        title: `Bad upload ${Date.now()}`,
        type: "note",
        owner: user?.name || "管理员",
        fileName: "malware.exe",
        fileType: "application/octet-stream",
        contentBase64: `data:application/octet-stream;base64,${content}`,
      },
    });
    const blob = JSON.stringify(json);
    record(
      "POST /api/documents reject .exe",
      status === 400 && /UPLOAD_TYPE|not allowed|不允许/i.test(blob),
      `status=${status} code=${json?.errorCode} msg=${json?.message}`,
    );
  }

  if (docId) {
    const { status, json } = await req("POST", `/api/documents/${docId}/upload-url`, {
      token,
      body: { fileName: "next.md", fileType: "text/markdown", fileSize: 10 },
    });
    record(
      "POST /api/documents/:id/upload-url",
      status === 201 && json?.data?.mode === "direct_multipart" && Boolean(json?.data?.uploadUrl),
      `status=${status} mode=${json?.data?.mode} url=${json?.data?.uploadUrl}`,
    );
  } else {
    record("POST /api/documents/:id/upload-url", false, "no document id");
  }

  {
    const { status, json } = await req("POST", "/api/auth/login", {
      body: { email: "admin@example.com", password: "wrong-password" },
    });
    record("POST /api/auth/login wrong password", status === 401 || status === 403, `status=${status} code=${json?.errorCode}`);
  }

  try {
    const res = await fetch(WEB + "/");
    const html = await res.text();
    record("GET web / (vite)", res.status === 200 && /root|script/i.test(html), `status=${res.status} len=${html.length}`);
  } catch (error) {
    record("GET web / (vite)", false, error.message);
  }

  if (docId && token) {
    try {
      const { WebSocket } = require("ws");
      await new Promise((resolve) => {
        let settled = false;
        const done = (ok, detail) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          record("WS /ws/collab with pm.jwt protocol", ok, detail);
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          resolve();
        };
        const timer = setTimeout(() => done(false, "timeout 5s"), 5000);
        const socket = new WebSocket(
          `ws://127.0.0.1:4010/ws/collab?documentId=${encodeURIComponent(docId)}`,
          ["pm.jwt", token],
        );
        socket.on("message", (data) => {
          let msg = {};
          try {
            msg = JSON.parse(String(data));
          } catch {
            /* ignore */
          }
          done(msg.type === "snapshot", `type=${msg.type || "message"}`);
        });
        socket.on("error", (err) => done(false, err.message));
        socket.on("close", (code, reason) => {
          if (!settled) done(false, `closed code=${code} reason=${reason}`);
        });
      });
    } catch (error) {
      record("WS /ws/collab with pm.jwt protocol", false, error.message);
    }
  }

  const fail = printSummary();
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

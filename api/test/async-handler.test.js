const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const http = require("node:http");
const { asyncHandler, wrapRouterAsync } = require("../src/lib/asyncHandler");

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
}

test("asyncHandler routes rejected promises to error middleware", async () => {
  const app = express();
  app.get("/boom", asyncHandler(async () => {
    throw Object.assign(new Error("nope"), { status: 422, code: "VALIDATION_FAILED" });
  }));
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ errorCode: err.code || "INTERNAL", message: err.message });
  });
  const { port, close } = await listen(app);
  try {
    const res = await get(port, "/boom");
    assert.equal(res.status, 422);
    assert.match(res.body, /VALIDATION_FAILED/);
  } finally {
    await close();
  }
});

test("wrapRouterAsync covers stack handlers so rejections do not crash", async () => {
  const app = express();
  const router = express.Router();
  router.get("/late", async () => {
    throw Object.assign(new Error("late"), { status: 400, code: "BAD" });
  });
  wrapRouterAsync(router);
  app.use(router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ errorCode: err.code || "INTERNAL", message: err.message });
  });
  const { port, close } = await listen(app);
  try {
    const res = await get(port, "/late");
    assert.equal(res.status, 400);
    assert.match(res.body, /"BAD"/);
  } finally {
    await close();
  }
});

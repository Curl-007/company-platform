const assert = require("node:assert/strict");
const test = require("node:test");
const { runDrill } = require("../scripts/graceful-shutdown-drill");

test("API process exits cleanly via shared shutdown path", { timeout: 60_000 }, async () => {
  // HTTP trigger exercises the same shutdown() used by SIGTERM/SIGINT handlers.
  // On Windows, child_process.kill('SIGTERM') does not run those handlers.
  const report = await runDrill({ mode: "http" });
  assert.equal(report.ok, true, report.error || JSON.stringify(report));
  assert.equal(report.sawGracefulLog, true);
  assert.ok(report.shutdownMs < 12_000);
});

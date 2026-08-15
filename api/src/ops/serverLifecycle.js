function createServerLifecycle({
  aiExecutionGateway,
  aiJobTimeoutMs,
  aiJobTimeoutSweepMs,
  aiJobsRepository,
  aiModelClient,
  audit,
  closeDatabase,
  logger = console,
  now,
  processExit = process.exit,
  recoverPendingAiJobs,
  reminderScheduler,
  server,
  serveWeb,
  startAiJobTimeoutMonitor,
  clearIntervalFn = clearInterval,
  clearTimeoutFn = clearTimeout,
  setTimeoutFn = setTimeout,
  wss,
  agentWss,
}) {
  if (!server || !wss || typeof closeDatabase !== "function" || typeof recoverPendingAiJobs !== "function" || typeof startAiJobTimeoutMonitor !== "function") {
    throw new Error("Server lifecycle dependencies are required.");
  }

  let aiJobTimeoutTimer = null;
  let shuttingDown = false;

  function onError(port, err) {
    if (err.code === "EADDRINUSE") {
      logger.error(`FATAL: Port ${port} is already in use. Stop the other process or set PORT to a free port.`);
      processExit(1);
      return;
    }
    throw err;
  }

  function start(port) {
    const handleError = (err) => onError(port, err);
    server.on("error", handleError);
    wss.on("error", handleError);
    agentWss?.on("error", handleError);
    server.listen(port, () => {
      recoverPendingAiJobs();
      if (!aiJobTimeoutTimer) {
        aiJobTimeoutTimer = startAiJobTimeoutMonitor({
          repository: aiJobsRepository,
          audit,
          now,
          timeoutMs: aiJobTimeoutMs,
          sweepMs: aiJobTimeoutSweepMs,
          actor: { id: "system", name: "AI Worker Monitor" },
        });
      }
      // Reminder scheduling starts with the server (db already initialized by
      // the caller) and immediately sweeps reminders overdue across restarts.
      reminderScheduler?.start?.();
      logger.log(`Company project management API listening on http://localhost:${port}`);
      if (serveWeb) logger.log(`Same-origin web UI: http://localhost:${port}/ (HashRouter SPA)`);
    });
  }

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`Received ${signal}, shutting down gracefully...`);

    if (aiJobTimeoutTimer) {
      clearIntervalFn(aiJobTimeoutTimer);
      aiJobTimeoutTimer = null;
    }

    // Stop sweeping before the database closes so no delivery races shutdown.
    reminderScheduler?.stop?.();

    try {
      for (const wssInstance of [wss, agentWss].filter(Boolean)) {
        for (const client of wssInstance.clients || []) {
          try {
            client.close(1001, "Server shutting down");
          } catch {
            // A closing socket cannot prevent the rest of the process shutdown.
          }
        }
        await new Promise((resolve) => {
          try {
            wssInstance.close(() => resolve());
          } catch {
            resolve();
          }
        });
      }
    } catch (error) {
      logger.warn("WebSocket shutdown warning:", error && error.message ? error.message : error);
    }

    await new Promise((resolve) => {
      let settled = false;
      let forceCloseTimer;
      const complete = () => {
        if (settled) return;
        settled = true;
        if (forceCloseTimer) clearTimeoutFn(forceCloseTimer);
        resolve();
      };
      forceCloseTimer = setTimeoutFn(complete, 8_000);
      forceCloseTimer?.unref?.();
      try {
        server.close(complete);
      } catch {
        complete();
      }
    });

    try {
      await aiModelClient.close();
    } catch (error) {
      logger.warn("AI Harness shutdown warning:", error && error.message ? error.message : error);
    }

    try {
      await aiExecutionGateway.close();
    } catch (error) {
      logger.warn("AI capability execution gateway shutdown warning:", error && error.message ? error.message : error);
    }

    try {
      await closeDatabase();
    } catch (error) {
      logger.error("Database close failed:", error && error.message ? error.message : error);
    }

    processExit(0);
  }

  function installSignalHandlers(processRef = process) {
    processRef.on("SIGTERM", () => { void shutdown("SIGTERM"); });
    processRef.on("SIGINT", () => { void shutdown("SIGINT"); });
  }

  return {
    installSignalHandlers,
    shutdown,
    start,
    status: () => ({ shuttingDown, timeoutMonitorActive: Boolean(aiJobTimeoutTimer) }),
  };
}

module.exports = { createServerLifecycle };

/**
 * Same-origin SPA hosting for internal SQLite trial / single-process production.
 * Frontend uses BASE_URL='' and HashRouter; only "/" + assets need serving.
 */

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ apiRoot?: string, isProd?: boolean }} [options]
 */
function resolveWebDist(env = process.env, { apiRoot } = {}) {
  if (env.WEB_DIST && String(env.WEB_DIST).trim()) {
    return path.resolve(String(env.WEB_DIST).trim());
  }
  const root = apiRoot || path.resolve(__dirname, "..", "..");
  return path.resolve(root, "..", "web", "dist");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ apiRoot?: string, isProd?: boolean, fsImpl?: typeof fs }} [options]
 */
function shouldServeWeb(env = process.env, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const isProd =
    typeof options.isProd === "boolean"
      ? options.isProd
      : String(env.NODE_ENV || "development") === "production";
  const flag = String(env.SERVE_WEB || "").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "on" || flag === "yes") return true;
  // Default: production auto-serve when build output is present.
  if (!isProd) return false;
  const dist = resolveWebDist(env, { apiRoot: options.apiRoot });
  return fsImpl.existsSync(path.join(dist, "index.html"));
}

/**
 * Helmet CSP directives safe enough for the Vite production SPA on same origin.
 */
function spaContentSecurityPolicyDirectives() {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "ws:", "wss:"],
    workerSrc: ["'self'", "blob:"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  };
}

/**
 * API-only CSP (JSON, no scripts).
 */
function apiOnlyContentSecurityPolicyDirectives() {
  return {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
  };
}

/**
 * Mount static assets + index.html. Call before the 404 catch-all, after API routes.
 * @param {import("express").Express} app
 * @param {string} webDist
 * @param {{ isProd?: boolean }} [options]
 * @returns {{ webDist: string, indexHtml: string }}
 */
function mountStaticWeb(app, webDist, { isProd = false } = {}) {
  const indexHtml = path.join(webDist, "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`WEB_DIST index.html not found: ${indexHtml}`);
  }

  app.use(
    express.static(webDist, {
      index: false,
      fallthrough: true,
      maxAge: isProd ? "1h" : 0,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  // HashRouter only needs the shell at "/"; unknown non-API GETs still get the SPA shell
  // so a refresh on a mistaken path is recoverable.
  app.get(/^(?!\/api(?:\/|$)|\/ws(?:\/|$)).*/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(indexHtml, (error) => {
      if (error) next(error);
    });
  });

  return { webDist, indexHtml };
}

module.exports = {
  apiOnlyContentSecurityPolicyDirectives,
  mountStaticWeb,
  resolveWebDist,
  shouldServeWeb,
  spaContentSecurityPolicyDirectives,
};

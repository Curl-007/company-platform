const crypto = require("node:crypto");

function createNextId({ now = Date.now, randomUUID = crypto.randomUUID } = {}) {
  return async function nextId(prefix) {
    const normalizedPrefix = String(prefix || "ID").trim().toUpperCase();
    const timestamp = Number(now()).toString(36).toUpperCase();
    const entropy = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    return `${normalizedPrefix}-${timestamp}-${entropy}`;
  };
}

module.exports = { createNextId };

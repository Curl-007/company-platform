const crypto = require("crypto");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createIdempotency({ row, run, parse, now, fail }) {
  async function beginIdempotentRequest(req, res, operation) {
    const key = String(req.get("Idempotency-Key") || "").trim();
    if (!key) return { commit() {}, abort() {} };
    if (key.length > 128) {
      fail(res, 400, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be 128 characters or fewer.");
      return null;
    }
    const actorId = req.user.id;
    const requestHash = crypto.createHash("sha256").update(stableJson(req.body || {})).digest("hex");
    const existing = await row(
      "SELECT * FROM idempotency_keys WHERE actor_id = @actorId AND operation = @operation AND idempotency_key = @key",
      { actorId, operation, key },
    );
    if (existing) {
      if (existing.request_hash !== requestHash) {
        fail(res, 409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with a different request.");
      } else if (existing.response_status) {
        res.status(existing.response_status).json(parse(existing.response_body, {}));
      } else {
        fail(res, 409, "IDEMPOTENCY_IN_PROGRESS", "A request with this Idempotency-Key is still being processed.");
      }
      return null;
    }
    const reservation = await run(
      `INSERT OR IGNORE INTO idempotency_keys
       (actor_id, operation, idempotency_key, request_hash, response_status, response_body, created_at, updated_at)
       VALUES (@actorId, @operation, @key, @requestHash, NULL, NULL, @createdAt, @updatedAt)`,
      { actorId, operation, key, requestHash, createdAt: now(), updatedAt: now() },
    );
    if (reservation.changes !== 1) return await beginIdempotentRequest(req, res, operation);
    return {
      async commit(status, response) {
        await run(
          `UPDATE idempotency_keys SET response_status = @status, response_body = @body, updated_at = @updatedAt
           WHERE actor_id = @actorId AND operation = @operation AND idempotency_key = @key`,
          { actorId, operation, key, status, body: JSON.stringify(response), updatedAt: now() },
        );
      },
      async abort() {
        await run(
          `DELETE FROM idempotency_keys
           WHERE actor_id = @actorId AND operation = @operation AND idempotency_key = @key AND response_status IS NULL`,
          { actorId, operation, key },
        );
      },
    };
  }

  return { stableJson, beginIdempotentRequest };
}

module.exports = { stableJson, createIdempotency };

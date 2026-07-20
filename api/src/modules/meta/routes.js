const express = require("express");

function createMetaRouter({ ok, publicEnums }) {
  const router = express.Router();

  router.get("/meta/enums", (_req, res) => {
    res.json(ok({
      version: "2026-07-15",
      source: "api/src/domain/enums.js",
      enums: publicEnums(),
    }));
  });

  return router;
}

module.exports = { createMetaRouter };

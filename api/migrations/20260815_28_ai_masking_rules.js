module.exports = {
  id: "20260815_28_ai_masking_rules",
  up({ db, now }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_masking_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        mode TEXT NOT NULL,
        pattern TEXT NOT NULL,
        replacement TEXT NOT NULL DEFAULT '',
        is_regex INTEGER NOT NULL DEFAULT 0,
        case_sensitive INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_masking_rules_enabled
        ON ai_masking_rules(enabled, name);
    `);
    // Seed exactly the three default rules, idempotently: INSERT OR IGNORE on
    // the UNIQUE(name) constraint is a no-op for databases that already hold
    // them (or where an admin renamed a seed into something else).
    const stamp = now();
    const seed = db.prepare(`INSERT OR IGNORE INTO ai_masking_rules
      (id, name, mode, pattern, replacement, is_regex, case_sensitive, enabled, created_at, updated_at)
      VALUES (@id, @name, @mode, @pattern, @replacement, @isRegex, @caseSensitive, @enabled, @createdAt, @updatedAt)`);
    seed.run({
      id: "MASK-DEFAULT-API-KEY",
      name: "API 密钥防泄",
      mode: "block",
      pattern: "sk-[A-Za-z0-9_-]{20,}",
      replacement: "",
      isRegex: 1,
      caseSensitive: 0,
      enabled: 1,
      createdAt: stamp,
      updatedAt: stamp,
    });
    seed.run({
      id: "MASK-DEFAULT-JWT",
      name: "JWT 令牌防泄",
      mode: "block",
      pattern: "eyJ[A-Za-z0-9_-]{20,}\\.",
      replacement: "",
      isRegex: 1,
      caseSensitive: 0,
      enabled: 1,
      createdAt: stamp,
      updatedAt: stamp,
    });
    seed.run({
      id: "MASK-DEFAULT-REPLACE",
      name: "示例:代号替换",
      mode: "replace",
      pattern: "公司机密代号",
      replacement: "[已脱敏]",
      isRegex: 0,
      caseSensitive: 0,
      // Disabled by default: this row is an administrator-facing example of
      // the replace mode, not a live policy.
      enabled: 0,
      createdAt: stamp,
      updatedAt: stamp,
    });
  },
};

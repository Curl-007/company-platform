function createNextId({ rows }) {
  return async function nextId(prefix, table, column = "id") {
    const existing = await rows(`SELECT ${column} AS id FROM ${table}`);
    const max = existing.reduce((value, item) => {
      const numeric = Number(String(item.id || "").replace(`${prefix}-`, ""));
      return Number.isFinite(numeric) ? Math.max(value, numeric) : value;
    }, 0);
    return `${prefix}-${String(max + 1).padStart(3, "0")}`;
  };
}

module.exports = { createNextId };

function isUniqueConstraintError(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  if (String(error.code || "").startsWith("SQLITE_CONSTRAINT_UNIQUE")) return true;
  return String(error.code || "") === "SQLITE_CONSTRAINT"
    && /unique constraint failed/i.test(String(error.message || ""));
}

function conflictError(message = "The value is already in use.") {
  const error = new Error(message);
  error.code = "CONFLICT";
  error.status = 409;
  return error;
}

module.exports = { conflictError, isUniqueConstraintError };

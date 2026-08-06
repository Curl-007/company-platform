const { addColumnIfMissing } = require("../src/db/sqliteSchema");

module.exports = {
  id: "20260723_23_user_token_version",
  up({ db }) {
    addColumnIfMissing(db, "users", "token_version", "INTEGER NOT NULL DEFAULT 0");
  },
};

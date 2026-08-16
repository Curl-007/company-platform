function createAuthRepository({ row, run }) {
  return {
    async findByEmail(email) {
      return await row("SELECT * FROM users WHERE email = @email", { email });
    },
    async findById(id) {
      return await row("SELECT * FROM users WHERE id = @id", { id });
    },
    async findOtherByEmail(email, id) {
      return await row("SELECT id FROM users WHERE email = @email AND id != @id", { email, id });
    },
    async updateProfile(id, profile) {
      await run(
        `UPDATE users
         SET name = @name, email = @email, phone = @phone, position = @position, department = @department, bio = @bio
         WHERE id = @id`,
        { id, ...profile },
      );
      return this.findById(id);
    },
    // Bumping token_version together with the hash revokes every outstanding
    // session (same contract as the admin password reset in team routes).
    async updatePassword(id, passwordHash) {
      await run(
        "UPDATE users SET password_hash = @passwordHash, token_version = token_version + 1 WHERE id = @id",
        { id, passwordHash },
      );
      return this.findById(id);
    },
  };
}

module.exports = { createAuthRepository };

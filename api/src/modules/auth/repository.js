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
  };
}

module.exports = { createAuthRepository };

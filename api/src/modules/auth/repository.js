function createAuthRepository({ row, run }) {
  return {
    findByEmail(email) {
      return row("SELECT * FROM users WHERE email = @email", { email });
    },
    findById(id) {
      return row("SELECT * FROM users WHERE id = @id", { id });
    },
    findOtherByEmail(email, id) {
      return row("SELECT id FROM users WHERE email = @email AND id != @id", { email, id });
    },
    updateProfile(id, profile) {
      run(
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

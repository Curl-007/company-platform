const crypto = require("crypto");

const PREFIX = "enc:v1";

function createSecretCodec(masterKey) {
  const source = String(masterKey || "").trim();
  if (!source) {
    return {
      available: false,
      encrypt() { throw new Error("Secret encryption key is not configured."); },
      decrypt() { return ""; },
    };
  }

  const key = crypto.createHash("sha256").update(source).digest();
  return {
    available: true,
    encrypt(value) {
      if (!value) return "";
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [PREFIX, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(":");
    },
    decrypt(value) {
      const parts = String(value || "").split(":");
      if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) return "";
      try {
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parts[2], "base64url"));
        decipher.setAuthTag(Buffer.from(parts[4], "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
      } catch {
        return "";
      }
    },
  };
}

module.exports = { createSecretCodec };

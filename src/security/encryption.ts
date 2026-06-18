import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

export function encryptSecret(plainText: string, encryptionSecret: string): string {
  const key = deriveKey(encryptionSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string, encryptionSecret: string): string {
  const [ivRaw, authTagRaw, encryptedRaw] = payload.split(".");

  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted payload");
  }

  const key = deriveKey(encryptionSecret);
  const decipher = createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

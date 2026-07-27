import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

export type VaultCipher = {
  cipherText: string;
  iv: string;
  authTag: string;
};

const SALT = "votezpro:vault:v1";
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, KEY_LEN);
}

/**
 * AES-256-GCM encryption with a per-row random IV. The output is fully
 * self-contained: cipherText + iv + authTag. The key is derived via scrypt
 * from API_VAULT_SECRET_KEY, distinct from the organizer-secrets key.
 */
export function encryptVaultPayload(plaintext: string, secret: string): VaultCipher {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    cipherText: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex")
  };
}

export function decryptVaultPayload(payload: VaultCipher, secret: string): string {
  const key = deriveKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

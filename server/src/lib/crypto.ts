import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

const ALGO = "aes-256-gcm";

function loadKey(base64: string, varName: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new Error(`${varName} must decode to exactly 32 bytes (AES-256)`);
  }
  return key;
}

const currentKey = loadKey(config.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
// Set only during a key rotation — see scripts/rotate-token-encryption-key.ts. Lets ciphertext
// still encrypted under the old key keep decrypting while the migration re-encrypts everything
// under the new one; remove this env var once that script reports zero rows remaining.
const previousKey = config.TOKEN_ENCRYPTION_KEY_PREVIOUS ? loadKey(config.TOKEN_ENCRYPTION_KEY_PREVIOUS, "TOKEN_ENCRYPTION_KEY_PREVIOUS") : null;

/** Encrypts a secret (OAuth token, etc.) for storage. Format: iv:authTag:ciphertext, all base64. Always uses the current key. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, currentKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, dataB64: string): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Tries the current key first, then the previous key (if a rotation is in progress) — no
 * version marker needed in the stored format, since AES-GCM's auth tag makes decrypting with
 * the wrong key a clean, safe failure (setAuthTag/final() throws) rather than garbled output.
 */
export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  try {
    return decryptWith(currentKey, ivB64, tagB64, dataB64);
  } catch (err) {
    if (!previousKey) throw err;
    return decryptWith(previousKey, ivB64, tagB64, dataB64);
  }
}

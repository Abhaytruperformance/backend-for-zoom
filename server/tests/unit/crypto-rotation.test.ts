import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";

// crypto.ts reads its keys once at module load, so switching "current"/"previous" key
// configuration between scenarios needs a fresh module instance each time — vi.resetModules()
// plus a fresh dynamic import, rather than trying to mutate an already-loaded module's keys.

const KEY_A = randomBytes(32).toString("base64"); // the "old" key in rotation scenarios
const KEY_B = randomBytes(32).toString("base64"); // the "new" key

async function freshCrypto(current: string, previous: string) {
  vi.resetModules();
  vi.doMock("../../src/config.js", () => ({ config: { TOKEN_ENCRYPTION_KEY: current, TOKEN_ENCRYPTION_KEY_PREVIOUS: previous } }));
  return import("../../src/lib/crypto.js");
}

describe("crypto.ts — encryption key rotation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../../src/config.js");
  });

  it("round-trips a secret under a single (non-rotating) key", async () => {
    const { encryptSecret, decryptSecret } = await freshCrypto(KEY_A, "");
    const stored = encryptSecret("my-refresh-token");
    expect(decryptSecret(stored)).toBe("my-refresh-token");
  });

  it("during a rotation, decrypts data encrypted under the old key via the previous-key fallback", async () => {
    // Data written before the rotation, under what was then the current key (KEY_A).
    const oldCrypto = await freshCrypto(KEY_A, "");
    const storedUnderOldKey = oldCrypto.encryptSecret("pre-rotation-token");

    // App restarted with the new key as current, old key as previous.
    const rotatingCrypto = await freshCrypto(KEY_B, KEY_A);
    expect(rotatingCrypto.decryptSecret(storedUnderOldKey)).toBe("pre-rotation-token");
  });

  it("new writes during a rotation use the new (current) key, not the previous one", async () => {
    const rotatingCrypto = await freshCrypto(KEY_B, KEY_A);
    const storedUnderNewKey = rotatingCrypto.encryptSecret("post-rotation-token");

    // A module instance that only has KEY_B (no previous key) must still be able to read it —
    // proves the write actually happened under the current key, not accidentally the previous one.
    const newOnlyCrypto = await freshCrypto(KEY_B, "");
    expect(newOnlyCrypto.decryptSecret(storedUnderNewKey)).toBe("post-rotation-token");
  });

  it("throws (never returns garbage) when the stored data matches neither the current nor a configured previous key", async () => {
    const KEY_C = randomBytes(32).toString("base64"); // unrelated to what encrypted the data below
    const oldCrypto = await freshCrypto(KEY_A, "");
    const stored = oldCrypto.encryptSecret("orphaned-token");

    const wrongKeyCrypto = await freshCrypto(KEY_B, KEY_C); // neither key matches KEY_A
    expect(() => wrongKeyCrypto.decryptSecret(stored)).toThrow();
  });

  it("throws when no previous key is configured and the current key can't decrypt old data", async () => {
    const oldCrypto = await freshCrypto(KEY_A, "");
    const stored = oldCrypto.encryptSecret("token-without-migration-path");

    const noFallbackCrypto = await freshCrypto(KEY_B, ""); // rotated but TOKEN_ENCRYPTION_KEY_PREVIOUS never set
    expect(() => noFallbackCrypto.decryptSecret(stored)).toThrow();
  });
});

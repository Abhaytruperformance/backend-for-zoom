/**
 * Re-encrypts every stored OAuth token (Zoom + mailbox) under a new TOKEN_ENCRYPTION_KEY.
 *
 * Rotation procedure:
 *   1. Generate a new key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *   2. Deploy with TOKEN_ENCRYPTION_KEY = the new key, TOKEN_ENCRYPTION_KEY_PREVIOUS = the old
 *      key. The app keeps working immediately — decryptSecret() falls back to the previous key
 *      for anything not yet re-encrypted (see lib/crypto.ts).
 *   3. Run this script once, pointed at the same environment (needs both env vars set).
 *   4. Once it reports 0 remaining on the old key, remove TOKEN_ENCRYPTION_KEY_PREVIOUS.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env scripts/rotate-token-encryption-key.ts
 */
import { prisma } from "../src/db.js";
import { config } from "../src/config.js";
import { encryptSecret, decryptSecret } from "../src/lib/crypto.js";

async function rotateZoomConnections(): Promise<{ total: number; rotated: number }> {
  const rows = await prisma.zoomConnection.findMany({ select: { id: true, accessTokenEnc: true, refreshTokenEnc: true } });
  let rotated = 0;
  for (const row of rows) {
    await prisma.zoomConnection.update({
      where: { id: row.id },
      data: {
        accessTokenEnc: encryptSecret(decryptSecret(row.accessTokenEnc)),
        refreshTokenEnc: encryptSecret(decryptSecret(row.refreshTokenEnc)),
      },
    });
    rotated++;
  }
  return { total: rows.length, rotated };
}

async function rotateMailboxConnections(): Promise<{ total: number; rotated: number }> {
  const rows = await prisma.mailboxConnection.findMany({ select: { id: true, accessTokenEnc: true, refreshTokenEnc: true } });
  let rotated = 0;
  for (const row of rows) {
    await prisma.mailboxConnection.update({
      where: { id: row.id },
      data: {
        accessTokenEnc: encryptSecret(decryptSecret(row.accessTokenEnc)),
        refreshTokenEnc: encryptSecret(decryptSecret(row.refreshTokenEnc)),
      },
    });
    rotated++;
  }
  return { total: rows.length, rotated };
}

async function main() {
  if (!config.TOKEN_ENCRYPTION_KEY_PREVIOUS) {
    console.error("TOKEN_ENCRYPTION_KEY_PREVIOUS is not set — nothing to rotate from. Set it to the OLD key, keep TOKEN_ENCRYPTION_KEY as the NEW one, then re-run.");
    process.exit(1);
  }

  const zoom = await rotateZoomConnections();
  const mailbox = await rotateMailboxConnections();

  console.log(`ZoomConnection: ${zoom.rotated}/${zoom.total} re-encrypted`);
  console.log(`MailboxConnection: ${mailbox.rotated}/${mailbox.total} re-encrypted`);
  console.log("\nAll rows now decrypt under the current key. Once this deploy is confirmed healthy, remove TOKEN_ENCRYPTION_KEY_PREVIOUS.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

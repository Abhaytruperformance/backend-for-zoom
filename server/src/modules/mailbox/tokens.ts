import { prisma } from "../../db.js";
import { decryptSecret, encryptSecret } from "../../lib/crypto.js";
import type { MailboxProvider } from "@prisma/client";

/**
 * Returns a valid access token for a user's connected mailbox, refreshing on
 * expiry. On refresh failure: MailboxConnection -> REAUTH_REQUIRED (never a
 * generic failure) so the UI can prompt a specific reconnect action.
 */
export async function getValidMailboxAccessToken(
  userId: string,
  provider: MailboxProvider,
  buildRefreshRequest: (refreshToken: string) => { tokenUrl: string; body: URLSearchParams; headers?: Record<string, string> }
): Promise<{ accessToken: string; connectionId: string }> {
  const conn = await prisma.mailboxConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!conn) throw Object.assign(new Error(`${provider} mailbox not connected`), { status: 409 });
  if (conn.status === "REVOKED") throw Object.assign(new Error(`${provider} mailbox connection revoked`), { status: 409 });

  const stillValid = conn.expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid && conn.status === "ACTIVE") {
    return { accessToken: decryptSecret(conn.accessTokenEnc), connectionId: conn.id };
  }

  const req = buildRefreshRequest(decryptSecret(conn.refreshTokenEnc));
  try {
    const res = await fetch(req.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(req.headers ?? {}) },
      body: req.body.toString(),
    });
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

    await prisma.mailboxConnection.update({
      where: { id: conn.id },
      data: {
        accessTokenEnc: encryptSecret(body.access_token),
        refreshTokenEnc: body.refresh_token ? encryptSecret(body.refresh_token) : conn.refreshTokenEnc,
        expiresAt: new Date(Date.now() + body.expires_in * 1000),
        status: "ACTIVE",
        lastValidatedAt: new Date(),
        lastAuthError: null,
      },
    });
    return { accessToken: body.access_token, connectionId: conn.id };
  } catch (err) {
    await prisma.mailboxConnection.update({
      where: { id: conn.id },
      data: { status: "REAUTH_REQUIRED", lastAuthError: err instanceof Error ? err.message : "refresh failed" },
    });
    throw Object.assign(new Error(`${provider} mailbox needs to be reconnected`), { status: 409, reauthRequired: true });
  }
}

export async function markReauthRequired(connectionId: string, error: string): Promise<void> {
  await prisma.mailboxConnection.update({ where: { id: connectionId }, data: { status: "REAUTH_REQUIRED", lastAuthError: error } });
}

export async function markValidated(connectionId: string): Promise<void> {
  await prisma.mailboxConnection.update({ where: { id: connectionId }, data: { lastValidatedAt: new Date(), lastUsedAt: new Date() } });
}

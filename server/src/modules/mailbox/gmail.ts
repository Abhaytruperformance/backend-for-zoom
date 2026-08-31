import { config } from "../../config.js";
import { getValidMailboxAccessToken, markValidated } from "./tokens.js";
import type { ReconcileResult } from "./reconcile.js";

function googleRefreshRequest(refreshToken: string) {
  return {
    tokenUrl: "https://oauth2.googleapis.com/token",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
    }),
  };
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMime(params: { to: string[]; subject: string; body: string; internetMessageId: string; fromEmail: string }): string {
  // Subject is free text (unlike `to`, which is zod .email()-validated) — strip CR/LF so it
  // can't inject extra MIME headers into the message we build below.
  const subject = params.subject.replace(/[\r\n]+/g, " ");
  return [
    `From: ${params.fromEmail}`,
    `To: ${params.to.join(", ")}`,
    `Subject: ${subject}`,
    `Message-ID: <${params.internetMessageId}>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    params.body,
  ].join("\r\n");
}

export async function sendViaGmail(params: {
  userId: string;
  fromEmail: string;
  to: string[];
  subject: string;
  body: string;
  internetMessageId: string;
}): Promise<{ providerMessageId: string }> {
  const { accessToken, connectionId } = await getValidMailboxAccessToken(params.userId, "GOOGLE", googleRefreshRequest);
  const raw = base64url(buildMime(params));

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if (res.status === 401) {
    throw Object.assign(new Error("Gmail send unauthorized"), { authFailure: true });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Gmail send failed: ${res.status}`), { ambiguous: res.status >= 500 });
  }

  await markValidated(connectionId);
  const body = (await res.json()) as { id: string };
  return { providerMessageId: body.id };
}

/**
 * Reconciliation: was a message with this Message-ID already sent?
 *
 * Deliberately does NOT use `?q=rfc822msgid:...`. Google documents that the `q` parameter
 * "cannot be used when accessing the api using the gmail.metadata scope", and gmail.metadata
 * is the only read scope this app requests. The q-based version therefore always failed with
 * a 403 and — because the old code turned any non-OK response into `found: false` — reported
 * "not sent" every single time. That silently disabled duplicate-send protection: an
 * ambiguous failure after Gmail had actually accepted the message would send it a second time.
 *
 * Instead: list recent SENT ids (labelIds is permitted under the metadata scope) and read the
 * Message-ID header of each with format=metadata. Least privilege stays intact.
 */
const RECONCILE_SCAN_LIMIT = 40;

export async function reconcileGmailSend(userId: string, internetMessageId: string): Promise<ReconcileResult> {
  const { accessToken } = await getValidMailboxAccessToken(userId, "GOOGLE", googleRefreshRequest);
  const auth = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=${RECONCILE_SCAN_LIMIT}`,
    { headers: auth }
  );
  // "Unknown" is not "not sent". Anything other than a clean answer must stay unknown so the
  // caller refuses to re-send rather than risking a duplicate to a client.
  if (!listRes.ok) {
    return { status: "unknown", reason: `SENT list failed: ${listRes.status}` };
  }

  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = list.messages ?? [];

  for (const { id } of ids) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Message-ID`,
      { headers: auth }
    );
    if (!msgRes.ok) return { status: "unknown", reason: `metadata fetch failed: ${msgRes.status}` };

    const msg = (await msgRes.json()) as { payload?: { headers?: Array<{ name: string; value: string }> } };
    const header = msg.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value?.trim();
    if (header && header.replace(/^<|>$/g, "") === internetMessageId) {
      return { status: "found", providerMessageId: id };
    }
  }

  // Bounded scan: if the mailbox has sent more than RECONCILE_SCAN_LIMIT messages since our
  // attempt, the message could be just past the window — that is unknown, not absent.
  if (ids.length >= RECONCILE_SCAN_LIMIT) {
    return { status: "unknown", reason: `scanned newest ${RECONCILE_SCAN_LIMIT} sent messages without a match` };
  }
  return { status: "not_found" };
}

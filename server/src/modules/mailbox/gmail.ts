import { config } from "../../config.js";
import { getValidMailboxAccessToken, markValidated } from "./tokens.js";

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
  return [
    `From: ${params.fromEmail}`,
    `To: ${params.to.join(", ")}`,
    `Subject: ${params.subject}`,
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

/** Reconciliation: was a message with this Message-ID already sent? Uses gmail.metadata (headers only, no body). */
export async function reconcileGmailSend(userId: string, internetMessageId: string): Promise<{ found: boolean; providerMessageId?: string }> {
  const { accessToken } = await getValidMailboxAccessToken(userId, "GOOGLE", googleRefreshRequest);
  const q = encodeURIComponent(`rfc822msgid:${internetMessageId}`);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { found: false };
  const body = (await res.json()) as { messages?: Array<{ id: string }> };
  if (body.messages && body.messages.length > 0) {
    return { found: true, providerMessageId: body.messages[0].id };
  }
  return { found: false };
}

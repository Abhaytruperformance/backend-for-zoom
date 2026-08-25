import { config } from "../../config.js";
import { getValidMailboxAccessToken, markValidated } from "./tokens.js";

function microsoftRefreshRequest(refreshToken: string) {
  return {
    tokenUrl: `https://login.microsoftonline.com/${config.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.MICROSOFT_CLIENT_ID,
      client_secret: config.MICROSOFT_CLIENT_SECRET,
      scope: "offline_access Mail.Send Mail.ReadBasic User.Read",
    }),
  };
}

/**
 * Graph's sendMail doesn't let a client set the standard Message-ID header
 * (it's server-generated), so reconciliation instead searches for an
 * invisible marker we append to the body — verified against a real mailbox
 * via the gated integration test, not just assumed from docs.
 */
function reconciliationMarker(internetMessageId: string): string {
  return `​[ref:${internetMessageId}]`;
}

export async function sendViaGraph(params: {
  userId: string;
  to: string[];
  subject: string;
  body: string;
  internetMessageId: string;
}): Promise<{ providerMessageId: string | null }> {
  const { accessToken, connectionId } = await getValidMailboxAccessToken(params.userId, "MICROSOFT", microsoftRefreshRequest);

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: "Text", content: `${params.body}\n${reconciliationMarker(params.internetMessageId)}` },
        toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
        internetMessageHeaders: [{ name: "x-zri-send-id", value: params.internetMessageId }],
      },
      saveToSentItems: true,
    }),
  });

  if (res.status === 401) {
    throw Object.assign(new Error("Graph send unauthorized"), { authFailure: true });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Graph send failed: ${res.status}`), { ambiguous: res.status >= 500 });
  }

  await markValidated(connectionId);
  // sendMail returns 202 Accepted with no body — Graph doesn't hand back the created message id synchronously.
  return { providerMessageId: null };
}

export async function reconcileGraphSend(userId: string, internetMessageId: string): Promise<{ found: boolean; providerMessageId?: string }> {
  const { accessToken } = await getValidMailboxAccessToken(userId, "MICROSOFT", microsoftRefreshRequest);
  const search = encodeURIComponent(`"${internetMessageId}"`);
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$search=${search}&$select=id`, {
    headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: "eventual" },
  });
  if (!res.ok) return { found: false };
  const body = (await res.json()) as { value?: Array<{ id: string }> };
  if (body.value && body.value.length > 0) {
    return { found: true, providerMessageId: body.value[0].id };
  }
  return { found: false };
}

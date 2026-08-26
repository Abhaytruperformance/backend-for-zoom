import type { Request, Response } from "express";
import { config, frontendUrl } from "../../config.js";
import { prisma } from "../../db.js";
import { encryptSecret } from "../../lib/crypto.js";
import { writeAudit } from "../../lib/audit.js";
import { issueOAuthState, verifyOAuthState } from "../../lib/oauthState.js";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.metadata", // least-privilege: headers only, for send-reconciliation search
].join(" ");

export const MICROSOFT_SCOPES = ["offline_access", "Mail.Send", "Mail.ReadBasic", "User.Read"].join(" ");

const GOOGLE_STATE_COOKIE = "mailbox_google_oauth_nonce";
const MICROSOFT_STATE_COOKIE = "mailbox_microsoft_oauth_nonce";

// These callbacks are full-page browser redirects (the frontend does window.location, not
// fetch), so every exit path must send the browser back into the app — never res.json, or the
// user is stranded on a bare JSON page with no way back in.
function redirectToMailbox(query: Record<string, string>): string {
  return `${frontendUrl}/mailbox?${new URLSearchParams(query).toString()}`;
}

export function googleConnectHandler(req: Request, res: Response): void {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  const { state, codeChallenge } = issueOAuthState(res, GOOGLE_STATE_COOKIE, { userId: req.user!.userId, tenantId: req.user!.tenantId });
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  res.json({ authorizeUrl: url.toString() });
}

export async function googleCallbackHandler(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query;
  if (typeof error === "string") {
    res.redirect(redirectToMailbox({ error }));
    return;
  }
  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(redirectToMailbox({ error: "Missing code/state from Google" }));
    return;
  }
  const claims = verifyOAuthState<{ userId: string; tenantId: string }>(req, res, GOOGLE_STATE_COOKIE, state);
  if (!claims) {
    res.redirect(redirectToMailbox({ error: "Invalid or expired connect link — try again" }));
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: config.GOOGLE_REDIRECT_URI,
        code_verifier: claims.codeVerifier,
      }),
    });
    if (!tokenRes.ok) {
      res.redirect(redirectToMailbox({ error: "Google token exchange failed" }));
      return;
    }
    const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    if (!tokens.refresh_token) {
      res.redirect(redirectToMailbox({ error: "Google didn't return a refresh token — revoke app access in your Google account settings and reconnect" }));
      return;
    }

    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as { emailAddress: string };

    await prisma.mailboxConnection.upsert({
      where: { userId_provider: { userId: claims.userId, provider: "GOOGLE" } },
      create: {
        userId: claims.userId,
        provider: "GOOGLE",
        email: profile.emailAddress,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: GOOGLE_SCOPES,
        status: "ACTIVE",
        lastValidatedAt: new Date(),
      },
      update: {
        email: profile.emailAddress,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: "ACTIVE",
        lastValidatedAt: new Date(),
        lastAuthError: null,
      },
    });

    await writeAudit({ tenantId: claims.tenantId, actorUserId: claims.userId, entityType: "MailboxConnection", entityId: profile.emailAddress, action: "CONNECTED_GOOGLE" });
    res.redirect(redirectToMailbox({ connected: "google" }));
  } catch {
    res.redirect(redirectToMailbox({ error: "Gmail connection failed — try again" }));
  }
}

export function microsoftConnectHandler(req: Request, res: Response): void {
  const url = new URL(`https://login.microsoftonline.com/${config.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", config.MICROSOFT_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.MICROSOFT_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MICROSOFT_SCOPES);
  const { state, codeChallenge } = issueOAuthState(res, MICROSOFT_STATE_COOKIE, { userId: req.user!.userId, tenantId: req.user!.tenantId });
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  res.json({ authorizeUrl: url.toString() });
}

export async function microsoftCallbackHandler(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query;
  if (typeof error === "string") {
    res.redirect(redirectToMailbox({ error }));
    return;
  }
  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(redirectToMailbox({ error: "Missing code/state from Microsoft" }));
    return;
  }
  const claims = verifyOAuthState<{ userId: string; tenantId: string }>(req, res, MICROSOFT_STATE_COOKIE, state);
  if (!claims) {
    res.redirect(redirectToMailbox({ error: "Invalid or expired connect link — try again" }));
    return;
  }

  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${config.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.MICROSOFT_CLIENT_ID,
        client_secret: config.MICROSOFT_CLIENT_SECRET,
        redirect_uri: config.MICROSOFT_REDIRECT_URI,
        scope: MICROSOFT_SCOPES,
        code_verifier: claims.codeVerifier,
      }),
    });
    if (!tokenRes.ok) {
      res.redirect(redirectToMailbox({ error: "Microsoft token exchange failed" }));
      return;
    }
    const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    if (!tokens.refresh_token) {
      res.redirect(redirectToMailbox({ error: "Microsoft didn't return a refresh token" }));
      return;
    }

    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const me = (await meRes.json()) as { mail?: string; userPrincipalName: string };
    const email = me.mail ?? me.userPrincipalName;

    await prisma.mailboxConnection.upsert({
      where: { userId_provider: { userId: claims.userId, provider: "MICROSOFT" } },
      create: {
        userId: claims.userId,
        provider: "MICROSOFT",
        email,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: MICROSOFT_SCOPES,
        status: "ACTIVE",
        lastValidatedAt: new Date(),
      },
      update: {
        email,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: "ACTIVE",
        lastValidatedAt: new Date(),
        lastAuthError: null,
      },
    });

    await writeAudit({ tenantId: claims.tenantId, actorUserId: claims.userId, entityType: "MailboxConnection", entityId: email, action: "CONNECTED_MICROSOFT" });
    res.redirect(redirectToMailbox({ connected: "microsoft" }));
  } catch {
    res.redirect(redirectToMailbox({ error: "Microsoft connection failed — try again" }));
  }
}

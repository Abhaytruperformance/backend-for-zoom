import type { Request, Response } from "express";
import { config, frontendUrl } from "../../config.js";
import { prisma } from "../../db.js";
import { encryptSecret } from "../../lib/crypto.js";
import { writeAudit } from "../../lib/audit.js";
import { issueOAuthState, verifyOAuthState } from "../../lib/oauthState.js";
import { exchangeZoomAuthCode, getZoomUserInfo } from "./client.js";

const STATE_COOKIE = "zoom_oauth_nonce";

/**
 * Least-privilege scopes, mapped to the endpoints they gate (see plan doc) —
 * spot-check these against the live Marketplace app on first real connect.
 */
export const ZOOM_SCOPES = [
  "user:read:user",
  "meeting:read:meeting",
  "meeting:read:list_meetings",
  "cloud_recording:read:list_recording_files",
  "cloud_recording:read:content", // Zoom's actual current name for what the plan doc guessed as "cloud_recording:read:recording"
  "meeting:read:list_past_participants",
].join(" ");

export function zoomConnectHandler(req: Request, res: Response): void {
  const user = req.user!;
  const { state, codeChallenge } = issueOAuthState(res, STATE_COOKIE, { tenantId: user.tenantId, userId: user.userId });
  const url = new URL("https://zoom.us/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.ZOOM_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.ZOOM_REDIRECT_URI);
  // Actually request the least-privilege list. Previously this was never sent, so Zoom
  // granted whatever the Marketplace app had configured and ZOOM_SCOPES was decorative.
  url.searchParams.set("scope", ZOOM_SCOPES);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  res.json({ authorizeUrl: url.toString() });
}

export async function zoomCallbackHandler(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query;

  // This is a full-page browser redirect (the frontend does window.location, not fetch), so
  // every exit path here must send the browser back into the app — never res.json, or the
  // user is stranded on a bare JSON page with no way back in.
  if (typeof error === "string") {
    res.redirect(`${frontendUrl}/zoom?error=${encodeURIComponent(error)}`);
    return;
  }
  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(`${frontendUrl}/zoom?error=${encodeURIComponent("Missing code/state from Zoom")}`);
    return;
  }

  const claims = verifyOAuthState<{ tenantId: string; userId: string }>(req, res, STATE_COOKIE, state);
  if (!claims) {
    res.redirect(`${frontendUrl}/zoom?error=${encodeURIComponent("Invalid or expired connect link — try again")}`);
    return;
  }

  let tokens: Awaited<ReturnType<typeof exchangeZoomAuthCode>>;
  let zoomUser: Awaited<ReturnType<typeof getZoomUserInfo>>;
  try {
    tokens = await exchangeZoomAuthCode(code, claims.codeVerifier);
    zoomUser = await getZoomUserInfo(tokens.access_token);
  } catch {
    res.redirect(`${frontendUrl}/zoom?error=${encodeURIComponent("Zoom connection failed — try again")}`);
    return;
  }

  await prisma.zoomConnection.upsert({
    where: { tenantId_zoomUserId: { tenantId: claims.tenantId, zoomUserId: zoomUser.id } },
    create: {
      tenantId: claims.tenantId,
      zoomUserId: zoomUser.id,
      zoomAccountId: zoomUser.account_id,
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope ?? ZOOM_SCOPES,
      status: "ACTIVE",
      connectedByUserId: claims.userId,
    },
    update: {
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope ?? ZOOM_SCOPES,
      status: "ACTIVE",
    },
  });

  await writeAudit({
    tenantId: claims.tenantId,
    actorUserId: claims.userId,
    entityType: "ZoomConnection",
    entityId: zoomUser.id,
    action: "CONNECTED",
  });

  res.redirect(`${frontendUrl}/zoom?connected=1`);
}

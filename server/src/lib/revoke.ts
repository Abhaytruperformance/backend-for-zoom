import { config } from "../config.js";

/**
 * Best-effort revocation at the provider, so disconnecting in this app actually ends the
 * grant rather than only forgetting the tokens locally. Deleting our copy is not enough:
 * the refresh token stays valid on the provider's side until it is revoked or the user
 * hunts it down in their own account security settings.
 *
 * Every function here swallows failures — the local delete must still proceed, otherwise a
 * provider outage would leave a user unable to disconnect at all. Callers record the
 * outcome in the audit log so a failed revoke is visible after the fact.
 */

export async function revokeZoomToken(token: string): Promise<boolean> {
  try {
    const basicAuth = Buffer.from(`${config.ZOOM_CLIENT_ID}:${config.ZOOM_CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://zoom.us/oauth/revoke", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Microsoft exposes no equivalent per-grant revocation endpoint for a confidential client —
 * the grant is withdrawn by the user at myapplications.microsoft.com, or tenant-wide by an
 * admin. We drop our copy of the tokens and report that so the UI can say so plainly rather
 * than implying a revocation that did not happen.
 */
export function microsoftRevocationIsManual(): boolean {
  return true;
}

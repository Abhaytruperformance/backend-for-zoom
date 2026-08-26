import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { decryptSecret, encryptSecret } from "../../lib/crypto.js";

const ZOOM_API_BASE = "https://api.zoom.us/v2";
const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";

async function refreshZoomToken(refreshToken: string) {
  const basicAuth = Buffer.from(`${config.ZOOM_CLIENT_ID}:${config.ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(ZOOM_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Zoom token refresh failed: ${res.status}`), { zoomAuthFailure: true });
  }
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

/** Returns a valid access token for the tenant's Zoom connection, refreshing (and one retry) on expiry/401. Flips the connection to REAUTH_REQUIRED if refresh itself fails. */
export async function getValidZoomAccessToken(tenantId: string): Promise<string> {
  const conn = await prisma.zoomConnection.findFirst({ where: { tenantId } });
  if (!conn) throw Object.assign(new Error("Zoom not connected for this tenant"), { status: 409 });
  if (conn.status === "REVOKED") throw Object.assign(new Error("Zoom connection revoked"), { status: 409 });

  const stillValid = conn.expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid && conn.status === "ACTIVE") {
    return decryptSecret(conn.accessTokenEnc);
  }

  try {
    const refreshed = await refreshZoomToken(decryptSecret(conn.refreshTokenEnc));
    await prisma.zoomConnection.update({
      where: { id: conn.id },
      data: {
        accessTokenEnc: encryptSecret(refreshed.access_token),
        refreshTokenEnc: encryptSecret(refreshed.refresh_token),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        status: "ACTIVE",
      },
    });
    return refreshed.access_token;
  } catch {
    await prisma.zoomConnection.update({ where: { id: conn.id }, data: { status: "REAUTH_REQUIRED" } });
    throw Object.assign(new Error("Zoom connection needs to be reconnected"), { status: 409, reauthRequired: true });
  }
}

async function zoomFetch(tenantId: string, path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidZoomAccessToken(tenantId);
  const res = await fetch(`${ZOOM_API_BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    // One retry after forcing a fresh token lookup (covers a race where the token expired between check and call).
    const conn = await prisma.zoomConnection.findFirst({ where: { tenantId } });
    if (conn) await prisma.zoomConnection.update({ where: { id: conn.id }, data: { expiresAt: new Date(0) } });
    const retryToken = await getValidZoomAccessToken(tenantId);
    return fetch(`${ZOOM_API_BASE}${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${retryToken}` } });
  }
  return res;
}

export interface ZoomRecordingFile {
  id: string;
  file_type: string; // "TRANSCRIPT" for the VTT transcript
  download_url: string;
  status: string;
}

export interface ZoomRecordingsResponse {
  uuid: string;
  id: number;
  recording_files: ZoomRecordingFile[];
}

/** GET /meetings/{meetingId}/recordings — cloud_recording:read:list_recording_files scope */
export async function listMeetingRecordings(tenantId: string, meetingId: string): Promise<ZoomRecordingsResponse | null> {
  const res = await zoomFetch(tenantId, `/meetings/${encodeURIComponent(meetingId)}/recordings`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Zoom recordings lookup failed: ${res.status}`);
  return (await res.json()) as ZoomRecordingsResponse;
}

/** Downloads the transcript VTT file content — cloud_recording:read:content scope covers the download_url. */
export async function downloadTranscriptVtt(tenantId: string, downloadUrl: string): Promise<string> {
  const token = await getValidZoomAccessToken(tenantId);
  // Bearer header rather than ?access_token= — a token in a query string ends up in proxy
  // logs, browser/CDN caches and Referer headers, and this one can read every recording.
  const res = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Zoom transcript download failed: ${res.status}`);
  return res.text();
}

export async function exchangeZoomAuthCode(code: string, codeVerifier: string) {
  const basicAuth = Buffer.from(`${config.ZOOM_CLIENT_ID}:${config.ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(ZOOM_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.ZOOM_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) throw new Error(`Zoom OAuth code exchange failed: ${res.status}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
}

export interface ZoomPastParticipant {
  name: string;
  user_email: string;
}

/**
 * GET /past_meetings/{uuid}/participants — meeting:read:list_past_participants scope.
 * Report API's equivalent (report:read:meeting_participant) isn't available on every plan/app
 * tier; this Meeting-API endpoint is. Used as a backfill in handleMeetingEnded for anyone the
 * meeting.participant_joined webhook missed, not as the primary capture path.
 * Double-encode the UUID per Zoom's convention when it contains "/" or starts with "/".
 */
export async function listPastMeetingParticipants(tenantId: string, zoomUuid: string): Promise<ZoomPastParticipant[]> {
  const encoded = encodeURIComponent(encodeURIComponent(zoomUuid));
  const participants: ZoomPastParticipant[] = [];
  let nextPageToken = "";
  do {
    const qs = new URLSearchParams({ page_size: "300" });
    if (nextPageToken) qs.set("next_page_token", nextPageToken);
    const res = await zoomFetch(tenantId, `/past_meetings/${encoded}/participants?${qs.toString()}`);
    if (!res.ok) break;
    const body = (await res.json()) as { participants: ZoomPastParticipant[]; next_page_token?: string };
    participants.push(...body.participants);
    nextPageToken = body.next_page_token ?? "";
  } while (nextPageToken);
  return participants;
}
// (see zoom/ingestion.ts handleParticipantJoined), so there's no pull-API equivalent here.

export async function getZoomUserInfo(accessToken: string) {
  const res = await fetch(`${ZOOM_API_BASE}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Zoom user lookup failed: ${res.status}`);
  return (await res.json()) as { id: string; account_id: string; email: string };
}

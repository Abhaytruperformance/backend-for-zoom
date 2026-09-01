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

export interface ZoomPastMeetingSummary {
  uuid: string;
  id: number;
  topic: string;
  start_time?: string;
  duration?: number;
  host_email?: string;
}

/**
 * GET /users/me/meetings?type=previous_meetings — meeting:read:list_meetings scope (already
 * requested at connect time, previously unused). Used for one-time historical backfill, not
 * the live capture path (that's webhook-driven — see zoom/webhooks.ts).
 * ponytail: Zoom's exact retention window for "previous_meetings" isn't verified against a
 * live account here — TECHNICAL.md already warns Zoom's endpoint/scope behavior drifts from
 * docs. Verify against the real API response before assuming completeness.
 */
export async function listPastMeetings(tenantId: string): Promise<ZoomPastMeetingSummary[]> {
  const meetings: ZoomPastMeetingSummary[] = [];
  let nextPageToken = "";
  do {
    const qs = new URLSearchParams({ type: "previous_meetings", page_size: "300" });
    if (nextPageToken) qs.set("next_page_token", nextPageToken);
    const res = await zoomFetch(tenantId, `/users/me/meetings?${qs.toString()}`);
    if (!res.ok) throw new Error(`Zoom past-meetings list failed: ${res.status}`);
    const body = (await res.json()) as { meetings: ZoomPastMeetingSummary[]; next_page_token?: string };
    meetings.push(...body.meetings);
    nextPageToken = body.next_page_token ?? "";
  } while (nextPageToken);
  return meetings;
}

// ---------- Server-to-Server: company-wide sync, not tied to any tenant's OAuth connection ----------

let s2sTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Account-credentials grant — authenticates as the whole Zoom account (config.ZOOM_S2S_ACCOUNT_ID),
 * not a specific user. No refresh token in this grant type; just request a fresh one when the
 * cached one is close to expiry. Cached in-process only (short-lived, ~1h) — fine to re-fetch
 * after a restart.
 */
async function getS2SAccessToken(): Promise<string> {
  if (s2sTokenCache && s2sTokenCache.expiresAt - Date.now() > 60_000) {
    return s2sTokenCache.token;
  }
  const basicAuth = Buffer.from(`${config.ZOOM_S2S_CLIENT_ID}:${config.ZOOM_S2S_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${ZOOM_OAUTH_TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(config.ZOOM_S2S_ACCOUNT_ID)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  if (!res.ok) throw new Error(`Zoom S2S token request failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  s2sTokenCache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function zoomS2SFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getS2SAccessToken();
  return fetch(`${ZOOM_API_BASE}${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
}

export interface ZoomAccountUser {
  id: string;
  email: string;
}

/** GET /users (account-wide) — every active user in the Zoom account this S2S app is scoped to. */
export async function listAccountUsers(): Promise<ZoomAccountUser[]> {
  const users: ZoomAccountUser[] = [];
  let nextPageToken = "";
  do {
    const qs = new URLSearchParams({ status: "active", page_size: "300" });
    if (nextPageToken) qs.set("next_page_token", nextPageToken);
    const res = await zoomS2SFetch(`/users?${qs.toString()}`);
    if (!res.ok) throw new Error(`Zoom account users list failed: ${res.status}`);
    const body = (await res.json()) as { users: ZoomAccountUser[]; next_page_token?: string };
    users.push(...body.users);
    nextPageToken = body.next_page_token ?? "";
  } while (nextPageToken);
  return users;
}

/** GET /users/{userId}/meetings?type=previous_meetings — same shape as listPastMeetings, but for any user in the account via S2S auth. */
export async function listUserPastMeetingsS2S(userId: string): Promise<ZoomPastMeetingSummary[]> {
  const meetings: ZoomPastMeetingSummary[] = [];
  let nextPageToken = "";
  do {
    const qs = new URLSearchParams({ type: "previous_meetings", page_size: "300" });
    if (nextPageToken) qs.set("next_page_token", nextPageToken);
    const res = await zoomS2SFetch(`/users/${encodeURIComponent(userId)}/meetings?${qs.toString()}`);
    if (!res.ok) throw new Error(`Zoom S2S past-meetings list failed for user ${userId}: ${res.status}`);
    const body = (await res.json()) as { meetings: ZoomPastMeetingSummary[]; next_page_token?: string };
    meetings.push(...body.meetings);
    nextPageToken = body.next_page_token ?? "";
  } while (nextPageToken);
  return meetings;
}

/** GET /meetings/{meetingId}/recordings via S2S auth — same as listMeetingRecordings but not scoped to a tenant's own OAuth connection. */
export async function listMeetingRecordingsS2S(meetingId: string): Promise<ZoomRecordingsResponse | null> {
  const res = await zoomS2SFetch(`/meetings/${encodeURIComponent(meetingId)}/recordings`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Zoom S2S recordings lookup failed: ${res.status}`);
  return (await res.json()) as ZoomRecordingsResponse;
}

/** Downloads a transcript VTT file via S2S auth. */
export async function downloadTranscriptVttS2S(downloadUrl: string): Promise<string> {
  const token = await getS2SAccessToken();
  const res = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Zoom S2S transcript download failed: ${res.status}`);
  return res.text();
}

export async function getZoomUserInfo(accessToken: string) {
  const res = await fetch(`${ZOOM_API_BASE}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Zoom user lookup failed: ${res.status}`);
  return (await res.json()) as { id: string; account_id: string; email: string };
}

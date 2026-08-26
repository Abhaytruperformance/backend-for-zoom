import type { Request, Response } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Marks this JWT as an OAuth state token and nothing else. Session tokens carry
 * `typ: "session"` and requireAuth rejects anything else — without that split, a
 * state token doubles as a valid session bearer, and state is far more exposed than
 * a session token: it rides in a query string to Zoom/Google, so it lands in browser
 * history, Referer headers, and the provider's own request logs. Anyone who scraped
 * one from those places held a 10-minute session for the account that minted it.
 */
export const OAUTH_STATE_TYP = "oauth_state";

export interface IssuedOAuthState {
  state: string;
  /** S256 PKCE challenge to put on the authorize URL. */
  codeChallenge: string;
}

/**
 * Binds the OAuth `state` JWT to the browser that started the flow via an HttpOnly nonce
 * cookie. Without this, the state's signature only proves "some user of this server minted
 * this," not "the browser completing the callback is that same user" — letting an attacker
 * mint a state for their own account, then get a victim's browser to complete the
 * third-party consent screen, linking the victim's real Zoom/Gmail tokens onto the
 * attacker's app account.
 *
 * The same cookie carries the PKCE code_verifier. It deliberately does NOT go in the state
 * JWT: state is handed to the provider and echoed back through the URL bar, so a verifier
 * stored there would be visible to anyone who could see the code it's meant to protect.
 */
export function issueOAuthState<T extends object>(res: Response, cookieName: string, claims: T): IssuedOAuthState {
  const nonce = randomBytes(24).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");

  res.cookie(cookieName, `${nonce}.${codeVerifier}`, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_MS,
    path: "/api",
  });

  return {
    state: jwt.sign({ ...claims, nonce, typ: OAUTH_STATE_TYP }, config.JWT_SECRET, { expiresIn: "10m" }),
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
  };
}

export function verifyOAuthState<T>(
  req: Request,
  res: Response,
  cookieName: string,
  state: string
): (T & { codeVerifier: string }) | null {
  const cookie = readCookie(req, cookieName);
  res.clearCookie(cookieName, { path: "/api" });
  try {
    const claims = jwt.verify(state, config.JWT_SECRET) as T & { nonce: string; typ?: string };
    if (claims.typ !== OAUTH_STATE_TYP) return null;
    if (!cookie) return null;

    const sep = cookie.indexOf(".");
    if (sep === -1) return null;
    const cookieNonce = cookie.slice(0, sep);
    const codeVerifier = cookie.slice(sep + 1);
    if (!codeVerifier) return null;

    const a = Buffer.from(cookieNonce);
    const b = Buffer.from(claims.nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return { ...claims, codeVerifier };
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

import type { Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Binds the OAuth `state` JWT to the browser that started the flow via an HttpOnly nonce
 * cookie. Without this, the state's signature only proves "some user of this server minted
 * this," not "the browser completing the callback is that same user" — letting an attacker
 * mint a state for their own account, then get a victim's browser to complete the
 * third-party consent screen, linking the victim's real Zoom/Gmail tokens onto the
 * attacker's app account.
 */
export function issueOAuthState<T extends object>(res: Response, cookieName: string, claims: T): string {
  const nonce = randomBytes(24).toString("hex");
  res.cookie(cookieName, nonce, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_MS,
    path: "/api",
  });
  return jwt.sign({ ...claims, nonce }, config.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyOAuthState<T>(req: Request, res: Response, cookieName: string, state: string): T | null {
  res.clearCookie(cookieName, { path: "/api" });
  try {
    const claims = jwt.verify(state, config.JWT_SECRET) as T & { nonce: string };
    const cookieNonce = readCookie(req, cookieName);
    if (!cookieNonce) return null;
    const a = Buffer.from(cookieNonce);
    const b = Buffer.from(claims.nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return claims;
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

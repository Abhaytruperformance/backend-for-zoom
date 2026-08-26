import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Every JWT this app mints is signed with the same secret, so the payload has to say what
 * kind of token it is. Session tokens are the only kind requireAuth will accept; OAuth
 * state tokens carry `typ: "oauth_state"` and are rejected here. See lib/oauthState.ts for
 * why that matters — state travels through URLs and provider logs, sessions do not.
 */
export const SESSION_TYP = "session";

export function signSession(user: AuthUser): string {
  return jwt.sign({ ...user, typ: SESSION_TYP }, config.JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), config.JWT_SECRET) as AuthUser & { typ?: string };
    if (payload.typ !== SESSION_TYP) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    req.user = { userId: payload.userId, tenantId: payload.tenantId, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

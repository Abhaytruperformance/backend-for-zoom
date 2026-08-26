import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { config } from "../../src/config.js";
import { requireAuth, signSession } from "../../src/middleware/auth.js";
import { OAUTH_STATE_TYP } from "../../src/lib/oauthState.js";

/**
 * Session tokens and OAuth state tokens are both signed with JWT_SECRET, so the only thing
 * separating them is the `typ` claim. Before it existed, a state token — which rides in a
 * query string to Zoom/Google and so leaks into browser history, Referer headers and the
 * provider's logs — was accepted as a session bearer for the account that minted it.
 */
function callRequireAuth(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` } } as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  requireAuth(req, res, next);
  return { req, res, next };
}

const IDENTITY = { userId: "user_1", tenantId: "tenant_1", email: "person@example.com" };

describe("token type separation", () => {
  it("accepts a real session token", () => {
    const { req, next, res } = callRequireAuth(signSession(IDENTITY));
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject(IDENTITY);
  });

  it("rejects an OAuth state token used as a session bearer", () => {
    const stateToken = jwt.sign(
      { ...IDENTITY, nonce: "a".repeat(48), typ: OAUTH_STATE_TYP },
      config.JWT_SECRET,
      { expiresIn: "10m" }
    );
    const { req, next, res } = callRequireAuth(stateToken);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.user).toBeUndefined();
  });

  it("rejects a well-formed token with no typ claim at all", () => {
    const legacy = jwt.sign(IDENTITY, config.JWT_SECRET, { expiresIn: "12h" });
    const { next, res } = callRequireAuth(legacy);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("does not let a forged typ claim through without a valid signature", () => {
    const forged = jwt.sign({ ...IDENTITY, typ: "session" }, "not-the-real-secret", { expiresIn: "12h" });
    const { next, res } = callRequireAuth(forged);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

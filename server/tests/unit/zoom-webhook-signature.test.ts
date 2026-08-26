import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isFreshTimestamp, verifyZoomSignature } from "../../src/modules/zoom/webhooks.js";

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "placeholder";

function sign(rawBody: string, timestamp: string): string {
  const hash = createHmac("sha256", SECRET).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  return `v0=${hash}`;
}

/** Signatures are only accepted inside a freshness window now, so tests must sign "now". */
const nowSeconds = () => String(Math.floor(Date.now() / 1000));

describe("verifyZoomSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event: "meeting.ended" });
    const ts = nowSeconds();
    expect(verifyZoomSignature(body, ts, sign(body, ts))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ event: "meeting.ended" });
    const ts = nowSeconds();
    const sig = sign(body, ts);
    expect(verifyZoomSignature(body + "tampered", ts, sig)).toBe(false);
  });

  it("rejects a signature computed with the wrong timestamp", () => {
    const body = JSON.stringify({ event: "meeting.ended" });
    const ts = nowSeconds();
    const sig = sign(body, ts);
    expect(verifyZoomSignature(body, String(Number(ts) + 1), sig)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifyZoomSignature("{}", nowSeconds(), "not-a-real-signature")).toBe(false);
  });

  // Replay protection: a captured-but-genuine request stops being accepted once it ages out,
  // so a signature scraped from logs isn't valid forever.
  it("rejects a correctly signed but stale payload", () => {
    const body = JSON.stringify({ event: "meeting.ended" });
    const ts = String(Math.floor(Date.now() / 1000) - 60 * 60);
    expect(verifyZoomSignature(body, ts, sign(body, ts))).toBe(false);
  });
});

describe("isFreshTimestamp", () => {
  const now = 1_800_000_000_000; // fixed "now" in ms

  it("accepts epoch seconds", () => {
    expect(isFreshTimestamp(String(now / 1000), now)).toBe(true);
  });

  it("accepts epoch milliseconds", () => {
    expect(isFreshTimestamp(String(now), now)).toBe(true);
  });

  it("accepts small clock drift in both directions", () => {
    expect(isFreshTimestamp(String(now - 60_000), now)).toBe(true);
    expect(isFreshTimestamp(String(now + 60_000), now)).toBe(true);
  });

  it("rejects stale and far-future timestamps", () => {
    expect(isFreshTimestamp(String(now - 10 * 60_000), now)).toBe(false);
    expect(isFreshTimestamp(String(now + 10 * 60_000), now)).toBe(false);
  });

  it("rejects junk", () => {
    expect(isFreshTimestamp("not-a-number", now)).toBe(false);
    expect(isFreshTimestamp("", now)).toBe(false);
    expect(isFreshTimestamp("-1", now)).toBe(false);
  });
});

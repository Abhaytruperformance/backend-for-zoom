import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyZoomSignature } from "../../src/modules/zoom/webhooks.js";

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "placeholder";

function sign(rawBody: string, timestamp: string): string {
  const hash = createHmac("sha256", SECRET).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  return `v0=${hash}`;
}

describe("verifyZoomSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event: "meeting.ended" });
    const ts = "1700000000";
    expect(verifyZoomSignature(body, ts, sign(body, ts))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ event: "meeting.ended" });
    const ts = "1700000000";
    const sig = sign(body, ts);
    expect(verifyZoomSignature(body + "tampered", ts, sig)).toBe(false);
  });

  it("rejects a signature computed with the wrong timestamp", () => {
    const body = JSON.stringify({ event: "meeting.ended" });
    const sig = sign(body, "1700000000");
    expect(verifyZoomSignature(body, "1700000001", sig)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifyZoomSignature("{}", "1700000000", "not-a-real-signature")).toBe(false);
  });
});

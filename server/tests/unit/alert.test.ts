import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/config.js", () => ({ config: { ALERT_SLACK_WEBHOOK_URL: "" } }));

const { config } = await import("../../src/config.js");
const { sendAlert } = await import("../../src/lib/alert.js");

describe("sendAlert", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    config.ALERT_SLACK_WEBHOOK_URL = "";
  });

  it("no-ops without making a network call when unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await sendAlert("test message");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the message to the configured webhook URL as JSON", async () => {
    config.ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.example/webhook";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await sendAlert("something broke");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.slack.example/webhook",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "something broke" }) })
    );
  });

  it("never throws, even when the webhook call itself fails", async () => {
    config.ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.example/webhook";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(sendAlert("something broke")).resolves.toBeUndefined();
  });
});

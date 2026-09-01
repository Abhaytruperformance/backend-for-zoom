import { config } from "../config.js";

/**
 * Fire-and-forget ops notification via Slack incoming webhook. No-ops when unconfigured
 * (ALERT_SLACK_WEBHOOK_URL unset) and never throws — a broken alert channel must never take
 * down the job it's reporting on.
 */
export async function sendAlert(message: string): Promise<void> {
  if (!config.ALERT_SLACK_WEBHOOK_URL) return;
  try {
    await fetch(config.ALERT_SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error("sendAlert: failed to post to Slack webhook —", err instanceof Error ? err.message : err);
  }
}

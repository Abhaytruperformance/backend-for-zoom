import { Router } from "express";
import express from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { webhookRateLimit } from "../../middleware/rateLimit.js";
import { processTranscriptQueue, pollTranscriptQueue, meetingJobId } from "../../queue.js";
import { handleMeetingEnded, handleParticipantJoined } from "./ingestion.js";

export const zoomWebhookRouter = Router();

zoomWebhookRouter.use(webhookRateLimit);
zoomWebhookRouter.use(express.text({ type: "*/*", limit: "2mb" }));

export function verifyZoomSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const message = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", config.ZOOM_WEBHOOK_SECRET_TOKEN).update(message).digest("hex");
  const expected = `v0=${hash}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

zoomWebhookRouter.post("/", async (req, res) => {
  const rawBody = req.body as string;
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  // Zoom's one-time endpoint URL validation handshake — no signature to check yet.
  if (payload.event === "endpoint.url_validation") {
    const plainToken = payload.payload?.plainToken as string;
    const encryptedToken = createHmac("sha256", config.ZOOM_WEBHOOK_SECRET_TOKEN).update(plainToken).digest("hex");
    res.status(200).json({ plainToken, encryptedToken });
    return;
  }

  const timestamp = req.header("x-zm-request-timestamp");
  const signature = req.header("x-zm-signature");
  if (!timestamp || !signature || !verifyZoomSignature(rawBody, timestamp, signature)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const eventType: string = payload.event;
  const providerEventId: string =
    payload.payload?.object?.uuid ?? payload.payload?.object?.id ?? `${eventType}:${timestamp}`;
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  // Idempotent intake: the unique (provider, providerEventId) constraint rejects a duplicate delivery.
  let event;
  try {
    event = await prisma.webhookEvent.create({
      data: {
        provider: "zoom",
        eventType,
        providerEventId: `${eventType}:${providerEventId}:${payloadHash.slice(0, 12)}`,
        payloadHash,
        payload,
        status: "RECEIVED",
      },
    });
  } catch {
    // Unique constraint hit — already processed or in flight. Return 200 so Zoom stops retrying.
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }

  // Zero AI/DB-heavy work inline — persist then hand off, respond fast.
  try {
    if (eventType === "meeting.participant_joined") {
      await handleParticipantJoined(payload);
    } else if (eventType === "meeting.ended") {
      const meeting = await handleMeetingEnded(payload);
      if (meeting) {
        // Bounded fallback poll in case recording.transcript_completed never arrives — not the primary path.
        await pollTranscriptQueue.add(
          "pollTranscriptFallback",
          { meetingId: meeting.id },
          { jobId: meetingJobId(meeting.id), delay: 5 * 60_000 }
        );
      }
    } else if (eventType === "recording.transcript_completed" || eventType === "recording.completed") {
      const zoomUuid = payload.payload?.object?.uuid;
      const meeting = zoomUuid
        ? await prisma.meeting.findFirst({ where: { zoomUuid } })
        : null;
      if (meeting) {
        await processTranscriptQueue.add(
          "processTranscript",
          { meetingId: meeting.id, eventType },
          { jobId: meetingJobId(meeting.id) }
        );
      }
    }
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date() } });
  } catch (err) {
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "FAILED" } });
    console.error("zoom webhook handling failed", err);
  }

  res.status(200).json({ ok: true });
});

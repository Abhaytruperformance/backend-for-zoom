import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { assertTenantOwns } from "../../lib/tenantScope.js";
import { writeAudit } from "../../lib/audit.js";
import { transitionMeeting } from "./stateMachine.js";
import { pollTranscriptQueue, processTranscriptQueue, meetingJobId } from "../../queue.js";
import { buildMeetingContext } from "../knowledge/context.js";
import { extractMeeting } from "../ai/service.js";

const NOT_SAFE_TO_REGENERATE: string[] = ["WAITING_FOR_TRANSCRIPT", "TRANSCRIPT_READY", "PROCESSING", "SENDING"];

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

meetingsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const meetings = await prisma.meeting.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { startTime: "desc" },
      take: 100,
      include: { account: true },
    });
    res.json(meetings);
  })
);

meetingsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: {
        account: true,
        contact: true,
        transcript: true,
        extraction: true,
        decisions: {
          orderBy: { createdAt: "desc" },
          include: {
            supersedes: { include: { meeting: { select: { id: true, title: true, startTime: true } } } },
            supersededBy: { include: { meeting: { select: { id: true, title: true, startTime: true } } } },
          },
        },
        actionItems: {
          orderBy: { createdAt: "desc" },
          include: {
            supersedes: { include: { meeting: { select: { id: true, title: true, startTime: true } } } },
            supersededBy: { include: { meeting: { select: { id: true, title: true, startTime: true } } } },
          },
        },
        followupDraft: {
          include: {
            approvalSnapshot: {
              include: { sendAttempt: true, approvedByUser: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);
    res.json(meeting);
  })
);

/** Human resolution for a meeting flagged needsResolution (multiple candidate accounts matched). */
meetingsRouter.post(
  "/:id/resolve-account",
  asyncRoute(async (req, res) => {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);

    const accountId = req.body?.accountId as string | undefined;
    if (!accountId) {
      res.status(400).json({ error: "accountId is required" });
      return;
    }
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    assertTenantOwns("Account", account, req.user!.tenantId);

    await prisma.meeting.update({ where: { id: meeting.id }, data: { accountId, needsResolution: false } });
    res.json({ resolved: true });
  })
);

const titleSchema = z.object({ title: z.string().min(1).max(200) });

/** The AI/Zoom-derived title is a starting point, not a lock — reps rename meetings to match how they actually talk about a client's work. */
meetingsRouter.patch(
  "/:id/title",
  asyncRoute(async (req, res) => {
    const body = titleSchema.parse(req.body);
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);

    const updated = await prisma.meeting.update({ where: { id: meeting.id }, data: { title: body.title } });

    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "Meeting",
      entityId: meeting.id,
      action: "HUMAN_CORRECTED",
      metadata: { field: "title", before: meeting.title, after: body.title },
    });

    res.json(updated);
  })
);

const conversationTypeSchema = z.object({ conversationType: z.enum(["SALES", "PROJECT_DELIVERY", "INTERNAL", "OTHER"]) });

/** Conversation type is AI-guessed but always human-editable (spec explicitly calls for this). */
meetingsRouter.patch(
  "/:id/conversation-type",
  asyncRoute(async (req, res) => {
    const body = conversationTypeSchema.parse(req.body);
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);

    const extraction = await prisma.meetingExtraction.findUnique({ where: { meetingId: meeting.id } });
    if (!extraction) {
      res.status(409).json({ error: "This meeting has no extraction yet." });
      return;
    }

    const updated = await prisma.meetingExtraction.update({
      where: { meetingId: meeting.id },
      data: { conversationType: body.conversationType },
    });

    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "MeetingExtraction",
      entityId: extraction.id,
      action: "HUMAN_CORRECTED",
      metadata: { field: "conversationType", before: extraction.conversationType, after: body.conversationType },
    });

    res.json(updated);
  })
);

/**
 * Re-runs AI extraction for the meeting's narrative fields (summary, conversation type,
 * risks, open questions, next steps) — NOT decisions/action items. Those are individually
 * correctable via PATCH /decisions/:id and /actions/:id; re-running the full knowledge-base
 * write here would either duplicate them (same meeting, new rows) or require deleting rows
 * that a later meeting's supersedesId may already point to, which isn't a safe blind
 * operation. Regenerating the narrative alone is safe (nothing else references it by FK).
 */
meetingsRouter.post(
  "/:id/regenerate-extraction",
  asyncRoute(async (req, res) => {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);

    if (NOT_SAFE_TO_REGENERATE.includes(meeting.status)) {
      res.status(409).json({ error: `Meeting is currently ${meeting.status.toLowerCase().replace(/_/g, " ")} — try again once it settles.` });
      return;
    }
    const transcript = await prisma.transcript.findUnique({ where: { meetingId: meeting.id } });
    if (!transcript) {
      res.status(409).json({ error: "No transcript available to re-extract from." });
      return;
    }

    const context = await buildMeetingContext(meeting.tenantId, meeting.accountId, meeting.id);
    const extraction = await extractMeeting(meeting.id, context);

    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "Meeting",
      entityId: meeting.id,
      action: "EXTRACTION_REGENERATED",
    });

    res.json(extraction);
  })
);

meetingsRouter.post(
  "/:id/retry",
  asyncRoute(async (req, res) => {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Meeting", meeting, req.user!.tenantId);

    if (meeting.status !== "FAILED") {
      res.status(409).json({ error: "Only FAILED meetings can be retried" });
      return;
    }

    const hasTranscript = await prisma.transcript.findUnique({ where: { meetingId: meeting.id } });
    if (hasTranscript) {
      await transitionMeeting(meeting.id, "FAILED", "PROCESSING");
      await processTranscriptQueue.add("processTranscript", { meetingId: meeting.id }, { jobId: meetingJobId(meeting.id) });
    } else {
      await transitionMeeting(meeting.id, "FAILED", "WAITING_FOR_TRANSCRIPT");
      await pollTranscriptQueue.add("pollTranscriptFallback", { meetingId: meeting.id }, { jobId: meetingJobId(meeting.id) });
    }

    res.json({ retried: true });
  })
);

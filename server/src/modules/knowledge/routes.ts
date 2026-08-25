import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { assertTenantOwns } from "../../lib/tenantScope.js";
import { writeAudit } from "../../lib/audit.js";

export const knowledgeRouter = Router();
knowledgeRouter.use(requireAuth);

knowledgeRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const accounts = await prisma.account.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { lastMeetingAt: "desc" },
      include: { contacts: true },
    });
    res.json(accounts);
  })
);

knowledgeRouter.get(
  "/needs-resolution",
  asyncRoute(async (req, res) => {
    const meetings = await prisma.meeting.findMany({
      where: { tenantId: req.user!.tenantId, needsResolution: true },
      orderBy: { startTime: "desc" },
    });
    res.json(meetings);
  })
);

const accountSchema = z.object({
  name: z.string().min(1),
  domains: z.array(z.string()).optional(),
  emails: z.array(z.string().email()).optional(),
});

/** Manual account creation — the only way to onboard a client before their first meeting resolves to them automatically. */
knowledgeRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = accountSchema.parse(req.body);
    const account = await prisma.account.create({
      data: { tenantId: req.user!.tenantId, name: body.name, domains: body.domains ?? [], emails: body.emails ?? [] },
    });
    await writeAudit({ tenantId: req.user!.tenantId, actorUserId: req.user!.userId, entityType: "Account", entityId: account.id, action: "CREATED" });
    res.status(201).json(account);
  })
);

knowledgeRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = accountSchema.partial().parse(req.body);
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Account", account, req.user!.tenantId);

    const updated = await prisma.account.update({
      where: { id: account.id },
      data: { name: body.name, domains: body.domains, emails: body.emails },
    });
    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "Account",
      entityId: account.id,
      action: "HUMAN_CORRECTED",
      metadata: { before: { name: account.name, domains: account.domains, emails: account.emails }, after: body },
    });
    res.json(updated);
  })
);

/** The primary "before next meeting" briefing screen. */
knowledgeRouter.get(
  "/:id/briefing",
  asyncRoute(async (req, res) => {
    const tenantId = req.user!.tenantId;
    const account = await prisma.account.findUnique({ where: { id: req.params.id }, include: { contacts: true } });
    assertTenantOwns("Account", account, tenantId);

    const [latestSummary, openActionItems, currentDecisions, recentMeetings, meetingCount30d] = await Promise.all([
      prisma.relationshipSummary.findFirst({ where: { accountId: account.id }, orderBy: { generatedAt: "desc" } }),
      prisma.actionItem.findMany({ where: { tenantId, accountId: account.id, status: "OPEN" }, orderBy: { createdAt: "desc" } }),
      prisma.decision.findMany({ where: { tenantId, accountId: account.id, supersededBy: null }, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.meeting.findMany({ where: { tenantId, accountId: account.id }, orderBy: { startTime: "desc" }, take: 5, include: { extraction: true } }),
      prisma.meeting.count({ where: { tenantId, accountId: account.id, startTime: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);

    const openQuestions = recentMeetings[0]?.extraction?.openQuestions ?? [];

    res.json({
      account,
      contacts: account.contacts,
      relationshipSummary: latestSummary?.content ?? null,
      lastMeetingDate: recentMeetings[0]?.startTime ?? null,
      openCommitments: openActionItems,
      confirmedDecisions: currentDecisions.filter((d) => d.status === "CONFIRMED"),
      tentativeDecisions: currentDecisions.filter((d) => d.status !== "CONFIRMED"),
      openQuestions,
      recentMeetings: recentMeetings.map((m) => ({ id: m.id, date: m.startTime, title: m.title })),
      meetingsLast30Days: meetingCount30d,
    });
  })
);

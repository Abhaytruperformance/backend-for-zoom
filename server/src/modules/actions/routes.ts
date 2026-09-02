import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { assertTenantOwns } from "../../lib/tenantScope.js";
import { writeAudit } from "../../lib/audit.js";

export const actionsRouter = Router();
actionsRouter.use(requireAuth);

const statusFilterSchema = z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional();
const listQuerySchema = z.object({
  accountId: z.string().optional(),
  status: statusFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

actionsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const where = { tenantId: req.user!.tenantId, accountId: q.accountId, status: q.status };
    const [items, total] = await Promise.all([
      prisma.actionItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.actionItem.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

const bulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
  ownerDisplayName: z.string().min(1).optional(),
  ownerEmail: z.string().email().nullable().optional(),
});

/** Bulk status/owner update — never touches description or dueDate, and never anything client-facing (no email is sent from here). */
actionsRouter.patch(
  "/bulk",
  asyncRoute(async (req, res) => {
    const body = bulkUpdateSchema.parse(req.body);
    if (!body.status && body.ownerDisplayName === undefined && body.ownerEmail === undefined) {
      res.status(400).json({ error: "Provide at least one of status, ownerDisplayName, ownerEmail" });
      return;
    }

    const result = await prisma.actionItem.updateMany({
      where: { id: { in: body.ids }, tenantId: req.user!.tenantId },
      data: { status: body.status, ownerDisplayName: body.ownerDisplayName, ownerEmail: body.ownerEmail },
    });

    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "ActionItem",
      entityId: `bulk:${body.ids.length}`,
      action: "HUMAN_CORRECTED",
      metadata: { ids: body.ids, changes: { status: body.status, ownerDisplayName: body.ownerDisplayName, ownerEmail: body.ownerEmail } },
    });

    res.json({ updated: result.count });
  })
);

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
  dueDate: z.string().nullable().optional(),
  ownerDisplayName: z.string().optional(),
  ownerEmail: z.string().email().nullable().optional(),
});

actionsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const item = await prisma.actionItem.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("ActionItem", item, req.user!.tenantId);

    const updated = await prisma.actionItem.update({
      where: { id: item.id },
      data: {
        description: body.description,
        status: body.status,
        dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
        ownerDisplayName: body.ownerDisplayName,
        ownerEmail: body.ownerEmail,
      },
    });

    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "ActionItem",
      entityId: item.id,
      action: "HUMAN_CORRECTED",
      metadata: { before: { description: item.description, status: item.status, dueDate: item.dueDate, ownerDisplayName: item.ownerDisplayName, ownerEmail: item.ownerEmail }, after: body },
    });

    res.json(updated);
  })
);

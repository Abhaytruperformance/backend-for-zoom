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

actionsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const { accountId, status } = req.query;
    const statusFilter = statusFilterSchema.parse(typeof status === "string" ? status : undefined);
    const items = await prisma.actionItem.findMany({
      where: {
        tenantId: req.user!.tenantId,
        accountId: typeof accountId === "string" ? accountId : undefined,
        status: statusFilter,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
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

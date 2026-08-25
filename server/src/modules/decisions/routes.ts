import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { assertTenantOwns } from "../../lib/tenantScope.js";
import { writeAudit } from "../../lib/audit.js";

export const decisionsRouter = Router();
decisionsRouter.use(requireAuth);

// Human correction of an AI-extracted decision — a direct overwrite, separate from the
// cross-meeting supersession machinery (which only applies to the AI's own proposals).
const updateSchema = z.object({
  description: z.string().min(1).optional(),
  status: z.enum(["CONFIRMED", "PROPOSED", "TENTATIVE", "REJECTED"]).optional(),
});

decisionsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const decision = await prisma.decision.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Decision", decision, req.user!.tenantId);

    const updated = await prisma.decision.update({
      where: { id: decision.id },
      data: { description: body.description, status: body.status },
    });

    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "Decision",
      entityId: decision.id,
      action: "HUMAN_CORRECTED",
      metadata: { before: { description: decision.description, status: decision.status }, after: body },
    });

    res.json(updated);
  })
);

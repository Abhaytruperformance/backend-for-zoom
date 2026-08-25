import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { assertTenantOwns } from "../../lib/tenantScope.js";
import { writeAudit } from "../../lib/audit.js";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().optional(),
});

contactsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const account = await prisma.account.findUnique({ where: { id: body.accountId } });
    assertTenantOwns("Account", account, req.user!.tenantId);

    const contact = await prisma.contact.create({
      data: { tenantId: req.user!.tenantId, accountId: account.id, name: body.name, email: body.email, role: body.role },
    });
    await writeAudit({ tenantId: req.user!.tenantId, actorUserId: req.user!.userId, entityType: "Contact", entityId: contact.id, action: "CREATED" });
    res.status(201).json(contact);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
});

contactsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
    assertTenantOwns("Contact", contact, req.user!.tenantId);

    const updated = await prisma.contact.update({ where: { id: contact.id }, data: body });
    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "Contact",
      entityId: contact.id,
      action: "HUMAN_CORRECTED",
      metadata: { before: { name: contact.name, email: contact.email, role: contact.role }, after: body },
    });
    res.json(updated);
  })
);

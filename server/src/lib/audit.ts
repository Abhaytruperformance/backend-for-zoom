import { prisma } from "../db.js";

export async function writeAudit(params: {
  tenantId: string;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      actorUserId: params.actorUserId ?? null,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      metadata: params.metadata as any,
    },
  });
}

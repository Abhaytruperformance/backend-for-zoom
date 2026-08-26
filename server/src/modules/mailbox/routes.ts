import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { googleCallbackHandler, googleConnectHandler, microsoftCallbackHandler, microsoftConnectHandler } from "./oauth.js";
import { decryptSecret } from "../../lib/crypto.js";
import { revokeGoogleToken } from "../../lib/revoke.js";
import { writeAudit } from "../../lib/audit.js";
import { z } from "zod";

export const mailboxRouter = Router();

mailboxRouter.get("/google/connect", requireAuth, googleConnectHandler);
mailboxRouter.get("/google/callback", (req, res, next) => googleCallbackHandler(req, res).catch(next));

mailboxRouter.get("/microsoft/connect", requireAuth, microsoftConnectHandler);
mailboxRouter.get("/microsoft/callback", (req, res, next) => microsoftCallbackHandler(req, res).catch(next));

mailboxRouter.get(
  "/status",
  requireAuth,
  asyncRoute(async (req, res) => {
    const connections = await prisma.mailboxConnection.findMany({ where: { userId: req.user!.userId } });
    res.json(
      connections.map((c) => ({ provider: c.provider, email: c.email, status: c.status, lastValidatedAt: c.lastValidatedAt }))
    );
  })
);

const providerParam = z.object({ provider: z.enum(["GOOGLE", "MICROSOFT"]) });

/**
 * Disconnect a mailbox. Scoped to the calling user's own connection — a mailbox grant
 * belongs to the person who consented, not to the tenant, so no one else can drop it.
 */
mailboxRouter.delete(
  "/:provider",
  requireAuth,
  asyncRoute(async (req, res) => {
    const { provider } = providerParam.parse({ provider: String(req.params.provider).toUpperCase() });
    const conn = await prisma.mailboxConnection.findUnique({
      where: { userId_provider: { userId: req.user!.userId, provider } },
    });
    if (!conn) {
      res.status(404).json({ error: `No ${provider} mailbox connected` });
      return;
    }

    // Google honours a revoke call; Microsoft has no per-grant endpoint for a confidential
    // client, so there the grant is withdrawn by the user at myapplications.microsoft.com.
    const revoked = provider === "GOOGLE" ? await revokeGoogleToken(decryptSecret(conn.refreshTokenEnc)) : false;

    await prisma.mailboxConnection.delete({ where: { id: conn.id } });
    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      entityType: "MailboxConnection",
      entityId: conn.email,
      action: `DISCONNECTED_${provider}`,
      metadata: { revokedAtProvider: revoked },
    });

    res.json({
      disconnected: true,
      revokedAtProvider: revoked,
      manualRevocationUrl: provider === "MICROSOFT" ? "https://myapplications.microsoft.com" : null,
    });
  })
);

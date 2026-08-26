import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { zoomCallbackHandler, zoomConnectHandler } from "./oauth.js";
import { decryptSecret } from "../../lib/crypto.js";
import { revokeZoomToken } from "../../lib/revoke.js";
import { writeAudit } from "../../lib/audit.js";

export const zoomRouter = Router();

zoomRouter.get("/connect", requireAuth, zoomConnectHandler);
zoomRouter.get("/oauth/callback", (req, res, next) => zoomCallbackHandler(req, res).catch(next));

zoomRouter.get(
  "/status",
  requireAuth,
  asyncRoute(async (req, res) => {
    const conn = await prisma.zoomConnection.findFirst({ where: { tenantId: req.user!.tenantId } });
    res.json({
      connected: !!conn && conn.status === "ACTIVE",
      status: conn?.status ?? "NOT_CONNECTED",
    });
  })
);

/**
 * Disconnect. Until this existed there was no way to end a Zoom grant from inside the app —
 * tokens simply lived in the database forever, which also meant no way to respond to a
 * suspected compromise short of editing rows by hand.
 */
zoomRouter.delete(
  "/connection",
  requireAuth,
  asyncRoute(async (req, res) => {
    const tenantId = req.user!.tenantId;
    const conn = await prisma.zoomConnection.findFirst({ where: { tenantId } });
    if (!conn) {
      res.status(404).json({ error: "No Zoom connection to disconnect" });
      return;
    }

    const revoked = await revokeZoomToken(decryptSecret(conn.refreshTokenEnc));
    await prisma.zoomConnection.delete({ where: { id: conn.id } });
    await writeAudit({
      tenantId,
      actorUserId: req.user!.userId,
      entityType: "ZoomConnection",
      entityId: conn.zoomUserId,
      action: "DISCONNECTED",
      metadata: { revokedAtProvider: revoked },
    });

    res.json({ disconnected: true, revokedAtProvider: revoked });
  })
);

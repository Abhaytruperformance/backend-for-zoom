import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { zoomCallbackHandler, zoomConnectHandler } from "./oauth.js";

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

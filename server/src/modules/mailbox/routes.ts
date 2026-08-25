import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { prisma } from "../../db.js";
import { googleCallbackHandler, googleConnectHandler, microsoftCallbackHandler, microsoftConnectHandler } from "./oauth.js";

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

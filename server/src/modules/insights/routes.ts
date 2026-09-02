import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { computeInsights } from "./service.js";

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

insightsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(await computeInsights(req.user!.tenantId));
  })
);

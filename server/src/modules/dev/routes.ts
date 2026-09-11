import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../middleware/errorHandler.js";
import { seedDemoScenario } from "../../lib/demoScenarios.js";

/**
 * HTTP equivalent of scripts/demo-fallback.ts, for hosts with no shell access (e.g. Render's
 * free tier has no Shell/One-Off Jobs). Scoped to the caller's own tenant via requireAuth —
 * same trust boundary as any other authenticated write in this app.
 */
export const devRouter = Router();
devRouter.use(requireAuth);

const seedSchema = z.object({ scenario: z.enum(["1", "2"]) });

devRouter.post(
  "/seed-demo",
  asyncRoute(async (req, res) => {
    const body = seedSchema.parse(req.body);
    const result = await seedDemoScenario(req.user!.tenantId, body.scenario);
    res.json(result);
  })
);

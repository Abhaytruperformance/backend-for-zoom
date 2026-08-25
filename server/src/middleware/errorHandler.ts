import type { NextFunction, Request, Response } from "express";
import { NotFoundInTenantError } from "../lib/tenantScope.js";
import { ZodError } from "zod";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof NotFoundInTenantError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }
  if (err instanceof Error && "status" in err && typeof (err as any).status === "number") {
    res.status((err as any).status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

/**
 * Wraps an async Express handler so a thrown/rejected error reaches errorHandler
 * instead of becoming an unhandled rejection — which, unwrapped, crashes the
 * whole Node process (Express 4 doesn't catch async handler rejections itself).
 */
export function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

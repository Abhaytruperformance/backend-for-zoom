import { Router } from "express";
import { z } from "zod";
import { loginRateLimit } from "../../middleware/rateLimit.js";
import { login, registerTenantAndUser, requestPasswordReset, resetPassword } from "./service.js";

export const authRouter = Router();

const registerSchema = z.object({
  tenantName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

authRouter.post("/register", loginRateLimit, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await registerTenantAndUser(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await login(body.email, body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const forgotSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", loginRateLimit, async (req, res, next) => {
  try {
    const body = forgotSchema.parse(req.body);
    await requestPasswordReset(body.email);
    // Always the same response, whether or not the email exists — don't leak registration status.
    res.json({ message: "If that email is registered, a reset token has been generated." });
  } catch (err) {
    next(err);
  }
});

const resetSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post("/reset-password", loginRateLimit, async (req, res, next) => {
  try {
    const body = resetSchema.parse(req.body);
    const result = await resetPassword(body.email, body.token, body.newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

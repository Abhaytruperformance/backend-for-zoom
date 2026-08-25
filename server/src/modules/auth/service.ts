import bcrypt from "bcrypt";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../../db.js";
import { signSession } from "../../middleware/auth.js";

// ponytail: no email verification / refresh-token rotation for this MVP.
// Fine for a controlled internal rollout; add both before any public/production deployment.

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerTenantAndUser(params: {
  tenantName: string;
  email: string;
  password: string;
  name?: string;
}) {
  const existing = await prisma.user.findFirst({ where: { email: params.email } });
  if (existing) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(params.password, 12);

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: params.tenantName } });
    const user = await tx.user.create({
      data: { tenantId: tenant.id, email: params.email, passwordHash, name: params.name },
    });
    return { tenant, user };
  });

  const token = signSession({ userId: user.id, tenantId: tenant.id, email: user.email });
  return { token, user: { id: user.id, email: user.email, name: user.name }, tenant: { id: tenant.id, name: tenant.name } };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw Object.assign(new Error("Invalid credentials"), { status: 401 });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw Object.assign(new Error("Invalid credentials"), { status: 401 });

  const token = signSession({ userId: user.id, tenantId: user.tenantId, email: user.email });
  return { token, user: { id: user.id, email: user.email, name: user.name } };
}

/**
 * No transactional email is configured (only per-user OAuth mailbox send, which requires
 * being logged in already — no good for a locked-out user). The reset token is logged
 * server-side instead of emailed — fine for an internal/demo deployment, not for production
 * (see the ponytail note above this file).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    // Same response either way — don't let this endpoint reveal whether an email is registered.
    console.log(`[password reset] no account for ${email}`);
    return;
  }

  const token = randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(token), resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  console.log(`[password reset] token for ${email} (valid 30 min): ${token}`);
}

export async function resetPassword(email: string, token: string, newPassword: string) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) {
    throw Object.assign(new Error("Invalid or expired reset token"), { status: 400 });
  }
  if (user.resetTokenExpiresAt.getTime() < Date.now()) {
    throw Object.assign(new Error("Reset token has expired — request a new one"), { status: 400 });
  }
  const expected = Buffer.from(user.resetTokenHash);
  const actual = Buffer.from(hashToken(token));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw Object.assign(new Error("Invalid or expired reset token"), { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });

  const sessionToken = signSession({ userId: user.id, tenantId: user.tenantId, email: user.email });
  return { token: sessionToken, user: { id: user.id, email: user.email, name: user.name } };
}

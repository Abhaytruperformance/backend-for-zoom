import { describe, expect, it } from "vitest";
import { isDbAvailable, createTenantWithUser, cleanupTenant } from "../fixtures/db.js";
import { prisma } from "../../src/db.js";

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)("WebhookEvent — Test 6: a duplicate Zoom webhook delivery is rejected at the DB layer", () => {
  it("a second insert with the same (provider, providerEventId) fails the unique constraint", async () => {
    const { tenant } = await createTenantWithUser("wh");
    const providerEventId = `meeting.ended:uuid-${Date.now()}:abc123`;

    await prisma.webhookEvent.create({
      data: { tenantId: tenant.id, provider: "zoom", eventType: "meeting.ended", providerEventId, payloadHash: "h", payload: {} },
    });

    await expect(
      prisma.webhookEvent.create({
        data: { tenantId: tenant.id, provider: "zoom", eventType: "meeting.ended", providerEventId, payloadHash: "h", payload: {} },
      })
    ).rejects.toThrow();

    const count = await prisma.webhookEvent.count({ where: { providerEventId } });
    expect(count).toBe(1); // exactly one row — the duplicate never landed

    await cleanupTenant(tenant.id);
  });
});

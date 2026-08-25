import { describe, expect, it } from "vitest";
import { resolveAccountForMeeting } from "../../src/modules/knowledge/resolution.js";
import { isDbAvailable, createTenantWithUser, cleanupTenant } from "../fixtures/db.js";
import { prisma } from "../../src/db.js";

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)("resolveAccountForMeeting — deterministic identity resolution", () => {
  it("Test 4: proceeds unlinked when no participant matches any known account/contact", async () => {
    const { tenant } = await createTenantWithUser("res4");
    const result = await resolveAccountForMeeting(tenant.id, [{ name: "Nobody", email: "nobody@unknown-domain.test" }]);
    expect(result).toEqual({ accountId: null, contactId: null, needsResolution: false });
    await cleanupTenant(tenant.id);
  });

  it("Test 5: flags needsResolution instead of silently picking one account when participants match two different accounts", async () => {
    const { tenant } = await createTenantWithUser("res5");
    const accountA = await prisma.account.create({ data: { tenantId: tenant.id, name: "A Corp", domains: ["a-corp.test"], emails: [] } });
    const accountB = await prisma.account.create({ data: { tenantId: tenant.id, name: "B Corp", domains: ["b-corp.test"], emails: [] } });

    const result = await resolveAccountForMeeting(tenant.id, [
      { name: "Alice", email: "alice@a-corp.test" },
      { name: "Bob", email: "bob@b-corp.test" },
    ]);
    expect(result.needsResolution).toBe(true);
    expect(result.accountId).toBeNull();
    void accountA;
    void accountB;
    await cleanupTenant(tenant.id);
  });

  it("resolves via exact contact email when one exists", async () => {
    const { tenant } = await createTenantWithUser("resExact");
    const account = await prisma.account.create({ data: { tenantId: tenant.id, name: "Known Co", domains: [], emails: [] } });
    const contact = await prisma.contact.create({ data: { tenantId: tenant.id, accountId: account.id, name: "Carol", email: "carol@known.test" } });

    const result = await resolveAccountForMeeting(tenant.id, [{ name: "Carol", email: "carol@known.test" }]);
    expect(result.accountId).toBe(account.id);
    expect(result.contactId).toBe(contact.id);
    expect(result.needsResolution).toBe(false);
    await cleanupTenant(tenant.id);
  });

  it("resolves via account domain match when no direct contact exists", async () => {
    const { tenant } = await createTenantWithUser("resDomain");
    const account = await prisma.account.create({ data: { tenantId: tenant.id, name: "Domain Co", domains: ["domainco.test"], emails: [] } });

    const result = await resolveAccountForMeeting(tenant.id, [{ name: "New Person", email: "new.person@domainco.test" }]);
    expect(result.accountId).toBe(account.id);
    expect(result.needsResolution).toBe(false);
    await cleanupTenant(tenant.id);
  });
});

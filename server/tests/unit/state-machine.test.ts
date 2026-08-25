import { describe, expect, it } from "vitest";
import { transitionMeeting } from "../../src/modules/meetings/stateMachine.js";
import { isDbAvailable, createTenantWithUser, cleanupTenant } from "../fixtures/db.js";
import { prisma } from "../../src/db.js";

describe("transitionMeeting — illegal transition guard (no DB required, throws before any query)", () => {
  it("rejects a transition not present in the state machine", async () => {
    await expect(transitionMeeting("does-not-matter", "COMPLETED", "APPROVED")).rejects.toThrow(/Illegal meeting transition/);
  });

  it("rejects skipping states (e.g. CAPTURED straight to APPROVED)", async () => {
    await expect(transitionMeeting("does-not-matter", "CAPTURED", "APPROVED")).rejects.toThrow(/Illegal meeting transition/);
  });
});

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)("transitionMeeting — CAS behavior against a real Meeting row", () => {
  it("only the first of two concurrent transitions from the same state succeeds", async () => {
    const { tenant } = await createTenantWithUser("cas");
    const meeting = await prisma.meeting.create({
      data: {
        tenantId: tenant.id,
        zoomMeetingId: "1",
        zoomUuid: `uuid-${Date.now()}`,
        title: "t",
        participants: [],
        status: "WAITING_FOR_TRANSCRIPT",
      },
    });

    const [a, b] = await Promise.all([
      transitionMeeting(meeting.id, "WAITING_FOR_TRANSCRIPT", "TRANSCRIPT_READY"),
      transitionMeeting(meeting.id, "WAITING_FOR_TRANSCRIPT", "TRANSCRIPT_READY"),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1); // exactly one of the two racing calls actually applied

    const final = await prisma.meeting.findUniqueOrThrow({ where: { id: meeting.id } });
    expect(final.status).toBe("TRANSCRIPT_READY");

    await cleanupTenant(tenant.id);
  });
});

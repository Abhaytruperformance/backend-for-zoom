/**
 * Demo fallback / rehearsal script — reproduces the exact supersession "wow moment"
 * end to end (real GPT-4o-mini, real knowledge-base writes) without depending on a
 * live Zoom meeting actually producing a Cloud Recording transcript.
 *
 * Uses the pre-seeded "Acme Corp" / "John Smith" demo account so it's consistent
 * with whatever the presenter shows in the UI.
 *
 * Usage (from server/, with Postgres/Redis up):
 *   DEMO_TENANT_ID=<tenant id> npx tsx --env-file=.env scripts/demo-fallback.ts 1   # kickoff meeting
 *   DEMO_TENANT_ID=<tenant id> npx tsx --env-file=.env scripts/demo-fallback.ts 2   # follow-up that supersedes meeting 1
 *
 * Run 1 then 2 live during the demo (narrate "meeting 1 happened last week" / "meeting 2
 * just ended") — or run both back to back beforehand as a pure rehearsal. Either way, meeting 2
 * ends AWAITING_APPROVAL with a real follow-up draft ready for the human-edit-then-approve
 * finale in the UI — that step is deliberately NOT scripted here, do it live.
 *
 * On a host with no shell access (e.g. Render's free tier), use the equivalent authenticated
 * HTTP endpoint instead — POST /api/dev/seed-demo (see server/src/modules/dev/routes.ts).
 */
import { frontendUrl } from "../src/config.js";
import { seedDemoScenario } from "../src/lib/demoScenarios.js";

async function main() {
  const arg = process.argv[2];
  const tenantId = process.env.DEMO_TENANT_ID;

  if (!tenantId) {
    console.error("Set DEMO_TENANT_ID to the tenant this demo account belongs to, e.g.:\n  DEMO_TENANT_ID=<your tenant id> npx tsx --env-file=.env scripts/demo-fallback.ts 1");
    process.exit(1);
  }
  if (!arg) {
    console.error("Usage: npx tsx --env-file=.env scripts/demo-fallback.ts <1|2>");
    process.exit(1);
  }

  console.log(`Seeding scenario ${arg}...`);
  const result = await seedDemoScenario(tenantId, arg);

  console.log(`\n=== Current knowledge base state for Acme Corp ===`);
  console.log("Decisions:", result.decisions);
  console.log("Action items:", result.actionItems);
  console.log(`\nMeeting ready in the UI: ${frontendUrl}/meetings/${result.meetingId}`);
  console.log(`Approval screen: ${frontendUrl}/meetings/${result.meetingId}/approval`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

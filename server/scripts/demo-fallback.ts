/**
 * Demo fallback / rehearsal script — reproduces the exact supersession "wow moment"
 * end to end (real GPT-4o-mini, real knowledge-base writes) without depending on a
 * live Zoom meeting actually producing a Cloud Recording transcript.
 *
 * Uses the pre-seeded "Acme Corp" / "John Smith" demo account so it's consistent
 * with whatever the presenter shows in the UI.
 *
 * Usage (from server/, with Postgres/Redis up):
 *   npx tsx --env-file=.env scripts/demo-fallback.ts 1   # kickoff meeting
 *   npx tsx --env-file=.env scripts/demo-fallback.ts 2   # follow-up that supersedes meeting 1
 *
 * Run 1 then 2 live during the demo (narrate "meeting 1 happened last week" / "meeting 2
 * just ended") — or run both back to back beforehand as a pure rehearsal. Either way, meeting 2
 * ends AWAITING_APPROVAL with a real follow-up draft ready for the human-edit-then-approve
 * finale in the UI — that step is deliberately NOT scripted here, do it live.
 */
import { prisma } from "../src/db.js";
import { buildMeetingContext } from "../src/modules/knowledge/context.js";
import { extractMeeting, generateFollowup } from "../src/modules/ai/service.js";
import { applyExtractionToKnowledgeBase } from "../src/modules/knowledge/relationship.js";

const DEMO_ACCOUNT_ID = "demo-acme-corp";
const DEMO_TENANT_ID_FALLBACK = process.env.DEMO_TENANT_ID; // optional override; otherwise inferred from the account

const PARTICIPANTS = [
  { name: "You", email: "abhayshukla4455@gmail.com" },
  { name: "John Smith", email: "john@acme.com" },
];

const SCENARIOS: Record<string, { title: string; daysAgo: number; vtt: string; segments: Array<{ speaker: string; start: string; end: string; text: string }> }> = {
  "1": {
    title: "Acme Corp — Website Redesign Kickoff",
    daysAgo: 7,
    vtt: `WEBVTT

1
00:00:00.000 --> 00:00:08.000
You: Thanks for hopping on, John. Let's kick off the website redesign project.

2
00:00:08.000 --> 00:00:16.000
John Smith: We've reviewed the proposal and we want to move forward with Integration Approach A — the direct API integration.

3
00:00:16.000 --> 00:00:24.000
John Smith: I'll own sending over the detailed integration proposal by this Friday.

4
00:00:24.000 --> 00:00:30.000
You: Sounds good. One thing to flag — integration complexity is the main risk here given your legacy CRM.
`,
    segments: [
      { speaker: "You", start: "00:00:00.000", end: "00:00:08.000", text: "Thanks for hopping on, John. Let's kick off the website redesign project." },
      { speaker: "John Smith", start: "00:00:08.000", end: "00:00:16.000", text: "We've reviewed the proposal and we want to move forward with Integration Approach A — the direct API integration." },
      { speaker: "John Smith", start: "00:00:16.000", end: "00:00:24.000", text: "I'll own sending over the detailed integration proposal by this Friday." },
      { speaker: "You", start: "00:00:24.000", end: "00:00:30.000", text: "Sounds good. One thing to flag — integration complexity is the main risk here given your legacy CRM." },
    ],
  },
  "2": {
    title: "Acme Corp — Website Redesign Follow-up",
    daysAgo: 0,
    vtt: `WEBVTT

1
00:00:00.000 --> 00:00:09.000
John Smith: Quick update — after the technical review, we've actually decided against Integration Approach A, it's too complex given our CRM constraints.

2
00:00:09.000 --> 00:00:18.000
John Smith: We're going with Approach B instead, the middleware integration. That's confirmed on our end.

3
00:00:18.000 --> 00:00:28.000
John Smith: Also, I'm swamped this month — Sarah on my team is going to take over sending the integration proposal instead of me, and realistically it'll be Monday, not this Friday.

4
00:00:28.000 --> 00:00:32.000
You: Got it, thanks for the update. I'll get the follow-up over to you both.
`,
    segments: [
      { speaker: "John Smith", start: "00:00:00.000", end: "00:00:09.000", text: "Quick update — after the technical review, we've actually decided against Integration Approach A, it's too complex given our CRM constraints." },
      { speaker: "John Smith", start: "00:00:09.000", end: "00:00:18.000", text: "We're going with Approach B instead, the middleware integration. That's confirmed on our end." },
      { speaker: "John Smith", start: "00:00:18.000", end: "00:00:28.000", text: "Also, I'm swamped this month — Sarah on my team is going to take over sending the integration proposal instead of me, and realistically it'll be Monday, not this Friday." },
      { speaker: "You", start: "00:00:28.000", end: "00:00:32.000", text: "Got it, thanks for the update. I'll get the follow-up over to you both." },
    ],
  },
};

async function main() {
  const arg = process.argv[2];
  const scenario = SCENARIOS[arg];
  if (!scenario) {
    console.error('Usage: npx tsx --env-file=.env scripts/demo-fallback.ts <1|2>');
    process.exit(1);
  }

  const account = await prisma.account.findUniqueOrThrow({ where: { id: DEMO_ACCOUNT_ID } });
  const tenantId = DEMO_TENANT_ID_FALLBACK ?? account.tenantId;

  const startTime = new Date(Date.now() - scenario.daysAgo * 24 * 60 * 60 * 1000);

  const meeting = await prisma.meeting.create({
    data: {
      tenantId,
      zoomMeetingId: `demo-fallback-${arg}`,
      zoomUuid: `demo-fallback-${arg}-${Date.now()}`,
      title: scenario.title,
      startTime,
      participants: PARTICIPANTS,
      accountId: DEMO_ACCOUNT_ID,
      status: "PROCESSING",
    },
  });

  await prisma.transcript.create({
    data: { meetingId: meeting.id, rawVtt: scenario.vtt, normalizedSegments: scenario.segments as any },
  });

  console.log(`[${scenario.title}] extracting with real GPT-4o-mini...`);
  const context = await buildMeetingContext(tenantId, DEMO_ACCOUNT_ID, meeting.id);
  const extraction = await extractMeeting(meeting.id, context);
  await applyExtractionToKnowledgeBase(meeting, extraction, context);
  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "AWAITING_APPROVAL" } });

  console.log("Generating follow-up draft...");
  const draft = await generateFollowup(meeting.id, "client-formal");
  await prisma.followupDraft.create({
    data: {
      meetingId: meeting.id,
      subject: draft.subject,
      body: draft.body,
      recipients: draft.recipients as any,
      tonePreset: "client-formal",
      status: "DRAFT",
      model: draft.model,
      modelVersion: draft.model,
      promptVersion: draft.promptVersion,
      templateVersion: draft.templateVersion,
    },
  });

  const [decisions, actions] = await Promise.all([
    prisma.decision.findMany({ where: { tenantId, accountId: DEMO_ACCOUNT_ID }, orderBy: { createdAt: "desc" } }),
    prisma.actionItem.findMany({ where: { tenantId, accountId: DEMO_ACCOUNT_ID }, orderBy: { createdAt: "desc" } }),
  ]);

  console.log("\n=== Current knowledge base state for Acme Corp ===");
  console.log("Decisions:", decisions.map((d) => `${d.status}: ${d.description}`));
  console.log("Action items:", actions.map((a) => `${a.status} (${a.ownerDisplayName}${a.dueDate ? ", due " + a.dueDate.toISOString().slice(0, 10) : ""}): ${a.description}`));
  console.log(`\nMeeting ready in the UI: http://localhost:5173/meetings/${meeting.id}`);
  console.log(`Approval screen: http://localhost:5173/meetings/${meeting.id}/approval`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

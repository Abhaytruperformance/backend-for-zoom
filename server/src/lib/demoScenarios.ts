/**
 * Shared by scripts/demo-fallback.ts (CLI) and modules/dev/routes.ts (authenticated HTTP
 * trigger, for environments like Render's free tier with no Shell access). Reproduces the
 * supersession "wow moment" end to end (real GPT-4o-mini, real knowledge-base writes)
 * without depending on a live Zoom meeting actually producing a Cloud Recording transcript.
 */
import { prisma } from "../db.js";
import { buildMeetingContext } from "../modules/knowledge/context.js";
import { extractMeeting, generateFollowup } from "../modules/ai/service.js";
import { applyExtractionToKnowledgeBase } from "../modules/knowledge/relationship.js";

const PARTICIPANTS = [
  { name: "You", email: "abhayshukla4455@gmail.com" },
  { name: "John Smith", email: "john@acme.com" },
];

export const DEMO_SCENARIOS: Record<
  string,
  { title: string; daysAgo: number; vtt: string; segments: Array<{ speaker: string; start: string; end: string; text: string }> }
> = {
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

export async function seedDemoScenario(tenantId: string, scenarioKey: string) {
  const scenario = DEMO_SCENARIOS[scenarioKey];
  if (!scenario) {
    throw Object.assign(new Error(`Unknown demo scenario "${scenarioKey}" — valid values: ${Object.keys(DEMO_SCENARIOS).join(", ")}`), { status: 400 });
  }

  // Scoped to this tenant specifically — a global lookup-by-name here previously let two
  // different tenants' demo runs silently share (and cross-reference) the same account row.
  const demoAccountId = `demo-acme-corp-${tenantId}`;
  let account = await prisma.account.findUnique({ where: { id: demoAccountId } });
  if (!account) {
    account = await prisma.account.create({
      data: { id: demoAccountId, tenantId, name: "Acme Corp", domains: ["acme.com"], emails: [] },
    });
    await prisma.contact.create({
      data: { tenantId, accountId: demoAccountId, name: "John Smith", email: "john@acme.com" },
    });
  }

  const startTime = new Date(Date.now() - scenario.daysAgo * 24 * 60 * 60 * 1000);

  const meeting = await prisma.meeting.create({
    data: {
      tenantId,
      zoomMeetingId: `demo-fallback-${scenarioKey}`,
      zoomUuid: `demo-fallback-${scenarioKey}-${Date.now()}`,
      title: scenario.title,
      startTime,
      participants: PARTICIPANTS,
      accountId: account.id,
      status: "PROCESSING",
    },
  });

  await prisma.transcript.create({
    data: { meetingId: meeting.id, rawVtt: scenario.vtt, normalizedSegments: scenario.segments as any },
  });

  const context = await buildMeetingContext(tenantId, account.id, meeting.id);
  const extraction = await extractMeeting(meeting.id, context);
  await applyExtractionToKnowledgeBase(meeting, extraction, context);
  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "AWAITING_APPROVAL" } });

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
    prisma.decision.findMany({ where: { tenantId, accountId: account.id }, orderBy: { createdAt: "desc" } }),
    prisma.actionItem.findMany({ where: { tenantId, accountId: account.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return {
    meetingId: meeting.id,
    title: scenario.title,
    decisions: decisions.map((d) => `${d.status}: ${d.description}`),
    actionItems: actions.map((a) => `${a.status} (${a.ownerDisplayName}${a.dueDate ? ", due " + a.dueDate.toISOString().slice(0, 10) : ""}): ${a.description}`),
  };
}

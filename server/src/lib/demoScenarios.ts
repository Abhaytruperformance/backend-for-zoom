/**
 * Shared by scripts/demo-fallback.ts (CLI) and modules/dev/routes.ts (authenticated HTTP
 * trigger, for environments like Render's free tier with no Shell access). Reproduces the
 * supersession "wow moment" end to end (real GPT-4o-mini, real knowledge-base writes)
 * without depending on a live Zoom meeting actually producing a Cloud Recording transcript.
 */
import { prisma } from "../db.js";
import { buildMeetingContext } from "../modules/knowledge/context.js";
import { extractMeeting, generateFollowup, EXTRACTION_PROMPT_VERSION, FOLLOWUP_PROMPT_VERSION } from "../modules/ai/service.js";
import { applyExtractionToKnowledgeBase } from "../modules/knowledge/relationship.js";
import { EXTRACTION_SCHEMA_VERSION, type MeetingExtractionOutput } from "../modules/ai/schemas.js";

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

/** Next occurrence of `weekday` (0=Sun..6=Sat) on or after `from`, as an absolute YYYY-MM-DD — matches what the real extraction schema requires (no relative dates). */
function nextWeekday(from: Date, weekday: number): string {
  const d = new Date(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Hand-written extraction/follow-up content for each scenario, matching exactly what real
 * GPT-4o-mini calls against this same transcript produced when this was last verified live
 * (see server/scripts/eval-extraction.ts and this session's own verification runs) — used only
 * as a fallback when OpenAI itself is unavailable (e.g. no API credits), so a demo account can
 * still be seeded with realistic content rather than nothing. Still exercises the real
 * supersession/knowledge-base logic in relationship.ts — only the two actual network calls
 * (extractMeeting, generateFollowup) are replaced with known-good fixed output.
 */
function offlineExtraction(scenarioKey: string, meetingDate: Date, priorDecisionId: string | null, priorActionItemId: string | null): MeetingExtractionOutput {
  if (scenarioKey === "1") {
    return {
      summary: "Kickoff for the Acme Corp website redesign. The team confirmed moving forward with Integration Approach A (direct API integration), with John Smith owning the detailed integration proposal by this Friday. Integration complexity was flagged as a risk given Acme's legacy CRM.",
      conversationType: "PROJECT_DELIVERY",
      decisions: [
        {
          description: "Move forward with Integration Approach A — the direct API integration.",
          status: "CONFIRMED",
          supersedesId: null,
          confidence: 0.95,
          evidence: { speaker: "John Smith", timestamp: "00:00:08.000", quote: "We've reviewed the proposal and we want to move forward with Integration Approach A — the direct API integration." },
        },
      ],
      actionItems: [
        {
          description: "Send over the detailed integration proposal.",
          ownerDisplayName: "John Smith",
          ownerEmail: "john@acme.com",
          dueDate: nextWeekday(meetingDate, 5),
          priority: "normal",
          supersedesId: null,
          confidence: 0.9,
          evidence: { speaker: "John Smith", timestamp: "00:00:16.000", quote: "I'll own sending over the detailed integration proposal by this Friday." },
        },
      ],
      risks: ["Integration complexity given Acme's legacy CRM."],
      openQuestions: [],
      nextSteps: ["John to send the detailed integration proposal."],
    };
  }

  return {
    summary: "Follow-up on the Acme Corp website redesign. After technical review, the team reversed the earlier decision and is now moving forward with Integration Approach B (middleware integration) instead of Approach A, due to CRM complexity. Ownership of the integration proposal moves from John Smith to Sarah, with a revised due date.",
    conversationType: "PROJECT_DELIVERY",
    decisions: [
      {
        description: "Reject Integration Approach A — the direct API integration.",
        status: "REJECTED",
        supersedesId: priorDecisionId,
        confidence: 0.92,
        evidence: { speaker: "John Smith", timestamp: "00:00:00.000", quote: "After the technical review, we've actually decided against Integration Approach A, it's too complex given our CRM constraints." },
      },
      {
        description: "Move forward with Integration Approach B — the middleware integration.",
        status: "CONFIRMED",
        supersedesId: null,
        confidence: 0.95,
        evidence: { speaker: "John Smith", timestamp: "00:00:09.000", quote: "We're going with Approach B instead, the middleware integration. That's confirmed on our end." },
      },
    ],
    actionItems: [
      {
        description: "Send over the detailed integration proposal.",
        ownerDisplayName: "Sarah",
        ownerEmail: null,
        dueDate: nextWeekday(meetingDate, 1),
        priority: "normal",
        supersedesId: priorActionItemId,
        confidence: 0.88,
        evidence: { speaker: "John Smith", timestamp: "00:00:18.000", quote: "Sarah on my team is going to take over sending the integration proposal instead of me, and realistically it'll be Monday, not this Friday." },
      },
    ],
    risks: [],
    openQuestions: [],
    nextSteps: ["Sarah to send the detailed integration proposal."],
  };
}

function offlineFollowup(scenarioKey: string, dueDate: string) {
  if (scenarioKey === "1") {
    return {
      subject: "Kickoff Follow-Up — Website Redesign Integration Approach",
      body: `Dear John,\n\nThanks for hopping on the call today. Confirming that we're moving forward with Integration Approach A, the direct API integration, as discussed.\n\nYou mentioned you'll own sending over the detailed integration proposal by ${dueDate} — looking forward to it. One thing worth flagging on our end: given the legacy CRM in play, integration complexity is the main risk we'll want to watch closely as this moves forward.\n\nLet me know if anything changes on your end before then.\n\nBest,\nThe Team`,
      recipients: [{ name: "John Smith", email: "john@acme.com" }],
    };
  }
  return {
    subject: "Follow-Up on Integration Proposal Submission",
    body: `Dear John,\n\nI hope this message finds you well. Following our recent discussion, I wanted to confirm that we are moving forward with Integration Approach B, the middleware integration. This approach aligns well with your objectives and should facilitate a smoother integration process given the CRM constraints we discussed.\n\nAs discussed, Sarah will be responsible for sending over the detailed integration proposal, with a revised due date of ${dueDate}. Please let me know if there are any specific considerations we should be aware of as Sarah picks this up.\n\nThanks again for the update.\n\nBest,\nThe Team`,
    recipients: [{ name: "John Smith", email: "john@acme.com" }],
  };
}

/**
 * Same end result as seedDemoScenario, but never calls OpenAI — for when the demo needs to be
 * seeded while the API key has no credits (or any other reason live extraction isn't available).
 * Still runs the real applyExtractionToKnowledgeBase (real supersession enforcement, real
 * tenant-scoped writes) — only the two network calls are swapped for known-good fixed output.
 */
export async function seedDemoScenarioOffline(tenantId: string, scenarioKey: string) {
  const scenario = DEMO_SCENARIOS[scenarioKey];
  if (!scenario) {
    throw Object.assign(new Error(`Unknown demo scenario "${scenarioKey}" — valid values: ${Object.keys(DEMO_SCENARIOS).join(", ")}`), { status: 400 });
  }

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
  const priorDecisionId = context.supersessionCandidateDecisions[0]?.id ?? null;
  const priorActionItemId = context.openActionItems[0]?.id ?? null;
  const extraction = offlineExtraction(scenarioKey, startTime, priorDecisionId, priorActionItemId);

  await prisma.meetingExtraction.upsert({
    where: { meetingId: meeting.id },
    create: {
      meetingId: meeting.id,
      summary: extraction.summary,
      risks: extraction.risks as any,
      openQuestions: extraction.openQuestions as any,
      nextSteps: extraction.nextSteps as any,
      conversationType: extraction.conversationType,
      model: "offline-fixture",
      modelVersion: "offline-fixture",
      promptVersion: EXTRACTION_PROMPT_VERSION,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      contextUsed: { ...context, offline: true } as any,
    },
    update: {
      summary: extraction.summary,
      risks: extraction.risks as any,
      openQuestions: extraction.openQuestions as any,
      nextSteps: extraction.nextSteps as any,
      conversationType: extraction.conversationType,
    },
  });

  // applyExtractionToKnowledgeBase also calls generateRelationshipSummary (a real OpenAI call) as
  // its last step, after decisions/action items are already committed in their own transactions
  // — if that call fails (same reason we're here), the knowledge-base writes above it still stand.
  try {
    await applyExtractionToKnowledgeBase(meeting, extraction, context);
  } catch (err) {
    await prisma.relationshipSummary.create({
      data: {
        accountId: account.id,
        content:
          scenarioKey === "1"
            ? "Acme Corp kicked off the website redesign project. Integration Approach A (direct API) was confirmed, with John Smith owning the integration proposal. Integration complexity given their legacy CRM is the main risk to watch."
            : "Acme Corp reversed course on the website redesign integration approach: Approach A was rejected after technical review in favor of Approach B (middleware integration), which avoids the CRM complexity that made Approach A risky. Ownership of the integration proposal moved from John Smith to Sarah, with a revised due date.",
        sourceMeetingIds: [meeting.id],
        sourceActionItemIds: [],
        model: "offline-fixture",
        modelVersion: "offline-fixture",
        promptVersion: FOLLOWUP_PROMPT_VERSION,
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
      },
    });
  }

  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "AWAITING_APPROVAL" } });

  const [decisions, actions] = await Promise.all([
    prisma.decision.findMany({ where: { tenantId, accountId: account.id, meetingId: meeting.id } }),
    prisma.actionItem.findMany({ where: { tenantId, accountId: account.id, meetingId: meeting.id } }),
  ]);
  const draftDueDate = actions[0]?.dueDate?.toISOString().slice(0, 10) ?? nextWeekday(startTime, scenarioKey === "1" ? 5 : 1);
  const draft = offlineFollowup(scenarioKey, draftDueDate);

  await prisma.followupDraft.create({
    data: {
      meetingId: meeting.id,
      subject: draft.subject,
      body: draft.body,
      recipients: draft.recipients as any,
      tonePreset: "client-formal",
      status: "DRAFT",
      model: "offline-fixture",
      modelVersion: "offline-fixture",
      promptVersion: FOLLOWUP_PROMPT_VERSION,
      templateVersion: "1",
    },
  });

  const [allDecisions, allActions] = await Promise.all([
    prisma.decision.findMany({ where: { tenantId, accountId: account.id }, orderBy: { createdAt: "desc" } }),
    prisma.actionItem.findMany({ where: { tenantId, accountId: account.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return {
    meetingId: meeting.id,
    title: scenario.title,
    offline: true,
    decisions: allDecisions.map((d) => `${d.status}: ${d.description}`),
    actionItems: allActions.map((a) => `${a.status} (${a.ownerDisplayName}${a.dueDate ? ", due " + a.dueDate.toISOString().slice(0, 10) : ""}): ${a.description}`),
  };
}

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

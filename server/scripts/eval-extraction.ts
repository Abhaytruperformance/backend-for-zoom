/**
 * A small, honest first AI evaluation harness — not a benchmark suite, a starting point.
 * Runs real GPT-4o-mini extraction against a handful of hand-written transcripts with known-
 * correct expected facts, and checks simple pass/fail assertions against the real output.
 *
 * This is deliberately lightweight: exact-string matching would fail on any paraphrase, so
 * checks are keyword/field-level (does the description mention X, is the owner exactly Y, does
 * the due date resolve to exactly Z) rather than a full NLP similarity score. Good enough to
 * catch a real regression or a systematic bias (e.g. date-inference errors); not a substitute
 * for a proper labeled dataset if this needs to scale up later.
 *
 * Usage (from server/, with Postgres up):
 *   npx tsx --env-file=.env scripts/eval-extraction.ts
 */
import { prisma } from "../src/db.js";
import { buildMeetingContext } from "../src/modules/knowledge/context.js";
import { extractMeeting } from "../src/modules/ai/service.js";
import { applyExtractionToKnowledgeBase } from "../src/modules/knowledge/relationship.js";
import { parseVtt } from "../src/modules/zoom/ingestion.js";
import type { MeetingExtractionOutput } from "../src/modules/ai/schemas.js";

const EVAL_ACCOUNT_ID = "eval-fixtures-account";
const EVAL_TENANT_ID = process.env.EVAL_TENANT_ID;

interface Check {
  label: string;
  pass: (extraction: MeetingExtractionOutput) => boolean;
}

interface Fixture {
  name: string;
  title: string;
  daysAgo: number;
  vtt: string;
  checks: Check[];
  /** If true, this meeting's extraction result feeds knowledge-base state that the NEXT fixture's checks may depend on (supersession case). */
  applyToKnowledgeBase?: boolean;
}

function decisionMentions(extraction: MeetingExtractionOutput, keyword: string): boolean {
  return extraction.decisions.some((d) => d.description.toLowerCase().includes(keyword.toLowerCase()));
}

const FIXTURES: Fixture[] = [
  {
    name: "basic-decision-and-action",
    title: "Eval — Basic decision and action item",
    daysAgo: 3,
    vtt: `WEBVTT

1
00:00:00.000 --> 00:00:06.000
Priya: Let's confirm — we're going with the annual billing plan, not monthly.

2
00:00:06.000 --> 00:00:12.000
Tom: Confirmed on our end. I'll send over the signed order form by Wednesday.
`,
    checks: [
      { label: "extracts a CONFIRMED decision about annual billing", pass: (e) => e.decisions.some((d) => d.status === "CONFIRMED" && d.description.toLowerCase().includes("annual")) },
      { label: "extracts an action item owned by Tom", pass: (e) => e.actionItems.some((a) => a.ownerDisplayName.toLowerCase().includes("tom")) },
    ],
  },
  {
    name: "supersession-1-kickoff",
    title: "Eval — Supersession kickoff",
    daysAgo: 10,
    vtt: `WEBVTT

1
00:00:00.000 --> 00:00:08.000
Dana: We've decided to launch on the East Coast servers first, that's confirmed.

2
00:00:08.000 --> 00:00:15.000
Dana: Marcus is going to own the migration runbook.
`,
    checks: [{ label: "extracts a CONFIRMED decision about East Coast", pass: (e) => decisionMentions(e, "east coast") && e.decisions.some((d) => d.status === "CONFIRMED") }],
    applyToKnowledgeBase: true,
  },
  {
    name: "supersession-2-followup",
    title: "Eval — Supersession follow-up",
    daysAgo: 0,
    vtt: `WEBVTT

1
00:00:00.000 --> 00:00:09.000
Dana: Update — we're actually switching to West Coast servers instead, East Coast had compliance issues. That's final.

2
00:00:09.000 --> 00:00:16.000
Dana: And Marcus is out this month, Elena's taking over the migration runbook.
`,
    checks: [
      { label: "extracts a CONFIRMED decision about West Coast", pass: (e) => decisionMentions(e, "west coast") && e.decisions.some((d) => d.status === "CONFIRMED") },
      { label: "the West Coast decision is marked as superseding something", pass: (e) => e.decisions.some((d) => decisionMentionsKeyword(d.description, "west") && !!d.supersedesId) },
      { label: "extracts an action item now owned by Elena, not Marcus", pass: (e) => e.actionItems.some((a) => a.ownerDisplayName.toLowerCase().includes("elena")) },
    ],
  },
  {
    name: "relative-date-resolution",
    title: "Eval — Relative date resolution",
    daysAgo: 0, // meetingDate becomes "today" in the assertion below
    vtt: `WEBVTT

1
00:00:00.000 --> 00:00:07.000
Wei: I'll get you the budget numbers by next Tuesday.
`,
    checks: [
      {
        label: "resolves 'next Tuesday' to an absolute YYYY-MM-DD date, not a relative string",
        pass: (e) => e.actionItems.some((a) => a.dueDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate!) && !/tuesday|next|friday|monday/i.test(a.dueDate!)),
      },
    ],
  },
  {
    name: "no-hallucination",
    title: "Eval — Vague discussion, no real decision",
    daysAgo: 1,
    vtt: `WEBVTT

1
00:00:00.000 --> 00:00:08.000
Sam: We might explore a partnership at some point, nothing concrete yet.

2
00:00:08.000 --> 00:00:14.000
Sam: Let's just keep talking and see where it goes.
`,
    checks: [{ label: "does not fabricate a CONFIRMED decision from vague discussion", pass: (e) => !e.decisions.some((d) => d.status === "CONFIRMED") }],
  },
];

function decisionMentionsKeyword(description: string, keyword: string): boolean {
  return description.toLowerCase().includes(keyword.toLowerCase());
}

async function main() {
  if (!EVAL_TENANT_ID) {
    console.error("Set EVAL_TENANT_ID to an existing tenant id, e.g.:\n  EVAL_TENANT_ID=<id> npx tsx --env-file=.env scripts/eval-extraction.ts");
    process.exit(1);
  }

  let account = await prisma.account.findUnique({ where: { id: EVAL_ACCOUNT_ID } });
  if (!account) {
    account = await prisma.account.create({ data: { id: EVAL_ACCOUNT_ID, tenantId: EVAL_TENANT_ID, name: "Eval Fixtures", domains: [], emails: [] } });
  }

  let totalChecks = 0;
  let passedChecks = 0;

  for (const fixture of FIXTURES) {
    const startTime = new Date(Date.now() - fixture.daysAgo * 24 * 60 * 60 * 1000);
    const meeting = await prisma.meeting.create({
      data: {
        tenantId: EVAL_TENANT_ID,
        zoomMeetingId: `eval-${fixture.name}`,
        zoomUuid: `eval-${fixture.name}-${Date.now()}`,
        title: fixture.title,
        startTime,
        participants: [],
        accountId: EVAL_ACCOUNT_ID,
        status: "PROCESSING",
      },
    });
    await prisma.transcript.create({ data: { meetingId: meeting.id, rawVtt: fixture.vtt, normalizedSegments: parseVtt(fixture.vtt) as any } });

    const context = await buildMeetingContext(EVAL_TENANT_ID, EVAL_ACCOUNT_ID, meeting.id);
    const extraction = await extractMeeting(meeting.id, context);
    if (process.env.EVAL_DEBUG) console.log(JSON.stringify(extraction, null, 2));

    console.log(`\n=== ${fixture.title} ===`);
    for (const check of fixture.checks) {
      totalChecks++;
      const ok = check.pass(extraction);
      if (ok) passedChecks++;
      console.log(`  ${ok ? "✓" : "✗"} ${check.label}`);
    }

    if (fixture.applyToKnowledgeBase) {
      await applyExtractionToKnowledgeBase(meeting, extraction, context);
    }
  }

  console.log(`\n${passedChecks}/${totalChecks} checks passed`);

  // Cleanup — this is a repeatable eval run, not data meant to persist.
  await prisma.decision.deleteMany({ where: { accountId: EVAL_ACCOUNT_ID } });
  await prisma.actionItem.deleteMany({ where: { accountId: EVAL_ACCOUNT_ID } });
  await prisma.meetingExtraction.deleteMany({ where: { meeting: { accountId: EVAL_ACCOUNT_ID } } });
  await prisma.transcript.deleteMany({ where: { meeting: { accountId: EVAL_ACCOUNT_ID } } });
  await prisma.relationshipSummary.deleteMany({ where: { accountId: EVAL_ACCOUNT_ID } });
  await prisma.meeting.deleteMany({ where: { accountId: EVAL_ACCOUNT_ID } });
  await prisma.account.delete({ where: { id: EVAL_ACCOUNT_ID } }).catch(() => {});

  process.exit(passedChecks === totalChecks ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

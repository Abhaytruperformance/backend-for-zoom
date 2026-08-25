import { prisma } from "../../db.js";
import { callStructured, countTokens } from "./client.js";
import {
  EXTRACTION_SCHEMA_VERSION,
  RELATIONSHIP_SCHEMA_VERSION,
  followupOutputSchema,
  meetingExtractionOutputSchema,
  relationshipSummaryOutputSchema,
  type FollowupOutput,
  type MeetingExtractionOutput,
} from "./schemas.js";
import type { MeetingContextPackage } from "../knowledge/context.js";
import { config } from "../../config.js";

export const EXTRACTION_PROMPT_VERSION = "1";
export const RELATIONSHIP_PROMPT_VERSION = "1";
export const FOLLOWUP_PROMPT_VERSION = "1";

const CHUNK_TOKEN_THRESHOLD = 12_000;
const CHUNK_OVERLAP_SEGMENTS = 5;

type Segment = { speaker: string; start: string; end: string; text: string };

const EXTRACTION_RULES = `You extract structured facts from a meeting transcript.
Rules:
- Never invent people, dates, decisions, commitments, or email recipients. Only use what is stated in the transcript.
- If uncertain, lower "confidence" and add the open question to "openQuestions" instead of asserting it as fact.
- Every decision and action item MUST include "evidence" with the speaker, an approximate timestamp if visible, and a short verbatim quote.
- A decision's "status" must be CONFIRMED only if the transcript clearly confirms it as final; use PROPOSED/TENTATIVE for anything discussed but not settled; use REJECTED if explicitly rejected.
- You may be given a list of "existingOpenItems" (open action items) and "existingDecisions" (candidates for supersession) from prior meetings with this account. If the CURRENT transcript clearly updates one of them (new owner, new due date, explicit confirmation, or explicit rejection), set "supersedesId" to that item's id. Only set supersedesId when the transcript is explicit about the change — do not guess.
- "dueDate" MUST be an absolute date in YYYY-MM-DD format, or null if none was stated. The transcript's "meetingDate" (given below) is your reference point for converting relative references ("Friday", "next Monday", "in two weeks") to an absolute date. Never output a relative string like "Friday" as dueDate.
- Respond with ONLY a JSON object matching the required schema, no prose.`;

function contextBlock(context: MeetingContextPackage): string {
  return JSON.stringify(
    {
      accountName: context.accountName,
      relationshipSummary: context.relationshipSummary,
      existingOpenItems: context.openActionItems,
      existingDecisions: context.supersessionCandidateDecisions,
      recentMeetings: context.recentMeetings,
    },
    null,
    2
  );
}

function segmentsToText(segments: Segment[]): string {
  return segments.map((s) => `[${s.start}] ${s.speaker}: ${s.text}`).join("\n");
}

async function extractSingleCall(transcriptText: string, context: MeetingContextPackage, meetingDate: string, extraCandidates?: string) {
  const user = `Meeting date: ${meetingDate}\n\nContext (account relationship state — for supersession matching only, do not restate it in the summary):\n${contextBlock(context)}\n\n${
    extraCandidates ? `Prior chunk candidates to reconcile against (a later statement may override an earlier one):\n${extraCandidates}\n\n` : ""
  }Transcript:\n${transcriptText}\n\nRequired JSON shape: { summary, conversationType, decisions: [{description,status,supersedesId,confidence,evidence:{speaker,timestamp,quote}}], actionItems: [{description,ownerDisplayName,ownerEmail,dueDate,priority,supersedesId,confidence,evidence}], risks: [string], openQuestions: [string], nextSteps: [string] }`;

  return callStructured({ system: EXTRACTION_RULES, user, schema: meetingExtractionOutputSchema });
}

/** Chunked extraction for long transcripts: per-chunk candidates (kept in full, not summarized) feed one consolidation call. */
async function extractChunked(segments: Segment[], context: MeetingContextPackage, meetingDate: string) {
  const chunks: Segment[][] = [];
  const approxSegmentsPerChunk = Math.max(20, Math.floor((CHUNK_TOKEN_THRESHOLD * segments.length) / countTokens(segmentsToText(segments))));
  for (let i = 0; i < segments.length; i += approxSegmentsPerChunk - CHUNK_OVERLAP_SEGMENTS) {
    chunks.push(segments.slice(i, i + approxSegmentsPerChunk));
  }

  const chunkResults: MeetingExtractionOutput[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const chunk of chunks) {
    const result = await extractSingleCall(segmentsToText(chunk), context, meetingDate);
    chunkResults.push(result.data);
    totalPromptTokens += result.promptTokens;
    totalCompletionTokens += result.completionTokens;
  }

  const candidateBundle = JSON.stringify(
    chunkResults.map((r, i) => ({ chunkIndex: i, decisions: r.decisions, actionItems: r.actionItems, risks: r.risks, openQuestions: r.openQuestions, nextSteps: r.nextSteps })),
    null,
    2
  );

  const finalUser = `Meeting date: ${meetingDate}\n\nConsolidate the candidate decisions/action items gathered across sequential chunks of ONE meeting transcript into a single final result. A candidate from a later chunk that clearly reassigns or updates an earlier chunk's item (e.g. a different owner or date for the same commitment) should replace it — keep only the final, correct version plus its evidence. Do not duplicate the same underlying commitment twice.\n\nCandidates:\n${candidateBundle}\n\nWrite one overall "summary" covering the whole meeting.\n\nRequired JSON shape: { summary, conversationType, decisions: [...], actionItems: [...], risks: [...], openQuestions: [...], nextSteps: [...] } — same shape as the candidates. "dueDate" fields must already be absolute YYYY-MM-DD (from the candidates) — keep them as-is, don't reintroduce relative text.`;

  const final = await callStructured({ system: EXTRACTION_RULES, user: finalUser, schema: meetingExtractionOutputSchema });
  return {
    data: final.data,
    promptTokens: totalPromptTokens + final.promptTokens,
    completionTokens: totalCompletionTokens + final.completionTokens,
    latencyMs: final.latencyMs,
    chunked: true,
    chunkCount: chunks.length,
  };
}

export async function extractMeeting(meetingId: string, context: MeetingContextPackage) {
  const [transcript, meeting] = await Promise.all([
    prisma.transcript.findUniqueOrThrow({ where: { meetingId } }),
    prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
  ]);
  const segments = transcript.normalizedSegments as unknown as Segment[];
  const fullText = segmentsToText(segments);
  const tokenCount = countTokens(fullText);
  const meetingDate = (meeting.startTime ?? new Date()).toISOString().slice(0, 10);

  const result =
    tokenCount > CHUNK_TOKEN_THRESHOLD
      ? await extractChunked(segments, context, meetingDate)
      : { ...(await extractSingleCall(fullText, context, meetingDate)), chunked: false, chunkCount: 1 };

  const contextUsed = { ...context, transcriptTokenCount: tokenCount, chunked: result.chunked, chunkCount: result.chunkCount };

  // upsert (not create) so this can also serve a "regenerate extraction" action on a meeting
  // that already has one — MeetingExtraction.meetingId is unique, a bare create would conflict.
  const extractionData = {
    summary: result.data.summary,
    risks: result.data.risks as any,
    openQuestions: result.data.openQuestions as any,
    nextSteps: result.data.nextSteps as any,
    conversationType: result.data.conversationType,
    model: config.OPENAI_MODEL,
    modelVersion: config.OPENAI_MODEL,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    contextUsed: contextUsed as any,
  };
  await prisma.meetingExtraction.upsert({
    where: { meetingId },
    create: { meetingId, ...extractionData },
    update: extractionData,
  });

  return result.data;
}

export async function generateRelationshipSummary(tenantId: string, accountId: string): Promise<void> {
  const [account, openActionItems, decisions, recentMeetings, previous] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: accountId } }),
    prisma.actionItem.findMany({ where: { tenantId, accountId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.decision.findMany({ where: { tenantId, accountId, supersededBy: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.meeting.findMany({ where: { tenantId, accountId }, orderBy: { startTime: "desc" }, take: 5, include: { extraction: true } }),
    prisma.relationshipSummary.findFirst({ where: { accountId }, orderBy: { generatedAt: "desc" } }),
  ]);

  const user = `Account: ${account.name}\nPrevious relationship summary (may be stale — the data below is current):\n${previous?.content ?? "(none yet)"}\n\nCurrently open commitments:\n${JSON.stringify(openActionItems.map((a) => ({ description: a.description, owner: a.ownerDisplayName, dueDate: a.dueDate })), null, 2)}\n\nCurrent decisions (CONFIRMED/PROPOSED/TENTATIVE, latest first):\n${JSON.stringify(decisions.map((d) => ({ description: d.description, status: d.status })), null, 2)}\n\nRecent meetings:\n${JSON.stringify(recentMeetings.map((m) => ({ date: m.startTime, summary: m.extraction?.summary })), null, 2)}\n\nWrite a concise (under 200 words) current-state relationship summary a rep could read before the next meeting. Reflect the current data above, not the previous summary, wherever they conflict.\n\nRequired JSON shape: { content: string }`;

  const result = await callStructured({
    system: "You write concise, factual account relationship summaries for a sales/delivery team. Never invent facts not present in the supplied data.",
    user,
    schema: relationshipSummaryOutputSchema,
  });

  await prisma.relationshipSummary.create({
    data: {
      accountId,
      content: result.data.content,
      sourceMeetingIds: recentMeetings.map((m) => m.id),
      sourceActionItemIds: openActionItems.map((a) => a.id),
      model: config.OPENAI_MODEL,
      modelVersion: config.OPENAI_MODEL,
      promptVersion: RELATIONSHIP_PROMPT_VERSION,
      schemaVersion: RELATIONSHIP_SCHEMA_VERSION,
    },
  });
}

export async function generateFollowup(meetingId: string, tonePreset: string): Promise<FollowupOutput & { model: string; promptVersion: string; templateVersion: string }> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { extraction: true, decisions: true, actionItems: true },
  });
  const participants = (meeting.participants as any) as Array<{ name: string; email?: string }>;
  const knownEmails = participants.filter((p) => p.email).map((p) => ({ name: p.name, email: p.email as string }));

  const user = `Meeting: ${meeting.title}\nConversation type: ${meeting.extraction?.conversationType}\nSummary: ${meeting.extraction?.summary}\nDecisions: ${JSON.stringify(meeting.decisions.map((d) => ({ description: d.description, status: d.status })))}\nAction items: ${JSON.stringify(meeting.actionItems.map((a) => ({ description: a.description, owner: a.ownerDisplayName, dueDate: a.dueDate })))}\nTone: ${tonePreset}\nKnown meeting participants with email addresses (the ONLY people you may propose as recipients): ${JSON.stringify(knownEmails)}\n\nWrite a follow-up email that continues this specific relationship (avoid generic "thank you for the meeting" boilerplate unless it genuinely fits). Only propose recipients from the known participants list above.\n\nRequired JSON shape: { subject, body, recipients: [{name, email}] }`;

  const result = await callStructured({
    system: "You draft follow-up emails for a relationship-intelligence product. Never invent recipients outside the supplied participant list.",
    user,
    schema: followupOutputSchema,
  });

  // Defense in depth: even if the model ignores the instruction, drop any recipient not in the known list.
  const knownEmailSet = new Set(knownEmails.map((k) => k.email.toLowerCase()));
  const safeRecipients = result.data.recipients.filter((r) => knownEmailSet.has(r.email.toLowerCase()));

  return {
    ...result.data,
    recipients: safeRecipients,
    model: config.OPENAI_MODEL,
    promptVersion: FOLLOWUP_PROMPT_VERSION,
    templateVersion: "1",
  };
}

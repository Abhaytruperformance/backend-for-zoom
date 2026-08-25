import { z } from "zod";

export const EXTRACTION_SCHEMA_VERSION = "1";
export const RELATIONSHIP_SCHEMA_VERSION = "1";
export const FOLLOWUP_SCHEMA_VERSION = "1";

const evidenceSchema = z.object({
  speaker: z.string(),
  timestamp: z.string().nullable().optional(),
  quote: z.string(),
});

const decisionOutputSchema = z.object({
  description: z.string(),
  status: z.enum(["CONFIRMED", "PROPOSED", "TENTATIVE", "REJECTED"]),
  // If set, must be one of the candidate ids we supplied in context (validated server-side, never trusted blindly).
  supersedesId: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidence: evidenceSchema,
});

const actionItemOutputSchema = z.object({
  description: z.string(),
  ownerDisplayName: z.string(),
  ownerEmail: z.string().email().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be an absolute ISO date YYYY-MM-DD, not a relative reference like 'Friday'")
    .nullable()
    .optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  supersedesId: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidence: evidenceSchema,
});

export const meetingExtractionOutputSchema = z.object({
  summary: z.string(),
  conversationType: z.enum(["SALES", "PROJECT_DELIVERY", "INTERNAL", "OTHER"]),
  decisions: z.array(decisionOutputSchema),
  actionItems: z.array(actionItemOutputSchema),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

export type MeetingExtractionOutput = z.infer<typeof meetingExtractionOutputSchema>;

export const relationshipSummaryOutputSchema = z.object({
  content: z.string(),
});

export type RelationshipSummaryOutput = z.infer<typeof relationshipSummaryOutputSchema>;

export const followupOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
  recipients: z.array(z.object({ name: z.string().optional(), email: z.string().email() })),
});

export type FollowupOutput = z.infer<typeof followupOutputSchema>;

export const conversationTypeSchema = z.enum(["SALES", "PROJECT_DELIVERY", "INTERNAL", "OTHER"]);

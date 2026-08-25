import OpenAI from "openai";
import { getEncoding } from "js-tiktoken";
import type { z, ZodType } from "zod";
import { config } from "../../config.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
// o200k_base is the encoding used by the gpt-4o model family (incl. gpt-4o-mini).
const encoding = getEncoding("o200k_base");

export interface StructuredCallResult<T> {
  data: T;
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  repaired: boolean;
}

/**
 * One structured OpenAI call, JSON-mode + zod validation, with exactly one
 * bounded repair retry (send the validation error back to the model) before
 * failing safely. Never silently accepts malformed output.
 */
export async function callStructured<S extends ZodType<any>>(params: {
  system: string;
  user: string;
  schema: S;
}): Promise<StructuredCallResult<z.infer<S>>> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  let repaired = false;
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const start = Date.now();
    const completion = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const latencyMs = Date.now() - start;
    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      lastError = "Response was not valid JSON";
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: `Your last response was not valid JSON. Error: ${lastError}. Reply again with ONLY valid JSON matching the required shape.` });
      repaired = true;
      continue;
    }

    const validation = params.schema.safeParse(parsedJson);
    if (validation.success) {
      return {
        data: validation.data,
        model: config.OPENAI_MODEL,
        latencyMs,
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        repaired,
      };
    }

    lastError = JSON.stringify(validation.error.flatten());
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `Your last response failed schema validation: ${lastError}. Reply again with ONLY valid JSON matching the required shape, fixing these issues.`,
    });
    repaired = true;
  }

  throw Object.assign(new Error(`AI structured output invalid after repair retry: ${lastError}`), {
    aiValidationFailure: true,
  });
}

/** Real token count (o200k_base) for the transcript-chunking threshold decision. */
export function countTokens(text: string): number {
  return encoding.encode(text).length;
}

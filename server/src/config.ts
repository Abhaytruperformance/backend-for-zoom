import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1, "TOKEN_ENCRYPTION_KEY is required (32-byte base64 key)"),
  JWT_SECRET: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  ZOOM_CLIENT_ID: z.string().default(""),
  ZOOM_CLIENT_SECRET: z.string().default(""),
  ZOOM_REDIRECT_URI: z.string().default(""),
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string().default(""),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default(""),

  MICROSOFT_CLIENT_ID: z.string().default(""),
  MICROSOFT_CLIENT_SECRET: z.string().default(""),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  MICROSOFT_REDIRECT_URI: z.string().default(""),

  OUTBOUND_MESSAGE_ID_DOMAIN: z.string().default("zri.local"),

  SKIP_INTEGRATION: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — see printed field errors above.");
}

export const config = parsed.data;

export const corsAllowedOrigins = config.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim());

/** Where to redirect the browser back to after an OAuth callback (it's a full-page redirect, not a fetch — landing on raw JSON would strand the user). */
export const frontendUrl = corsAllowedOrigins[0];

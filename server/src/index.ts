import express from "express";
// Explicit `default` rather than a default import: helmet's package exports map has no
// `types` condition, so TypeScript can land on either index.d.mts or index.d.cts depending
// on how the importing file is classified. Both declare `helmet as default` as a *named*
// export, so selecting it by name compiles under either resolution — a plain default import
// resolves to the module namespace in the CJS case, which isn't callable (TS2349).
import { default as helmet } from "helmet";
import cors from "cors";
import { config, corsAllowedOrigins } from "./config.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import { zoomWebhookRouter } from "./modules/zoom/webhooks.js";

// Last-resort safety net: a route handler bug or transient failure (DB blip, etc.) should
// return a 500 to that one request, never take down the whole process. Every route is now
// wrapped in asyncRoute so this shouldn't fire, but it's cheap insurance if one is missed.
process.on("unhandledRejection", (err) => {
  console.error("unhandled rejection (server stayed up):", err);
});

const app = express();

// Behind a reverse proxy/tunnel in every real deployment (and in local dev via ngrok/localtunnel),
// which sets X-Forwarded-For — express-rate-limit refuses to run without this being acknowledged.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: corsAllowedOrigins }));

// Webhook routes need the raw body for signature validation, so they're
// mounted before the JSON body parser and parse their own body.
app.use("/api/zoom/webhooks", zoomWebhookRouter);

app.use(express.json({ limit: "2mb" }));
app.use("/api", apiRateLimit, apiRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`server listening on :${config.PORT}`);
});

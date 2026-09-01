# Zoom Meeting Intelligence & Relationship Knowledge Base

Zoom-only meeting capture → transcript → OpenAI (GPT-4o-mini) extraction → persistent account/contact relationship knowledge → human-approved follow-up, sent from your own Gmail or Microsoft 365 mailbox.

The core idea: every meeting adds knowledge about the relationship, and that knowledge makes the next meeting — and the follow-up after it — smarter. See [`TECHNICAL.md`](./TECHNICAL.md) for architecture, data model, and the reasoning behind the harder design decisions.

## Stack

Node.js/TypeScript + Express + Prisma/Postgres + BullMQ/Redis on the backend, React/TypeScript (Vite) on the frontend, hand-written iOS/macOS-inspired design system (no component library).

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres + Redis), or point `DATABASE_URL`/`REDIS_URL` in `server/.env` at your own instances
- A Zoom OAuth app (Marketplace), a Google Cloud OAuth client, and/or a Microsoft Entra app registration — see [External app setup](#external-app-setup). The app boots and the unit test suite runs without these; you only need them to actually connect Zoom/mailboxes and call OpenAI
- An HTTPS tunnel (ngrok or similar) for local development — Zoom's OAuth and webhooks both require HTTPS, `http://localhost` doesn't work (see `TECHNICAL.md`)

## First run

```bash
npm install                          # installs both workspaces
docker compose up -d                 # Postgres :5442, Redis :6379
cd server
npx prisma migrate dev --name init   # creates the schema
```

Edit `server/.env` (already scaffolded with generated `TOKEN_ENCRYPTION_KEY`/`JWT_SECRET`) and fill in:

- `OPENAI_API_KEY` — required for any AI extraction/summary/follow-up call
- `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_REDIRECT_URI` (HTTPS tunnel URL) / `ZOOM_WEBHOOK_SECRET_TOKEN` — from your Zoom Marketplace app
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` — from Microsoft Entra ID app registration

Then, in three terminals:

```bash
npm run dev:server            # API on :4000
cd server && npm run worker   # BullMQ workers (transcript processing, email sending)
npm run dev:client            # UI on :5173
```

Open `http://localhost:5173`, register a workspace, then connect Zoom and a mailbox from the nav. Create your client Accounts/Contacts from the **Accounts** page (**+ New account**, then **+ Add contact** on that account's briefing page) — a meeting only auto-resolves to an account once its email/domain is known.

## Exposing it through a single tunnel

Free-tier ngrok allows exactly **one** simultaneous public endpoint tied to one static domain — not one per port. Rather than run two tunnels, point the single tunnel at the **Vite dev server** (`5173`), not Express (`4000`) directly:

```bash
ngrok http 5173
```

Vite's dev server already proxies `/api/*` to `localhost:4000` (see `client/vite.config.ts`), so the one tunnel transparently serves the UI *and* forwards Zoom's webhook/OAuth-callback POSTs to Express — same-origin, no CORS complications, and no change needed on Zoom's side beyond using that one URL for both the redirect URI and the webhook endpoint. Vite blocks unrecognized `Host` headers by default, so `vite.config.ts` allowlists `*.ngrok-free.dev`/`.ngrok-free.app`/`.ngrok.io`/`.ngrok.app` — add your own tunnel provider's domain pattern there if you're using something else. `/health` on the tunnel domain will 404/serve the SPA (it's not under `/api`) — that's expected, hit `/api/...` or the UI itself to check liveness.

## Tests

```bash
cd server && npm test
```

Runs against `server/.env`'s `DATABASE_URL`; the DB-backed suites skip automatically (not fail) if no Postgres is reachable, so this is safe to run at any point. `server/tests/integration` (real Zoom/Gmail/Graph calls) is separate and off by default (`SKIP_INTEGRATION=true`); it's a scaffolded-but-empty folder — a fast-follow, not yet written.

`server/scripts/eval-extraction.ts` is a small AI accuracy check — 8 hand-written assertions (decision confirmation, action-item ownership, decision supersession across two linked meetings, relative-date resolution, and a no-hallucination case on vague discussion) run against real GPT-4o-mini calls, not mocks. Currently 8/8. Not part of `npm test` (costs real API calls) — run manually with `EVAL_TENANT_ID=<id> npx tsx --env-file=.env scripts/eval-extraction.ts` from `server/`. Keyword/field-level checks, not exact-match — good enough to catch a regression or a systematic bias, not a substitute for a larger labeled dataset if this needs to scale up later.

`server/scripts/demo-fallback.ts` is a separate, reusable rehearsal/fallback tool — runs two scripted meetings (kickoff + follow-up) through the real pipeline (real GPT-4o-mini, real knowledge-base writes) against a seeded demo account, ending with a draft ready to approve in the UI. Useful for demos or for proving the pipeline works without depending on a live Zoom recording. Self-seeding — creates its demo account if one doesn't already exist, given `DEMO_TENANT_ID`. See the comment at the top of that file for usage.

`server/scripts/run-company-sync-once.ts` — same idea, but triggers the [company-wide Zoom sync](#company-wide-zoom-sync-server-to-server) on demand instead of waiting for its daily schedule.

## External app setup

**Zoom** (Marketplace → build a **General App**, not Server-to-Server or Webhook-only — that's a separate app, see [Company-wide Zoom sync](#company-wide-zoom-sync-server-to-server) below): both the OAuth redirect URI and the webhook endpoint must be HTTPS (`https://<your-domain>/api/zoom/oauth/callback` and `https://<your-domain>/api/zoom/webhooks`) — Zoom rejects plain `http://localhost` outright. Scopes: `user:read:user`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:read:participant`, `meeting:read:list_past_participants`, `cloud_recording:read:list_recording_files`, `cloud_recording:read:content`, `cloud_recording:read:recording`, `cloud_recording:read:meeting_transcript`. Webhooks: `meeting.ended`, `meeting.participant_joined`, `recording.transcript_completed`, `recording.completed`. Copy the webhook Secret Token into `ZOOM_WEBHOOK_SECRET_TOKEN`. Prefer uploading a manifest JSON over the per-field UI for this app (see `TECHNICAL.md` → Gotchas) — the UI was unreliable about actually persisting changes during development, and it's also the only reliable way to check `production_webhook_url` — this silently pointing at a stale local ngrok tunnel (left over from development) is a real way for the webhook path to look correctly configured while actually going nowhere; verify it explicitly after every environment change.

**Zoom app is in Development mode until reviewed.** Only Zoom accounts within the same account/org as whoever built the app can authorize it — anyone else gets bounced back to the Marketplace instead of the consent screen. Open this up via full **Submit for Review** (see "Going to production" below) to go **Published**. **Beta was tried and abandoned**: Beta's Security and Privacy Compliance Review is a separate, harder bar than Published itself — it requires evidence (SSDLC docs, SAST/DAST scan output, a pentest executive summary) this app doesn't have and Beta participation is explicitly optional per Zoom's own rejection email — publication doesn't require any of it. Don't resubmit for Beta; go straight for Published when ready for real customers.

**Google** (Cloud Console → OAuth client, Gmail API enabled): redirect URI `http://localhost:4000/api/mailbox/google/callback` (plain HTTP is fine here — this restriction is Zoom-specific); add your account under OAuth consent screen → Test users while the app is unverified.

**Microsoft** (Entra ID → App registration): redirect URI `http://localhost:4000/api/mailbox/microsoft/callback`; API permissions `Mail.Send`, `Mail.ReadBasic`, `User.Read`, `offline_access`. Run as **multitenant + personal accounts** (Authentication → Supported account types → "Accounts in any organizational directory and personal Microsoft accounts"), `MICROSOFT_TENANT_ID=common` — this is what's actually deployed, since single-tenant forces every user through a "Need admin approval" screen unless the tenant admin grants consent, which isn't something this app controls. **Before Azure will let you switch to that account type**, the app **Manifest**'s `api.requestedAccessTokenVersion` must already be `2` (find it under Authentication → Manifest, or via the Graph API app resource) — Azure blocks the account-type change with an opaque `Property api.requestedAccessTokenVersion is invalid` error otherwise, worth knowing before you go hunting for what's wrong.

## Company-wide Zoom sync (Server-to-Server)

Separate from the per-tenant OAuth Connect flow above, `server/src/modules/zoom/companySync.ts` pulls every user's recorded meetings across a **whole Zoom account** into one dedicated tenant — no one has to click Connect. Built for the case where a single company's own Zoom account should feed this app automatically, not for a multi-tenant product where different companies each connect their own Zoom (the per-tenant OAuth flow is what handles that case; Server-to-Server is locked to one account permanently and can't).

**Zoom setup**: Marketplace → build a **Server-to-Server OAuth** app (different from the General App above) → grant it the same recording/user-list scopes, admin-level (e.g. `user:read:list_users:admin`, `cloud_recording:read:list_user_recordings:admin` — exact current names may drift, verify against the live scope picker as always). You get an Account ID, Client ID, and Client Secret — no redirect URI, no user consent screen.

**Env vars** (`server/.env` or the platform's env vars): `ZOOM_S2S_ACCOUNT_ID`, `ZOOM_S2S_CLIENT_ID`, `ZOOM_S2S_CLIENT_SECRET`, and `ZOOM_S2S_SYNC_TENANT_ID` (the tenant the synced meetings should belong to — register a dedicated workspace for this rather than reusing a personal one). All four must be set or the sync silently no-ops rather than erroring.

Runs daily at 03:00 UTC via BullMQ's repeatable-job scheduling (registered in `jobs/worker.ts`). To test on demand instead of waiting: `npx tsx scripts/run-company-sync-once.ts` (needs the same env vars, plus a working `DATABASE_URL`/`REDIS_URL` — against Render's Postgres/Redis, use their **external** connection strings if running this from outside Render itself). Logs per-user recording/queued/failed counts, never meeting content, to stdout.

**This only finds meetings that were actually recorded to Zoom's cloud** — a meeting that happened but wasn't recorded (or was recorded locally, which Zoom's API can't see at all) is invisible to this or any API-based tool. If most of an account's meetings aren't showing up, check Zoom Account Admin → Account Management → Account Settings → Recording → **"Automatically record meetings to the cloud"** before assuming something's broken in the sync.

## Going to production (later, not now)

Testing-mode OAuth (Zoom Development, Google Testing status, Microsoft single-tenant) is correct for the current build-and-test phase. Before real customers can connect their own accounts:

1. Deploy to a real public domain — Google/Zoom verification both require a stable, publicly reachable app URL
2. Finalize scopes/redirect URIs against that domain first — verification is tied to the exact config submitted
3. Write a privacy policy + app homepage (Google requires both for sensitive scopes like `gmail.send`)
4. Submit for review: Google's OAuth verification, Zoom's Marketplace "Submit for Review," Microsoft's publisher verification + moving to multi-tenant
5. Write and run `tests/integration` against the production config before flipping real traffic over

## What's built

Full data model with provenance, Zoom OAuth + webhook ingestion (verified live: OAuth connect, signature validation, `meeting.ended`/`meeting.participant_joined` capture, and — as of this deploy — a real Zoom Cloud Recording → transcript **download**, the one step that used to be unverified), CAS state machine, chunked GPT-4o-mini extraction with evidence, deterministic account/contact resolution, backend-validated decision/action-item supersession, manual Account/Contact creation, relationship briefing with a dashboard of what needs attention (stat cards, aging badges on stuck approvals), human correction of any AI output (meeting title, conversation type, decisions, action items — all inline-editable), on-demand extraction regeneration, search/filter on meetings and accounts, password reset (real single-use token flow, verified live end to end — see `TECHNICAL.md` for the one honest caveat: no email delivery configured yet, so the token is logged server-side rather than emailed), Gmail send + Microsoft Graph send (both verified live — the Entra app now runs as multitenant + personal accounts, `MICROSOFT_TENANT_ID=common`, so it's no longer blocked on a tenant admin-consent wall) with reconciliation-based duplicate-send protection, approval snapshots, audit logging, tenant scoping, and an iOS/macOS-inspired UI throughout (toast notifications, confirm-before-reject, responsive nav).

**Also built**: Zoom/Gmail/Microsoft disconnect (not just connect), a one-time "Import past meetings" backfill for meetings that predate a tenant's Zoom connection, and a separate **company-wide Zoom sync** — see [Company-wide Zoom sync](#company-wide-zoom-sync-server-to-server) below — that pulls every user's recorded meetings across a whole Zoom account via Server-to-Server OAuth, no per-user connect required.

Deployed and live: client on Vercel, API + worker on Render (see [`DEPLOY.md`](./DEPLOY.md)). Every stage of the pipeline above has now run against real production traffic, not just local dev.

See [`TECHNICAL.md`](./TECHNICAL.md) for the full verified-live breakdown, deferred items, and known gaps.

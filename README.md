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

`server/scripts/demo-fallback.ts` is a separate, reusable rehearsal/fallback tool — runs two scripted meetings (kickoff + follow-up) through the real pipeline (real GPT-4o-mini, real knowledge-base writes) against a seeded demo account, ending with a draft ready to approve in the UI. Useful for demos or for proving the pipeline works without depending on a live Zoom recording. See the comment at the top of that file for usage.

## External app setup

**Zoom** (Marketplace → build a **General App**, not Server-to-Server or Webhook-only): both the OAuth redirect URI and the webhook endpoint must be HTTPS (`https://<your-tunnel>/api/zoom/oauth/callback` and `https://<your-tunnel>/api/zoom/webhooks`) — Zoom rejects plain `http://localhost` outright. Scopes: `user:read:user`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:read:participant`, `meeting:read:list_past_participants`, `meeting:read:meeting_transcript`, `meeting:read:meeting_chat`, `cloud_recording:read:list_recording_files`, `cloud_recording:read:content`, `cloud_recording:read:recording`, `cloud_recording:read:meeting_transcript`. Webhooks: `meeting.ended`, `meeting.participant_joined`, `recording.transcript_completed`, `recording.completed`. Copy the webhook Secret Token into `ZOOM_WEBHOOK_SECRET_TOKEN`. Prefer uploading a manifest JSON over the per-field UI for this app (see `TECHNICAL.md` → Gotchas) — the UI was unreliable about actually persisting changes during development. The tunnel URL changes if it restarts — both the redirect URI and webhook endpoint need updating in Zoom (and `ZOOM_REDIRECT_URI` in `.env`) whenever that happens.

**Google** (Cloud Console → OAuth client, Gmail API enabled): redirect URI `http://localhost:4000/api/mailbox/google/callback` (plain HTTP is fine here — this restriction is Zoom-specific); add your account under OAuth consent screen → Test users while the app is unverified.

**Microsoft** (Entra ID → App registration): redirect URI `http://localhost:4000/api/mailbox/microsoft/callback`; API permissions `Mail.Send`, `Mail.ReadBasic`, `User.Read`, `offline_access`. If you register the app as **multitenant + personal accounts**, leave `MICROSOFT_TENANT_ID=common`; if you register it as **single tenant** ("My organization only"), set `MICROSOFT_TENANT_ID` to that tenant's GUID instead — and expect a "Need admin approval" screen on first connect unless the tenant admin has granted consent (App registration → API permissions → "Grant admin consent"), since that's the tenant's own policy, not something this app controls.

## Going to production (later, not now)

Testing-mode OAuth (Zoom Development, Google Testing status, Microsoft single-tenant) is correct for the current build-and-test phase. Before real customers can connect their own accounts:

1. Deploy to a real public domain — Google/Zoom verification both require a stable, publicly reachable app URL
2. Finalize scopes/redirect URIs against that domain first — verification is tied to the exact config submitted
3. Write a privacy policy + app homepage (Google requires both for sensitive scopes like `gmail.send`)
4. Submit for review: Google's OAuth verification, Zoom's Marketplace "Submit for Review," Microsoft's publisher verification + moving to multi-tenant
5. Write and run `tests/integration` against the production config before flipping real traffic over

## What's built

Full data model with provenance, Zoom OAuth + webhook ingestion (verified live: OAuth connect, signature validation, `meeting.ended`/`meeting.participant_joined` capture), CAS state machine, chunked GPT-4o-mini extraction with evidence, deterministic account/contact resolution, backend-validated decision/action-item supersession, manual Account/Contact creation, relationship briefing with a dashboard of what needs attention (stat cards, aging badges on stuck approvals), human correction of any AI output (meeting title, conversation type, decisions, action items — all inline-editable), on-demand extraction regeneration, search/filter on meetings and accounts, password reset (real single-use token flow, verified live end to end — see `TECHNICAL.md` for the one honest caveat: no email delivery configured yet, so the token is logged server-side rather than emailed), Gmail send (verified live, real message landed in a real inbox) + Microsoft Graph send (implemented symmetrically, hit a tenant admin-consent wall during setup — see `TECHNICAL.md` → Gotchas, not a code issue) with reconciliation-based duplicate-send protection, approval snapshots, audit logging, tenant scoping, and an iOS/macOS-inspired UI throughout (toast notifications, confirm-before-reject, responsive nav).

The one unverified step in the live path: the actual Zoom Cloud Recording → transcript **download** (blocked by the dev account's plan tier, not a code issue — see `TECHNICAL.md` → Verified live vs. not). Every other stage of the pipeline has run against a real Zoom meeting, real GPT-4o-mini calls, and a real sent email.

See [`TECHNICAL.md`](./TECHNICAL.md) for the full verified-live breakdown, deferred items, and known gaps.

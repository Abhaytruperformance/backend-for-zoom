# Technical Reference

Architecture, data model, and the reasoning behind the harder decisions in this codebase. Read `README.md` first for setup; this doc is for understanding *why* things are built the way they are.

## The core loop

```
Zoom meeting ends
  → webhook: meeting.ended (creates Meeting row)
  → webhook: recording.transcript_completed (downloads VTT transcript)
  → GPT-4o-mini extraction (summary, decisions, action items, risks, open questions, next steps)
  → knowledge base update (deterministic account resolution, validated decision/action-item supersession, relationship summary regeneration)
  → follow-up draft generation
  → human approval (edit anything, correct any AI mistake)
  → real send via the approver's own Gmail/Microsoft mailbox
```

Every step is separated into source data (transcript) → derived knowledge (decisions/commitments/summaries) → AI output (drafts) → human-approved output (approval snapshot), per the original design brief. Nothing downstream treats AI output as ground truth without either backend validation or a human approval gate.

## Repo layout

```
server/
  prisma/schema.prisma       # 17 models, see Data model below
  scripts/
    demo-fallback.ts         # reusable rehearsal/fallback: two scripted meetings through the real pipeline
  src/
    config.ts                # zod-validated env, fails fast on boot
    queue.ts                 # BullMQ queues + deterministic jobIds
    modules/
      auth/                  # register/login, JWT
      zoom/                  # oauth, client (REST wrapper), webhooks, ingestion
      mailbox/                # per-user Gmail/Graph OAuth, send, reconciliation
      meetings/                # CRUD + state machine + title/conversation-type edit + regenerate-extraction
      ai/                      # OpenAI wrapper, schemas, AIService
      knowledge/                # resolution, context retrieval, relationship summary, account CRUD
      contacts/, actions/, decisions/  # human-correction / creation endpoints
      approval/                   # draft edit/approve/reject/regenerate, ApprovalSnapshot
    jobs/                      # BullMQ workers: transcript pipeline, email send
  tests/
    unit/                     # 22 tests, DB-backed ones auto-skip without Postgres
    integration/              # scaffolded, not yet written — real Zoom/Gmail/Graph contract tests
client/
  src/pages/                  # Login, Dashboard, Meetings, MeetingDetail, ApprovalScreen, Accounts,
                               # AccountBriefing, ZoomConnect, MailboxConnect
  src/components/             # Skeleton, EmptyState, ToastStack, ConfirmButton
  src/lib/toast.ts             # tiny pub/sub toast system — no context provider needed for this scale
```

## Data model

Every tenant-owned table carries `tenantId` + index; reads go through `lib/tenantScope.ts`'s `assertTenantOwns` helper rather than ad hoc queries, so a stray `findUnique(id)` can't leak another tenant's row.

- **Tenant, User** — one workspace per tenant, users belong to exactly one tenant
- **ZoomConnection** (per tenant) / **MailboxConnection** (per user, provider GOOGLE|MICROSOFT) — both carry a `status` (ACTIVE | REAUTH_REQUIRED | REVOKED); a 401 triggers one refresh+retry, and only flips to REAUTH_REQUIRED on genuine failure, so the UI can prompt a specific reconnect instead of a generic error
- **WebhookEvent** — idempotency ledger; unique `(provider, providerEventId)` rejects duplicate Zoom deliveries at the DB level
- **Meeting** — the state-machine-driven core record; `zoomUuid` unique per tenant, `participants` JSON, `accountId`/`contactId` nullable, `needsResolution` flag, `title` human-renamable
- **Transcript** — raw VTT preserved untouched alongside `normalizedSegments` (speaker/start/end/text array) used for AI input
- **Account, Contact** — `Account.domains[]`/`emails[]` and `Contact.email` are what deterministic resolution matches against; both creatable/editable directly from the UI (`knowledge/routes.ts`, `contacts/routes.ts`)
- **RelationshipSummary** — append-only per account; never mutated, corrections create a new row; normal reads only ever take the latest
- **MeetingExtraction** — 1:1 with Meeting; `contextUsed` JSON stores exactly what was retrieved and sent to the model, answering "why did the AI say this?" after the fact; `conversationType` human-editable, whole row regenerable on demand
- **Decision** — own table (not embedded JSON) with `status` (CONFIRMED | PROPOSED | TENTATIVE | REJECTED | SUPERSEDED) and a self-relation `supersedesId` (unique — the DB itself enforces "no double supersede"); description/status human-correctable
- **ActionItem** — `ownerType` (INTERNAL|EXTERNAL) with `ownerUserId`/`ownerContactId`/`ownerEmail`/`ownerDisplayName` resolved deterministically against the meeting's participant list, never a bare free-text name; same `supersedesId` self-relation pattern as Decision; description/owner/due-date/status all human-correctable
- **FollowupDraft** → **ApprovalSnapshot** (immutable, created at approval time, never updated) → **EmailSendAttempt** (1:1 with the snapshot; `status` PENDING|SENT|FAILED|NEEDS_RECONCILIATION|AUTH_REQUIRED)
- **AuditLog** — every AI action, human correction, creation, approval, and send is recorded here; never logs secrets

## State machine

```
CAPTURED → WAITING_FOR_TRANSCRIPT → TRANSCRIPT_READY → PROCESSING → EXTRACTED
  → DRAFT_READY → AWAITING_APPROVAL → APPROVED → SENDING → COMPLETED
FAILED reachable from any processing state; manual retry re-enters from FAILED.
```

Transitions go through one function (`meetings/stateMachine.ts::transitionMeeting`) that does a compare-and-swap update — `UPDATE meeting SET status = $to WHERE id = $id AND status = $from` — and no-ops if another worker already moved it. This gets safe concurrent-worker behavior without a raw `SELECT ... FOR UPDATE`. BullMQ's deterministic `jobId = meetingId` (see Gotchas below) prevents a duplicate job from even being enqueued while one is in flight.

## The two hard business rules

**Current meeting overrides stale history, but only a decisive statement overrides a decisive one.** `knowledge/context.ts` feeds the account's open ActionItems and non-superseded Decisions (including REJECTED ones — a later meeting can un-reject something) into the extraction prompt as supersession candidates. The model may set `supersedesId` on a returned item, but `knowledge/relationship.ts::applyExtractionToKnowledgeBase` re-validates every proposed supersession inside a transaction before applying it: the target must exist, belong to the same tenant+account, still be in a supersedable state, and not already targeted by another item in the same batch. A `CONFIRMED` or `REJECTED` decision (both decisive) may supersede a prior `CONFIRMED`/`PROPOSED`/`TENTATIVE` one; a merely `PROPOSED`/`TENTATIVE` mention can never supersede a `CONFIRMED` fact — it's stored as its own row instead, so a tentative "maybe Sept 30" never silently overwrites a confirmed "Sept 15." The LLM proposes; the backend enforces.

**Ambiguous or missing account never gets silently guessed.** `knowledge/resolution.ts` is 100% deterministic — exact contact email → exact account email → account domain → ambiguous. Zero matches: meeting proceeds unlinked. Multiple matches: `needsResolution = true`, pipeline still completes without relationship context, surfaced on the Dashboard and Accounts page for a human to resolve. No LLM involvement in identity resolution at all.

Both rules have direct unit test coverage in `tests/unit/supersession.test.ts` and `tests/unit/resolution.test.ts`, matching the critical test cases from the original spec. `scripts/demo-fallback.ts` reproduces the supersession case end to end with real GPT-4o-mini as a rehearsable, presentable demonstration.

## AI service

`ai/client.ts` wraps the OpenAI SDK only — model configurable via `OPENAI_MODEL`, default `gpt-4o-mini`. JSON-mode + zod validation with exactly one bounded repair retry (the validation error is sent back to the model) before failing safely to a `FAILED` state with an audit entry — never silently accepts malformed output. Real token counting via `js-tiktoken` (not a char/4 estimate) decides whether a transcript needs chunking (~12k token threshold); chunked extraction keeps every candidate decision/action item with its evidence across chunks so a later chunk correcting an earlier one isn't lost to summarization.

Every extraction includes the meeting's actual date in the prompt so the model can resolve relative dates ("Friday," "next Monday") to absolute `YYYY-MM-DD` — the schema rejects anything else, which is what caught a real bug during testing (see Gotchas).

`meetings/routes.ts::POST /:id/regenerate-extraction` re-runs extraction for the narrative fields only (summary, conversation type, risks, open questions, next steps) — deliberately *not* re-running the knowledge-base write, since that would either duplicate decisions/action items for the same meeting or require deleting rows a later meeting's `supersedesId` may already reference. Decisions and action items are corrected individually instead, via `PATCH /decisions/:id` and `PATCH /actions/:id` — both are inline-editable in `MeetingDetail.tsx`, along with the meeting title and conversation type.

## Zoom integration

OAuth is per-tenant (`ZoomConnection`); each tenant connects their own Zoom account. Scopes and webhook events are listed in `README.md`. Participant emails are captured two ways, since `meeting.ended`'s payload doesn't include them and Report API access (`report:read:meeting_participant`) isn't available on every plan: primary path is the live `meeting.participant_joined` webhook; if that misses someone, `handleMeetingEnded` backfills from `GET /past_meetings/{uuid}/participants` (`meeting:read:list_past_participants`); if both come up empty, falls back to just the host's email.

Webhook handling validates the HMAC signature, answers the one-time `endpoint.url_validation` challenge, checks the `WebhookEvent` idempotency constraint, persists, and hands off to a queue — zero AI/DB-heavy work happens inline. A bounded fallback poll (`pollTranscriptQueue`, 6 attempts, exponential backoff starting at 2 minutes) covers a missed `recording.transcript_completed` webhook without polling forever.

## Mailbox (send-as-rep) integration

Separate per-user OAuth (`MailboxConnection`), one row per (user, provider). Gmail uses `gmail.send` + `gmail.metadata` (headers only, least privilege) and a real client-supplied `Message-ID` header for reconciliation search (`rfc822msgid:` query). Microsoft Graph can't accept a client-supplied Message-ID on send, so it uses a custom `x-zri-send-id` header plus a body-embedded marker, searched via Graph's `$search`.

**Honest reconciliation, not fake idempotency**: a lost HTTP response after calling the send API is not proof of failure or success. On any ambiguous failure, `EmailSendAttempt.status → NEEDS_RECONCILIATION`; before any retry, the worker searches the provider's Sent folder for the deterministic marker first — found means mark `SENT` without resending, not found after a bounded number of attempts surfaces for manual operator decision. A 401 gets one refresh+retry; still failing flips to `AUTH_REQUIRED` (distinct from a generic failure) so the UI can prompt a specific reconnect.

## Security

Helmet + CORS allowlist + `express-rate-limit` on `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, webhooks, and general `/api/*`. `trust proxy` is set (required for rate-limiting to work correctly behind any reverse proxy/tunnel — see Gotchas). JWT access token, 12h expiry, bcrypt hashing. AES-256-GCM encryption for all stored OAuth tokens (Zoom + mailbox). Password reset tokens are 32 random bytes, stored as a SHA-256 hash (never plaintext), 30-minute expiry, single-use (cleared on success), compared with `timingSafeEqual`. No secrets ever logged or placed in `AuditLog` metadata — the reset token itself is a deliberate, documented exception (see below), logged to the server console only because no transactional email sender exists yet. Deferred for this build stage: email verification, refresh-token rotation.

## API surface

```
/api/auth          register, login, forgot-password, reset-password
/api/zoom           connect, oauth/callback, status
/api/mailbox        google/connect, google/callback, microsoft/connect, microsoft/callback, status
/api/meetings       list, get, resolve-account, title (PATCH), conversation-type (PATCH),
                     regenerate-extraction, retry
/api/accounts       list, POST (create), :id (PATCH), needs-resolution, :id/briefing
/api/contacts       POST (create), :id (PATCH)
/api/actions        list (filterable by accountId/status), :id (PATCH — human correction, incl. description)
/api/decisions      :id (PATCH — human correction)
/api/approval       :meetingId (get), draft (PATCH), regenerate, reject, approve
```

## Frontend

Hand-written CSS design system (no component library) in `client/src/index.css` — see the design-token block at the top for the full palette/type/spacing/radius scale. iOS 17/macOS Sonoma-inspired: system font stack (real San Francisco rendering on Apple devices via `-apple-system`), one accent color used only for primary actions, translucent blur reserved for the one place something actually floats over scrolling content (the sticky nav), content-shaped skeleton loaders instead of spinners, real empty states (what's missing + why + the action that fills it).

**Dashboard** is the landing page — four stat cards (awaiting approval, needs resolution, failed, open action items), a highlighted banner once an approval has sat over a day, needs-resolution list, failed meetings, and all open action items across every account in one place.

**Editability**: meeting title, conversation type, decision description/status, and action item description/owner/due-date/status are all inline-editable directly in `MeetingDetail.tsx` — every AI-extracted fact has a correction path, not just a display. `Login.tsx` guards `/login` against an already-authenticated session (see Gotchas — this was a real bug). Meetings and Accounts have client-side search/filter (`useMemo` over the already-fetched list; fine at demo scale, would move server-side with real data volume). Toasts (`lib/toast.ts` — a ~30-line pub/sub, no context provider) replace every silent success/failure, including a proper `ConfirmButton` (two-click, 4s timeout) instead of native `confirm()`/`alert()` for Reject.

## Testing

`tests/unit` — 22 tests, all passing against a live Postgres. DB-backed suites auto-skip (not fail) if no Postgres is reachable, so the suite is always safe to run. Covers: VTT parsing, Zoom webhook signature verification, illegal state transitions, CAS concurrent-worker races, deterministic account resolution (including the ambiguous/no-match cases), the three supersession business-rule cases (including one specifically proving a tentative decision can never override a confirmed one), webhook idempotency, and send reconciliation (including the exact "lost response never causes a duplicate send" case).

`tests/integration` — scaffolded folder, gated behind `SKIP_INTEGRATION=false`, not yet written. Would hold real-provider contract tests (actual Zoom OAuth/webhook/transcript download, actual Gmail/Graph send+reconciliation) that mocks can't catch.

`scripts/demo-fallback.ts` — not a test, but doubles as one: running scenario 1 then 2 exercises the entire real pipeline (transcript → real GPT-4o-mini extraction → knowledge base → supersession → relationship summary → follow-up draft) against live infrastructure, and has been run and verified during development, including a real approve-and-send through Gmail.

## Verified live vs. not

Verified end-to-end against a real Zoom account, real Gmail account, and real GPT-4o-mini calls during development: OAuth connect for both Zoom and Gmail, webhook signature validation + idempotent intake, `meeting.ended` → Meeting creation, `meeting.participant_joined` → participant capture, account/contact resolution (including manual account/contact creation), AI extraction (via fixture and scripted transcripts), all three supersession business-rule cases, relationship summary generation, follow-up drafting, human approval, meeting title/conversation-type/decision/action-item correction, extraction regeneration, a real Gmail send with a real provider message ID landing in a real inbox, and the full password-reset flow (request → token → reset → login with new password → old token rejected on reuse).

**Not yet verified live**: the actual Zoom Cloud Recording → VTT transcript *download* step. The Zoom account used during development doesn't have Cloud Recording on its plan (Pro-tier-and-above feature), so no real meeting has ever produced a transcript file to retrieve — the code path is implemented per Zoom's documented API and typechecks, but has only been exercised with fixture/scripted transcripts injected directly into the database. Verify this specifically against an account with Cloud Recording + Audio Transcript enabled. Microsoft Graph send is implemented symmetrically to Gmail but has not been connected/tested live at all — attempted during development against a real Microsoft 365 tenant and blocked by that tenant's admin-consent policy (see Gotchas), not a code issue.

## Known gaps

- **No transactional email sending.** Password reset works (see Security above) but the token is logged server-side rather than emailed — fine for internal/demo use, not for anyone who isn't the person with server console access. The same gap blocks email verification and any future email-based notification.
- No reminder *notification* beyond the in-app Dashboard aging badge — no email/push reminder for a stuck draft (same root cause as above)
- No refresh-token rotation on the app's own JWT session (12h flat expiry, re-login after)
- `tests/integration` is empty
- No AI evaluation dataset/metrics beyond the fixture-based unit tests
- Search/filter on Meetings and Accounts is client-side only — fine at current scale, would need server-side pagination/query params once account/meeting counts grow large
- No bulk actions (e.g. bulk-approve, bulk-reassign action items)

## Gotchas (expensive to have discovered — don't rediscover them)

- **Zoom's standard OAuth apps require HTTPS redirect URIs.** `http://localhost` is rejected with error 4700 "Invalid redirect" *even when it exactly matches the configured allow list* — this isn't a config bug, it's Zoom's documented policy for non-PKCE confidential clients. Route the OAuth callback through the same HTTPS tunnel used for webhooks.
- **Zoom's granular scope names drift and don't match their own docs reliably.** What the plan assumed as `cloud_recording:read:recording` is actually `cloud_recording:read:content` in the current Marketplace UI; Report API scopes may not be available on every plan (see the participant-capture fallback design above). Always verify scope names against the live app's scope picker, and prefer uploading a manifest JSON directly over the per-field UI, which in testing was unreliable about actually persisting changes (a saved-looking event subscription or scope list would silently not be there on re-export).
- **Zoom's newer app builder splits "development" and "production" webhook URLs/redirect URIs**, and its UI groups things under non-obvious labels ("Connect" is for outbound Resthooks, not inbound webhooks; "Actions and Triggers" is for bot-workflow building, not event subscriptions either — the actual toggle is under Features → **Event Subscription**, a distinct top-level feature).
- **ngrok's free tier allows exactly one simultaneous public endpoint, tied to one static account-level domain** — starting a second tunnel (even to a different local port, even via a multi-tunnel config file) fails with `ERR_NGROK_334`. Fix used here: point the one tunnel at the Vite dev server instead of Express directly, and let Vite's own `/api` proxy forward to the backend — one tunnel then serves the UI, the app's own API calls, and Zoom's webhook/OAuth-callback traffic, all through the same origin.
- **Vite's dev server blocks unrecognized `Host` headers by default** (DNS-rebinding protection) — a tunnel domain needs to be added to `server.allowedHosts` in `vite.config.ts`, or every proxied request 403s with "Blocked request."
- **A route that only renders on `/login` needs its own "already authenticated" redirect**, not just `RequireAuth` on the protected routes. Without it, a successful login (or landing back on `/login` while a valid token already exists) just re-renders the login form forever — nothing ever navigates away — which looks exactly like the login button silently doing nothing.
- **BullMQ rejects custom job IDs containing `:`.** It uses that character internally for Redis key construction. Use a bare ID (we use the meeting/snapshot id directly — each queue is already its own namespace, no extra prefix needed).
- **`express-rate-limit` throws if `X-Forwarded-For` is present without `app.set("trust proxy", ...)`.** Any reverse proxy or tunnel sets that header; without `trust proxy` configured, rate-limited routes 500 on every request that goes through one.
- **Every async Express route handler must be wrapped** (see `middleware/errorHandler.ts::asyncRoute`) or a thrown error becomes an unhandled promise rejection, which crashes the entire Node process in current Node versions — not just that one request. This caused a real production-shaped incident during development (a single transient DB blip took the whole server down).
- **Docker Desktop's WSL2 port forwarding can silently bind only one IP family.** Symptom: `docker compose ps` shows the container healthy, but Node can't connect via `localhost` while other tools report success — because only the IPv6 listener came up, and Node resolved `localhost` to IPv4. Fix: pin Compose port bindings to explicit `127.0.0.1:<port>:<port>` rather than a bare `<port>:<port>`. This can still resurface after a `wsl --shutdown`/long idle period even with the pin in place — if Postgres/Redis suddenly become unreachable, `docker compose restart` (or a full `down`/`up`) before debugging application code.
- **A GPT-4o-mini extraction will naturally return relative dates ("Friday," "next Monday") unless told not to.** The fix isn't just prompting — the zod schema should reject anything that isn't `YYYY-MM-DD` so a slipped-through relative date fails validation (triggering the repair retry) instead of crashing the DB write with an invalid Date. Give the model the meeting's actual date in the prompt so it has a reference point to compute from.
- **An Entra ID app registered "single tenant" (My organization only) forces every consenting user through an admin-approval screen**, even for basic delegated permissions like `Mail.Send` — this is the tenant's own consent policy, not something in our OAuth request. Either the tenant admin grants org-wide consent once (App registration → API permissions → "Grant admin consent for `<tenant>`"), or the app registration is switched to multitenant + personal accounts and `MICROSOFT_TENANT_ID` set to `common` instead of the specific tenant GUID.

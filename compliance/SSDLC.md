# Secure Software Development Lifecycle (SSDLC)

**App:** Zoom Meeting Intelligence & Relationship Knowledge Base
**Maintainer:** Tru Performance
**Last updated:** 2026-09-01

This document describes the actual development lifecycle this application is built under. It is written to reflect current practice, not an aspirational process — where a control doesn't yet exist, it's noted as a known gap rather than implied.

## 1. Source control and change management

- All code lives in git (GitHub), with full commit history retained.
- Two integrations are deployed from this history: the frontend (Vercel, deploys from the `client/` workspace) and the backend API + workers (Render, deploys from the `server/` workspace).
- Environment variables and secrets are never committed — `.env` is gitignored, and production secrets are set directly in the Render/Vercel dashboards as encrypted platform-managed environment variables.

## 2. Environments

- **Local development**: `.env`-driven config, local Postgres/Redis via Docker Compose, an HTTPS tunnel (ngrok) for OAuth/webhook callbacks that require public HTTPS endpoints.
- **Production**: Render (API, Postgres, Redis) + Vercel (static frontend), fully separate credentials and OAuth app registrations from development where the provider supports it (Zoom, Google, Microsoft each have distinct dev/test vs. production app configurations).

## 3. Build and deploy gates

Every deploy to production goes through:

1. **TypeScript compilation** (`tsc --noEmit`) — the build fails on any type error; this is enforced as part of the Render build command (`npm run build`), so a type-incorrect change cannot reach production.
2. **Automated test suite** — 56 unit tests (Vitest) covering: VTT transcript parsing, Zoom webhook signature verification, the meeting state machine (including compare-and-swap concurrency behavior under concurrent workers), deterministic account/contact resolution, the core business-rule logic for decision supersession, webhook idempotency, send-failure reconciliation and deduplication, encryption key rotation, Redis-backed rate limiting, and BullMQ retry behavior. Database-backed tests run against a real Postgres instance rather than mocks, to catch schema/query-level bugs mocks would hide.
3. **AI extraction accuracy check** — a smaller, separate eval harness (`server/scripts/eval-extraction.ts`) runs real model calls against known-answer transcript fixtures to catch regressions in the AI extraction pipeline specifically (decision/action-item extraction correctness, date resolution, hallucination resistance).

## 4. Static analysis and dependency scanning

- **SAST**: Semgrep (`p/security-audit`, `p/secrets`, `p/nodejsscan` rulesets) run against the full server source. See `compliance/SAST-DAST-RESULTS.md`.
- **Dependency/SCA scanning**: `npm audit` run against production dependencies; a critical transitive vulnerability (`tar`, via `bcrypt`'s build tooling) was found and pinned to a patched version via npm `overrides`. See the same results file.
- **DAST**: OWASP ZAP baseline scan run against the live production API. See the same results file.

## 5. Data handling by design

- OAuth access/refresh tokens (Zoom, Google, Microsoft) are encrypted at rest with AES-256-GCM before being written to the database, with a supported key-rotation path (`server/scripts/rotate-token-encryption-key.ts`) that re-encrypts all stored tokens under a new key without downtime, using a fallback-to-previous-key decrypt during rotation.
- User passwords are hashed with bcrypt; the application's own session is a short-lived (12h) JWT.
- All external API calls (Zoom, Google, Microsoft, OpenAI, this app's own frontend/backend boundary) are made over TLS 1.2+.
- Database access is exclusively through Prisma's parameterized query builder — no raw string-concatenated SQL exists in the codebase, which eliminates SQL injection as an attack class here.
- Inbound webhooks (Zoom) are signature-verified against a shared secret before any payload is trusted or processed.

## 6. Known gaps (disclosed, not hidden)

- **No formal peer code review gate.** This is currently a small team; there is no branch-protection-enforced second-reviewer requirement yet. The automated test/typecheck gate is the current substitute quality control.
- **No independent third-party penetration test has been performed.** The SAST/DAST scans in this submission are the extent of security testing to date.
- **No dedicated staging environment identical to production** — local dev and production are the two environments in active use.

These are tracked as real, prioritized follow-ups, not omissions the team is unaware of.

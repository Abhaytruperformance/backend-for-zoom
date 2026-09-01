# Incident Management and Response Policy

**App:** Zoom Meeting Intelligence & Relationship Knowledge Base
**Last updated:** 2026-09-01

## Purpose

Defines how this team detects, responds to, and follows up on a security incident — anything from a leaked credential to unauthorized data access.

## Detection

- **Automated alerting**: application failures that reach a terminal state (a meeting's processing permanently failing after exhausting retries, the company-wide Zoom sync failing entirely) trigger a Slack alert via `server/src/lib/alert.ts`, so operational failures are noticed rather than silently accumulating.
- **Platform-level monitoring**: Render and Vercel deployment/runtime logs are the primary source of infrastructure-level signal (crash loops, failed health checks, elevated error rates).
- **Manual reports**: a security researcher or user reporting an issue directly (see the contact in `compliance/SECURITY-POLICY.md`).

## Severity classification

| Severity | Definition | Example |
|---|---|---|
| Critical | Active data breach, credential compromise, or full service compromise | A leaked API key with write access to production data |
| High | Exploitable vulnerability with realistic attack path, not yet known to be exploited | An auth-bypass bug found via a security scan |
| Medium | Vulnerability requiring an unlikely precondition, or a significant availability issue | A rate-limit bypass under a specific timing window |
| Low | Defense-in-depth gap, best-practice deviation with no direct exploit path | A missing security header |

## Response process

1. **Contain** — for a credential leak: rotate the credential immediately (this app has a documented rotation path for `TOKEN_ENCRYPTION_KEY`; other secrets — `JWT_SECRET`, OAuth client secrets, `OPENAI_API_KEY` — are rotated directly in the Render/Vercel dashboard, which takes effect on next deploy/restart). For an active exploit: patch or, if patching isn't immediate, disable the affected route/feature.
2. **Assess** — determine what data or systems were actually touched, using database audit fields (`createdAt`/`updatedAt` timestamps, `EmailSendAttempt` records, the `AuditLog` table) and provider-side logs (Zoom/Google/Microsoft API access logs where available).
3. **Notify** — affected tenants are notified directly, with what happened, what data was involved, and what's been done, as soon as containment is confirmed and the facts are established (not before — not after unreasonable delay).
4. **Remediate** — fix the root cause, not just the symptom; add a regression test where the incident class is testable (this codebase's testing philosophy already favors this — see `TECHNICAL.md`'s Gotchas section for examples of exactly this pattern from real incidents during development).
5. **Review** — a brief post-incident note: what happened, why, what changed as a result. Kept even for small incidents, since the pattern (not just the one instance) is what's valuable to catch next time.

## Current gaps (disclosed)

- No 24/7 on-call rotation — this is a small team; alerting goes to a Slack channel monitored during business hours, not paged.
- No formal notification-timeline SLA has been documented yet (e.g. "72 hours" for a specific regulatory regime) — this should be added if/when this app processes data under a jurisdiction requiring one.

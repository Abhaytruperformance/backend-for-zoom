# Security Policy

**App:** Zoom Meeting Intelligence & Relationship Knowledge Base
**Last updated:** 2026-09-01

## Scope

This policy covers the application's backend (Node.js/Express API + BullMQ workers, hosted on Render), frontend (React SPA, hosted on Vercel), database (Postgres), and queue/cache layer (Redis).

## Authentication and access control

- Application login uses bcrypt-hashed passwords and short-lived (12h) JWT sessions; no long-lived session tokens are issued.
- Every tenant's data is scoped by `tenantId` at the database query level — cross-tenant data access is a query-shape bug class this app's data model is designed to prevent structurally, not just by application-level checks.
- Third-party account connections (Zoom, Google, Microsoft) use OAuth 2.0; this app never asks a user for their Zoom/Google/Microsoft password directly.
- The company-wide Zoom sync feature (Server-to-Server OAuth, account-wide) is scoped to a single explicitly-configured tenant via `ZOOM_S2S_SYNC_TENANT_ID` — it cannot be silently pointed at the wrong tenant by application logic.

## Data protection

- OAuth tokens are encrypted at rest with AES-256-GCM. The encryption key supports rotation without downtime (`server/scripts/rotate-token-encryption-key.ts`): the app tries the current key first, falls back to a previous key during a rotation window, and GCM's authentication tag ensures a wrong key fails safely rather than producing garbage plaintext.
- All external traffic (browser ↔ Vercel, Vercel ↔ Render API, this app ↔ Zoom/Google/Microsoft/OpenAI) is TLS 1.2+.
- Database access is exclusively through Prisma's parameterized queries — no raw SQL string concatenation exists in the codebase.

## Application-layer defenses

- **Rate limiting**: Redis-backed (survives process restarts and works correctly across multiple instances), applied separately to login, webhook, and general API routes.
- **Security headers**: Helmet is applied globally (HSTS, CSP with `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, X-Content-Type-Options, etc.), plus an explicit deny-all `Permissions-Policy` header.
- **Webhook signature verification**: every inbound Zoom webhook is verified against the shared webhook secret before its payload is trusted.
- **CORS**: restricted to an explicit allowlist of origins, not a wildcard.
- **Crash isolation**: every async Express route handler is wrapped so a thrown error becomes a normal HTTP error response instead of an unhandled promise rejection that could crash the whole process.

## Secure development practices

See `compliance/SSDLC.md` for the full development lifecycle. In summary: TypeScript compilation and a 56-test automated suite gate every deploy; SAST (Semgrep) and dependency scanning (`npm audit`) are run and findings tracked (see `compliance/SAST-DAST-RESULTS.md`); secrets are never committed and are managed as platform environment variables.

## Vulnerability handling

See `compliance/VULNERABILITY-MANAGEMENT.md`.

## Incident response

See `compliance/INCIDENT-RESPONSE-POLICY.md`.

## Reporting a security issue

**[Fill in: a real contact/email for external security researchers to report issues to, before publishing this policy externally.]**

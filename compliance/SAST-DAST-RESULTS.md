# SAST / DAST / Dependency Scan Results

**App:** Zoom Meeting Intelligence & Relationship Knowledge Base
**Scan date:** 2026-09-03
**Scope:** `server/src` (SAST, SCA), live production API at `https://backend-for-zoom.onrender.com` (DAST)

These are real scan runs against this codebase and this live deployment, not asserted/summarized claims. Raw tool output is available on request. **Screenshots of each finished scan run are in `compliance/SAST-DAST-scan-evidence.pdf`** — Semgrep, npm audit, and OWASP ZAP output, one per page.

## 1. Static Application Security Testing (SAST)

**Tool:** Semgrep, rulesets `p/security-audit`, `p/secrets`, `p/nodejsscan`
**Result:** 175 rules run across 47 tracked source files — **6 findings, all INFO severity, zero actual vulnerabilities.**

All 6 findings are the `nodejsscan` "good practice" rules confirming Helmet's security headers are correctly configured on the Express app (`server/src/index.ts`): HSTS present, X-Content-Type-Options set, X-Powered-By removed, X-DNS-Prefetch-Control set, X-Download-Options set, X-XSS-Protection set. No hardcoded secrets, no injection-pattern matches, no unsafe deserialization or other flagged patterns in the `security-audit` ruleset.

## 2. Dynamic Application Security Testing (DAST)

**Tool:** OWASP ZAP, baseline (passive) scan
**Target:** live production API health/spider surface
**Result:** 64 checks passed, **0 FAIL, 3 WARN — all low severity, no exploitable finding.** (A prior run flagged a missing `Permissions-Policy` header — fixed in `server/src/index.ts`; this rerun shows it passing.)

Warnings and disposition:

| Finding | Severity | Disposition |
|---|---|---|
| Re-examine Cache-Control directives | Low | Accepted — applies to a JSON health-check endpoint with no sensitive content |
| Storable and Cacheable Content | Low | Accepted — same health-check endpoint; no sensitive data returned |
| CSP: directive without explicit fallback | Low | Accepted — triggered on 404 responses outside the app's own routes; the app's real routes already carry a CSP with `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'` (via Helmet) |

No SQL injection, XSS, authentication bypass, session management, information disclosure, or transport-security findings.

## 3. Software Composition Analysis (dependency scanning)

**Tool:** `npm audit`

**Before remediation:** 9 known advisories across both workspaces (a later rerun also caught a newly-published `qs` advisory, moderate, via `express` → `body-parser` — a live example of why this should run on a schedule, not just once).

**Fixed, both via npm `overrides` in the root `package.json`, verified by a clean reinstall and `npm audit` re-run:**
- `tar` (critical) — transitively via `bcrypt` → `@mapbox/node-pre-gyp`, a build-time-only dependency used to fetch prebuilt native binaries during install, not invoked at runtime. Multiple hardlink/symlink path-traversal and DoS advisories in versions ≤7.5.20. Pinned to `^7.5.21`.
- `qs` (moderate) — via `express` → `body-parser`, a shipped runtime dependency. Array-limit bypass and a DoS advisory in versions ≤6.15.3. Pinned to `^6.16.0`.

**Remaining, all in `devDependencies` only — not present in the deployed production build (the Render API bundle or the Vercel static build) — but disclosed in full rather than filtered out:**

| Package | Severity | Advisory | Real exposure here |
|---|---|---|---|
| `vitest` (test runner) | Critical (CVSS 9.8) | [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) — arbitrary file read/execute when Vitest's UI server is listening | This project's test script is `vitest run tests/unit` — the `--ui` flag that starts the vulnerable server is never used anywhere in this codebase's scripts or CI |
| `vite` (dev server / client build tool) | High (CVSS 7.5) | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) — `server.fs.deny` bypass on Windows via alternate paths | Only reachable through `vite dev`'s local dev server; the deployed Vercel build is Vite's static output, which doesn't run this server |
| `vite` | Moderate x2 | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | Same — dev-server only |
| `esbuild` | Moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — dev server accepts cross-origin requests | Same — dev-server only |
| `react-router` / `react-router-dom` | Moderate x2 | [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) | This is a shipped runtime dependency, unlike the rest of this table. It's a client-rendered SPA with no server-side rendering (the SSR-hydration advisory doesn't apply), and no `<Link>`/`useNavigate` target is ever built from untrusted/user-controlled input (the open-redirect advisory's precondition) |

**Why these aren't fixed yet:** the fix for the vitest/vite chain is a two-major-version jump (`vitest@4.x`, `vite@8.x`) and the react-router fix is also a breaking major bump — both need their own dedicated regression pass against this project's 60-test suite and the client build before shipping, rather than being force-upgraded under time pressure and risking a silent breakage in the one thing that currently catches regressions. Tracked as a real, prioritized follow-up — not indefinitely deferred.

**After remediation:** the critical finding reachable in the runtime dependency tree (`tar`) and the moderate finding in a shipped runtime dependency (`qs`) are both fixed. What remains is dev-tooling-only exposure plus one moderate, low-practical-risk client dependency, disclosed above rather than omitted.

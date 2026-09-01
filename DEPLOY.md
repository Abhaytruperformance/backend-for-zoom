# Deploying

Two hosts, on purpose: the client is static and belongs on a CDN, the server is not.
`server/src/jobs/worker.ts` holds three BullMQ workers that sit connected to Redis
waiting for jobs — including delayed ones (the 5-minute transcript fallback poll,
and exponential backoff on retries). A request-scoped serverless runtime has nowhere
to run that, so meetings would queue and never process. The server needs a host that
runs persistent processes.

| Piece | Host | Config |
| --- | --- | --- |
| React client | Vercel | [`vercel.json`](./vercel.json) |
| API + BullMQ worker + Postgres + Redis | Render | [`render.yaml`](./render.yaml) |

Render is one Blueprint file covering all four; Railway or Fly work equally well if
you'd rather — the requirement is just "can run two long-lived processes."

## 1. Server on Render

> **Free tier works, with real gaps.** Render has no Background Worker resource on the
> free plan, so the BullMQ workers run in-process inside `backend-for-zoom` instead (`RUN_WORKER_INLINE`
> in `render.yaml`) — a dedicated paid worker is the more correct shape if budget allows,
> since it has no idle-spindown gap. Three more free-tier facts that matter here: free web
> services spin down after 15 minutes idle and take ~1 minute to wake (a cold start on a
> Zoom webhook, and on inline job processing too, since it's the same process), free
> Postgres is deleted 30 days after creation, and free Key Value does **not** persist to
> disk, so every queued job is lost whenever Redis restarts. Free is fine for a
> look-around; it is not fine for a pipeline you expect to keep meetings in.

Dashboard → **New → Blueprint** → point at this repo. It creates three resources from
`render.yaml`: `backend-for-zoom` (web, running the BullMQ workers in-process), `zri-redis`, and
`zri-postgres`.

`DATABASE_URL` and `REDIS_URL` are wired automatically. Everything marked `sync: false`
must be set by hand, in the **`zri-shared` env group** so both services get identical
values — the API encrypts Zoom/mailbox tokens and the worker decrypts them, so a
mismatched `TOKEN_ENCRYPTION_KEY` fails late and confusingly rather than at startup.

Generate the two secrets fresh — do not reuse the local ones:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"  # JWT_SECRET
```

Migrations run in the API's build step (`prisma migrate deploy`).

## 2. Client on Vercel

Point a Vercel project at this repo root. `vercel.json` sets `"framework": null` —
that matters. Vercel's **Express preset compiles `server/src/index.ts` as a serverless
function using its own TypeScript settings**, which fails on the helmet import and has
nothing to do with your `server/tsconfig.json`. `framework: null` stops that.

**Check the project's Root Directory.** If it is set to `server` (which Vercel picks
automatically when it import-suggests an Express app), Vercel scopes dependency
installation to that one workspace — `npm install --workspace server`, 257 packages —
so the client's `react` and `react-router-dom` are never installed and the build dies
in a wall of `Cannot find namespace 'React'`. The `installCommand` here forces a full
workspace install so it works either way, but setting Root Directory to `./` is the
tidier fix.

Then edit the rewrite destination in `vercel.json` to your real Render URL:

```json
{ "source": "/api/:path*", "destination": "https://backend-for-zoom.onrender.com/api/:path*" }
```

Vercel doesn't expand env vars inside `vercel.json`, so this is a literal edit.

**Why proxy instead of pointing the client at Render directly.** It keeps the browser
on one origin. The OAuth state nonce is an HttpOnly cookie, and cookies are scoped by
hostname — split the UI and the callback across two domains and the callback never
sees the cookie, so every connect attempt fails with "Invalid or expired connect link".
Same reason the README routes everything through a single ngrok tunnel locally.

## 3. Point the OAuth apps at the Vercel domain

Every URL below is the **Vercel** origin, never the Render one — the browser only ever
talks to Vercel.

In the `zri-shared` env group:

```
CORS_ALLOWED_ORIGINS=https://<your-app>.vercel.app
ZOOM_REDIRECT_URI=https://<your-app>.vercel.app/api/zoom/oauth/callback
GOOGLE_REDIRECT_URI=https://<your-app>.vercel.app/api/mailbox/google/callback
MICROSOFT_REDIRECT_URI=https://<your-app>.vercel.app/api/mailbox/microsoft/callback
OUTBOUND_MESSAGE_ID_DOMAIN=<your-app>.vercel.app
```

`CORS_ALLOWED_ORIGINS` is load-bearing beyond CORS: the server derives its post-OAuth
redirect target from the **first** entry, so if you list several, put the canonical one
first.

Then update the same redirect URIs in each provider console — they're validated
server-side, so a mismatch is rejected before your code runs:

- **Zoom Marketplace** → OAuth redirect URL *and* the webhook endpoint
  (`https://<your-app>.vercel.app/api/zoom/webhooks`)
- **Google Cloud Console** → Authorized redirect URIs
- **Microsoft Entra** → Redirect URIs

A real HTTPS domain replaces the ngrok tunnel entirely.

## 4. Verify

```bash
curl https://<your-app>.vercel.app/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"tenantName":"Acme","email":"you@example.com","password":"<pick-one>"}'
```

A `201` proves the whole chain: Vercel → rewrite → Render → Postgres.

Check `backend-for-zoom`'s own logs for `workers started` — that's the inline BullMQ workers coming
up in the same process. Without that line nothing will process, however healthy the API
looks otherwise.

## Known gaps before real users

- **`bcrypt` is a native module.** Some hosts skip install scripts (Vercel's build log
  lists it under `allow-scripts`), which leaves it without a binary and makes every
  login 500. Render runs install scripts normally, so it should build — if you ever see
  `invalid ELF header` or a missing `bcrypt_lib.node`, swap to `bcryptjs`, which is
  pure JS and produces interchangeable hashes.
- **Password reset tokens are logged, not emailed.** Anyone with log access can take
  over an account. Wire up real delivery before letting anyone else in.
- **`TOKEN_ENCRYPTION_KEY` now has a rotation path** (`server/src/lib/crypto.ts` +
  `server/scripts/rotate-token-encryption-key.ts`): set `TOKEN_ENCRYPTION_KEY` to a freshly
  generated key, `TOKEN_ENCRYPTION_KEY_PREVIOUS` to the old one, deploy (nothing breaks —
  decryption falls back to the previous key automatically), run the script once to re-encrypt
  every stored token under the new key, then remove `TOKEN_ENCRYPTION_KEY_PREVIOUS`. Still
  true until you actually do this: whoever reads the current env reads every connected
  mailbox and Zoom account, same as any single-key scheme.
- **Rate limiting is in-process.** Fine on a single Render instance; if you scale the
  API past one, move `express-rate-limit` to a Redis store or the limits multiply.
- **Rotate any credential that has been pasted into a chat, ticket, or terminal.**

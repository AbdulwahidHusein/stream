# Stream (`stream.et`)

Async screen recording for Ethiopian freelancers, agencies, and remote teams. Record in the browser, get an instant shareable link, pay in **ETB** via Telebirr / CBE Birr.

Product brief: [`idea.txt`](./idea.txt)  
Technical spec: [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md) (v0.2)

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS v4 + CSS design tokens |
| Host | Cloudflare Workers via `@opennextjs/cloudflare` |
| DB | Cloudflare D1 + Drizzle ORM |
| Video | Cloudflare R2 (progressive multipart upload) |
| Auth | Google OAuth (opaque D1 sessions) |
| Pay | WeBirr / Telebirr (Phase 1) |

Designed to stay near **$0 infra** until usage outgrows Cloudflare free tiers (R2 10 GB is the binding constraint).

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm cf-typegen                              # generate binding types
pnpm exec wrangler d1 migrations apply stream --local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

D1 and R2 run against local miniflare state in `.wrangler/state` — no Cloudflare
account is needed to record, upload, and play back locally.

`/record` and `/library` require a signed-in user, so `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` must be set in `.env.local` before either page loads.
Watching a `/v/{publicId}` link never requires an account.

### Environment variables

Each runtime reads from a different file. Nothing is shared between them, which is
the usual reason sign-in works under `pnpm dev` and not under `pnpm preview`:

| Running with | Reads from | Committed? |
| --- | --- | --- |
| `pnpm dev` | `.env.local` | no — git-ignored |
| `pnpm preview` (workerd) | `.dev.vars` | no — git-ignored |
| `pnpm deploy` | `wrangler secret put NAME` (secrets), `vars` in `wrangler.jsonc` (non-secrets) | secrets no, `vars` yes |

[`.env.example`](./.env.example) is the annotated list: what is required, what has
a default, what nothing reads yet, and which values must be secrets. Two that are
easy to get wrong:

- **`GOOGLE_CLIENT_SECRET`** — a secret. `wrangler secret put GOOGLE_CLIENT_SECRET`,
  never a `vars` entry, because `wrangler.jsonc` is committed.
- **`SESSION_SECRET`** — despite the name, sessions do not use it; it is the salt
  for the §8.4 viewer-key hash (`lib/views.ts`). Unset in production, view dedupe
  hashes become reproducible by anyone with an IP and user-agent.

### Google OAuth setup

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   **Create credentials** → **OAuth client ID** → **Web application**.
2. Authorized redirect URIs — one line per origin you run on, matched byte for byte:
   - `http://localhost:3000/api/auth/callback/google` (`pnpm dev`)
   - `http://localhost:8787/api/auth/callback/google` (`pnpm preview`)
   - `https://<your-domain>/api/auth/callback/google` (deployed)
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the file for the runtime
   you are using, per the table above.

While the consent screen is in **Testing**, only accounts listed as test users can
sign in — everyone else gets `access_denied`, which the app reports as "Sign-in was
cancelled".

The token exchange retries up to three times with a 6-second per-attempt timeout,
so a dropped packet on a bad link does not end the sign-in. Failures that survive
that are reported to the user as a connection problem (`?error=network`) rather
than as a rejected login (`?error=exchange`) — the two are different situations
and only one of them is worth retrying.

### Recordings made before sign-in existed

Takes recorded while ownership was the fixed `usr_local_dev` stand-in belong to no
account: their `/v/` links still play, but no library lists them. Sign in and
`/library` offers a one-click **Move them to &lt;your email&gt;** banner
(`lib/auth/legacy-owner.ts`), which re-owns the rows and moves their bytes onto
your storage total in a single D1 transaction.

It is development-only — the route 404s anywhere else, since an endpoint that
moves recordings between accounts has no business existing in production. The
deployed database never had a stand-in owner, so there is nothing there to adopt.

After changing `lib/db/schema.ts`:

```bash
pnpm exec drizzle-kit generate               # writes SQL into drizzle/
pnpm exec wrangler d1 migrations apply stream --local
```

### Cloudflare preview / deploy

```bash
pnpm preview   # build + wrangler-local Workers runtime
pnpm deploy    # build + deploy to Cloudflare Workers
```

Before the first deploy, create the real resources and fill in `wrangler.jsonc`:

```bash
pnpm exec wrangler d1 create stream          # paste database_id into wrangler.jsonc
pnpm exec wrangler r2 bucket create stream-videos
pnpm exec wrangler d1 migrations apply stream --remote
```

### Purge worker (§6.2)

Expiry and abandoned-upload cleanup run as a **separate** Worker on an hourly
cron, so a schedule change can never break the app deploy. It is not covered by
`pnpm deploy` — deploy it once, and again whenever `lib/purge.ts` changes:

```bash
pnpm exec wrangler deploy -c workers/purge/wrangler.jsonc
```

To exercise it by hand against local data:

```bash
pnpm exec wrangler dev -c workers/purge/wrangler.jsonc --test-scheduled \
  --persist-to .wrangler/state
curl http://localhost:8787/__scheduled
```

## Repo layout

```
app/           routes (landing, record, library, playback, embed, api)
components/    UI by domain
lib/           plans, auth, db, r2, recorder, billing
workers/       cron jobs (purge, downgrade, usage)
TECHNICAL_SPEC.md
idea.txt
```

## Status

Phase 1 step 1 is in: record → progressive multipart upload to R2 during capture →
public `/v/{publicId}` link that plays and seeks, with OG tags for unfurling.

Uploads go through the Worker's R2 binding rather than presigned S3 URLs
(see `lib/r2/bucket.ts` for why, and what it would take to switch).

Auth is in: Google sign-in on `/login`, opaque 30-day sliding sessions in D1
(`sessions.id` is a SHA-256 of the cookie token), `proxy.ts` bouncing signed-out
visitors off `/record` and `/library`, and `requireUser` enforcing ownership at
every route handler and Server Function. §7.1 magic links remain the unbuilt
second method; the `magic_links` table is unused.

Next: library CRUD + thumbnails, quota enforcement, cron purge jobs, billing.

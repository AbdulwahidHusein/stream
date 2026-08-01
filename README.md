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
| Auth | Magic link (Phase 1) |
| Pay | WeBirr / Telebirr (Phase 1) |

Designed to stay near **$0 infra** until usage outgrows Cloudflare free tiers (R2 10 GB is the binding constraint).

## Local development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy env template:

```bash
cp .env.example .env.local
```

### Cloudflare preview / deploy

```bash
pnpm preview   # build + wrangler-local Workers runtime
pnpm deploy    # build + deploy to Cloudflare Workers
```

Create D1 / R2 bindings in `wrangler.jsonc` when starting Phase 1 storage work.

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

Scaffold + design shell. Next: Phase 0 landing/validation and Phase 1 recorder → progressive R2 upload → share link.

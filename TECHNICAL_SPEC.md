# Stream (stream.et) — Technical Specification

**Version:** 0.2  
**Status:** Draft for build  
**Product brief:** `idea.txt`  
**Date:** August 1, 2026  
**Audience:** Founder + implementers  

---

## 1. Purpose

This document defines how Stream is built: architecture, stack, data model, APIs, recording pipeline, billing hooks, free-tier cost controls, and UI design principles.

**Product one-liner:** Browser-based async screen/webcam recording with instant shareable links, billed in ETB via local payment rails.

**Non-goals for MVP:** live calls, team workspaces, advanced analytics, mobile-first recording, heavy video editing.

---

## 2. Design Principles (Product + UI)

Stream must feel **powerful, accurate, professional, and minimalist** — closer to a precision tool than a consumer social app.

### 2.1 Product feel
| Principle | Meaning in practice |
|---|---|
| Powerful | One clear primary action (“Record”); fast path from open → share link |
| Accurate | Exact durations, reliable upload %, honest free-tier limits, correct view counts |
| Professional | Clean playback page clients can trust; no clutter, no gimmicks |
| Minimalist | Few screens, few controls, no dashboard noise in the hero/record flow |

### 2.2 Visual direction
- **Composition:** First viewport = one job (record or watch). Not a marketing dashboard.
- **Brand first:** `Stream` / `stream.et` is the hero-level identity on marketing + app chrome.
- **Typography:** Expressive, purposeful pairing (e.g. sharp grotesk for UI + distinctive display for brand). Avoid Inter / Roboto / Arial / system defaults.
- **Color:** Define CSS variables early. Prefer a restrained Ethiopian-professional palette (deep ink, warm off-white or cool stone, one decisive accent — not purple-gradient SaaS defaults).
- **Background:** Subtle atmosphere (soft gradient / grain / light geometric field) — not flat single-color, not neon glow.
- **Cards:** Default to no cards. Use contained surfaces only when they support interaction (library rows, settings).
- **Hero (landing):** Full-bleed visual plane; brand + one headline + one sentence + CTA. No stat strips, pill clusters, or overlay badges.
- **Motion:** 2–3 intentional motions (e.g. record pulse, upload progress, playback entrance). No decorative noise.
- **Density:** Generous whitespace; tight information hierarchy; monospace sparingly for IDs/durations/technical meta.

### 2.3 Core screens (MVP)
1. **Landing** — brand, value, CTA to record / sign in  
2. **Record** — capture UI (screen / cam / both), mute/cam toggles, stop  
3. **Processing** — upload progress → share link  
4. **Library** — list, rename, delete, copy link  
5. **Playback** — public watch page (no account required)  
6. **Billing** — plan status + ETB pay (paid tier)  

---

## 3. Recommended Stack

Optimized for **$0 infrastructure until usage grows**.

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js** (App Router) | Prefer over Svelte per product decision |
| Language | **TypeScript** (strict) | |
| UI | **React 19 + CSS Modules or Tailwind** | Keep design tokens in CSS variables either way |
| Hosting | **Cloudflare Workers** + static assets (`@opennextjs/cloudflare`) | Not Pages — OpenNext targets Workers; verify current adapter docs at build start |
| API | Next.js Route Handlers + optional **Hono** on Workers if needed | Start with Next route handlers |
| Auth | **Magic link** (email) primary; Google OAuth optional | Session cookies (httpOnly, Secure, SameSite) |
| DB | **Cloudflare D1** (SQLite) via Drizzle ORM | Metadata only — never store video blobs in D1 |
| Object storage | **Cloudflare R2** | Zero egress; 10 GB free tier (see §6.1 — this is the binding constraint) |
| Uploads | Browser → **presigned R2 multipart**, progressive | Multipart from first chunk, not only for large files — see §10.5 |
| Email | **Resend** free tier (magic links) | |
| Payments | **WeBirr** (or Telebirr/CBE aggregator) | Integrate after recorder works |
| Analytics (product) | Privacy-light first-party events in D1 | No heavy third-party required for MVP |
| Repo tooling | pnpm, ESLint, Prettier, Vitest | |

### 3.1 Explicitly avoid (early)
- AWS S3 / DO Spaces as primary video store (egress cost)
- Always-on VPS for MVP
- LiveKit / WebRTC SFU (async only)
- Supabase Storage as primary video store (free quota too small)

---

## 4. System Architecture

```
┌──────────────┐     session/API      ┌─────────────────────┐
│  Next.js UI  │ ◄──────────────────► │  Next.js Route APIs │
│  (Pages)     │                      │  (Workers runtime)  │
└──────┬───────┘                      └──────────┬──────────┘
       │                                         │
       │ presigned URL                           │ Drizzle
       ▼                                         ▼
┌──────────────┐                      ┌─────────────────────┐
│ Cloudflare   │  video objects       │ Cloudflare D1       │
│ R2           │                      │ users, recordings,  │
│              │ ◄── public/signed ── │ views, subscriptions│
└──────────────┘      playback        └─────────────────────┘
```

### 4.1 Trust boundaries
- **Public:** landing, playback page (`/v/[publicId]`), static assets  
- **Authenticated:** record, library, account, billing  
- **Server-only:** R2 credentials, session secrets, payment webhooks  

### 4.2 Recording data path
1. User authenticates (or starts anonymous draft session — see §7).  
2. Client requests `POST /api/recordings` → creates DB row (`status=pending_upload`), initiates an R2 multipart upload, returns `uploadId` + part-signing endpoint.  
3. Client records via `getDisplayMedia` / `getUserMedia` + `MediaRecorder` with `timeslice` (~5s chunks).  
4. Client uploads each buffered part **directly to R2 while still recording** (§10.5). Parts are retried independently on failure.  
5. On stop: flush final part → `POST /api/recordings/[id]/complete` → server completes the multipart upload, validates the object exists and its size, sets `status=ready`, returns share URL.  
6. Viewer opens `/v/[publicId]` → server loads metadata → streams/plays from R2 via signed GET (§11.3).  

Uploading during recording (rather than after stop) is a deliberate MVP requirement, not an optimisation: it bounds browser memory, survives tab crashes, and makes the ≥98% success target in §21 achievable on the unreliable connections our target users have.

---

## 5. Functional Requirements (MVP)

### 5.1 Capture
- Modes: **screen only**, **webcam only**, **screen + webcam bubble**  
- Toggles during recording: mute mic, disable camera  
- Max duration enforced client-side by auto-stop timer; **server enforces via `size_bytes`** (see §5.1.1)  
- Capture capped at 1080p / 30fps and a fixed bitrate (§10.3) — required for the §6.1 cost model  
- Desktop-first; document mobile `getDisplayMedia` as unsupported/best-effort  

#### 5.1.1 What the server can actually enforce
`duration_ms` is reported by the client at `/complete` and is therefore **spoofable**. The server MUST NOT treat it as an authoritative limit. The binding server-side check is `size_bytes` against `plan.maxBytesPerRecording`, derived from `maxDurationMs × maxBitrate × safety factor`. Reject completion above that ceiling and mark the recording `failed`. Duration is stored for display only.

### 5.2 Share & playback
- Instant shareable URL after upload complete  
- Public watch: play/pause, **seekable** scrub bar (requires §10.4), playback speed (0.75×–2×)  
- No account required to view  
- **Open Graph / oEmbed tags** on `/v/[publicId]` so links unfurl with thumbnail, title, and duration in Telegram, Slack, WhatsApp, and email — table stakes for a link-sharing product  
- **`/embed/[publicId]`** iframe route — claimed as a competitive checkmark in `idea.txt` §7, so it ships in MVP  
- Optional: simple start/end trim before upload (stretch; not required for v0.1)  

### 5.3 Library
- List recordings: title, thumbnail, duration, createdAt, views, status  
- Rename, delete, copy link  
- Free-tier expiry countdown visible when applicable  

### 5.4 Analytics (MVP)
- View count increment (dedupe lightly by viewer cookie/fingerprint window — best effort)  
- No heatmaps / comments in MVP  

### 5.5 Billing (MVP paid tier)
- Free + Individual only at launch (Team deferred)  
- ETB checkout via WeBirr; webhook activates subscription  
- Enforce: monthly recording count, max duration, watermark, link TTL  

---

## 6. Plan Limits (enforced in code)

| Limit | Free | Individual |
|---|---|---|
| Recordings / month | 15 | Unlimited* |
| Max duration / recording | 5 min | 25 min |
| Link expiry | 7 days | None (until user deletes) |
| Watermark on playback | Yes | No |
| View analytics | Count only | Count only (MVP) |
| Max storage (soft) | Shared free pool; auto-delete on expiry | Soft cap e.g. 5–10 GB/user (config) |

\*“Unlimited” must still respect a **storage soft cap** to protect ETB unit economics (config flag `MAX_STORAGE_BYTES_INDIVIDUAL`).

### 6.1 Storage math (why bitrate is capped)

The R2 free tier is **10 GB stored**, and it is the binding constraint on the “$0 infra” claim in §19 — not compute, not D1. At MediaRecorder's default settings a 1080p screen capture runs ~2.5–5 Mbps, which makes a single 5-minute free recording **~95–190 MB**. At that rate the free tier is exhausted by roughly **8–10 active free users**, before a single paying customer stores anything.

The spec therefore fixes the bitrate rather than leaving it to the browser (§10.3):

| Setting | Value | Result |
|---|---|---|
| Video bitrate | 1.5 Mbps | ~11 MB/min |
| Audio bitrate | 96 kbps | ~0.7 MB/min |
| Effective | ~1.6 Mbps | **~12 MB/min** |

At ~12 MB/min:

| Scenario | Storage |
|---|---|
| Free recording at 5-min cap | ~60 MB |
| Free user at full 15/month quota | ~900 MB |
| Individual recording at 25-min cap | ~300 MB |
| R2 free tier headroom | ~11 free users at full quota, or ~170 five-minute recordings |

Free-tier objects expire after 7 days, so the steady-state free pool is bounded by *weekly* upload volume, not cumulative — which is what makes the free tier survivable at all.

1.5 Mbps is chosen because screen content is mostly static: UI text stays legible at this rate where camera-heavy footage would not. Validate legibility on real 1080p code/design screens during Phase 1 before locking it in; raise to 2 Mbps if text smears, and re-run the table above if you do.

**Kill switch:** track total bytes in the free pool and stop accepting new free recordings above `MAX_FREE_POOL_BYTES` (default 8 GB), rather than discovering the overage on a bill.

### 6.2 Scheduled jobs (cron Workers)

| Job | Frequency | Action |
|---|---|---|
| `purge-expired` | daily | Delete free recordings past `expires_at` + their R2 objects |
| `purge-abandoned` | hourly | Abort R2 multipart uploads and delete `pending_upload` rows older than 24h |
| `purge-deleted` | daily | Hard-delete R2 objects for rows soft-deleted > 24h ago |
| `downgrade-lapsed` | daily | Set `plan=free` where `plan_expires_at + grace` has passed (§12.3) |
| `usage-report` | weekly | Report R2/D1 usage against free tiers; alert at 80% |

`downgrade-lapsed` is easy to forget and directly costs revenue integrity — lapsed users otherwise keep paid limits indefinitely.

R2 object lifecycle rules can handle free-tier expiry with zero code if keys are prefixed by tier (`free/…` vs `paid/…`), at the cost of a key rewrite on upgrade. Evaluate against the cron job in Phase 1; the cron job is the safer default because it keeps D1 and R2 in step.

---

## 7. Auth Model

### 7.1 MVP decision
- **Viewing:** anonymous  
- **Recording + library:** authenticated  
- **Method:** email magic link (primary)  

Rationale: ownership, quotas, and billing require identity; magic link avoids password UX and fits freelancers.

### 7.2 Session
- Opaque session token stored in D1 (`sessions` table)  
- Cookie: `stream_session` — `HttpOnly; Secure; SameSite=Lax; Path=/`  
- TTL: 30 days sliding  

### 7.3 Optional later
- Google OAuth for faster signup  
- Anonymous record → claim-by-email within 24h (only if validation shows signup friction)

---

## 8. Data Model (D1)

Use UUIDv7 or ULID for sortable IDs. Timestamps in UTC ISO / unix ms.

### 8.1 `users`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| email | text unique | lowercase |
| name | text null | |
| plan | text | `free` \| `individual` |
| plan_expires_at | integer null | |
| storage_bytes | integer | running total of `ready` recordings; enforced against plan cap |
| created_at | integer | |
| updated_at | integer | |

Maintain `storage_bytes` incrementally on complete/delete/purge rather than `SUM()`-ing `recordings` on every quota check. Recompute it in the weekly usage job to correct drift.

### 8.2 `sessions`
| Column | Type | Notes |
|---|---|---|
| id | text PK | session token hash |
| user_id | text FK | |
| expires_at | integer | |
| created_at | integer | |

### 8.3 `recordings`
| Column | Type | Notes |
|---|---|---|
| id | text PK | internal |
| public_id | text unique | short nanoid for URLs |
| user_id | text FK | |
| title | text | default “Untitled recording” |
| status | text | `pending_upload` \| `processing` \| `ready` \| `failed` \| `expired` \| `deleted` |
| mode | text | `screen` \| `camera` \| `both` |
| duration_ms | integer null | client-reported, display only — see §5.1.1 |
| size_bytes | integer null | authoritative; set from R2 on complete |
| mime_type | text null | `video/mp4` or `video/webm` — see §10.2 |
| r2_key | text | object key |
| r2_upload_id | text null | in-flight multipart upload; cleared on complete |
| thumbnail_r2_key | text null | |
| has_watermark | integer | 0/1 denormalized from plan at create |
| expires_at | integer null | free tier |
| view_count | integer | default 0 |
| deleted_at | integer null | soft-delete time; purge job finds objects by age |
| created_at | integer | |
| updated_at | integer | |

**Quota counting:** the monthly recording quota in §6 counts rows with `status='ready'` only. Counting `pending_upload` rows lets abandoned or failed uploads consume a free user's allowance.

### 8.4 `views`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| recording_id | text FK | |
| viewer_key | text | hashed cookie/IP bucket |
| watched_at | integer | |
| completed | integer | 0/1 best-effort |

Unique-ish: `(recording_id, viewer_key, day)` for light dedupe — or increment `view_count` with cooldown in API.

### 8.5 `payments`

One table, not two. Current plan state lives on `users` (`plan`, `plan_expires_at`); this is the immutable ledger of payment attempts. There is no separate `subscriptions` table because these rails are prepaid rather than recurring (§12.3).

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text FK | |
| provider | text | `webirr` |
| provider_ref | text | |
| amount_etb | integer | minor units (cents/santim) |
| status | text | `pending` \| `paid` \| `failed` \| `expired` |
| period_start | integer null | |
| period_end | integer null | |
| raw_payload | text null | webhook JSON |
| created_at | integer | |

### 8.6 `magic_links`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| email | text | |
| token_hash | text unique | |
| expires_at | integer | ~15 min |
| consumed_at | integer null | |

---

## 9. API Specification

Base: `/api/*`  
Auth: session cookie unless marked public.  
Errors: `{ "error": { "code": string, "message": string } }` with appropriate HTTP status.

### 9.1 Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/magic-link` | public | body `{ email }` → send link |
| GET | `/api/auth/callback` | public | `?token=` → set session, redirect |
| POST | `/api/auth/logout` | user | clear session |
| GET | `/api/me` | user | current user + plan + usage |

### 9.2 Recordings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/recordings` | user | list library |
| POST | `/api/recordings` | user | create row + initiate R2 multipart; enforce quotas |
| GET | `/api/recordings/[id]` | user | metadata |
| PATCH | `/api/recordings/[id]` | user | rename |
| DELETE | `/api/recordings/[id]` | user | soft-delete (`deleted_at`) + schedule R2 delete |
| POST | `/api/recordings/[id]/part-url` | user | sign one multipart part; body `{ partNumber }` |
| POST | `/api/recordings/[id]/complete` | user | body `{ parts[], durationMs }` → complete multipart, verify size, set `ready` |
| POST | `/api/recordings/[id]/abort` | user | abort multipart on client-side cancel |
| POST | `/api/recordings/[id]/thumbnail` | user | thumbnail upload URL |

Part URLs are signed one at a time on request rather than batch-issued at create, because part count is unknown until recording stops.

### 9.3 Playback (public)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v/[publicId]` | public | metadata + signed playable URL |
| POST | `/api/v/[publicId]/view` | public | register view (rate limited) |
| POST | `/api/v/[publicId]/report` | public | abuse report → §14.1 |

### 9.4 Billing
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/billing/checkout` | user | create WeBirr payment intent |
| POST | `/api/billing/webhook` | provider | verify signature; activate plan |
| GET | `/api/billing/status` | user | current subscription |

### 9.5 Create recording response (example)
```json
{
  "recording": {
    "id": "…",
    "publicId": "x7k2m9",
    "status": "pending_upload",
    "shareUrl": "https://stream.et/v/x7k2m9",
    "maxDurationMs": 300000,
    "maxBytes": 94371840
  },
  "upload": {
    "strategy": "multipart",
    "uploadId": "…",
    "partUrlEndpoint": "/api/recordings/…/part-url",
    "minPartBytes": 5242880,
    "expiresIn": 3600
  }
}
```

`minPartBytes` is 5 MB — the S3/R2 minimum for all parts except the last. The client buffers MediaRecorder chunks to that threshold before uploading a part (§10.5). `maxBytes` is the server-enforced ceiling from §5.1.1 and is echoed so the client can fail fast rather than uploading a doomed file.

---

## 10. Client Recording Specification

### 10.1 Browser APIs
- `navigator.mediaDevices.getDisplayMedia` — screen (+ system audio if available)  
- `navigator.mediaDevices.getUserMedia` — camera + mic  
- `MediaRecorder` — container/codec selected by capability probe (§10.2)  

### 10.2 Container & codec strategy — prefer MP4

**The recipient's browser matters more than the recorder's.** Stream's value proposition is "send a link to your client abroad"; a meaningful share of those clients open links on iPhone or macOS Safari. WebM/VP9 playback there is unreliable — especially on iOS — so a WebM-only pipeline can fail at the product's only job, for a viewer who never installed anything and will not debug it. Recording compatibility is a nice-to-have; **playback compatibility is the product.**

Selection order, by capability probe at record time:

```
1. video/mp4;codecs=avc1.42E01E,mp4a.40.2   → H.264/AAC in MP4  (universal playback)
2. video/webm;codecs=vp9,opus
3. video/webm;codecs=vp8,opus                → last resort
```

Recent Chrome and Safari both support MP4 output from `MediaRecorder`; Firefox is WebM-only. This yields near-universal playback with **no server-side transcoding**, which is why §11.4 can stay transcode-free.

> **Verify before locking in:** exact codec strings and version thresholds move. Confirm `MediaRecorder.isTypeSupported()` behaviour on current Chrome, Safari, and Firefox during Phase 1 week 1 — this decision determines whether §11.4 (no transcoding) holds.

Store the negotiated type in `recordings.mime_type`; the playback page uses it to pick a fallback message.

### 10.3 Encoding constraints (cost-critical)

Bitrate is **explicitly set, never left to the browser** — see §6.1, where the entire free-tier cost model depends on it:

```js
new MediaRecorder(stream, {
  mimeType,                      // from §10.2 probe
  videoBitsPerSecond: 1_500_000, // ~11 MB/min — do not omit
  audioBitsPerSecond: 96_000,
});
```

- Capture constraints: `max 1920×1080`, `frameRate: { ideal: 30, max: 30 }`  
- `timeslice` = 5000 ms on `start()` — feeds progressive upload (§10.5)  
- Enforce max duration with a timer that auto-stops, plus a warning at 80% of the cap  
- If permissions are denied → precise, actionable error copy per failure mode (denied vs. no device vs. unsupported browser), not a generic failure  

### 10.4 WebM duration fix (required if WebM is used)

`MediaRecorder` WebM output omits the Duration and Cues elements. The consequence is not cosmetic: `video.duration` reads `Infinity` and **the scrub bar in §5.2 does not work**. Any WebM-path build must either:

- rewrite the EBML header client-side before upload (`ts-ebml` or equivalent), or  
- write correct duration metadata server-side on complete.

This does not apply to the MP4 path in §10.2, which is a further reason to prefer it. Whichever path ships, seeking on the public playback page is a Definition-of-Done item (§19), not a follow-up.

### 10.5 Progressive upload

MVP requirement, not a v1.1 optimisation (see §4.2 for rationale).

1. `MediaRecorder` fires `dataavailable` every 5s.  
2. Chunks accumulate in a buffer until it reaches ≥ 5 MB (the R2 minimum part size).  
3. The buffer is uploaded as one multipart part via a URL from `/api/recordings/[id]/part-url`, then released from memory.  
4. Failed parts retry with exponential backoff (3 attempts) **without interrupting recording**; a part that exhausts retries is re-queued and retried after stop.  
5. On stop, the remaining buffer uploads as the final part (exempt from the 5 MB minimum), then `/complete` is called with the `parts[]` ETag list.  
6. If the user closes the tab mid-recording, `r2_upload_id` lets `purge-abandoned` (§6.2) abort the multipart upload so no partial data is billed.

Effects: memory stays bounded at ~5 MB instead of growing to the full recording; a network drop costs one 5 MB part rather than the whole file; and upload completes seconds after stop rather than minutes, which is what makes the "instant share link" promise true on a slow connection.

### 10.6 Thumbnail generation

On stop, draw a frame from ~1s into the recording to an offscreen `<canvas>`, export as JPEG (quality ~0.7, max width 640), and upload via `/api/recordings/[id]/thumbnail`. Failure is non-fatal — the library falls back to a placeholder tile.

### 10.7 Compatibility matrix (document in UI)

**Recording:**

| Platform | Screen | Camera | MVP support |
|---|---|---|---|
| Desktop Chrome/Edge | Yes | Yes | Primary |
| Desktop Firefox | Yes | Yes | Supported (WebM path) |
| Desktop Safari | Partial | Yes | Best-effort |
| Mobile browsers | Inconsistent | Yes | Not required |

**Playback (must be near-universal — validate in Phase 1):**

| Platform | MP4/H.264 | WebM/VP9 |
|---|---|---|
| Desktop Chrome/Edge/Firefox | Yes | Yes |
| Desktop Safari | Yes | Unreliable |
| iOS Safari / in-app browsers | Yes | No |
| Android Chrome | Yes | Yes |

### 10.8 Composition (screen + camera)
- Record screen track as primary canvas/stream  
- Overlay webcam in corner via `canvas.captureStream` **or** CSS overlay only for preview and record screen+cam as separate tracks if product chooses simpler path  
- **MVP recommendation:** preview overlay in UI; encode **combined canvas stream** so playback is one file (Loom-like)  
- Note: canvas compositing raises CPU load on low-end machines. If dropped frames appear in testing, fall back to a lower composite frame rate (24fps) before abandoning the single-file approach.

---

## 11. Storage & Playback

### 11.1 R2 key layout
```
recordings/{userId}/{recordingId}/source.{mp4|webm}    # extension follows §10.2
recordings/{userId}/{recordingId}/thumb.jpg
```

### 11.2 Bucket CORS (required before any upload works)

Browser-direct multipart upload fails without CORS on the bucket. `ExposeHeaders: ETag` is mandatory — the client cannot complete a multipart upload without reading each part's ETag, and its absence produces a confusing empty-header failure rather than a clear CORS error.

```json
[{
  "AllowedOrigins": ["https://stream.et", "http://localhost:3000"],
  "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
  "AllowedHeaders": ["content-type"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

### 11.3 Access control
- **Uploads:** short-lived presigned part URLs, issued only to the owning user, scoped to one `uploadId`  
- **Playback:** either  
  - **A)** signed GET URLs (TTL 1–6h) issued by `/api/v/[publicId]`, or  
  - **B)** public read via custom domain + unguessable `public_id`  
- **MVP recommendation:** **signed GET** for private-by-default storage  

Signed URLs must be served over a bucket custom domain rather than the S3 API endpoint, so range requests (seeking) hit Cloudflare's cache instead of re-reading from origin on every scrub.

A signed URL is a bearer token for the duration of its TTL: once issued it can be forwarded outside the share page. This is acceptable — the same is true of the share link itself — but it means signed GET is a privacy measure against bucket enumeration, not access control against a determined viewer.

### 11.4 Transcoding and the watermark

- **MVP:** no server transcoding. The §10.2 MP4-preferred pipeline is what makes this viable; if that probe fails to deliver MP4 on Chrome and Safari, revisit this decision rather than shipping WebM-only.  
- **v1.1+:** Cloudflare Stream or an ffmpeg Worker, if the compatibility matrix in §10.7 proves worse in the field than expected.

**Watermark honesty.** With no transcoding, the free-tier watermark is a DOM overlay on the playback page, not burned into the video. It is therefore removable via devtools and absent if a viewer opens the media URL directly. This is accepted for MVP: the watermark is a **conversion nudge for ordinary viewers, not an enforcement mechanism.** Do not describe it internally or in marketing as if it were tamper-proof, and do not spend engineering time hardening it — burn-in requires transcoding, which is a v1.1+ cost decision.

### 11.5 Cost controls
- Free recordings: hard `expires_at` + daily purge job (§6.2)  
- Reject complete if `size_bytes` > plan max (§5.1.1)  
- Abort abandoned multipart uploads + `pending_upload` rows after 24h  
- Stop accepting new free recordings above `MAX_FREE_POOL_BYTES` (§6.1)  

---

## 12. Billing Integration (ETB)

### 12.1 Flow
1. User selects Individual plan → `POST /api/billing/checkout`  
2. Server creates pending `payments` row + WeBirr invoice  
3. User pays via Telebirr / CBE Birr on WeBirr UI  
4. Webhook → verify → set `users.plan = individual`, set period dates  
5. Middleware/quota checks read `users.plan`  

### 12.2 Rules
- Idempotent webhook handling on `provider_ref`  
- Grace period config (e.g. 3 days) before downgrade  
- On downgrade: keep existing permanent links; enforce free limits on **new** recordings; optionally watermark new only  

Indicative price (from PRD): **250–350 ETB/mo** — final amount is config, not hardcoded UI copy only.

### 12.3 This is prepaid, not a subscription

Telebirr and CBE Birr have **no card-style recurring mandate**. There is no auto-renewal to rely on: every month the user must actively pay again. "Subscription" is a UI word here, not a billing mechanism, and this changes what has to be built:

- **Renewal reminders** at T−3 days and on expiry (Resend) — without these, churn is silent and near-total  
- **Expiring-soon UI state** in the billing screen and library header  
- **`downgrade-lapsed` cron** (§6.2) — the only thing actually enforcing expiry  
- **One-tap re-pay** from the reminder email, landing directly on a prefilled WeBirr invoice  
- Expect materially higher involuntary churn than a card-billed SaaS; the renewal flow is a **core** surface, not an edge case

### 12.4 Provider lead time (schedule risk)

WeBirr merchant onboarding — application, KYC/business documents, sandbox credentials, webhook URL whitelisting, production approval — is **calendar time controlled by a third party**, typically weeks, and cannot be compressed by engineering effort.

**Start the WeBirr merchant application in Phase 0, week 1**, in parallel with validation interviews. If it is started when Phase 1 billing work begins, it silently becomes the critical path on the entire launch.

Build against a mocked provider interface (`lib/billing/provider.ts`) so checkout, webhook handling, and downgrade logic can be written and tested before credentials arrive.

---

## 13. Application Structure (Next.js)

```
/app
  /(marketing)/page.tsx          # landing
  /login/page.tsx
  /record/page.tsx
  /library/page.tsx
  /settings/billing/page.tsx
  /v/[publicId]/page.tsx         # public playback (+ generateMetadata for OG tags)
  /embed/[publicId]/page.tsx     # iframe embed
  /api/...                       # route handlers
/components
  /record/**                     # recorder UI
  /playback/**                   # player
  /library/**
  /ui/**                         # primitives
/lib
  /auth/**
  /db/**                         # drizzle schema + client
  /r2/**                         # signing, multipart helpers
  /recorder/**                   # capability probe, encoder config, chunk uploader
  /billing/**                    # provider.ts interface + webirr impl
  /plans.ts                      # limit config (single source of truth)
  /validators.ts
/workers
  /purge-expired.ts              # cron: free-tier expiry
  /purge-abandoned.ts            # cron: stale multipart uploads
  /purge-deleted.ts              # cron: soft-deleted objects
  /downgrade-lapsed.ts           # cron: plan expiry
  /usage-report.ts               # cron: free-tier usage alerting
```

`lib/plans.ts` is the single source of truth for every limit in §6 — durations, byte ceilings, bitrates, quotas. Client and server both import it; no limit is duplicated as a literal anywhere else.

---

## 14. Security Requirements

- CSRF: SameSite cookies + origin checks on mutating routes  
- Rate limit: magic-link send, view register, create recording, part-url signing (IP + email)  
- Validate ownership on all recording mutations **and on every part-url signing request**  
- Never expose R2 secret keys to client  
- Webhook signature verification mandatory  
- Content-Security-Policy appropriate for media + payment redirects; `/embed/*` needs a `frame-ancestors` policy that permits third-party embedding while other routes deny it  
- Sanitize titles (length + charset) — titles appear in OG tags, so escape for HTML attribute context  
- Public IDs: high-entropy nanoid (≥ 10 chars)  
- Magic-link tokens: single-use, hashed at rest, ~15 min TTL, invalidated on consumption  

### 14.1 Abuse, takedown, and legal

A public video host with anonymous viewing **will** be used to distribute malware lures, pirated content, phishing pages, and worse. This is not hypothetical for link-sharing products, and Cloudflare will forward complaints and expect a response. Minimum viable posture for MVP:

- **Abuse report endpoint** (§9.3) + a visible "Report" affordance on the playback page  
- **Admin kill switch:** set `status` to a takedown state that hard-blocks playback immediately, independent of the normal delete path  
- **`abuse@stream.et`** published in Terms and in the site footer  
- **Terms of Service + Privacy Policy** live before public launch — required by WeBirr merchant onboarding anyway, so it is on the critical path regardless  
- **Account deletion + data export** — cheap now, painful to retrofit, and relevant given users serve EU/international clients  
- Log the uploading `user_id` for every recording and retain it after deletion for a bounded window, so repeat abusers can be identified

None of this is large, but all of it is far cheaper before launch than during an incident.

---

## 15. Observability & Ops

- Structured logs on API errors (no PII beyond user id)  
- Metrics counters: uploads started/completed/failed, **part retries**, views, checkout started/paid, renewals due/completed  
- **Upload success rate tracked as a first-class metric** — it is the §21 target and the primary risk in §10.5; instrument it from day one rather than inferring it from failures  
- R2 + D1 usage checked weekly against free tiers  
- Alert when total storage > 80% of R2 free 10 GB, and when the free pool passes `MAX_FREE_POOL_BYTES` (§6.1)  
- Alert on webhook signature failures (possible misconfiguration or probing)  

---

## 16. Environment Variables

```bash
# App
APP_URL=https://stream.et
SESSION_SECRET=

# D1 / Cloudflare — bound in wrangler.toml (not always env)
# R2 bindings via wrangler

# Email
RESEND_API_KEY=
EMAIL_FROM=noreply@stream.et

# R2 (if using S3-compatible API from Node locally)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=stream-videos
R2_PUBLIC_BASE_URL=   # optional

# Billing
WEBIRR_API_KEY=
WEBIRR_WEBHOOK_SECRET=
INDIVIDUAL_PRICE_ETB=300
BILLING_GRACE_DAYS=3

# Limits / cost controls (see §6.1)
VIDEO_BITRATE_BPS=1500000
AUDIO_BITRATE_BPS=96000
MAX_FREE_POOL_BYTES=8589934592        # 8 GB — stop accepting free uploads above this
MAX_STORAGE_BYTES_INDIVIDUAL=10737418240   # 10 GB soft cap
FREE_LINK_TTL_DAYS=7

# Abuse
ABUSE_CONTACT_EMAIL=abuse@stream.et
```

Local dev: Wrangler + Next local bindings; Miniflare/R2 local simulation or real R2 staging bucket.

---

## 17. Testing Strategy

| Layer | What |
|---|---|
| Unit | plan limits, expiry math, webhook idempotency, size-ceiling calc, part buffering |
| Integration | auth callback, create→part-url→complete (mocked R2), quota counting excludes `pending_upload`, cron jobs |
| E2E (Playwright) | login → record mock → library → public playback → embed |
| Manual | real Chrome screen capture + R2 upload on staging |

### 17.1 Tests that specifically cover the risky parts

The default test pyramid does not touch the three things most likely to break this product:

- **Upload resilience:** simulate part failures and offline periods mid-recording (Playwright network throttling / offline toggle); assert the recording still completes. Test on a genuinely throttled connection, not just a fast one — the target market's median connection is the real environment.
- **Playback compatibility:** open a produced share link on real iOS Safari and macOS Safari before declaring §10.2 settled. A capability probe passing in Chrome proves nothing about the recipient.
- **Seeking:** assert `video.duration` is finite and a mid-video seek lands correctly, on both the MP4 and WebM paths (§10.4).

---

## 18. Phased Delivery

### Phase 0 — Validation (1–2 weeks)
- Landing page on Cloudflare Workers  
- Waitlist / interest form  
- Interest-gauging CTA (“Pay with Telebirr — join waitlist”). The disclosure that no payment is taken must be **unmissable on the button itself**, not only on the page it leads to — a payment button that looks real and isn't damages exactly the trust this product is selling.  
- 10–15 interviews (per PRD)  
- **Start WeBirr merchant application (§12.4)** — week 1, in parallel. Longest external lead time in the whole plan.  
- Browser capability probe spike (§10.2): 1 day, determines the MP4-vs-WebM path and therefore whether §11.4's no-transcoding assumption holds

### Phase 1 — MVP build (4–7 weeks realistic for one builder)

The original 2–4 week estimate covers auth, a browser recorder, multipart upload, library CRUD, quota enforcement, five cron jobs, a third-party payment integration, and legal pages. That is optimistic by roughly 2× for a solo builder, and §12.4's lead time is not compressible by working faster. Sequenced so the riskiest thing ships first:

1. **Record → progressive R2 upload → share link → playback** — highest risk, build it first; everything else is conventional CRUD  
2. Auth (magic link) + session  
3. Library CRUD + thumbnails  
4. Free-tier limits, quota enforcement, cron purge jobs  
5. Watermark overlay on free playback (§11.4 — overlay only)  
6. OG tags + embed route  
7. Individual ETB billing via WeBirr + renewal reminders  
8. ToS / Privacy / abuse endpoint (§14.1) — required before public launch  

**Cut line if the schedule slips:** ship steps 1–6 and invoice the first cohort manually. Ten customers paid by hand teach you more about the renewal flow than a webhook does, and it removes the one dependency you do not control from the launch path.

### Phase 2
- Completion analytics, team seats, pricing refinement  
- Server-side transcoding **only if** §10.7 field results demand it  

### Phase 3 (conditional)
- Drop-off, comments, deeper workspaces  

---

## 19. Definition of Done (MVP)

- [ ] User can magic-link login  
- [ ] User can record screen and/or camera in Chrome desktop  
- [ ] Stop → upload → receive `/v/{publicId}` that works logged-out  
- [ ] **Share link plays on iOS Safari and macOS Safari** (§10.2)  
- [ ] **Scrub bar seeks correctly; `video.duration` is finite** (§10.4)  
- [ ] **Recording survives a 30s network drop mid-capture and still completes** (§10.5)  
- [ ] **Recording ≤ 12 MB/min at 1080p** (§6.1 — the cost model depends on it)  
- [ ] Share link unfurls with thumbnail + title in Telegram and Slack  
- [ ] Library lists/renames/deletes  
- [ ] Free limits enforced (count, duration via size ceiling, expiry, watermark overlay)  
- [ ] Quota counts `ready` recordings only  
- [ ] Paid ETB checkout activates Individual plan  
- [ ] **Lapsed plan downgrades automatically after grace period** (§6.2)  
- [ ] Expired free videos purged from R2 + DB; abandoned multipart uploads aborted  
- [ ] ToS + Privacy live; abuse report endpoint and admin kill switch working (§14.1)  
- [ ] Infra cost ≈ $0 at low usage (domain excluded)  
- [ ] UI matches §2 (professional, minimal, accurate)  

---

## 20. Open Decisions (resolve during Phase 1 kickoff)

1. Tailwind vs CSS Modules — **default proposal: Tailwind + CSS variables for brand tokens**  
2. Anonymous-record-then-claim vs login-gated record — **default: login-gated**  
3. Canvas-composited single file vs dual-track — **default: single composited stream**  
4. WeBirr vs direct Telebirr — **default: WeBirr aggregator**  
5. Custom domain for R2 signed vs public — **default: signed GET over a bucket custom domain**  

**Resolved in v0.2** (previously implicit or contradictory):

| Was | Now |
|---|---|
| WebM-only, Safari deferred to v1.1 | MP4-preferred with capability probe (§10.2) — pending Phase 1 verification |
| Full-blob upload, chunking optional in v1.1 | Progressive multipart from first chunk, MVP requirement (§10.5) |
| Bitrate unspecified | Fixed at 1.5 Mbps video / 96 kbps audio (§6.1, §10.3) |
| Watermark implied as enforced | Explicitly a removable overlay, accepted (§11.4) |
| Duration "enforced server-side" | Enforced via `size_bytes`; duration is display-only (§5.1.1) |
| Cloudflare Pages | Cloudflare Workers + static assets (§3) |
| `subscriptions` / `payments` conflated | Single `payments` ledger; plan state on `users` (§8.5) |
| Recurring subscription assumed | Prepaid renewal with reminders + downgrade cron (§12.3) |

### 20.1 Decisions that must be made in Phase 1, week 1

Each of these blocks or invalidates later work, and each is cheap to answer early and expensive to discover late:

1. **Does `MediaRecorder` produce MP4 on current Chrome and Safari?** Determines §10.2, §10.4, and whether §11.4's no-transcoding stance survives.  
2. **Is 1.5 Mbps legible on real 1080p code and design screens?** Determines the entire §6.1 cost model.  
3. **What is the actual upload success rate on a typical local connection?** Determines whether §10.5's design is sufficient or needs resumable-session hardening.

---

## 21. Success Metrics (post-launch)

- Activation: % of signups who complete ≥1 recording in 24h  
- Share: % of recordings with ≥1 view  
- **Playback success: % of share-link opens that reach first frame** — the metric that catches a Safari compatibility failure, which activation and share rates would both miss  
- Conversion: free → Individual within 30 days  
- **Renewal: % of paying users who re-pay in month 2** — the number that matters most on prepaid rails (§12.3)  
- Cost: infra USD / active paying user, and GB stored / active free user  
- Reliability: upload success rate ≥ 98% on desktop Chrome  

---

*End of technical specification v0.2 — aligned with `idea.txt` and zero-cost Cloudflare stack.*

**Changelog v0.1 → v0.2:** added §5.1.1 (what the server can enforce), §6.1 (storage math and bitrate cap), §6.2 (scheduled jobs), §10.2 (MP4-preferred codec strategy), §10.4 (WebM duration fix), §10.5 (progressive upload), §10.6 (thumbnails), §11.2 (bucket CORS), §12.3 (prepaid renewal model), §12.4 (provider lead time), §14.1 (abuse and legal), §17.1 (risk-targeted tests), §20.1 (week-1 decisions). Revised the Phase 1 estimate, hosting target, and payments schema; made the watermark's limits explicit.

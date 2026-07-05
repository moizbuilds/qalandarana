# Qalandarana Phase 3 (The Media & The World) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Father messages a real WhatsApp number directly; each kalam can carry a Suno musical rendition and a TikTok/Reels audiogram of his actual voice; the archive gains search and goes public.

**Architecture:** The Phase 1 pipeline is untouched — Phase 3 adds a second ingestion door (WhatsApp Cloud API webhook writing through the same `createEntry`), additive schema (one `song_url` column), a standalone Remotion render script (runs on Moiz's laptop, not serverless — video rendering doesn't belong in a Vercel function), and presentation additions.

**Tech Stack:** Everything prior, plus: Meta WhatsApp Cloud API (raw fetch, same style as `telegram.ts`), Remotion (`remotion`, `@remotion/cli`, `@remotion/media-utils`) in a `video/` subfolder with its own entry point, Postgres full-text search (no new service).

**Read first:** Spec §6 (export), §7 (phase boundaries), §2 (the "swap the bridge, nothing downstream changes" promise this phase must keep). Phase 1 plan's Global Constraints all still apply.

## Global Constraints (additional)

- WhatsApp ingestion MUST reuse `createEntry` + `advanceEntry` untouched — if a pipeline change feels needed, stop and re-read spec §2; the bridges are interchangeable doors into the same house.
- Suno has no official API (verify at implementation time — if one has shipped, propose a plan amendment before building the manual flow). The manual flow below assumes none.
- Audiogram rendering is manual-per-entry by design (Moiz runs a script). Do NOT build serverless video rendering.
- Schema change (`song_url`) ships as migration + code together, in order (Moiz's CLAUDE.md rule).
- Going public is a deliberate, reversible flip — Task 5's checklist gates it, and `PUBLIC_MODE=false` rolls it back.

---

### Task 1: WhatsApp Cloud API bridge

**Files:**
- Create: `src/lib/whatsapp.ts`, `src/app/api/whatsapp/webhook/route.ts`, `docs/WHATSAPP-SETUP.md`
- Test: `src/lib/whatsapp.test.ts`, `src/app/api/whatsapp/webhook/route.test.ts`
- Modify: `src/lib/env.ts` (+ `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ALLOWED_NUMBERS` — comma-separated E.164, validated like the Telegram list), `.env.example`

**Interfaces:**
- Consumes: `createEntry`, `getEntryByTelegramMessageId` — **rename migration**: generalize dedup to `sourceMessageId: text` + `source: pgEnum('ingest_source', ['telegram','whatsapp'])` (migration renames the column, backfills `source='telegram'`; update Phase 1 call sites + tests — this is the ONE sanctioned touch to existing pipeline code, and it's mechanical).
- Produces:
  - `src/lib/whatsapp.ts`: `sendWhatsAppMessage(to: string, text: string)`, `getWhatsAppMediaUrl(mediaId: string): Promise<string>` (GET `/{media-id}` → `url`), `downloadWhatsAppMedia(url: string): Promise<Blob>` (Bearer-authenticated fetch — WhatsApp media URLs require the token, unlike Telegram), `verifyWebhookSignature(rawBody: string, header: string): boolean` (HMAC SHA-256 with `WHATSAPP_APP_SECRET` against `x-hub-signature-256`).
  - Webhook route: `GET` = Meta's verification handshake (echo `hub.challenge` when `hub.verify_token` matches); `POST` = signature check (401 on fail), parse messages of type `audio`/`voice`, allowlist `from` number (silent 200 otherwise), duration cap (WhatsApp doesn't always send duration — if absent, enforce the cap by Blob size proxy: reject > 25 MB with apology), dedup on `sourceMessageId`, then the same dance as Telegram: media → Blob → `createEntry({ source: 'whatsapp', ... })` → ack message → `waitUntil` advance. Review-link delivery: `send_review` stage must now reply via the entry's source — add `replyToEntry(entry, text)` in a new `src/lib/messaging.ts` that routes to Telegram or WhatsApp by `entry.source`; `pipeline.ts` swaps its two `sendTelegramMessage` calls for `replyToEntry` (second sanctioned touch; update pipeline tests).
- `docs/WHATSAPP-SETUP.md`: Meta developer app creation, WhatsApp product, **business verification** (the slow, human part — start it first, it takes days), dedicated number (must NOT be registered on the WhatsApp app), permanent token via System User, webhook subscribe with verify token, test-number sandbox flow for development before the real number clears.

- [ ] **Step 1: Failing tests** — signature valid/invalid; GET handshake echo; non-allowlisted number silent-dropped; happy path creates entry with `source='whatsapp'`; `replyToEntry` routes by source (both directions).
- [ ] **Step 2–4:** TDD loop: rename migration first (run Phase 1 test suite after — it must stay green), then lib, then route.
- [ ] **Step 5:** Manual: sandbox test number → real voice note → full pipeline → review link arrives back **on WhatsApp**. Commit `feat: whatsapp cloud api bridge`.

### Task 2: Suno renditions

**Files:**
- Create: migration (add `songUrl: text('song_url')` to entries), `src/app/admin/entry/[id]/SongUpload.tsx`
- Modify: `src/lib/schema.ts`, `src/app/admin/entry/[id]/page.tsx` + `actions.ts` (upload action), `src/app/entry/[id]/page.tsx`, `docs/SETUP.md` (Suno workflow section)
- Test: extend `src/app/admin/entry/[id]/actions.test.ts`

**Interfaces:**
- Produces: `uploadSongAction(entryId, formData)` — accepts mp3/m4a ≤ 20 MB, `put('songs/{entryId}.mp3', ...)` to Blob, sets `songUrl` (re-upload replaces: same pathname + `allowOverwrite`); entry folio shows a second, smaller Medallion labeled "Hear it as a song" in small caps below his voice medallion — his voice stays primary (spec §1: his recordings are the core), the rendition is clearly the echo.
- Documented Suno workflow in SETUP.md: open entry in admin → copy `kalam_original` + `kalam_roman` → Suno prompt template (include: genre "sufi qawwali / folk", the Roman text as lyrics, mood from the entry's maqam — template text written out in the doc) → download mp3 → upload on the entry's admin page.

- [ ] **Steps:** failing action test (size/type rejection, happy path) → migration + schema (ship together) → action + upload component → folio second medallion → verify with a real Suno render of one entry → commit `feat: suno renditions`.

### Task 3: Audiograms (Remotion)

**Files:**
- Create: `video/` (own package.json — Remotion deps stay out of the web app's bundle), `video/src/Root.tsx`, `video/src/Audiogram.tsx`, `video/render.ts` (CLI script), `scripts/fetch-entry-json.ts`
- Test: `video/src/timing.test.ts` (couplet scheduling is pure math — unit test it)

**Interfaces:**
- Produces:
  - `scripts/fetch-entry-json.ts` — given an entry id + `DATABASE_URL`, writes `video/input/{id}.json` (`{ title, kalamOriginal, kalamRoman, kalamEnglish, audioUrl, poetName, valleyHex }`) and downloads the audio beside it. (Runs on Moiz's laptop with prod env — read-only.)
  - `video/src/Audiogram.tsx` — 1080×1920, 30fps composition: entry's valley color background, khatam watermark, waveform bars from `@remotion/media-utils` `visualizeAudio` in gold, couplets (split on blank lines, same rule as `KalamLayers` — copy the split into `video/src/timing.ts` with a comment naming the source; the two must not drift) shown Nastaliq-over-English, **evenly distributed across audio duration** (v1 timing; word-level sync via Whisper `verbose_json` timestamps is a documented future upgrade, not built now), QALANDARANA small-caps outro card with the site URL.
  - `video/render.ts` — `npx tsx video/render.ts <entryId>`: runs fetch script, then Remotion render → `video/out/{id}.mp4`. Moiz posts it to TikTok/Reels manually.
  - Timing math in `video/src/timing.ts`: `scheduleCouplets(count: number, durationSec: number, fps: number): { from: number; durationInFrames: number }[]` — pure, tested.

- [ ] **Steps:** scaffold `video/` (`npm create video` minimal template) → failing `timing.test.ts` (3 couplets over 60s @30fps → three equal windows covering the full span; 1 couplet → full span; 0 → empty) → implement timing → composition → render script → render one real entry, watch the mp4, check Nastaliq renders (Remotion uses real Chromium, so shaping is safe — unlike Satori) → commit `feat: audiogram render pipeline`.

### Task 4: Search

**Files:**
- Create: migration (generated tsvector column + GIN index), `src/app/search/page.tsx`
- Modify: `src/lib/entries.ts` (`searchEntries(q: string): Promise<Entry[]>`), journey page (search affordance in footer: a small gold "Search the archive" link — not a header search bar; the journey stays contemplative)
- Test: `src/lib/search-query.test.ts`

**Interfaces:**
- Produces: migration adds `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(kalam_roman,'') || ' ' || coalesce(kalam_english,'') || ' ' || coalesce(explanation_english,'') || ' ' || coalesce(kalam_original,''))) STORED` + GIN index (CONCEPT in migration comment: 'simple' config because Urdu/Punjabi have no Postgres stemmer — exact-word matching, which is correct for verse). `searchEntries` = published-only, `websearch_to_tsquery('simple', q)` ranked by `ts_rank`, ILIKE fallback when tsquery yields nothing (catches partial Roman words). `sanitizeQuery(q)` (trim, cap 100 chars, reject empty) — the unit-tested part. Search page: one input, results as the standard entry rows, `.urdu` rendering where the match is in the original.

- [ ] **Steps:** failing sanitize test → migration (+ code same commit) → repository fn → page → verify Roman + Urdu + English queries in dev → commit `feat: archive search`.

### Task 5: Public launch

**Files:**
- Create: `src/app/sitemap.ts`, `src/app/robots.ts`, `docs/LAUNCH-CHECKLIST.md`
- Modify: `src/app/layout.tsx` (site-wide metadata), entry/poet pages (`generateMetadata` completeness)

**Interfaces:**
- Produces: full metadata (title template `%s — Qalandarana`, description from father's framing, OG defaults to the site card), sitemap of published entries + poets + journey (published-only — `PUBLIC_MODE=false` keeps robots `disallow: /` and empty sitemap so nothing leaks pre-launch), and `docs/LAUNCH-CHECKLIST.md`:

- [ ] **Step 1:** sitemap/robots/metadata, gated on `PUBLIC_MODE`.
- [ ] **Step 2:** `LAUNCH-CHECKLIST.md` — verbatim gates: father's explicit blessing on going public (and on the corrections in every published entry — he has approved each one by design); domain purchased + attached in Vercel (suggest `qalandarana.com`); all entries re-skimmed in admin; passphrase removed = `PUBLIC_MODE=true` + redeploy; rollback = set `false` + redeploy; announce (LinkedIn post via linkedin-post-writer — the 30-in-30 story writes itself: "my father is a celebrity, but the app treats him as what he's always been to me — a library").
- [ ] **Step 3:** Playwright: `PUBLIC_MODE=true` → no gate, sitemap non-empty, robots allows; `false` → gate intact, robots disallows. Commit `feat: public launch rails`.
- [ ] **Step 4:** The flip itself happens only when the checklist's human gates are checked — that day, not build day.

---

## Sequencing note

Tasks 2–4 are independent of Task 1 (and of each other) — build in any order once Phase 2 ships. Task 1's business verification has days of external latency: **start the Meta paperwork first**, build other tasks while waiting. Task 5 is last by definition.

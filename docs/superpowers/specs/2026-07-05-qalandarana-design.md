# Qalandarana — Design Spec

**Date:** 2026-07-05
**App:** #16 in Moiz's 30-in-30
**One line:** Fawad Rana records sufi kalam + explanations as voice notes → they become transcribed, translated, poet-attributed entries on a "Seven Valleys" journey site — after he taps Approve.

The name: *Qalandar* (the wandering dervish) folded into *Rana* (the family name). The dervish and the man in one word.

---

## 1. Product decisions (settled during brainstorm)

| Decision | Choice |
|---|---|
| Audience | Family-first (shared passphrase gate), public later (env-var flip removes gate) |
| Ingestion | Telegram bot bridge: father sends WhatsApp voice note to Moiz → Moiz forwards to bot in 2 taps. Upgrade path: WhatsApp Business API later, nothing downstream changes |
| Languages in | Punjabi kalam (Bulleh Shah, Baba Farid, Shah Hussain, Waris Shah, Sultan Bahu, Khwaja Ghulam Farid), Urdu poetry + explanations |
| Languages out | Original script (Nastaliq), Roman transliteration, polished English |
| Journey structure | Attar's Seven Valleys (maqamat) as the front door + poet rooms as the study index |
| His voice vs Suno | His recordings are the core of v1; Suno renditions are Phase 3 |
| Curation | Father reviews & approves his own entries via tokenized link; Moiz has full admin edit |
| Database | Neon Postgres (NOT Supabase — both free slots consumed; also avoids free-tier auto-pause on a legacy site) |
| Audio storage | Vercel Blob (original .ogg stored untouched, forever) |
| Transcription | OpenAI Whisper (works in Qatar; Gemini does not for local dev) behind a swappable adapter |
| Structuring LLM | Claude Sonnet vs GPT decided by a taste test on 2–3 real notes, judged by father. Both behind a swappable adapter; loser stays one config line away |
| Social export | Quote-card images (Phase 2), audiograms for TikTok/Reels (Phase 3) |

## 2. Architecture

One Next.js (App Router, TypeScript) app on Vercel. Drizzle ORM → Neon. No job queue, no cron: at a few notes/day, a status state machine + admin retry button is the right amount of infrastructure.

```
Father ─voice note─▶ Moiz's WhatsApp ─2-tap forward─▶ Telegram bot
                                                        │ webhook (secret token in URL, sender allowlist)
                                                        ▼
                                          /api/telegram/webhook
                                          1. .ogg → Vercel Blob (immutable original)
                                          2. entries row → Neon (status: received)
                                          3. bot replies "Got it 🌙 processing…"
                                                        │
                                     staged pipeline (each stage = one short route)
                                     received → transcribed → structured → in_review → published
                                     (side states: needs_fix, failed)
                                                        │
                                     transcribe: Whisper adapter (transcribe(audioUrl) → rawText)
                                     structure:  LLM adapter (structureEntry(transcript) → entry JSON)
                                                        │
                                                        ▼
                                     bot sends review link → father taps Approve & publish
                                                        │
                                                        ▼
                                     Journey site reads only status = published
```

**Why staged, not one function:** any stage that fails leaves the entry at its last good status with `error_message` set; admin shows a "Retry from last good stage" button. One long function loses all work on failure and hits Vercel timeouts on long recordings.

**Adapters (the swap points):** `lib/adapters/transcriber.ts` and `lib/adapters/structurer.ts` each export one function. Provider choice is an env var. Nothing else in the codebase imports OpenAI/Anthropic SDKs directly.

**Auth, two levels:**
- Father: never logs in. Review link contains `review_token` (crypto-random, per entry).
- Moiz: `/admin` behind email + hashed password (single `admins` row).
- Family visitors: one shared passphrase → cookie. `PUBLIC_MODE=true` env var removes the gate at launch.

## 3. Data model (Neon, Drizzle migrations)

**entries**
- `id`, `created_at`, `audio_url`, `duration_sec`, `telegram_message_id` (unique — dedup on re-forward)
- `status` pg enum: `received | transcribed | structured | in_review | needs_fix | published | failed`; `error_message`
- Raw layer (immutable): `raw_transcript` — exactly what Whisper heard. Never edited; re-running structuring never requires re-transcribing.
- Structured layer (AI-drafted, human-editable): `title`, `kalam_original`, `kalam_roman`, `kalam_english`, `explanation_original`, `explanation_english`, `poet_id`, `maqam_id`, `corrections` (JSON list of {heard, restored} — every canonical-text fix the AI made, shown at review)
- Review: `review_token`, `approved_at`, `published_at`
- Phase 2/3 (columns added later, noted here): `song_url` (Suno), quote-card needs no column (rendered on demand)

**poets** — `id`, `name_english`, `name_original`, `era`, `bio`. Seeded with the six poets above; admin can add.

**maqamat** — `id`, `slug`, `name_english`, `name_original`, `order_index`, `description`. Seeded with Attar's Seven Valleys, in order: Talab (Seeking), Ishq (Love), Ma'rifat (Knowledge), Istighna (Detachment), Tawhid (Unity), Hairat (Wonderment), Fana (Annihilation). Stations render from the DB — single source of truth, never hardcoded in UI. Father may reorder/rename; it's seed data.

**admins** — `email`, `password_hash`.

## 4. Pipeline detail

1. **Ingest** (`/api/telegram/webhook`): verify Telegram secret; reject senders not in `TELEGRAM_ALLOWED_USER_IDS`; reject audio > 25 min with a friendly "please split this one" (cost cap); download .ogg → Blob; insert row; reply in chat; trigger transcribe.
2. **Transcribe**: Whisper adapter; store `raw_transcript`; advance; trigger structure. Stream audio from Blob to Whisper (no re-download). If a long note bumps Vercel's 60s hobby cap, raise that route's `maxDuration` — documented knob, not a redesign.
3. **Structure**: one prompt to the LLM adapter: *transcript of a man reciting classical sufi kalam then explaining it, possibly ASR-garbled. Separate recitation from explanation. Identify poet + canonical poem; where the transcript garbles a verse, restore canonical wording BUT record every correction. Output JSON: kalam_original, kalam_roman, kalam_english, explanation_original, explanation_english, title, poet, maqam.* Forced-JSON response → structured columns → `in_review`. Corrections are surfaced, never silent: if father intentionally recited a variant (traditions differ), he sees the "fix" and can reject it.
4. **Review**: bot messages the sender: "'{title}' is ready — {link}". The sender is whoever forwarded — usually Moiz, who forwards the link back to father on WhatsApp (one tap; the tokenized link works for him with no login). If father ever installs Telegram and messages the bot directly, the allowlist supports that and he gets the link straight back. Phone-first page: his audio on top, kalam + translation below, corrections highlighted, two big buttons: **Approve & publish** / **Something's wrong** (→ `needs_fix`, notifies Moiz).
5. **Failure**: stage throws → `failed` + `error_message`; bot tells sender Moiz was notified; admin retry button re-runs from last good status.

**Cost, all-in:** Neon free, Vercel hobby, Blob free (1 GB ≈ ~250 notes; cheap known upgrade), Whisper ≈ $0.06/10-min note, LLM ≈ $0.03–0.05/note. ~$2–5/month.

## 5. The journey site — creative brief

**This section is a hard requirement, not inspiration.** The bar is not "clean SaaS" — it is the grandeur of a mehfil-e-sama after midnight. `superpowers:frontend-design` must be invoked before UI code, with this brief as its input.

### Concept: The Night Journey
The entire site is one nightscape. The visitor is a seeker; the scroll is the path; the entries are lamps his father has lit along it.

### The Color Pilgrimage (signature move)
The background is not one color — it **transmutes as you travel the valleys**, scroll-linked, so the journey is felt before it is read:

| Valley | Base tone | Hex anchor |
|---|---|---|
| (Gateway) | Night ink | `#0B0E1A` |
| Talab — Seeking | Deep indigo | `#131A33` |
| Ishq — Love | Blackened crimson | `#3A1220` |
| Ma'rifat — Knowledge | Deep emerald-teal | `#0E2E2A` |
| Istighna — Detachment | Cool slate | `#1C2430` |
| Tawhid — Unity | Pure lapis | `#152252` |
| Hairat — Wonderment | Midnight violet | `#2A1840` |
| Fana — Annihilation | Fades from near-black **into ivory light** `#F2EBDC` | — |

Fana ending in *light*, not darkness, is the theological point: annihilation into the Beloved. The final scroll position is luminous.

Constant accents across all valleys: **old-gold** `#C9A227` (hairlines, the thread, active states; use sparingly — gold is precious because it is rare) and **moon ivory** `#F2EBDC` (text). Text contrast must pass WCAG AA against every valley tone.

### The Silsila Thread
A single 1px gold thread runs vertically down the journey page, connecting the seven stations — the *silsila* (chain of transmission) made literal. Stations with entries glow as lit lamps with a slow breathing halo (4s ease-in-out); empty stations ahead are faint outlines — unlit lamps the family watches father light over time. The thread draws itself downward on first load (~1.2s, once).

### Typography
- **Urdu/Punjabi:** Gulzar (open-source Nastaliq, the more soulful cut) with Noto Nastaliq Urdu fallback. Nastaliq needs `line-height: 2.2+` and generous block padding or descenders clip — treat this as a layout constraint from day one, with true RTL (`dir="rtl"`), never Latin-font Urdu.
- **English display:** Cormorant Garamond — literary, calligraphic ancestry.
- **English body:** EB Garamond.
- **Roman transliteration:** EB Garamond italic — visually a *whisper* between the original and the translation.
- **UI micro-labels** (statuses, buttons, captions): letterspaced small caps, never shouting.
- **Banned:** Inter/Roboto/system-font stacks, purple gradients, card-grid layouts, emoji in the public UI.

### The entry page: an illuminated folio
Modeled on a Mughal manuscript leaf: generous margins, a thin gold hairline frame around the content column, kalam centered and large (Nastaliq at display size), one couplet per visual block with air between couplets — three layers stacked (never tabbed): Nastaliq → Roman whisper → English. Then his explanation as flowing prose. Then the poet's name as a gold link to their room.

### The audio player: a talisman
Custom circular medallion — his voice deserves better than a SoundCloud bar. Gold ring = progress (a halo filling), play/pause at center, subtle radial pulse synced to playback like a zikr breath. One per entry page, prominent, above the text: **the voice comes first, the text is its shadow.**

### Ornament discipline
Eight-pointed star (khatam) as the Qalandarana mark. Faint geometric pattern watermarks at ≤4% opacity, at most one per screen. Thin gold rules as manuscript margins. **No** literal mosque silhouettes, lanterns, crescents-and-stars clichés, or stock arabesque borders.

### Motion
Slow and breathing, never bouncing: 600–900ms ease-out transitions; couplets fade up 12px as they enter the viewport; the medallion pulses only during playback. `prefers-reduced-motion` collapses all of it to instant.

### Pages
1. **Gateway** (`/`): passphrase → the journey. Even the gate is beautiful: the khatam mark, one line of Bulleh Shah, a single input field.
2. **The Journey** (`/journey`): the seven-valley scroll described above; each station shows name (Urdu + English), one line on what the seeker learns there, and its entries as lamp-cards.
3. **Entry** (`/entry/[id]`): the illuminated folio.
4. **Poet rooms** (`/poets`, `/poets/[id]`): bio, era, their entries. The study index — quieter grandeur.
5. **Review** (`/review/[token]`): phone-first, father-first: audio top, corrections highlighted, two big thumb-height buttons. Grandeur yields to clarity here, but same palette and type.
6. **Admin** (`/admin`): utilitarian workbench. Entry list by status, edit-everything forms, retry buttons, poet management. Plain by contrast, on purpose.

## 6. Social export

- **Phase 2 — quote cards:** "Share" on each entry renders a static image via Vercel OG (Satori): one couplet in Nastaliq, English line below, Qalandarana khatam + wordmark. Sizes: 1080×1080 (IG post), 1080×1920 (story), 1600×900 (X). Doubles as the site's OG images. Note: Satori has limited complex-script shaping — validate Nastaliq rendering early in Phase 2; fallback is a headless-browser screenshot route of a styled card page.
- **Phase 3 — audiograms:** vertical video (his real voice, waveform breath, synced verse text) via Remotion for TikTok/Reels. A real subsystem; pairs with Suno work.
- Known behavior: cards shared while family-only → tapping through hits the passphrase gate. Acceptable teaser mechanics.

## 7. Phases

- **Phase 1 — the spine:** repo, schema, Telegram webhook, Blob, pipeline, review link, plain published page. Goal: one real voice note flows end-to-end. Includes the Claude-vs-GPT taste test on 2–3 real notes, judged by father.
- **Phase 2 — the beauty:** everything in §5, quote cards, passphrase gate, full admin. frontend-design skill first, web-interface-guidelines check after.
- **Phase 3 — later (explicitly out of v1):** Suno renditions (`song_url`), audiograms, WhatsApp Business API bridge, public launch flip, search.

## 8. Testing & guardrails

- Pipeline: automated tests with a checked-in fixture recording (a short real note); unit tests for legal/illegal status transitions (e.g. `received → structured` must throw).
- UI: superpowers:webapp-testing (Playwright) passes incl.: reload mid-review, dead audio URL, entry with no poet match, Urdu rendering at 360px width.
- Pre-flight checklist per phase; sharpest edges: #2 failure handling (the `failed`/retry design), #4 secrets (review token unguessable; webhook rejects non-allowlisted senders; all keys server-side only), #5 cost (25-min audio cap), #6 single source of truth (maqamat in DB, statuses as one pg enum).
- Schema changes ship with their migrations, in order.

## 9. Env vars

`DATABASE_URL` (Neon), `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_USER_IDS`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `STRUCTURER_PROVIDER` (`claude|openai`), `FAMILY_PASSPHRASE`, `PUBLIC_MODE`, `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`. All required — fail closed at boot if missing (checklist #4).

# Qalandarana Phase 1 (The Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One real voice note flows end-to-end: Telegram forward → Blob + Neon → Whisper transcript → LLM-structured entry → father's tokenized review link → plain published page.

**Architecture:** Single Next.js 15 (App Router, TypeScript) app on Vercel. Neon Postgres via Drizzle ORM; audio originals in Vercel Blob. A status state machine (`received → transcribed → structured → in_review → published`, side states `needs_fix`/`failed`) drives a staged pipeline where each stage is one short serverless invocation, chained by an internal secret-protected route. Transcription and LLM structuring sit behind one-function adapters so providers swap via env var.

**Tech Stack:** Next.js 15, TypeScript (strict), Drizzle ORM + drizzle-kit, @neondatabase/serverless, @vercel/blob, openai (Whisper), @anthropic-ai/sdk, zod, jose (admin session JWT), bcryptjs, Vitest. Telegram via raw `fetch` (no SDK — the API is 3 endpoints for us).

**Read first:** `docs/superpowers/specs/2026-07-05-qalandarana-design.md` — especially §2 (architecture), §3 (data model), §4 (pipeline). Phase 1 UI is deliberately plain; the §5 creative brief applies to Phase 2 only.

## Global Constraints

- TypeScript `strict: true`; no `any` unless interfacing with untyped webhook JSON (type it with zod instead where shown).
- Teaching comments per Moiz's CLAUDE.md: every file opens with a 2–4 line plain-English block (what this file does, how it fits); `// CONCEPT:` one-liners the first time a novice concept appears (webhook, JWT, adapter, state machine, server action, etc.). Comment ideas, not obvious lines.
- All secrets server-side only; `src/lib/env.ts` fails closed at first use if any required var is missing (spec §9).
- Audio > 25 minutes (1500s) rejected at ingest (cost cap, spec §4).
- Statuses exist in exactly one place: the `entry_status` pg enum + `src/lib/status.ts` const (single source of truth).
- Maqamat and poets live in the DB (seeded), never hardcoded in UI.
- Original `.ogg` and `raw_transcript` are immutable after write. No code path updates them.
- Commit after every task (message style: `feat:`, `test:`, `chore:`).
- Node 20, npm (not pnpm/yarn — matches Moiz's other projects).

**Env vars (final list; superset of spec §9 — additions noted):** `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_USER_IDS` (comma-separated numeric IDs), `TELEGRAM_ADMIN_CHAT_ID` (Moiz's chat id, for failure/needs-fix notifications — *addition*), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `STRUCTURER_PROVIDER` (`claude|openai`), `INTERNAL_API_SECRET` (protects stage-chaining route — *addition*), `AUTH_SECRET` (signs admin session JWT — *addition*), `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (bcrypt), `APP_URL` (absolute base URL for links — *addition*), `FAMILY_PASSPHRASE`, `PUBLIC_MODE` (unused until Phase 2, validated now).

**Failure model (locks in spec §4.5):** when a pipeline stage throws, the entry gets `status='failed'`, `failed_at_stage` (`'transcribe' | 'structure' | 'send_review'`), and `error_message`; the admin chat is notified via Telegram. Retry = set status back to that stage's input status (`transcribe→received`, `structure→transcribed`, `send_review→structured`), clear the failure fields, re-run.

---

### Task 1: Scaffold app + test harness

**Files:**
- Create: Next.js app at repo root (`~/qalandarana`), `vitest.config.ts`, `.env.example`, `README.md`
- Modify: `.gitignore` (ensure `.env*.local`)

**Interfaces:**
- Produces: a running `npm run dev` app and `npm test` (Vitest) harness all later tasks use.

- [ ] **Step 1: Scaffold** (repo root already has `docs/` + git; scaffold in place)

```bash
cd ~/qalandarana
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack
npm i drizzle-orm @neondatabase/serverless @vercel/blob openai @anthropic-ai/sdk zod jose bcryptjs
npm i -D drizzle-kit vitest @types/bcryptjs dotenv
```

- [ ] **Step 2: Vitest config**

```ts
// vitest.config.ts
// Test runner config. Vitest is like Jest but faster and TS-native.
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

- [ ] **Step 3: `.env.example`** — every var from Global Constraints, each with a one-line comment and placeholder value (e.g. `TELEGRAM_ALLOWED_USER_IDS=123456789,987654321 # from @userinfobot`).

- [ ] **Step 4: `README.md`** — 15 lines: what Qalandarana is, the pipeline diagram from the spec (copy the ASCII), links to spec + this plan.

- [ ] **Step 5: Verify and commit**

Run: `npm run dev` → app renders at :3000. `npm test` → "no test files found" exit 0 (pass `--passWithNoTests` in the script).

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Vitest harness"
```

### Task 2: Env validation (fail closed)

**Files:**
- Create: `src/lib/env.ts`
- Test: `src/lib/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): Env` — memoized, throws listing ALL missing vars at once. Every later file reads config ONLY through this.

- [ ] **Step 1: Failing test**

```ts
// src/lib/env.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getEnv, _resetEnvCache } from './env'

const VALID: Record<string, string> = {
  DATABASE_URL: 'postgres://u:p@h/db', BLOB_READ_WRITE_TOKEN: 'x',
  TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(16),
  TELEGRAM_ALLOWED_USER_IDS: '111,222', TELEGRAM_ADMIN_CHAT_ID: '111',
  OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'x', STRUCTURER_PROVIDER: 'claude',
  INTERNAL_API_SECRET: 'b'.repeat(16), AUTH_SECRET: 'c'.repeat(32),
  ADMIN_EMAIL: 'moiz@example.com', ADMIN_PASSWORD_HASH: 'x',
  APP_URL: 'https://qalandarana.vercel.app', FAMILY_PASSPHRASE: 'x', PUBLIC_MODE: 'false',
}

beforeEach(() => { _resetEnvCache(); for (const k of Object.keys(VALID)) delete process.env[k] })

describe('getEnv', () => {
  it('throws naming every missing var', () => {
    process.env.DATABASE_URL = VALID.DATABASE_URL
    expect(() => getEnv()).toThrowError(/TELEGRAM_BOT_TOKEN/)
    expect(() => getEnv()).toThrowError(/ANTHROPIC_API_KEY/)
  })
  it('parses a valid environment', () => {
    Object.assign(process.env, VALID)
    const env = getEnv()
    expect(env.STRUCTURER_PROVIDER).toBe('claude')
    expect(env.TELEGRAM_ALLOWED_USER_IDS).toEqual([111, 222])
  })
  it('rejects unknown STRUCTURER_PROVIDER', () => {
    Object.assign(process.env, VALID, { STRUCTURER_PROVIDER: 'gemini' })
    expect(() => getEnv()).toThrowError(/STRUCTURER_PROVIDER/)
  })
})
```

- [ ] **Step 2: Run** `npm test -- env` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/env.ts
// Single gate for all configuration. Fails closed: the app refuses to run
// with missing secrets rather than limping into confusing errors later.
import { z } from 'zod'

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  TELEGRAM_ALLOWED_USER_IDS: z.string().min(1)
    .transform((s) => s.split(',').map((id) => Number(id.trim())))
    .pipe(z.array(z.number().int().positive())),
  TELEGRAM_ADMIN_CHAT_ID: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  STRUCTURER_PROVIDER: z.enum(['claude', 'openai']),
  INTERNAL_API_SECRET: z.string().min(16),
  AUTH_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  APP_URL: z.string().url(),
  FAMILY_PASSPHRASE: z.string().min(1),
  PUBLIC_MODE: z.enum(['true', 'false']).default('false'),
})
export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null
export function getEnv(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid/missing environment variables: ${missing}`)
  }
  cached = parsed.data
  return cached
}
export function _resetEnvCache() { cached = null } // test hook only
```

- [ ] **Step 4: Run** `npm test -- env` → 3 PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: fail-closed env validation"`

### Task 3: Schema, DB client, migration, seeds

**Files:**
- Create: `src/lib/schema.ts`, `src/lib/db.ts`, `drizzle.config.ts`, `scripts/seed.ts`
- Test: covered by the E2E walkthrough (Task 15) — this task is declarative wiring; the logic that guards it (status machine) is unit-tested in Task 4.

**Interfaces:**
- Produces: Drizzle tables `entries`, `poets`, `maqamat`, `admins`; `entryStatusEnum`; `db` client; types `Entry`, `NewEntry` (`typeof entries.$inferSelect/$inferInsert`). `npm run db:migrate`, `npm run db:seed`.

- [ ] **Step 1: Schema**

```ts
// src/lib/schema.ts
// The database shape. Drizzle: tables defined in TypeScript, so queries are
// type-checked and migrations are generated from this one file.
import { pgTable, pgEnum, text, uuid, integer, timestamp, jsonb, bigint } from 'drizzle-orm/pg-core'

// CONCEPT: a pg enum makes illegal status strings impossible at the DB level.
export const entryStatusEnum = pgEnum('entry_status', [
  'received', 'transcribed', 'structured', 'in_review', 'needs_fix', 'published', 'failed',
])
export const failedStageEnum = pgEnum('failed_stage', ['transcribe', 'structure', 'send_review'])

export const poets = pgTable('poets', {
  id: uuid('id').primaryKey().defaultRandom(),
  nameEnglish: text('name_english').notNull(),
  nameOriginal: text('name_original').notNull(),
  era: text('era').notNull(),
  bio: text('bio').notNull(),
})

export const maqamat = pgTable('maqamat', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nameEnglish: text('name_english').notNull(),
  nameOriginal: text('name_original').notNull(),
  orderIndex: integer('order_index').notNull(),
  description: text('description').notNull(),
})

export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  audioUrl: text('audio_url').notNull(),          // Vercel Blob URL — immutable
  durationSec: integer('duration_sec').notNull(),
  telegramMessageId: bigint('telegram_message_id', { mode: 'number' }).notNull().unique(), // dedup
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }).notNull(), // who to reply to
  status: entryStatusEnum('status').notNull().default('received'),
  errorMessage: text('error_message'),
  failedAtStage: failedStageEnum('failed_at_stage'),
  rawTranscript: text('raw_transcript'),          // immutable once written
  title: text('title'),
  kalamOriginal: text('kalam_original'),
  kalamRoman: text('kalam_roman'),
  kalamEnglish: text('kalam_english'),
  explanationOriginal: text('explanation_original'),
  explanationEnglish: text('explanation_english'),
  corrections: jsonb('corrections').$type<{ heard: string; restored: string }[]>(),
  poetId: uuid('poet_id').references(() => poets.id),
  maqamId: uuid('maqam_id').references(() => maqamat.id),
  reviewToken: text('review_token').unique(),
  approvedAt: timestamp('approved_at'),
  publishedAt: timestamp('published_at'),
})

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
})

export type Entry = typeof entries.$inferSelect
export type NewEntry = typeof entries.$inferInsert
```

- [ ] **Step 2: Client + drizzle config**

```ts
// src/lib/db.ts
// One shared DB client. Neon's serverless driver speaks Postgres over HTTP,
// which suits Vercel functions (no connection pools to babysit).
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { getEnv } from './env'
import * as schema from './schema'

export const db = drizzle(neon(getEnv().DATABASE_URL), { schema })
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

Add scripts: `"db:generate": "drizzle-kit generate", "db:migrate": "drizzle-kit migrate", "db:seed": "npx tsx scripts/seed.ts"` (add `tsx` to devDeps).

- [ ] **Step 3: Seed script** — idempotent (upsert by unique key):

```ts
// scripts/seed.ts
// Seeds the fixed journey structure (Attar's Seven Valleys), the six core
// poets, and the single admin. Safe to re-run: upserts, never duplicates.
import 'dotenv/config'
import { db } from '@/lib/db'
import { maqamat, poets, admins } from '@/lib/schema'
import { getEnv } from '@/lib/env'

const VALLEYS = [
  { slug: 'talab', nameEnglish: 'Talab — Seeking', nameOriginal: 'طلب', orderIndex: 1, description: 'The seeker abandons comfort and sets out, not knowing what they seek — only that they must.' },
  { slug: 'ishq', nameEnglish: 'Ishq — Love', nameOriginal: 'عشق', orderIndex: 2, description: 'Reason is left at the door. Love burns the map the seeker was carrying.' },
  { slug: 'marifat', nameEnglish: "Ma'rifat — Knowledge", nameOriginal: 'معرفت', orderIndex: 3, description: 'Each seeker now sees the truth by their own inner light, not by borrowed lamps.' },
  { slug: 'istighna', nameEnglish: 'Istighna — Detachment', nameOriginal: 'استغنا', orderIndex: 4, description: 'The world grows small; crowns and thrones weigh less than a sparrow’s feather.' },
  { slug: 'tawhid', nameEnglish: 'Tawhid — Unity', nameOriginal: 'توحید', orderIndex: 5, description: 'The many faces resolve into One. Every direction the seeker turns, one Beloved.' },
  { slug: 'hairat', nameEnglish: 'Hairat — Wonderment', nameOriginal: 'حیرت', orderIndex: 6, description: 'Certainty dissolves into awe. The seeker knows nothing, and it is enough.' },
  { slug: 'fana', nameEnglish: 'Fana — Annihilation', nameOriginal: 'فنا', orderIndex: 7, description: 'The drop returns to the ocean and finds it was the ocean all along.' },
]
const POETS = [
  { nameEnglish: 'Bulleh Shah', nameOriginal: 'بلھے شاہ', era: '1680–1757', bio: 'Punjabi mystic of Kasur; tore down every wall between lover and Beloved, cleric and dancer.' },
  { nameEnglish: 'Baba Farid', nameOriginal: 'بابا فرید', era: '1173–1266', bio: 'Chishti saint of Pakpattan; his shlokas are the oldest Punjabi verse we have, austere and tender.' },
  { nameEnglish: 'Shah Hussain', nameOriginal: 'شاہ حسین', era: '1538–1599', bio: 'Lahore’s red-robed faqir; wrote kafis in the voice of the spinning girl at her wheel.' },
  { nameEnglish: 'Waris Shah', nameOriginal: 'وارث شاہ', era: '1722–1798', bio: 'Told Heer Ranjha so completely that Punjab reads its own soul in it.' },
  { nameEnglish: 'Sultan Bahu', nameOriginal: 'سلطان باہو', era: '1630–1691', bio: 'Every verse ends in Hu — the breath of the Divine name; planted the alif of love in the heart’s soil.' },
  { nameEnglish: 'Khwaja Ghulam Farid', nameOriginal: 'خواجہ غلام فرید', era: '1845–1901', bio: 'Sang the Rohi desert of Bahawalpur as the landscape of longing itself.' },
]

async function main() {
  for (const v of VALLEYS) await db.insert(maqamat).values(v).onConflictDoUpdate({ target: maqamat.slug, set: v })
  for (const p of POETS) await db.insert(poets).values(p).onConflictDoNothing()
  const env = getEnv()
  await db.insert(admins).values({ email: env.ADMIN_EMAIL, passwordHash: env.ADMIN_PASSWORD_HASH })
    .onConflictDoUpdate({ target: admins.email, set: { passwordHash: env.ADMIN_PASSWORD_HASH } })
  console.log('Seeded: 7 maqamat, 6 poets, 1 admin')
}
main().then(() => process.exit(0))
```

(Note: poets upsert needs a unique index on `name_english` — add `.unique()` to `nameEnglish` in schema Step 1.)

- [ ] **Step 4: Create Neon project + run** — create a Neon project named `qalandarana` in the dashboard (or `neonctl projects create`), put its connection string in `.env.local`, then:

Run: `npm run db:generate && npm run db:migrate && npm run db:seed`
Expected: migration applied; "Seeded: 7 maqamat, 6 poets, 1 admin".

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: schema, Neon client, migrations, seed data"`

### Task 4: Status state machine

**Files:**
- Create: `src/lib/status.ts`
- Test: `src/lib/status.test.ts`

**Interfaces:**
- Produces: `type EntryStatus`, `assertTransition(from: EntryStatus, to: EntryStatus): void` (throws on illegal), `stageForStatus(status: EntryStatus): 'transcribe' | 'structure' | 'send_review' | null` (which pipeline stage runs next), `retryStatusFor(stage: 'transcribe' | 'structure' | 'send_review'): EntryStatus` (where retry rewinds to).

- [ ] **Step 1: Failing test**

```ts
// src/lib/status.test.ts
import { describe, it, expect } from 'vitest'
import { assertTransition, stageForStatus, retryStatusFor } from './status'

describe('assertTransition', () => {
  it.each([
    ['received', 'transcribed'], ['transcribed', 'structured'], ['structured', 'in_review'],
    ['in_review', 'published'], ['in_review', 'needs_fix'], ['needs_fix', 'published'],
    ['received', 'failed'], ['failed', 'received'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow()
  })
  it.each([
    ['received', 'structured'], ['received', 'published'], ['published', 'received'],
    ['transcribed', 'published'], ['published', 'failed'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(() => assertTransition(from, to)).toThrowError(/Illegal/)
  })
})

describe('stage mapping', () => {
  it('maps statuses to their next stage', () => {
    expect(stageForStatus('received')).toBe('transcribe')
    expect(stageForStatus('transcribed')).toBe('structure')
    expect(stageForStatus('structured')).toBe('send_review')
    expect(stageForStatus('in_review')).toBeNull()
    expect(stageForStatus('published')).toBeNull()
  })
  it('maps a failed stage back to its input status', () => {
    expect(retryStatusFor('transcribe')).toBe('received')
    expect(retryStatusFor('structure')).toBe('transcribed')
    expect(retryStatusFor('send_review')).toBe('structured')
  })
})
```

- [ ] **Step 2: Run** `npm test -- status` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/status.ts
// The pipeline's rulebook. Every status change in the app goes through
// assertTransition, so an entry can never silently skip a stage.
// CONCEPT: this is a "state machine" — a fixed map of which states may
// follow which. The naive alternative (set status anywhere, to anything)
// is how half-processed entries end up published.

export const STATUSES = ['received', 'transcribed', 'structured', 'in_review', 'needs_fix', 'published', 'failed'] as const
export type EntryStatus = (typeof STATUSES)[number]
export type Stage = 'transcribe' | 'structure' | 'send_review'

const LEGAL: Record<EntryStatus, readonly EntryStatus[]> = {
  received: ['transcribed', 'failed'],
  transcribed: ['structured', 'failed'],
  structured: ['in_review', 'failed'],
  in_review: ['published', 'needs_fix'],
  needs_fix: ['in_review', 'published'],   // admin fixes then republishes or resends review
  published: [],
  failed: ['received', 'transcribed', 'structured'], // retry rewinds to the failed stage's input
}

export function assertTransition(from: EntryStatus, to: EntryStatus): void {
  if (!LEGAL[from].includes(to)) throw new Error(`Illegal status transition: ${from} → ${to}`)
}

const NEXT_STAGE: Partial<Record<EntryStatus, Stage>> = {
  received: 'transcribe', transcribed: 'structure', structured: 'send_review',
}
export function stageForStatus(status: EntryStatus): Stage | null {
  return NEXT_STAGE[status] ?? null
}

const STAGE_INPUT: Record<Stage, EntryStatus> = {
  transcribe: 'received', structure: 'transcribed', send_review: 'structured',
}
export function retryStatusFor(stage: Stage): EntryStatus {
  return STAGE_INPUT[stage]
}
```

- [ ] **Step 4: Run** `npm test -- status` → all PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: pipeline status state machine"`

### Task 5: Entries repository

**Files:**
- Create: `src/lib/entries.ts`
- Test: none (thin declarative Drizzle calls, no branching logic — exercised by Task 15's E2E walkthrough; the guarded logic lives in Task 4 and Task 8's stages, which ARE unit-tested)

**Interfaces:**
- Consumes: `db`, schema, `assertTransition`
- Produces:
  - `createEntry(data: { audioUrl: string; durationSec: number; telegramMessageId: number; telegramChatId: number }): Promise<Entry>`
  - `getEntryById(id: string): Promise<Entry | undefined>`
  - `getEntryByReviewToken(token: string): Promise<Entry | undefined>`
  - `getEntryByTelegramMessageId(id: number): Promise<Entry | undefined>`
  - `transition(entry: Entry, to: EntryStatus, patch?: Partial<NewEntry>): Promise<Entry>` — the ONLY writer of `status`; calls `assertTransition(entry.status, to)` first, merges `patch`, returns updated row
  - `listEntries(): Promise<Entry[]>` (newest first), `listPublishedEntries(): Promise<Entry[]>`
  - `updateEntryFields(id: string, patch: Partial<NewEntry>): Promise<void>` — admin edits; MUST strip `status`, `rawTranscript`, `audioUrl` from patch (immutability + single status writer)

- [ ] **Step 1: Implement** exactly the signatures above with Drizzle (`eq`, `desc`). `transition` example:

```ts
// src/lib/entries.ts (excerpt — implement all signatures from the plan)
// Repository: every DB read/write for entries lives here, so routes stay
// thin and the status rulebook can't be bypassed.
export async function transition(entry: Entry, to: EntryStatus, patch: Partial<NewEntry> = {}): Promise<Entry> {
  assertTransition(entry.status as EntryStatus, to)
  const [updated] = await db.update(entries)
    .set({ ...patch, status: to })
    .where(eq(entries.id, entry.id))
    .returning()
  return updated
}
```

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: entries repository with guarded transitions"`

### Task 6: Telegram client

**Files:**
- Create: `src/lib/telegram.ts`
- Test: `src/lib/telegram.test.ts`

**Interfaces:**
- Produces: `sendTelegramMessage(chatId: number, text: string): Promise<void>` (throws on non-ok), `getTelegramFileUrl(fileId: string): Promise<string>` (calls getFile, returns full download URL), `notifyAdmin(text: string): Promise<void>` (sendMessage to `TELEGRAM_ADMIN_CHAT_ID`; swallows errors — a failed notification must never fail a pipeline stage).

- [ ] **Step 1: Failing test** — stub global fetch:

```ts
// src/lib/telegram.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendTelegramMessage, getTelegramFileUrl, notifyAdmin } from './telegram'

// Minimal valid env for getEnv() — reuse the VALID map pattern from env.test.ts
// (import it or redeclare; keep TELEGRAM_BOT_TOKEN='tok', TELEGRAM_ADMIN_CHAT_ID='111').

beforeEach(() => { vi.restoreAllMocks(); /* assign VALID env, _resetEnvCache() */ })

it('sendTelegramMessage posts to the bot API', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal('fetch', fetchMock)
  await sendTelegramMessage(42, 'salaam')
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://api.telegram.org/bottok/sendMessage')
  expect(JSON.parse(init.body)).toEqual({ chat_id: 42, text: 'salaam' })
})

it('sendTelegramMessage throws when Telegram says not ok', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, description: 'bad' }), { status: 400 })))
  await expect(sendTelegramMessage(42, 'x')).rejects.toThrowError(/bad/)
})

it('getTelegramFileUrl resolves file_path to a download URL', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/f.oga' } }))))
  await expect(getTelegramFileUrl('abc')).resolves.toBe('https://api.telegram.org/file/bottok/voice/f.oga')
})

it('notifyAdmin never throws', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
  await expect(notifyAdmin('x')).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (raw fetch wrappers over `https://api.telegram.org/bot${token}/...`; parse `{ok, result, description}`). **Step 4: Run** → PASS. **Step 5: Commit** `feat: telegram client`.

### Task 7: Transcriber adapter (Whisper)

**Files:**
- Create: `src/lib/adapters/transcriber.ts`
- Test: `src/lib/adapters/transcriber.test.ts`

**Interfaces:**
- Produces: `transcribe(audioUrl: string): Promise<string>` — downloads the Blob audio, sends to OpenAI `whisper-1` with `language` hint omitted (mixed Urdu/Punjabi; let it detect) and `response_format: 'text'`. Throws on empty result. NOTHING else in the codebase may import the `openai` package for transcription.

- [ ] **Step 1: Failing test** — mock the OpenAI SDK module:

```ts
// src/lib/adapters/transcriber.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('openai', () => ({ default: class { audio = { transcriptions: { create: createMock } } } }))

import { transcribe } from './transcriber'

beforeEach(() => { createMock.mockReset(); /* VALID env + _resetEnvCache() as before */ })

it('downloads audio and returns Whisper text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['fake-ogg-bytes']))))
  createMock.mockResolvedValue('بلھا کیہ جاناں میں کون')
  const text = await transcribe('https://blob.example/x.ogg')
  expect(text).toContain('بلھا')
  expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'whisper-1' }))
})

it('throws on empty transcript', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['x']))))
  createMock.mockResolvedValue('   ')
  await expect(transcribe('https://blob.example/x.ogg')).rejects.toThrowError(/empty/i)
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

```ts
// src/lib/adapters/transcriber.ts
// The ONLY file that knows which speech-to-text provider we use.
// CONCEPT: adapter pattern — the pipeline calls transcribe(url) and nothing
// else, so swapping Whisper for ElevenLabs/Gemini later is a one-file change.
import OpenAI from 'openai'
import { getEnv } from '../env'

export async function transcribe(audioUrl: string): Promise<string> {
  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error(`Audio download failed: ${res.status}`)
  const file = new File([await res.blob()], 'note.ogg', { type: 'audio/ogg' })
  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY })
  const text = await client.audio.transcriptions.create({ model: 'whisper-1', file, response_format: 'text' })
  const out = String(text).trim()
  if (!out) throw new Error('Whisper returned an empty transcript')
  return out
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: whisper transcriber adapter`.

### Task 8: Structurer adapter (Claude + OpenAI, env-switched)

**Files:**
- Create: `src/lib/adapters/structurer.ts`, `src/lib/adapters/structurer-prompt.ts`
- Test: `src/lib/adapters/structurer.test.ts`

**Interfaces:**
- Produces: `structureEntry(rawTranscript: string): Promise<StructuredEntry>`; `StructuredEntrySchema` (zod) with fields: `title: string`, `poet_name: string` ("Unknown" allowed), `maqam_slug: enum(talab|ishq|marifat|istighna|tawhid|hairat|fana)`, `kalam_original`, `kalam_roman`, `kalam_english`, `explanation_original`, `explanation_english` (all strings), `corrections: {heard, restored}[]`. Provider chosen by `STRUCTURER_PROVIDER`.

- [ ] **Step 1: The prompt** (its own file — it's content, not plumbing; the taste test and future tuning edit only this):

```ts
// src/lib/adapters/structurer-prompt.ts
// The instructions given to the LLM. Kept separate so prompt tuning is a
// content edit, not a code change.
export const SYSTEM_PROMPT = `You are an archivist of classical sufi poetry (kalam) of Punjab and the Urdu tradition, fluent in Punjabi, Urdu, and English.

You receive a raw speech-to-text transcript of a voice note in which a learned man recites classical sufi kalam and explains it in Urdu/Punjabi. The transcript may contain transcription errors, especially in the recited verses.

Your tasks:
1. SEPARATE the recited kalam from his spoken explanation.
2. IDENTIFY the poet and, if possible, the specific poem. Use "Unknown" for poet_name only if genuinely unattributable.
3. RESTORE the kalam to its canonical published wording where the transcript garbled it — but record EVERY such change in "corrections" as {"heard": "...", "restored": "..."}. Never correct silently. If the reciter's version differs from canon in a way that could be a deliberate variant reading, prefer what he said and do NOT "correct" it.
4. TRANSLITERATE the kalam into Roman script (kalam_roman) as Punjabi/Urdu speakers write informally.
5. TRANSLATE the kalam into literary English (kalam_english) — faithful first, beautiful second; do not add imagery that is not in the verse.
6. RENDER his explanation: explanation_original = his explanation lightly cleaned (fillers removed, meaning untouched), explanation_english = a faithful English rendering that keeps his voice — he is speaking to family, not writing an essay.
7. TITLE the entry (short, evocative, English or Roman — e.g. the poem's refrain).
8. ASSIGN one maqam_slug from Attar's Seven Valleys by the kalam's dominant theme:
   talab (seeking/restlessness), ishq (love/burning), marifat (inner knowledge), istighna (detachment from the world), tawhid (unity/oneness), hairat (wonderment/bewilderment), fana (annihilation of the self).

Respond ONLY with JSON matching the provided schema.`
```

- [ ] **Step 2: Failing test** — mock both SDKs; assert provider switching and zod rejection of bad JSON:

```ts
// src/lib/adapters/structurer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const anthropicCreate = vi.fn()
const openaiCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: anthropicCreate } } }))
vi.mock('openai', () => ({ default: class { chat = { completions: { create: openaiCreate } } } }))

import { structureEntry } from './structurer'

const GOOD = {
  title: 'Ki Jaana Main Kaun', poet_name: 'Bulleh Shah', maqam_slug: 'hairat',
  kalam_original: 'بلھا کیہ جاناں میں کون', kalam_roman: 'Bulleya ki jaana main kaun',
  kalam_english: 'Bulleh! Who knows who I am?', explanation_original: '...', explanation_english: '...',
  corrections: [{ heard: 'کی جانا', restored: 'کیہ جاناں' }],
}

beforeEach(() => { anthropicCreate.mockReset(); openaiCreate.mockReset(); /* VALID env, _resetEnvCache() */ })

it('uses Claude when STRUCTURER_PROVIDER=claude and parses JSON', async () => {
  process.env.STRUCTURER_PROVIDER = 'claude'
  anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(GOOD) }] })
  const out = await structureEntry('raw transcript here')
  expect(out.poet_name).toBe('Bulleh Shah')
  expect(openaiCreate).not.toHaveBeenCalled()
})

it('uses OpenAI when STRUCTURER_PROVIDER=openai', async () => {
  process.env.STRUCTURER_PROVIDER = 'openai'
  openaiCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(GOOD) } }] })
  const out = await structureEntry('raw')
  expect(out.maqam_slug).toBe('hairat')
  expect(anthropicCreate).not.toHaveBeenCalled()
})

it('rejects malformed model output', async () => {
  process.env.STRUCTURER_PROVIDER = 'claude'
  anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"title": "only a title"}' }] })
  await expect(structureEntry('raw')).rejects.toThrow()
})
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement**

```ts
// src/lib/adapters/structurer.ts
// The ONLY file that talks to an LLM. Claude and GPT implementations side
// by side; STRUCTURER_PROVIDER picks the live one (father's taste test decides).
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { z } from 'zod'
import { getEnv } from '../env'
import { SYSTEM_PROMPT } from './structurer-prompt'

export const StructuredEntrySchema = z.object({
  title: z.string().min(1),
  poet_name: z.string().min(1),
  maqam_slug: z.enum(['talab', 'ishq', 'marifat', 'istighna', 'tawhid', 'hairat', 'fana']),
  kalam_original: z.string().min(1),
  kalam_roman: z.string().min(1),
  kalam_english: z.string().min(1),
  explanation_original: z.string(),
  explanation_english: z.string(),
  corrections: z.array(z.object({ heard: z.string(), restored: z.string() })),
})
export type StructuredEntry = z.infer<typeof StructuredEntrySchema>

const USER_PREFIX = 'Raw transcript of the voice note:\n\n'

async function viaClaude(raw: string): Promise<string> {
  const client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5', max_tokens: 4096, system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PREFIX + raw }],
  })
  const block = msg.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Claude returned no text')
  return block.text
}

async function viaOpenAI(raw: string): Promise<string> {
  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY })
  const res = await client.chat.completions.create({
    model: 'gpt-5', response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: USER_PREFIX + raw }],
  })
  const text = res.choices[0]?.message?.content
  if (!text) throw new Error('OpenAI returned no text')
  return text
}

export async function structureEntry(rawTranscript: string): Promise<StructuredEntry> {
  const provider = getEnv().STRUCTURER_PROVIDER
  const text = provider === 'claude' ? await viaClaude(rawTranscript) : await viaOpenAI(rawTranscript)
  // CONCEPT: never trust LLM output shape — parse it through zod so bad JSON
  // fails loudly here, not as undefined fields on the review page.
  const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return StructuredEntrySchema.parse(JSON.parse(jsonText))
}
```

(Model IDs: check current names at implementation time via the claude-api skill / OpenAI docs; these are the intended tiers — Claude Sonnet, GPT flagship.)

- [ ] **Step 5: Run** → PASS. Commit `feat: dual-provider structurer adapter`.

### Task 9: Pipeline stages

**Files:**
- Create: `src/lib/pipeline.ts`
- Test: `src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: repository (Task 5), adapters (7, 8), telegram (6), status (4)
- Produces: `advanceEntry(entryId: string): Promise<EntryStatus>` — looks up entry, runs `stageForStatus(entry.status)`, returns new status (or current if no stage). `retryEntry(entryId: string): Promise<EntryStatus>` — rewinds a `failed` entry via `retryStatusFor(entry.failedAtStage)`, clears failure fields, then calls `advanceEntry`. Stage internals:
  - **transcribe:** `transcribe(entry.audioUrl)` → `transition(entry, 'transcribed', { rawTranscript })`
  - **structure:** `structureEntry(entry.rawTranscript)` → resolve `poet_name` to `poetId` (case-insensitive match on `name_english`; null if no match), `maqam_slug` → `maqamId` → `transition(entry, 'structured', {...fields, corrections})`
  - **send_review:** generate `reviewToken` (`crypto.randomUUID()`), `transition(entry, 'in_review', { reviewToken })`, then `sendTelegramMessage(entry.telegramChatId, "'{title}' is ready to review — {APP_URL}/review/{token}")`
  - Any stage throw → `transition(entry, 'failed', { failedAtStage, errorMessage })` + `notifyAdmin(...)`; the error is NOT rethrown (the route returns 200; failure is data, not an exception).

- [ ] **Step 1: Failing tests** — mock repository + adapters + telegram modules with `vi.mock`; cover: happy transcribe advance; structure resolves poet id; unknown poet → `poetId: null` (not a failure); stage throw → failed + `failedAtStage` + admin notified; `retryEntry` rewinds `failed(structure)` → `transcribed` then re-runs; `advanceEntry` on `in_review` is a no-op returning `in_review`. Write them in the style of Task 8's test (explicit `vi.mock` factories, one behavior per test — ~7 tests).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/lib/pipeline.ts` per the interface block above (≈80 lines; file header comment: "The conductor: one function per pipeline stage, each short enough for a single serverless invocation").

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: staged pipeline with failure capture and retry`.

### Task 10: Webhook + advance routes

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`, `src/app/api/pipeline/advance/route.ts`
- Test: `src/app/api/telegram/webhook/route.test.ts`

**Interfaces:**
- Consumes: repository, pipeline, telegram, blob (`put` from `@vercel/blob`)
- Produces:
  - `POST /api/telegram/webhook` — validates `x-telegram-bot-api-secret-token` header equals `TELEGRAM_WEBHOOK_SECRET` (401 otherwise); ignores non-voice updates (200 empty); rejects senders not in `TELEGRAM_ALLOWED_USER_IDS` (200, no reply — silence to strangers); dedups on `telegramMessageId` (200); rejects `voice.duration > 1500` with apology reply; else: `getTelegramFileUrl` → fetch bytes → `put('audio/{message_id}.ogg', bytes, { access: 'public' })` → `createEntry` → reply "Got it 🌙 …" → `waitUntil(fetch(APP_URL + '/api/pipeline/advance', { headers: { 'x-internal-secret': ... }, body: { entryId } }))`. Always returns 200 fast (Telegram retries non-200s aggressively).
  - `POST /api/pipeline/advance` — requires `x-internal-secret` header (401 otherwise); body `{ entryId }`; calls `advanceEntry`; if the returned status still has a next stage (`stageForStatus(newStatus) !== null`), `waitUntil` another self-call — this is how transcribe chains into structure into send_review, each in its own invocation.

- [ ] **Step 1: Failing tests** for the webhook route (call the exported `POST` with constructed `Request` objects; mock blob/repo/pipeline/telegram modules): wrong secret → 401; text message → 200 + no entry created; disallowed sender → 200 + no entry; duplicate message id → 200 + no second entry; 26-min voice → apology reply + no entry; happy path → blob put called, entry created, ack sent.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** both routes. Type the Telegram update with a zod schema (`{ message: { message_id, chat: { id }, from: { id }, voice?: { file_id, duration } } }` — `.passthrough()` for the rest). Use `import { waitUntil } from '@vercel/functions'` (add dep). Set `export const maxDuration = 300` on the advance route (Whisper on long notes; requires Vercel Pro OR document hobby cap: hobby allows up to 60s — SETUP.md Task 15 covers which plan Moiz is on and the knob).

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: telegram webhook and stage-chaining advance route`.

### Task 11: Review page (father's phone)

**Files:**
- Create: `src/app/review/[token]/page.tsx`, `src/app/review/[token]/actions.ts`
- Test: `src/app/review/[token]/actions.test.ts` (the actions; the page is covered by Task 15 Playwright)

**Interfaces:**
- Consumes: `getEntryByReviewToken`, `transition`, `notifyAdmin`
- Produces: server actions `approveEntry(token: string)` (in_review|needs_fix → published, sets `approvedAt`+`publishedAt`) and `flagEntry(token: string)` (in_review → needs_fix, `notifyAdmin('"{title}" flagged by reviewer')`). Both throw 'Not found' on bad token; both no-op (idempotent) if already published.

- [ ] **Step 1: Failing tests** for both actions (mock repo + telegram): approve publishes and stamps timestamps; flag sets needs_fix and notifies; bad token throws; approving an already-published entry does not throw and does not double-stamp.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement actions** (`'use server'`; CONCEPT comment: server actions = form posts that run on the server, no API route boilerplate).

- [ ] **Step 4: Page** — server component, plain Tailwind, phone-first, Urdu blocks `dir="rtl"`:

```tsx
// src/app/review/[token]/page.tsx
// Father's review screen. Reached only via the secret link the bot sends.
// Phase 1 styling is deliberately plain; Phase 2 restyles it per spec §5.
import { notFound } from 'next/navigation'
import { getEntryByReviewToken } from '@/lib/entries'
import { approveEntry, flagEntry } from './actions'

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const entry = await getEntryByReviewToken(token)
  if (!entry) notFound()
  const published = entry.status === 'published'
  return (
    <main className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">{entry.title ?? 'Untitled'}</h1>
      <audio controls src={entry.audioUrl} className="w-full" preload="metadata" />
      <section dir="rtl" className="text-2xl leading-loose whitespace-pre-line">{entry.kalamOriginal}</section>
      <section className="italic whitespace-pre-line">{entry.kalamRoman}</section>
      <section className="whitespace-pre-line">{entry.kalamEnglish}</section>
      {entry.corrections?.length ? (
        <section className="rounded border border-amber-400 bg-amber-50 p-4 space-y-1">
          <h2 className="font-semibold">Corrections made to the verses — please check</h2>
          {entry.corrections.map((c, i) => (
            <p key={i} dir="rtl"><s>{c.heard}</s> ← {c.restored}</p>
          ))}
        </section>
      ) : null}
      <section dir="rtl" className="leading-loose whitespace-pre-line">{entry.explanationOriginal}</section>
      <section className="whitespace-pre-line">{entry.explanationEnglish}</section>
      {published ? (
        <p className="text-green-700 font-semibold">✓ Published</p>
      ) : (
        <div className="flex gap-4">
          <form action={approveEntry.bind(null, token)} className="flex-1">
            <button className="w-full rounded bg-green-700 p-4 text-white text-lg">Approve &amp; publish</button>
          </form>
          <form action={flagEntry.bind(null, token)} className="flex-1">
            <button className="w-full rounded bg-red-700 p-4 text-white text-lg">Something’s wrong</button>
          </form>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Run tests** → PASS; `npm run dev`, hand-insert a fake in_review row (SQL in a scratch script), open `/review/{token}`, click both buttons. Commit `feat: review page with approve/flag actions`.

### Task 12: Plain public pages

**Files:**
- Create: `src/app/journey/page.tsx`, `src/app/entry/[id]/page.tsx`; modify `src/app/page.tsx` (redirect `/` → `/journey` for Phase 1)
- Test: Task 15 Playwright (pages are read-only renders of repository data)

**Interfaces:**
- Consumes: `listPublishedEntries`, maqamat + poets tables
- Produces: `/journey` — the seven valleys in `orderIndex` order, each with name (Urdu + English), description, and its published entries as links (or "unlit" note if empty); `/entry/[id]` — published entries only (404 otherwise): audio, three kalam layers (same stacked structure as review page), explanation, poet name + era. Plain Tailwind; NO gate in Phase 1 (deploy stays unlinked; gate is Phase 2).

- [ ] **Step 1: Implement both pages** (server components; join entries→maqam/poet in the repository: add `listPublishedByMaqam(): Promise<Map<string, Entry[]>>` or a flat join — implementer's choice, keep it in `entries.ts`).
- [ ] **Step 2: Verify** with seeded + hand-published row in dev. **Step 3: Commit** `feat: plain journey and entry pages`.

### Task 13: Admin auth

**Files:**
- Create: `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`, `src/lib/admin-session.ts`, `src/middleware.ts`
- Test: `src/lib/admin-session.test.ts`

**Interfaces:**
- Produces: `createSessionJwt(email: string): Promise<string>` / `verifySessionJwt(token: string): Promise<string | null>` (jose HS256, `AUTH_SECRET`, 7-day expiry) in `admin-session.ts`; login action = bcrypt-compare against the `admins` row, set httpOnly cookie `qalandarana_admin`; `middleware.ts` matcher `['/admin/:path*']` redirects to `/admin/login` when the cookie fails verification (login page itself excluded).

- [ ] **Step 1: Failing tests** for `admin-session.ts`: round-trip verify returns email; tampered token → null; expired token (sign with `exp` in the past via a test-only param) → null.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** session lib, login page (email + password form), action, middleware.
- [ ] **Step 4: Run tests** → PASS; manual: `/admin` redirects to login; correct password lands on `/admin`. **Step 5: Commit** `feat: admin auth with JWT session cookie`.

### Task 14: Admin dashboard (list, edit, retry)

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/entry/[id]/page.tsx`, `src/app/admin/entry/[id]/actions.ts`
- Test: `src/app/admin/entry/[id]/actions.test.ts`

**Interfaces:**
- Consumes: `listEntries`, `getEntryById`, `updateEntryFields`, `retryEntry`, `transition`
- Produces:
  - `/admin` — table of ALL entries: created date, title (or "—"), status badge, `errorMessage` in red when present, link to detail.
  - `/admin/entry/[id]` — full edit form for every structured field + poet/maqam selects; read-only display of `rawTranscript` and audio player; buttons per status: **Retry** (status=failed → `retryEntry`), **Resend review link** (needs_fix → in_review + re-send Telegram message), **Publish now** (in_review|needs_fix → published — admin override).
  - Actions: `saveEntry(id, formData)` (via `updateEntryFields` — which strips status/rawTranscript/audioUrl by design), `retryAction(id)`, `resendReviewAction(id)`, `publishNowAction(id)`.

- [ ] **Step 1: Failing tests** for actions (mock repo/pipeline/telegram): save calls `updateEntryFields` without status even if formData smuggles one; retry only acts on failed entries (else throws); publishNow transitions and stamps `publishedAt`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** pages + actions (plain Tailwind workbench — spec says utilitarian).
- [ ] **Step 4: Run** → PASS; manual walkthrough in dev. **Step 5: Commit** `feat: admin dashboard with edit and retry`.

### Task 15: Wiring, taste test, E2E walkthrough

**Files:**
- Create: `scripts/set-webhook.ts`, `scripts/taste-test.ts`, `docs/SETUP.md`, `e2e/journey.spec.ts` (Playwright via superpowers:webapp-testing patterns)

**Interfaces:**
- Consumes: everything.
- Produces: a deployed, working spine + the provider decision.

- [ ] **Step 1: `scripts/set-webhook.ts`** — calls Telegram `setWebhook` with `{ url: APP_URL + '/api/telegram/webhook', secret_token: TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'] }`, prints Telegram's response.

- [ ] **Step 2: `docs/SETUP.md`** — exact once-only steps: BotFather `/newbot` → token; get Moiz's user id from @userinfobot; Neon project + `DATABASE_URL`; `vercel link`, Blob store create, all env vars into Vercel + `.env.local`; generate `ADMIN_PASSWORD_HASH` (`node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'the-password'`); deploy; run `db:migrate`+`db:seed` against prod DB; run `set-webhook.ts`; note on Vercel hobby 60s cap vs Pro 300s for the advance route.

- [ ] **Step 3: `scripts/taste-test.ts`** — takes a transcript file path; runs `viaClaude` and `viaOpenAI` outputs side by side (export both from structurer for this script), prints both JSON blocks labeled. Usage note in SETUP.md: run on the first 2–3 real notes' `raw_transcript` values; father judges; set `STRUCTURER_PROVIDER` accordingly.

- [ ] **Step 4: Playwright pass** (`e2e/journey.spec.ts` against dev server with a seeded published entry): `/journey` shows seven valleys in order; entry page renders all three kalam layers with `dir="rtl"` on Urdu blocks at 360px viewport; review link approve flow flips status; dead audio URL still renders page (audio element errors gracefully — assert page text present).

- [ ] **Step 5: The real thing** — Moiz forwards one genuine voice note from father to the bot; watch it flow `received → … → in_review`; father (via forwarded link) approves; entry appears on `/journey`. Run the pre-flight checklist (CLAUDE.md) against the spine. Commit `chore: wiring scripts, setup docs, e2e pass` — **Phase 1 done.**

---

## Phase 2 pointer (not in this plan)

Phase 2 (the beauty: spec §5 creative brief — Night Journey, color pilgrimage, silsila thread, Gulzar/Cormorant typography, medallion player, illuminated folio, quote cards, passphrase gate, full poet rooms) gets its own plan once this spine ships. It MUST begin by invoking `superpowers:frontend-design` with spec §5 as the brief, and end with `web-interface-guidelines` + `superpowers:webapp-testing` passes. Spec §6's Satori/Nastaliq risk (complex-script shaping) must be validated in Phase 2's first task, before the quote-card work is scheduled.

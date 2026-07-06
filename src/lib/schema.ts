// schema.ts — the database shape, written once in TypeScript.
//
// This is the single source of truth for every table, column, and status the
// app uses. Drizzle (our ORM) reads this file to (a) type-check every query at
// compile time and (b) generate SQL migrations, so the code and the real
// database can never quietly drift apart.
//
// CONCEPT: an ORM ("Object–Relational Mapper") lets us describe database tables
// as TypeScript objects and write queries in TypeScript instead of raw SQL. The
// naive alternative is hand-writing SQL strings everywhere — fast to start, but
// the compiler can't catch a typo'd column name or a wrong type until runtime.
import { pgTable, pgEnum, text, uuid, integer, timestamp, jsonb, bigint } from 'drizzle-orm/pg-core'

// CONCEPT: a pg enum is a database-level type that only permits a fixed set of
// string values. It makes an illegal status (e.g. 'banana') impossible to store
// at all — the DB itself rejects it, not just our code. This enum is the ONE
// place the entry statuses are defined; nothing else should re-list them.
export const entryStatusEnum = pgEnum('entry_status', [
  'received', 'transcribed', 'structured', 'in_review', 'needs_fix', 'published', 'failed',
])
export const failedStageEnum = pgEnum('failed_stage', ['transcribe', 'structure', 'send_review'])

// The poets whose kalam (poetry) the entries belong to.
export const poets = pgTable('poets', {
  id: uuid('id').primaryKey().defaultRandom(),
  // .unique() lets the seed script upsert poets by this name without duplicating.
  nameEnglish: text('name_english').notNull().unique(),
  nameOriginal: text('name_original').notNull(),
  era: text('era').notNull(),
  bio: text('bio').notNull(),
})

// The maqamat — the fixed stages of the spiritual journey (Attar's Seven
// Valleys). This table (plus the seed data) is the ONE place these live.
export const maqamat = pgTable('maqamat', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nameEnglish: text('name_english').notNull(),
  nameOriginal: text('name_original').notNull(),
  orderIndex: integer('order_index').notNull(),
  description: text('description').notNull(),
})

// The core table: one row per voice note submitted, carried through the
// pipeline (received → transcribed → structured → in_review → published).
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

// The single admin account (email + bcrypt hash — never a plaintext password).
export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
})

// CONCEPT: $inferSelect/$inferInsert derive TypeScript types straight from the
// table definition above — one row as it comes OUT of the DB (Entry) and one as
// it goes IN (NewEntry, with defaults optional). Deriving means these types can
// never fall out of sync with the actual columns.
export type Entry = typeof entries.$inferSelect
export type NewEntry = typeof entries.$inferInsert

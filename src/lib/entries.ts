// entries.ts — the entries "repository": the ONE module that reads and writes
// the entries table. Routes and pipeline stages call these functions; they
// never import `db` and never touch the table directly.
//
// CONCEPT: the "repository pattern" puts every query for one table behind a
// small set of named functions. Two payoffs here:
//   1. The status rulebook can't be bypassed — `transition()` is the only code
//      that ever writes the `status` column, and it always calls
//      assertTransition() first. If routes could `db.update(...).set({status})`
//      themselves, any one of them could skip a stage and publish a
//      half-processed entry.
//   2. Routes stay thin. They express intent ("publish this entry"), not SQL.
// The naive alternative — scattering `db.select`/`db.update` calls across every
// route and stage — means the same guard has to be remembered in a dozen places,
// and the day someone forgets is the day the pipeline breaks.
import { eq, and, desc } from 'drizzle-orm'
import { db } from './db'
import { entries, poets, type Entry, type NewEntry } from './schema'
import { assertTransition, type EntryStatus } from './status'

// A poet row, plus the poet-room reads that hang off it. Kept here with the
// other entry reads because a poet's "room" is really a view of their entries.
type Poet = typeof poets.$inferSelect

// Create a fresh entry from a newly-received voice note. Sets nothing beyond
// these four fields — `status` defaults to 'received' in the schema, and every
// later column is filled in by the pipeline stages as the entry progresses.
export async function createEntry(data: {
  audioUrl: string
  durationSec: number
  telegramMessageId: number
  telegramChatId: number
}): Promise<Entry> {
  const [created] = await db.insert(entries).values(data).returning()
  return created
}

// Look up a single entry by primary key. Returns undefined (not an error) when
// no row matches, so callers can decide what a miss means (e.g. a 404).
export async function getEntryById(id: string): Promise<Entry | undefined> {
  const [entry] = await db.select().from(entries).where(eq(entries.id, id)).limit(1)
  return entry
}

// Look up the entry a review link points at. The token is the unguessable
// secret in the admin's review URL, so this is how that page finds its entry.
export async function getEntryByReviewToken(token: string): Promise<Entry | undefined> {
  const [entry] = await db.select().from(entries).where(eq(entries.reviewToken, token)).limit(1)
  return entry
}

// Look up an entry by the Telegram message that created it. Used to dedupe:
// Telegram can redeliver the same update, and we must not process it twice.
export async function getEntryByTelegramMessageId(id: number): Promise<Entry | undefined> {
  const [entry] = await db.select().from(entries).where(eq(entries.telegramMessageId, id)).limit(1)
  return entry
}

// The ONLY writer of `status`. Every stage transition (received → transcribed →
// … → published) flows through here. assertTransition() throws on an illegal
// jump before any DB write happens, so an entry can never silently skip a stage.
// The optional `patch` lets a caller write the columns that belong with the new
// status in the same update (e.g. rawTranscript when moving to 'transcribed').
export async function transition(entry: Entry, to: EntryStatus, patch: Partial<NewEntry> = {}): Promise<Entry> {
  assertTransition(entry.status as EntryStatus, to)
  // CONCEPT: compare-and-swap (CAS). assertTransition() checks a SNAPSHOT — the
  // status on the `entry` object we were handed, which may be stale by the time
  // this write runs (two requests can rewind/advance the same entry at once).
  // Adding `eq(entries.status, entry.status)` to the WHERE makes the update
  // atomic: it only matches while the row is STILL at the status we validated
  // against. If a concurrent write already moved it, .returning() is empty and we
  // throw rather than silently applying a transition the rulebook never approved.
  const [updated] = await db.update(entries)
    .set({ ...patch, status: to })
    .where(and(eq(entries.id, entry.id), eq(entries.status, entry.status)))
    .returning()
  if (!updated) {
    throw new Error(`Concurrent modification: entry ${entry.id} is no longer ${entry.status}`)
  }
  return updated
}

// All entries, newest first — the admin dashboard's full list.
export async function listEntries(): Promise<Entry[]> {
  return db.select().from(entries).orderBy(desc(entries.createdAt))
}

// Only the published entries, newest publication first — the public feed.
export async function listPublishedEntries(): Promise<Entry[]> {
  return db.select().from(entries)
    .where(eq(entries.status, 'published'))
    .orderBy(desc(entries.publishedAt))
}

// Published entries grouped by their maqam (the spiritual "station" they belong
// to), so the public site can render one section per maqam. Same newest-first
// ordering as listPublishedEntries within each group. Entries with no maqam
// assigned collect under the 'unassigned' key.
//
// CONCEPT: a Map keeps insertion order and lets us key by maqamId (a string)
// without the prototype-pollution footguns of a plain object. We build the
// groups in a single pass over the already-ordered rows, so each group's
// internal order is preserved.
export async function listPublishedByMaqam(): Promise<Map<string, Entry[]>> {
  const published = await listPublishedEntries()
  const byMaqam = new Map<string, Entry[]>()
  for (const entry of published) {
    const key = entry.maqamId ?? 'unassigned'
    const group = byMaqam.get(key)
    if (group) group.push(entry)
    else byMaqam.set(key, [entry])
  }
  return byMaqam
}

// Every poet, each with a count of their PUBLISHED entries — the /poets index.
// One entries read + one poets read, joined in memory (family-scale data), so we
// don't issue a count query per poet.
export async function listPoetsWithCounts(): Promise<Array<Poet & { count: number }>> {
  const [allPoets, published] = await Promise.all([
    db.select().from(poets).orderBy(desc(poets.era)),
    listPublishedEntries(),
  ])
  const counts = new Map<string, number>()
  for (const e of published) {
    if (e.poetId) counts.set(e.poetId, (counts.get(e.poetId) ?? 0) + 1)
  }
  return allPoets.map((p) => ({ ...p, count: counts.get(p.id) ?? 0 }))
}

// One poet's room: the poet and their published entries (newest first), or
// undefined if no such poet. The page 404s on undefined.
export async function getPoetWithEntries(
  id: string,
): Promise<{ poet: Poet; entries: Entry[] } | undefined> {
  const [poet] = await db.select().from(poets).where(eq(poets.id, id)).limit(1)
  if (!poet) return undefined
  const theirEntries = await db
    .select()
    .from(entries)
    .where(and(eq(entries.poetId, id), eq(entries.status, 'published')))
    .orderBy(desc(entries.publishedAt))
  return { poet, entries: theirEntries }
}

// Admin edits to an entry's content (title, kalam, explanation, etc.).
//
// CONCEPT: this strips several fields out of the incoming patch before writing —
// two different kinds of "you may not change this here":
//   - `status` is stripped because transition() is the single status writer; an
//     admin edit must go through the rulebook, never around it.
//   - `rawTranscript` and `audioUrl` are immutable: the raw transcript and the
//     original audio are the source-of-truth record of what was actually said,
//     so nothing overwrites them after they're first written.
//   - `id`, `createdAt`, `telegramMessageId` are identity/provenance fields — an
//     entry's primary key, when it was created, and which Telegram message it
//     came from can never change, so we drop them defensively even though the
//     type wouldn't normally include them.
// Destructuring pulls the forbidden keys out; `safe` is whatever's left.
export async function updateEntryFields(id: string, patch: Partial<NewEntry>): Promise<void> {
  const { status: _status, rawTranscript: _rawTranscript, audioUrl: _audioUrl,
          id: _id, createdAt: _createdAt, telegramMessageId: _telegramMessageId,
          ...safe } = patch
  // Nothing editable left after stripping — skip the write. Drizzle throws on an
  // empty `.set({})`, so this guard also keeps a no-op patch from erroring.
  if (Object.keys(safe).length === 0) return
  await db.update(entries).set(safe).where(eq(entries.id, id))
}

// pipeline.ts — The conductor: one function per pipeline stage, each short
// enough for a single serverless invocation.
//
// A voice note travels received → transcribed → structured → in_review, one
// stage per HTTP call. `advanceEntry` looks at where an entry currently is,
// runs exactly the next stage, and returns the new status. Routes (Task 10)
// call `advanceEntry`; the admin dashboard (Task 14) calls `retryEntry` to
// rewind a stuck entry and try again.
//
// CONCEPT: "failure is data, not an exception." When a stage throws, we don't
// let the error bubble out to the route (which would 500 and lose the reason).
// Instead we record it ON the entry — status 'failed', which stage broke, and
// the message — then return 'failed' normally. The route stays 200; the admin
// sees a diagnosable, retryable row instead of a black-box crash.

import { ilike, eq } from 'drizzle-orm'
import { db } from './db'
import { poets, maqamat, type Entry } from './schema'
import { getEntryById, transition } from './entries'
import { stageForStatus, retryStatusFor, type EntryStatus, type Stage } from './status'
import { transcribe } from './adapters/transcriber'
import { structureEntry } from './adapters/structurer'
import { sendTelegramMessage, notifyAdmin } from './telegram'
import { getEnv } from './env'

// Postgres columns are text and forgiving; error messages can be huge stack
// dumps. Cap what we persist so a runaway message can't bloat a row.
const MAX_ERROR_LENGTH = 500

// Run the next stage for an entry, or no-op if it has no next stage.
//
// The heavy lifting is in runStage(); this wrapper's whole job is the
// try/catch that turns any stage throw into a recorded 'failed' state.
export async function advanceEntry(entryId: string): Promise<EntryStatus> {
  const entry = await getEntryById(entryId)
  if (!entry) throw new Error(`Entry not found: ${entryId}`)

  const stage = stageForStatus(entry.status as EntryStatus)
  // No next stage (in_review / needs_fix / published / failed) → nothing to do.
  // Returning the current status makes advanceEntry safely idempotent to call.
  if (!stage) return entry.status as EntryStatus

  try {
    const updated = await runStage(entry, stage)
    return updated.status as EntryStatus
  } catch (err) {
    // WHY here and not inside each stage: one catch covers all three stages, so
    // the failure-recording rule lives in exactly one place (DRY).
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_LENGTH)
    await transition(entry, 'failed', { failedAtStage: stage, errorMessage: message })
    await notifyAdmin(`Qalandarana: entry ${entry.id} failed at ${stage}: ${message}`)
    return 'failed'
  }
}

// Retry a failed entry: rewind to the stage's INPUT status (clearing the failure
// fields in the same write), then re-run the pipeline from there.
//
// Rewinding to the input, not the failed stage itself, is what makes retry
// correct: a structure failure rewinds to 'transcribed' (the transcript is still
// good), so re-running re-does only the structure step, not the transcription.
export async function retryEntry(entryId: string): Promise<EntryStatus> {
  const entry = await getEntryById(entryId)
  if (!entry) throw new Error(`Entry not found: ${entryId}`)
  if (entry.status !== 'failed' || !entry.failedAtStage) {
    throw new Error(`Cannot retry entry ${entryId}: it is not in a failed state`)
  }

  // Clearing errorMessage + failedAtStage here (not in a later write) keeps the
  // rewind atomic: an entry is never "not failed but still carrying a failure".
  await transition(entry, retryStatusFor(entry.failedAtStage as Stage), {
    errorMessage: null,
    failedAtStage: null,
  })
  return advanceEntry(entryId)
}

// The three stages. Each does its work, then calls transition() — the single
// status writer — to record the new status plus the columns that belong with it.
async function runStage(entry: Entry, stage: Stage): Promise<Entry> {
  switch (stage) {
    case 'transcribe': {
      const rawTranscript = await transcribe(entry.audioUrl)
      return transition(entry, 'transcribed', { rawTranscript })
    }

    case 'structure': {
      // rawTranscript is nullable on the row; guard rather than feed the LLM the
      // string 'null'. A null here means a bug upstream, so fail loudly → capture.
      if (entry.rawTranscript == null) throw new Error('Cannot structure an entry with no transcript')

      const structured = await structureEntry(entry.rawTranscript)
      // Resolve the model's human names to our foreign keys. An unknown poet is
      // NOT a failure — the admin can assign one on the review page — so it maps
      // to null, not a throw.
      const poetId = await resolvePoetId(structured.poet_name)
      const maqamId = await resolveMaqamId(structured.maqam_slug)

      return transition(entry, 'structured', {
        title: structured.title,
        kalamOriginal: structured.kalam_original,
        kalamRoman: structured.kalam_roman,
        kalamEnglish: structured.kalam_english,
        explanationOriginal: structured.explanation_original,
        explanationEnglish: structured.explanation_english,
        corrections: structured.corrections,
        poetId,
        maqamId,
      })
    }

    case 'send_review': {
      // Order matters and is deliberate: SEND FIRST, then transition. The state
      // machine forbids in_review→failed, so if we transitioned to in_review and
      // the send then failed, the failure path (→ failed) would be ILLEGAL and
      // the entry would be stranded. By sending while still 'structured', a send
      // failure leaves us at 'structured' → failed(send_review) → retry rewinds
      // to 'structured'. The token is generated up front so the exact link we
      // send is the exact token we store.
      const reviewToken = crypto.randomUUID()
      const title = entry.title ?? 'Untitled'
      const link = `${getEnv().APP_URL}/review/${reviewToken}`
      await sendTelegramMessage(entry.telegramChatId, `'${title}' is ready to review — ${link}`)
      return transition(entry, 'in_review', { reviewToken })
    }
  }
}

// Resolve a poet's English name to its id (case-insensitive, exact match — no
// wildcards). Returns null when no poet matches, which the structure stage treats
// as "unassigned", not an error.
//
// NOTE: the repository (entries.ts) is deliberately entries-only; these two
// reads of other tables are one-liners the pipeline owns directly rather than
// growing the repository for a single lookup each.
async function resolvePoetId(name: string): Promise<string | null> {
  const [row] = await db.select({ id: poets.id }).from(poets).where(ilike(poets.nameEnglish, name)).limit(1)
  return row?.id ?? null
}

// Resolve a maqam slug to its id. The slug is a validated enum, so a miss here
// should be impossible in practice, but we return null defensively rather than throw.
async function resolveMaqamId(slug: string): Promise<string | null> {
  const [row] = await db.select({ id: maqamat.id }).from(maqamat).where(eq(maqamat.slug, slug)).limit(1)
  return row?.id ?? null
}

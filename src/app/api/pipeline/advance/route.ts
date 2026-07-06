// advance/route.ts — the pipeline's engine, one stage per invocation.
//
// A voice note travels received → transcribed → structured → in_review. Each hop
// is a separate call to THIS route: advanceEntry runs exactly the next stage,
// and if the resulting status still has a stage ahead of it, we fire a fresh
// call to ourselves (via waitUntil) to run that one. Splitting the pipeline into
// one-stage invocations keeps each call well under the function time limit — a
// long Whisper transcription doesn't have to share a budget with structuring.
//
// CONCEPT: this route is internal-only. The webhook (and the route itself) call
// it with a shared secret header; there's no browser or Telegram in front of it.
// The secret check is the whole auth.
import { z } from 'zod'
import { waitUntil } from '@vercel/functions'
import { getEnv } from '@/lib/env'
import { advanceEntry } from '@/lib/pipeline'
import { stageForStatus } from '@/lib/status'
import { notifyAdmin } from '@/lib/telegram'
import { triggerAdvance } from '@/lib/advance-call'

// CONCEPT: maxDuration is a Vercel route-segment knob capping how long this
// function may run (seconds). Whisper on a 25-minute note can take minutes, so we
// ask for 300s. NOTE: 300 requires a Vercel Pro plan; the Hobby plan caps at 60s.
// SETUP.md (Task 15) records which plan Moiz is on and how to change this.
export const maxDuration = 300

const BodySchema = z.object({ entryId: z.string() })

export async function POST(request: Request): Promise<Response> {
  const { INTERNAL_API_SECRET } = getEnv()

  // Auth: internal secret or nothing.
  if (request.headers.get('x-internal-secret') !== INTERNAL_API_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  // Bad body is a caller bug (we control every caller), so a real 400 is right
  // here — unlike the webhook, Telegram isn't on the other end to retry-storm us.
  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response('invalid body', { status: 400 })
  const { entryId } = parsed.data

  try {
    const status = await advanceEntry(entryId)

    // If the new status still has a stage ahead of it, chain into it in a fresh
    // background invocation. A terminal status (in_review / failed / …) returns
    // null and stops the chain.
    if (stageForStatus(status) !== null) {
      waitUntil(triggerAdvance(entryId))
    }

    return Response.json({ status })
  } catch (err) {
    // INFRASTRUCTURE failure only (entry not found, DB down). A STAGE failure is
    // already recorded on the entry by advanceEntry and returns 'failed'
    // normally — it never reaches here. So this catch is for the pipeline's own
    // plumbing breaking; record it and return 200 so the caller doesn't retry.
    await notifyAdmin(`Qalandarana advance error for entry ${entryId}: ${String(err)}`)
    return Response.json({ status: 'error' })
  }
}

// webhook/route.ts — the app's front door. Telegram POSTs here every time the
// bot receives a message; a voice note is what we actually care about.
//
// CONCEPT: a "webhook" is a URL a third party (Telegram) calls to push events to
// us, instead of us polling them. Because the URL is public, EVERYTHING arriving
// here is attacker-controlled — this is a trust boundary. The secret-token header
// is the whole authentication: Telegram sends the secret we registered, and a
// request without it is a stranger knocking. That check is the only thing that
// returns a non-200.
//
// CONCEPT: Telegram retries any non-2xx response aggressively (it assumes we
// crashed and wants the event delivered). So after we've authenticated the
// caller, we ALWAYS return 200 — even on our own internal errors — and record
// the problem out-of-band (notifyAdmin). A 500 here would make Telegram hammer a
// pipeline that's already broken. Auth failure is the single exception.
import { z } from 'zod'
import { put } from '@vercel/blob'
import { waitUntil } from '@vercel/functions'
import { getEnv } from '@/lib/env'
import { createEntry, getEntryByTelegramMessageId } from '@/lib/entries'
import { sendTelegramMessage, getTelegramFileUrl, notifyAdmin } from '@/lib/telegram'
import { triggerAdvance } from '@/lib/advance-call'

// Telegram's voice notes cap at 25 minutes here (1500s). Whisper cost + Vercel
// function time both scale with length, so anything longer is bounced with an
// apology rather than silently blowing a budget.
const MAX_VOICE_DURATION_SEC = 1500
// Downloading the audio is an external fetch; don't let a stalled CDN pin the
// function. 60s is generous for a ≤25MB voice note.
const AUDIO_FETCH_TIMEOUT_MS = 60_000

// The slice of Telegram's update we read. `.loose()` keeps every other field
// (there are dozens) without us having to model them — we only validate what we
// touch. `voice` is optional because most messages aren't voice notes.
const UpdateSchema = z.object({
  message: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.number() }).loose(),
    from: z.object({ id: z.number() }).loose(),
    voice: z.object({ file_id: z.string(), duration: z.number() }).loose().optional(),
  }).loose(),
}).loose()

export async function POST(request: Request): Promise<Response> {
  const env = getEnv()

  // 1. Auth: the ONLY non-200 path. Header is attacker-controlled; the constant
  // secret is the gate.
  if (request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  // 2. Parse. A malformed or non-message update (channel post, edited message,
  // etc.) is not an error — just nothing for us to do. 200 so Telegram stops.
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response(null, { status: 200 })
  const { message } = parsed.data

  // 3. Non-voice message: ignore silently.
  if (!message.voice) return new Response(null, { status: 200 })

  // 4. Unknown sender: SILENCE. We don't reply to strangers — an ack would
  // confirm the bot exists and who it belongs to. Just drop it.
  if (!env.TELEGRAM_ALLOWED_USER_IDS.includes(message.from.id)) {
    return new Response(null, { status: 200 })
  }

  // Everything past here is a processable update from a trusted sender, so from
  // here on ANY throw is caught and turned into a 200 (see the class comment).
  try {
    // 5. Dedup: Telegram can redeliver the same update. If we already made an
    // entry for this message, do nothing (no second entry, no second ack).
    const existing = await getEntryByTelegramMessageId(message.message_id)
    if (existing) return new Response(null, { status: 200 })

    // 6. Too long: bounce with an apology, create nothing.
    if (message.voice.duration > MAX_VOICE_DURATION_SEC) {
      await sendTelegramMessage(
        message.chat.id,
        'this one is longer than 25 minutes — please split it and resend 🙏',
      )
      return new Response(null, { status: 200 })
    }

    // 7. Happy path. Resolve the file_id to a download URL, pull the bytes, store
    // them in blob, create the entry, ack the sender, then kick the pipeline.
    const fileUrl = await getTelegramFileUrl(message.voice.file_id)
    const audioRes = await fetch(fileUrl, { signal: AbortSignal.timeout(AUDIO_FETCH_TIMEOUT_MS) })
    if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`)

    // CONCEPT: we buffer the whole file into memory (arrayBuffer → Buffer) before
    // handing it to blob's put(), rather than streaming. Streams behave
    // inconsistently across the blob SDK's runtimes, and a ≤25-minute voice note
    // is ≤~25MB — trivial to hold in memory. The tradeoff (memory vs. streaming)
    // only tips the other way for large files, which the duration cap forbids.
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer())
    // Public-but-unguessable URL: this is the design's privacy model for the family's
    // voice notes. A random suffix stops sequential/guessable pathnames (e.g. by
    // message_id) from being enumerable; the DB stores whatever suffixed URL put()
    // actually returns, so nothing needs to reconstruct the pathname later.
    const blob = await put(`audio/${message.message_id}.ogg`, audioBuffer, { access: 'public', addRandomSuffix: true })

    const entry = await createEntry({
      audioUrl: blob.url,
      durationSec: message.voice.duration,
      telegramMessageId: message.message_id,
      telegramChatId: message.chat.id,
    })

    // Kick the pipeline FIRST, before the ack. The entry is committed and the
    // pipeline is what actually matters; the "Got it" reply is a nicety. waitUntil
    // keeps the function alive for the fetch without making THIS response wait.
    waitUntil(triggerAdvance(entry.id))

    // The ack gets its own try/catch: the entry is committed and the pipeline is
    // already kicked, so a failed ack must NOT resurface as a webhook error —
    // that would 500, and dedup would then block Telegram's re-forward of a note
    // we already stored. Record it out-of-band and still return 200.
    try {
      await sendTelegramMessage(message.chat.id, 'Got it 🌙 processing…')
    } catch (ackErr) {
      await notifyAdmin(`Qalandarana: ack failed for entry ${entry.id}: ${String(ackErr)}`)
    }

    return new Response(null, { status: 200 })
  } catch (err) {
    // Internal failure AFTER auth. No entry was committed on the failing paths
    // (the throw happens before or during createEntry), so the note can be
    // re-forwarded manually and dedup won't block it. Record and return 200.
    await notifyAdmin(`Qalandarana webhook error on message ${message.message_id}: ${String(err)}`)
    return new Response(null, { status: 200 })
  }
}

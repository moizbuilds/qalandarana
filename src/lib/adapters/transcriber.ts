// transcriber.ts — the ONLY file that knows which speech-to-text provider we use.
//
// The pipeline's transcribe stage calls transcribe(url) and nothing else, so
// swapping Whisper for ElevenLabs/Gemini later is a one-file change here.
//
// CONCEPT: adapter pattern — we hide a third-party API (OpenAI Whisper) behind a
// tiny, stable function of our own. The rest of the app depends on OUR shape
// (transcribe: url -> text), not on the SDK, so the provider can change without
// touching any caller. This is the only place `openai` may be imported for STT.
import OpenAI from 'openai'
import { getEnv } from '../env'

// CONCEPT: module-level memoization — we create ONE OpenAI client for the whole
// process and reuse it, so the underlying HTTP connections are pooled instead of
// re-dialed on every call. We build it lazily inside getClient() on first use —
// NOT at module load — because importing this file must not read env yet: tests
// (and any tooling) import it before applyValidEnv() runs, and reading getEnv()
// at the top level would throw on a not-yet-populated environment.
let client: OpenAI | null = null

function getClient(): OpenAI {
  if (client) return client
  // timeout: Whisper on long audio is slow, so we give it a generous 2 minutes
  // rather than let the SDK's short default abort a legitimate transcription.
  // maxRetries: retry transient 5xx a bounded number of times (never unbounded,
  // which could hammer the API and rack up cost on a persistent outage).
  client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 })
  return client
}

// Download the audio Blob, hand it to Whisper, return the plain text.
// We omit the `language` hint on purpose: the notes mix Urdu and Punjabi, so we
// let Whisper auto-detect rather than force one language and mistranscribe the other.
export async function transcribe(audioUrl: string): Promise<string> {
  // AbortSignal.timeout caps the download itself: a hung blob host shouldn't
  // block the request forever. 60s is plenty for a voice note.
  const res = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Audio download failed: ${res.status}`)

  const file = new File([await res.blob()], 'note.ogg', { type: 'audio/ogg' })
  const text = await getClient().audio.transcriptions.create({
    model: 'whisper-1',
    file,
    response_format: 'text',
  })

  // response_format:'text' returns a bare string, but type it defensively.
  const out = String(text).trim()
  if (!out) throw new Error('Whisper returned an empty transcript')
  return out
}

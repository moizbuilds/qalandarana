// transcriber.ts — the ONLY file that knows which speech-to-text provider we use.
//
// The pipeline's transcribe stage calls transcribe(url) and nothing else, so
// swapping Whisper for ElevenLabs/Gemini later is a one-file change here.
//
// CONCEPT: adapter pattern — we hide a third-party API (OpenAI Whisper) behind a
// tiny, stable function of our own. The rest of the app depends on OUR shape
// (transcribe: url -> text), not on the SDK, so the provider can change without
// touching any caller.
//
// The OpenAI client itself lives in openai-client.ts and is shared with the
// structurer adapter — one client (and one timeout/retry config) per process,
// defined once. See that file for why it's lazy + memoized.
import { getOpenAIClient } from './openai-client'
import { extFromUrl, mimeFromExt, sniffAudioExt } from '../audio-format'

// Download the audio Blob, hand it to Whisper, return the plain text.
// We omit the `language` hint on purpose: the notes mix Urdu and Punjabi, so we
// let Whisper auto-detect rather than force one language and mistranscribe the other.
export async function transcribe(audioUrl: string): Promise<string> {
  // AbortSignal.timeout caps the download itself: a hung blob host shouldn't
  // block the request forever. 60s is plenty for a voice note.
  const res = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Audio download failed: ${res.status}`)

  // Whisper decides how to decode the file from its FILENAME extension, so the
  // name MUST match the real content. We sniff the actual bytes (authoritative)
  // rather than trust the blob's extension, which itself came from Telegram's
  // unreliable mime_type: a forwarded note labeled audio/mpeg is often really an
  // M4A, and a note.mp3 that is really M4A makes Whisper reject it. Fall back to
  // the URL extension only when the magic bytes are unrecognized.
  const bytes = new Uint8Array(await res.arrayBuffer())
  const ext = sniffAudioExt(bytes) ?? extFromUrl(audioUrl)
  const file = new File([bytes], `note.${ext}`, { type: mimeFromExt(ext) })
  const text = await getOpenAIClient().audio.transcriptions.create({
    model: 'whisper-1',
    file,
    response_format: 'text',
  })

  // response_format:'text' returns a bare string, but type it defensively.
  const out = String(text).trim()
  if (!out) throw new Error('Whisper returned an empty transcript')
  return out
}

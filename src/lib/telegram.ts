// telegram.ts — the ONLY file that knows Telegram's Bot API shape.
//
// The webhook route (Task 10) and the pipeline (Task 9) reach Telegram through
// these three functions: send a chat message, resolve a voice-note file_id into
// a downloadable URL, and ping the admin. Keeping the API details here means the
// rest of the app never hard-codes a Telegram URL or parses its JSON envelope.
//
// CONCEPT: Telegram's Bot API is plain HTTPS. Every method lives at
// https://api.telegram.org/bot<TOKEN>/<method> and every response is a JSON
// envelope { ok, result?, description? }. ok:false means the call failed and
// `description` explains why — HTTP status alone isn't enough. We use raw fetch
// (no SDK) because our needs are tiny and an SDK would be dead weight.

import { getEnv } from './env'

// CONCEPT: an external network boundary should never be allowed to hang forever.
// A pipeline stage awaits these calls; if Telegram stalls, the stage would stall
// with it. AbortSignal.timeout(ms) fires an AbortError after ms, so a wedged
// call fails fast instead of pinning a serverless function until it times out.
const TELEGRAM_TIMEOUT_MS = 10_000

const API_BASE = 'https://api.telegram.org'

// The Telegram JSON envelope. `result` is generic because each method returns a
// different payload (sendMessage → a Message, getFile → a File with file_path).
type TelegramResponse<T> = { ok: boolean; result?: T; description?: string }

// One place that performs the request, applies the timeout, parses the envelope,
// and throws with Telegram's own `description` on failure — so every method below
// gets identical error handling for free (DRY).
async function callTelegram<T>(method: string, body: unknown): Promise<T> {
  const { TELEGRAM_BOT_TOKEN } = getEnv()
  const res = await fetch(`${API_BASE}/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  })
  const data = (await res.json()) as TelegramResponse<T>
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`)
  return data.result as T
}

// Send a chat message. Throws if Telegram rejects it — callers (the pipeline)
// decide whether that failure is fatal to a stage.
export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  await callTelegram('sendMessage', { chat_id: chatId, text })
}

// Turn a voice-note file_id into a fully-qualified download URL. Telegram splits
// this in two: getFile returns a relative `file_path`, and the actual bytes live
// at /file/bot<TOKEN>/<file_path>. We stitch them so callers get one ready URL.
export async function getTelegramFileUrl(fileId: string): Promise<string> {
  const { TELEGRAM_BOT_TOKEN } = getEnv()
  const file = await callTelegram<{ file_path: string }>('getFile', { file_id: fileId })
  return `${API_BASE}/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`
}

// Notify the admin chat of something noteworthy (a failed stage, say).
//
// CONCEPT: this function swallows ALL errors on purpose. It's called from inside
// pipeline error handling — if notifying the admin itself failed and threw, it
// would mask the ORIGINAL error and could fail the stage a second time over a
// mere missed notification. So here, "best effort, never throw" is correct: we
// log and move on. This is the exception, not the rule — swallowing errors is
// usually a bug, because it hides real failures. It's only right when the caller
// genuinely cannot act on the failure and the operation is non-critical.
export async function notifyAdmin(text: string): Promise<void> {
  try {
    const { TELEGRAM_ADMIN_CHAT_ID } = getEnv()
    await sendTelegramMessage(Number(TELEGRAM_ADMIN_CHAT_ID), text)
  } catch (err) {
    console.error('notifyAdmin failed (swallowed):', err)
  }
}

// Tests for the Telegram webhook route — the app's front door.
//
// This route is a TRUST BOUNDARY: everything arriving here is attacker-
// controlled (anyone can POST to a public webhook URL). So the tests lean hard
// on the auth/guard rules: the only non-200 is a wrong secret; every other
// "no" (stranger, non-voice, duplicate, too long) is a quiet 200 so Telegram
// won't retry. We mock every collaborator (entries repo, telegram client, blob
// put, waitUntil) and stub global fetch, so no test touches a network or DB.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyValidEnv } from '@/lib/test-fixtures'

// CONCEPT: vi.hoisted() runs BEFORE the vi.mock factories (which themselves are
// hoisted above the imports), so the spies exist when the factories reference
// them. It is the only safe way to share mock fns between factory and test body.
const {
  createEntry, getEntryByTelegramMessageId,
  sendTelegramMessage, getTelegramFileUrl, notifyAdmin,
  put, waitUntil,
} = vi.hoisted(() => ({
  createEntry: vi.fn(), getEntryByTelegramMessageId: vi.fn(),
  sendTelegramMessage: vi.fn(), getTelegramFileUrl: vi.fn(), notifyAdmin: vi.fn(),
  put: vi.fn(), waitUntil: vi.fn(),
}))

vi.mock('@/lib/entries', () => ({ createEntry, getEntryByTelegramMessageId }))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage, getTelegramFileUrl, notifyAdmin }))
vi.mock('@vercel/blob', () => ({ put }))
vi.mock('@vercel/functions', () => ({ waitUntil }))

import { POST } from './route'

// The valid webhook secret is what applyValidEnv() loads for TELEGRAM_WEBHOOK_SECRET.
const VALID_SECRET = 'a'.repeat(16)
// 111 is in TELEGRAM_ALLOWED_USER_IDS ('111,222'); 999 is a stranger.
const ALLOWED_USER = 111

// Build a POST Request with the given update body and secret header.
function webhookRequest(update: unknown, secret: string = VALID_SECRET): Request {
  return new Request('https://qalandarana.vercel.app/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(update),
  })
}

// A well-formed voice-note update. Each test overrides the fields it cares about.
function voiceUpdate(over: { message_id?: number; from_id?: number; duration?: number; file_id?: string } = {}) {
  return {
    update_id: 1,
    message: {
      message_id: over.message_id ?? 5000,
      chat: { id: 777 },
      from: { id: over.from_id ?? ALLOWED_USER },
      voice: { file_id: over.file_id ?? 'file-abc', duration: over.duration ?? 30 },
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  applyValidEnv()
})

describe('POST /api/telegram/webhook', () => {
  it('rejects a wrong secret with 401 (the ONLY non-200)', async () => {
    const res = await POST(webhookRequest(voiceUpdate(), 'wrong-secret'))
    expect(res.status).toBe(401)
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('ignores a non-voice (text) message: 200, no reply, no entry', async () => {
    const textUpdate = { update_id: 2, message: { message_id: 6000, chat: { id: 777 }, from: { id: ALLOWED_USER }, text: 'salaam' } }
    const res = await POST(webhookRequest(textUpdate))
    expect(res.status).toBe(200)
    expect(createEntry).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('ignores a malformed / non-message update: 200, no entry', async () => {
    const res = await POST(webhookRequest({ update_id: 3, edited_channel_post: {} }))
    expect(res.status).toBe(200)
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('silently drops a disallowed sender: 200, NO reply, no entry', async () => {
    const res = await POST(webhookRequest(voiceUpdate({ from_id: 999 })))
    expect(res.status).toBe(200)
    expect(createEntry).not.toHaveBeenCalled()
    // Silence to strangers: we must not even acknowledge them.
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('dedups a duplicate message_id: 200, no second entry', async () => {
    getEntryByTelegramMessageId.mockResolvedValue({ id: 'existing-entry' })
    const res = await POST(webhookRequest(voiceUpdate({ message_id: 5000 })))
    expect(res.status).toBe(200)
    expect(getEntryByTelegramMessageId).toHaveBeenCalledWith(5000)
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('rejects a 26-minute voice note with an apology and creates no entry', async () => {
    getEntryByTelegramMessageId.mockResolvedValue(undefined)
    const res = await POST(webhookRequest(voiceUpdate({ duration: 1560 }))) // 26 min > 1500s cap
    expect(res.status).toBe(200)
    expect(createEntry).not.toHaveBeenCalled()
    const [chatId, text] = sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe(777)
    expect(text).toMatch(/too long/)
  })

  it('happy path: stores audio, creates entry, acks, and fires the advance call', async () => {
    getEntryByTelegramMessageId.mockResolvedValue(undefined)
    getTelegramFileUrl.mockResolvedValue('https://api.telegram.org/file/bottok/voice/f.oga')
    put.mockResolvedValue({ url: 'https://blob.example/audio/5000.ogg' })
    createEntry.mockResolvedValue({ id: 'entry-new' })

    // Global fetch serves two roles here: downloading the audio bytes, and the
    // fire-and-forget advance call inside waitUntil. Branch on the URL.
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/api/pipeline/advance')) return new Response(JSON.stringify({ status: 'transcribed' }), { status: 200 })
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(webhookRequest(voiceUpdate({ message_id: 5000, file_id: 'file-abc' })))

    expect(res.status).toBe(200)
    expect(getTelegramFileUrl).toHaveBeenCalledWith('file-abc')
    // Blob stored at the deterministic per-message pathname.
    const [pathname, , opts] = put.mock.calls[0]
    expect(pathname).toBe('audio/5000.ogg')
    expect(opts).toEqual({ access: 'public', addRandomSuffix: true })
    // Entry created with the blob URL and Telegram provenance.
    expect(createEntry).toHaveBeenCalledWith({
      audioUrl: 'https://blob.example/audio/5000.ogg',
      durationSec: 30,
      telegramMessageId: 5000,
      telegramChatId: 777,
    })
    // Ack sent to the sender.
    const ack = sendTelegramMessage.mock.calls.find(([, text]) => /Got it/.test(text))
    expect(ack).toBeTruthy()
    // waitUntil fired with a promise; the advance fetch carries the internal secret.
    expect(waitUntil).toHaveBeenCalledOnce()
    const advanceCall = fetchMock.mock.calls.find(([url]) => url.includes('/api/pipeline/advance'))
    expect(advanceCall).toBeTruthy()
    const advanceUrl = advanceCall![0]
    const advanceInit = advanceCall![1] as { method: string; headers: Record<string, string>; body: string }
    expect(advanceUrl).toBe('https://qalandarana.vercel.app/api/pipeline/advance')
    expect(advanceInit.method).toBe('POST')
    expect(advanceInit.headers['x-internal-secret']).toBe('b'.repeat(16))
    expect(JSON.parse(advanceInit.body)).toEqual({ entryId: 'entry-new' })
  })

  it('accepts a FORWARDED audio file (WhatsApp voice note = audio/mpeg), stored as .mp3', async () => {
    // This is the bug this whole path exists for: a forwarded WhatsApp voice note
    // arrives as `audio` (mp3), not a native `voice` recording. It must process
    // identically and be stored under the real extension so Whisper can decode it.
    getEntryByTelegramMessageId.mockResolvedValue(undefined)
    getTelegramFileUrl.mockResolvedValue('https://api.telegram.org/file/bottok/music/f.mp3')
    put.mockResolvedValue({ url: 'https://blob.example/audio/7000-x9.mp3' })
    createEntry.mockResolvedValue({ id: 'entry-fwd' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/api/pipeline/advance')
        ? new Response(JSON.stringify({ status: 'transcribed' }), { status: 200 })
        : new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
    ))

    const audioUpdate = {
      update_id: 3,
      message: {
        message_id: 7000,
        chat: { id: 777 },
        from: { id: ALLOWED_USER },
        forward_date: 1700000000,
        audio: { file_id: 'file-mp3', duration: 113, mime_type: 'audio/mpeg', file_size: 1_800_000 },
      },
    }
    const res = await POST(webhookRequest(audioUpdate))

    expect(res.status).toBe(200)
    expect(getTelegramFileUrl).toHaveBeenCalledWith('file-mp3')
    const [pathname] = put.mock.calls[0]
    expect(pathname).toBe('audio/7000.mp3') // real extension, not .ogg
    expect(createEntry).toHaveBeenCalledWith({
      audioUrl: 'https://blob.example/audio/7000-x9.mp3',
      durationSec: 113,
      telegramMessageId: 7000,
      telegramChatId: 777,
    })
    expect(sendTelegramMessage.mock.calls.find(([, t]) => /Got it/.test(t))).toBeTruthy()
  })

  it('ignores a non-audio document (a stray PDF): 200, no entry', async () => {
    getEntryByTelegramMessageId.mockResolvedValue(undefined)
    const pdfUpdate = {
      update_id: 4,
      message: {
        message_id: 7100, chat: { id: 777 }, from: { id: ALLOWED_USER },
        document: { file_id: 'file-pdf', mime_type: 'application/pdf', file_size: 1000 },
      },
    }
    const res = await POST(webhookRequest(pdfUpdate))
    expect(res.status).toBe(200)
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('kicks the pipeline BEFORE acking, and a failed ack → notifyAdmin, still 200', async () => {
    // The entry is committed and the pipeline kicked by the time we ack. If the
    // ack then fails it must NOT fall into the outer catch (that path reads as a
    // webhook error and, on a Telegram redelivery, dedup would block reprocessing
    // a note we already stored). Instead: notifyAdmin out-of-band, still 200.
    getEntryByTelegramMessageId.mockResolvedValue(undefined)
    getTelegramFileUrl.mockResolvedValue('https://api.telegram.org/file/bottok/voice/f.oga')
    put.mockResolvedValue({ url: 'https://blob.example/audio/5001.ogg' })
    createEntry.mockResolvedValue({ id: 'entry-ack-fail' })
    sendTelegramMessage.mockRejectedValue(new Error('telegram sendMessage down'))
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/api/pipeline/advance')
        ? new Response(JSON.stringify({ status: 'transcribed' }), { status: 200 })
        : new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })))

    const res = await POST(webhookRequest(voiceUpdate({ message_id: 5001 })))

    expect(res.status).toBe(200)
    // Kick happened before the ack attempt — the pipeline is never hostage to the nicety.
    expect(waitUntil).toHaveBeenCalledOnce()
    expect(waitUntil.mock.invocationCallOrder[0])
      .toBeLessThan(sendTelegramMessage.mock.invocationCallOrder[0])
    // The ack failure surfaced to the admin, not as a webhook error.
    expect(notifyAdmin).toHaveBeenCalledWith(expect.stringContaining('ack failed for entry entry-ack-fail'))
  })

  it('swallows an internal error after auth: 200 + notifyAdmin, no crash', async () => {
    getEntryByTelegramMessageId.mockResolvedValue(undefined)
    getTelegramFileUrl.mockRejectedValue(new Error('telegram getFile down'))
    const res = await POST(webhookRequest(voiceUpdate()))
    expect(res.status).toBe(200)
    expect(notifyAdmin).toHaveBeenCalled()
    expect(createEntry).not.toHaveBeenCalled()
  })
})

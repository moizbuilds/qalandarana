import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendTelegramMessage, getTelegramFileUrl, notifyAdmin } from './telegram'
import { applyValidEnv } from './test-fixtures'

// applyValidEnv() loads a complete valid env (TELEGRAM_BOT_TOKEN='tok',
// TELEGRAM_ADMIN_CHAT_ID='111') and resets getEnv()'s cache so each test reads fresh.
beforeEach(() => { vi.restoreAllMocks(); applyValidEnv() })

describe('telegram client', () => {
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

  // The client is an external boundary: a hung Telegram call must not hang a
  // pipeline stage forever, so fetch carries an AbortSignal.timeout. Simulate the
  // timeout firing (fetch rejects with an AbortError) and assert we surface it —
  // and that notifyAdmin still swallows it.
  it('sendTelegramMessage rejects when the request times out; notifyAdmin still resolves', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))
    await expect(sendTelegramMessage(42, 'x')).rejects.toThrow()
    await expect(notifyAdmin('x')).resolves.toBeUndefined()
  })
})

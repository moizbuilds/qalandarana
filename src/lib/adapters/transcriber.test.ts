// Tests for the Whisper transcriber adapter.
//
// We mock the `openai` package entirely: these tests must never hit the real
// network or need a real API key. `createMock` stands in for
// client.audio.transcriptions.create, so we control exactly what "Whisper"
// returns and assert we called it with the right shape.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyValidEnv } from '../test-fixtures'

// CONCEPT: vi.mock replaces the real module with a fake for this test file. The
// factory must be self-contained (it's hoisted above imports), so we declare the
// spy first and reference it from inside the fake OpenAI class.
const createMock = vi.fn()
vi.mock('openai', () => ({ default: class { audio = { transcriptions: { create: createMock } } } }))

import { transcribe } from './transcriber'

// applyValidEnv() loads a complete valid env (incl. OPENAI_API_KEY) and resets
// getEnv()'s memoized cache so each test reads fresh values.
beforeEach(() => { createMock.mockReset(); applyValidEnv() })

describe('whisper transcriber adapter', () => {
  it('downloads audio and returns Whisper text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['fake-ogg-bytes']))))
    createMock.mockResolvedValue('بلھا کیہ جاناں میں کون')
    const text = await transcribe('https://blob.example/x.ogg')
    expect(text).toContain('بلھا')
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'whisper-1' }))
  })

  it('throws on empty transcript', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['x']))))
    createMock.mockResolvedValue('   ')
    await expect(transcribe('https://blob.example/x.ogg')).rejects.toThrowError(/empty/i)
  })

  it('throws when the audio download fails (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))
    await expect(transcribe('https://blob.example/missing.ogg')).rejects.toThrowError(/download failed/i)
  })
})

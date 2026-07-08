// The audio-format maps are load-bearing: get them wrong and Whisper rejects
// the file. These pin the two shapes that actually arrive (Telegram voice = ogg,
// forwarded WhatsApp audio = mp3) plus the URL-extension parsing.
import { describe, it, expect } from 'vitest'
import { extFromMime, extFromUrl, mimeFromExt } from './audio-format'

describe('extFromMime', () => {
  it('maps the real arrivals', () => {
    expect(extFromMime('audio/ogg')).toBe('ogg') // native Telegram voice
    expect(extFromMime('audio/mpeg')).toBe('mp3') // forwarded WhatsApp voice note
    expect(extFromMime('audio/mp4')).toBe('m4a')
    expect(extFromMime('audio/x-m4a')).toBe('m4a')
  })
  it('falls back to ogg for unknown or missing mime', () => {
    expect(extFromMime(undefined)).toBe('ogg')
    expect(extFromMime('application/octet-stream')).toBe('ogg')
  })
})

describe('extFromUrl', () => {
  it('reads the extension off a blob URL, ignoring query strings', () => {
    expect(extFromUrl('https://x.blob.vercel-storage.com/audio/7000-x9.mp3')).toBe('mp3')
    expect(extFromUrl('https://x/audio/1-a.ogg?download=1')).toBe('ogg')
  })
  it('falls back to ogg when the extension is absent or not a Whisper format', () => {
    expect(extFromUrl('https://x/audio/noext')).toBe('ogg')
    expect(extFromUrl('https://x/audio/file.pdf')).toBe('ogg')
  })
})

describe('mimeFromExt', () => {
  it('round-trips the common formats', () => {
    expect(mimeFromExt('mp3')).toBe('audio/mpeg')
    expect(mimeFromExt('ogg')).toBe('audio/ogg')
    expect(mimeFromExt('m4a')).toBe('audio/mp4')
  })
})

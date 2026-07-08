// The audio-format maps are load-bearing: get them wrong and Whisper rejects
// the file. These pin the two shapes that actually arrive (Telegram voice = ogg,
// forwarded WhatsApp audio = mp3) plus the URL-extension parsing.
import { describe, it, expect } from 'vitest'
import { extFromMime, extFromUrl, mimeFromExt, sniffAudioExt } from './audio-format'

// Build a 16-byte header from a list of [offset, string|bytes] parts.
function header(...parts: Array<[number, string | number[]]>): Uint8Array {
  const b = new Uint8Array(16)
  for (const [off, val] of parts) {
    if (typeof val === 'string') for (let i = 0; i < val.length; i++) b[off + i] = val.charCodeAt(i)
    else for (let i = 0; i < val.length; i++) b[off + i] = val[i]
  }
  return b
}

describe('sniffAudioExt (magic bytes beat the unreliable mime)', () => {
  it('detects M4A (ftyp box) — the case that was mislabeled audio/mpeg and rejected by Whisper', () => {
    expect(sniffAudioExt(header([4, 'ftyp'], [8, 'M4A ']))).toBe('m4a')
  })
  it('detects a native Telegram voice note (OggS)', () => {
    expect(sniffAudioExt(header([0, 'OggS']))).toBe('ogg')
  })
  it('detects real mp3 (ID3 tag and raw frame sync)', () => {
    expect(sniffAudioExt(header([0, 'ID3']))).toBe('mp3')
    expect(sniffAudioExt(header([0, [0xff, 0xfb]]))).toBe('mp3')
  })
  it('detects wav and flac', () => {
    expect(sniffAudioExt(header([0, 'RIFF'], [8, 'WAVE']))).toBe('wav')
    expect(sniffAudioExt(header([0, 'fLaC']))).toBe('flac')
  })
  it('returns null for unrecognized or too-short input (caller falls back to mime)', () => {
    expect(sniffAudioExt(header([0, 'ZZZZ']))).toBeNull()
    expect(sniffAudioExt(new Uint8Array(4))).toBeNull()
  })
})

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

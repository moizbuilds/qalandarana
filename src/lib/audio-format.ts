// audio-format.ts — the one place that maps between audio MIME types and the
// file extensions OpenAI Whisper understands.
//
// Why it matters: a forwarded WhatsApp voice note reaches Telegram as an `audio`
// file (audio/mpeg = mp3), not a native `voice` recording (audio/ogg). Whisper
// decides how to decode a file by its FILENAME EXTENSION, so the extension we
// store the blob under and the filename we hand Whisper must match the real
// bytes — or transcription fails with "invalid file format". The webhook (which
// stores the blob) and the transcriber (which names the file for Whisper) both
// read from here, so they can never disagree.
const MIME_TO_EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/oga': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mpga': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
}

const EXT_TO_MIME: Record<string, string> = {
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  flac: 'audio/flac',
}

// Every extension Whisper's API accepts. Anything outside this we store as .ogg
// and let Whisper attempt it — but the maps above cover Telegram voice (ogg) and
// forwarded WhatsApp audio (mp3/m4a), which is what actually arrives.
const WHISPER_EXTS = new Set(['ogg', 'mp3', 'mpeg', 'mpga', 'm4a', 'mp4', 'wav', 'webm', 'flac'])

export function extFromMime(mime: string | undefined): string {
  return MIME_TO_EXT[(mime ?? '').toLowerCase()] ?? 'ogg'
}

// Pull the extension off a blob URL (ignoring any query string), normalized to
// something Whisper accepts.
export function extFromUrl(url: string): string {
  const match = url.split('?')[0].match(/\.([a-z0-9]+)$/i)
  const ext = (match?.[1] ?? 'ogg').toLowerCase()
  return WHISPER_EXTS.has(ext) ? ext : 'ogg'
}

export function mimeFromExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? 'audio/ogg'
}

// Detect the REAL audio format from a file's leading "magic" bytes.
//
// Why this exists: Telegram's reported mime_type is unreliable. A forwarded
// WhatsApp/iPhone voice note is often an M4A (AAC) container, but Telegram
// labels it `audio/mpeg`, so extFromMime names it `.mp3`. Whisper then rejects
// the file for a content/extension mismatch ("Invalid file format") even though
// it accepts BOTH mp3 and m4a. Content sniffing is authoritative; the mime is a
// guess. Returns a Whisper-accepted extension, or null if unrecognized (caller
// falls back to the mime/URL guess).
export function sniffAudioExt(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  const at = (i: number, s: string) => {
    for (let k = 0; k < s.length; k++) if (bytes[i + k] !== s.charCodeAt(k)) return false
    return true
  }
  // ISO base media (MP4/M4A/AAC): 'ftyp' box at offset 4. Whisper takes m4a.
  if (at(4, 'ftyp')) return 'm4a'
  if (at(0, 'OggS')) return 'ogg'   // Telegram native voice notes (opus in ogg)
  if (at(0, 'fLaC')) return 'flac'
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'wav'
  if (at(0, 'ID3')) return 'mp3'    // mp3 with an ID3 tag
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3' // raw mp3 frame sync
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm'
  return null
}

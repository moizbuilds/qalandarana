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

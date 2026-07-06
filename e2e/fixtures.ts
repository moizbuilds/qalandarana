// fixtures.ts — the constants the e2e seeder and the spec BOTH need, kept in one
// import-safe place so the two files can never drift on an id or a token.
//
// Deliberately imports NOTHING from src/. The moment this (or anything it pulls
// in) touched src/lib/db, importing it would run getEnv() and throw when the
// environment is incomplete — which would break `playwright test --list` and the
// clean-skip behaviour. Plain data only: safe to import at the top of any file.

// Fixed ids so the spec can navigate straight to /entry/<id> and /review/<token>
// without first scraping them off a page. UUIDs are literal constants, not
// random, precisely so the URL is knowable ahead of time.
export const E2E_PUBLISHED_ID = '11111111-1111-4111-8111-111111111111'
export const E2E_REVIEW_ID = '22222222-2222-4222-8222-222222222222'
export const E2E_REVIEW_TOKEN = 'e2e-review-token'

// A URL that will never serve audio — proves the entry page still renders its
// text when the <audio> source is dead (the pre-flight "Failure" question).
export const DEAD_AUDIO_URL = 'https://example.com/nonexistent-e2e-audio.ogg'

// The published fixture's content. The spec asserts each kalam layer renders, so
// these strings are the expected values on both sides.
export const PUBLISHED_ENTRY = {
  title: 'E2E — Ishq ka imtihan',
  kalamOriginal: 'عشق دی نویں نویں بہار',
  kalamRoman: 'ishq di navin navin bahar',
  kalamEnglish: 'Love is a spring forever new',
  explanationOriginal: 'ایہہ عشق دی گل اے',
  explanationEnglish: 'This is the matter of love.',
  durationSec: 272,
} as const

export const REVIEW_ENTRY = {
  title: 'E2E — Under review',
  kalamOriginal: 'رب دا ناں لے',
  kalamRoman: 'rabb da naan lai',
  kalamEnglish: 'Take the name of the Lord',
  explanationOriginal: 'ایہہ اک امتحان اے',
  explanationEnglish: 'This is a test.',
  durationSec: 95,
} as const

// The seven valley names in journey order. Mirrors the `nameEnglish` values in
// scripts/seed.ts VALLEYS — if that wording ever changes, update it here too.
// (Test-side expected values necessarily restate what the app should produce;
// that's the assertion, not accidental duplication.)
export const VALLEY_NAMES_IN_ORDER = [
  'Talab — Seeking',
  'Ishq — Love',
  "Ma'rifat — Knowledge",
  'Istighna — Detachment',
  'Tawhid — Unity',
  'Hairat — Wonderment',
  'Fana — Annihilation',
] as const

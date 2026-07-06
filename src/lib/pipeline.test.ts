// Tests for the pipeline conductor.
//
// The pipeline stitches together the repository, the two AI adapters, the poet/
// maqam lookups, and Telegram. We mock every one of those modules so these tests
// never hit a network, an LLM, or a real database — each test asserts ONE
// behavior of the conductor's own logic (which stage runs, what it writes, and
// how a failure is captured).
//
// Mock strategy (resolution 2, option A): we mock `./db` wholesale with a tiny
// chainable `select().from().where().limit()` stub whose terminal `.limit()` is a
// spy (`dbSelectLimit`). The pipeline queries poets then maqamat in that order,
// so `mockResolvedValueOnce` twice feeds the two lookups in sequence. This keeps
// the poet/maqam resolution INSIDE pipeline.ts (no extra exported helpers to
// mock) while still giving us full control over what each lookup returns.

import { it, expect, vi, beforeEach } from 'vitest'
import { applyValidEnv } from './test-fixtures'

// CONCEPT: vi.mock factories are hoisted to the very top of the file, so any spy
// they reference must exist even earlier. vi.hoisted() runs its callback at that
// same hoisted point and hands the spies back here — the only safe way to share
// mock functions between the factories and the tests below.
const { getEntryById, transition, transcribe, structureEntry, sendTelegramMessage, notifyAdmin, dbSelectLimit } =
  vi.hoisted(() => ({
    getEntryById: vi.fn(), transition: vi.fn(), transcribe: vi.fn(), structureEntry: vi.fn(),
    sendTelegramMessage: vi.fn(), notifyAdmin: vi.fn(), dbSelectLimit: vi.fn(),
  }))

vi.mock('./entries', () => ({ getEntryById, transition }))
vi.mock('./adapters/transcriber', () => ({ transcribe }))
vi.mock('./adapters/structurer', () => ({ structureEntry }))
vi.mock('./telegram', () => ({ sendTelegramMessage, notifyAdmin }))
// The terminal `.limit()` of the chainable query is the only part we control.
vi.mock('./db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: dbSelectLimit }) }) }) },
}))

import { advanceEntry, retryEntry } from './pipeline'

// A minimal entry row; each test overrides just the fields it cares about.
const baseEntry = (over: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  status: 'received',
  audioUrl: 'https://blob.example/note.ogg',
  telegramChatId: 555,
  rawTranscript: null,
  title: null,
  failedAtStage: null,
  ...over,
})

// A complete StructuredEntry the mocked adapter can return.
const validStructured = {
  title: 'Ki Jaana Main Kaun', poet_name: 'Bulleh Shah', maqam_slug: 'hairat',
  kalam_original: 'ko', kalam_roman: 'kr', kalam_english: 'ke',
  explanation_original: 'eo', explanation_english: 'ee',
  corrections: [{ heard: 'a', restored: 'b' }],
}

beforeEach(() => { vi.resetAllMocks(); applyValidEnv() })

it('advanceEntry throws when the entry does not exist', async () => {
  getEntryById.mockResolvedValue(undefined)
  await expect(advanceEntry('missing')).rejects.toThrow()
})

it('advanceEntry no-ops on a status with no next stage (in_review) and returns it unchanged', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'in_review' }))
  const status = await advanceEntry('entry-1')
  expect(status).toBe('in_review')
  expect(transition).not.toHaveBeenCalled()
})

it('transcribe stage: transcribes the audio and transitions to transcribed', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'received' }))
  transcribe.mockResolvedValue('raw transcript text')
  transition.mockResolvedValue(baseEntry({ status: 'transcribed' }))

  const status = await advanceEntry('entry-1')

  expect(transcribe).toHaveBeenCalledWith('https://blob.example/note.ogg')
  expect(transition).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'entry-1' }),
    'transcribed',
    { rawTranscript: 'raw transcript text' },
  )
  expect(status).toBe('transcribed')
})

it('structure stage: resolves poetId + maqamId and stores every structured field', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'transcribed', rawTranscript: 'raw' }))
  structureEntry.mockResolvedValue(validStructured)
  // First lookup = poets, second = maqamat (that is the order pipeline.ts queries).
  dbSelectLimit.mockResolvedValueOnce([{ id: 'poet-1' }]).mockResolvedValueOnce([{ id: 'maqam-1' }])
  transition.mockResolvedValue(baseEntry({ status: 'structured' }))

  const status = await advanceEntry('entry-1')

  expect(structureEntry).toHaveBeenCalledWith('raw')
  expect(transition).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'entry-1' }),
    'structured',
    {
      title: 'Ki Jaana Main Kaun',
      kalamOriginal: 'ko', kalamRoman: 'kr', kalamEnglish: 'ke',
      explanationOriginal: 'eo', explanationEnglish: 'ee',
      corrections: [{ heard: 'a', restored: 'b' }],
      poetId: 'poet-1', maqamId: 'maqam-1',
    },
  )
  expect(status).toBe('structured')
})

it('structure stage: an unknown poet resolves to poetId null, NOT a failure', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'transcribed', rawTranscript: 'raw' }))
  structureEntry.mockResolvedValue({ ...validStructured, poet_name: 'Nobody Known' })
  dbSelectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'maqam-1' }])
  transition.mockResolvedValue(baseEntry({ status: 'structured' }))

  const status = await advanceEntry('entry-1')

  expect(transition).toHaveBeenCalledWith(
    expect.anything(),
    'structured',
    expect.objectContaining({ poetId: null, maqamId: 'maqam-1' }),
  )
  expect(status).toBe('structured')
})

it('captures a stage failure: marks failed with stage + truncated message and notifies admin', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'received' }))
  transcribe.mockRejectedValue(new Error('whisper boom'))
  transition.mockResolvedValue(baseEntry({ status: 'failed' }))

  const status = await advanceEntry('entry-1')

  expect(transition).toHaveBeenCalledWith(
    expect.anything(),
    'failed',
    { failedAtStage: 'transcribe', errorMessage: 'whisper boom' },
  )
  expect(notifyAdmin).toHaveBeenCalledWith('Qalandarana: entry entry-1 failed at transcribe: whisper boom')
  expect(status).toBe('failed')
})

it('send_review: sends the review link FIRST, then transitions to in_review with the same token', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'structured', title: 'My Kalam' }))
  sendTelegramMessage.mockResolvedValue(undefined)
  transition.mockResolvedValue(baseEntry({ status: 'in_review' }))

  const status = await advanceEntry('entry-1')

  const [chatId, text] = sendTelegramMessage.mock.calls[0]
  expect(chatId).toBe(555)
  expect(text).toContain("'My Kalam' is ready to review")
  expect(text).toContain('https://qalandarana.vercel.app/review/')
  // The token written to the DB must be the SAME token embedded in the sent link.
  const tokenInPatch = transition.mock.calls[0][2].reviewToken
  expect(text).toContain(tokenInPatch)
  expect(status).toBe('in_review')
})

it('send_review: a Telegram send failure leaves the entry retryable (failed at send_review, one transition)', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'structured', title: 'My Kalam' }))
  sendTelegramMessage.mockRejectedValue(new Error('telegram down'))
  transition.mockResolvedValue(baseEntry({ status: 'failed' }))

  const status = await advanceEntry('entry-1')

  // Send happens BEFORE any transition to in_review, so the only transition is the
  // legal structured→failed one. retryStatusFor('send_review') then rewinds to structured.
  expect(sendTelegramMessage).toHaveBeenCalled()
  expect(transition).toHaveBeenCalledTimes(1)
  expect(transition).toHaveBeenCalledWith(
    expect.anything(),
    'failed',
    { failedAtStage: 'send_review', errorMessage: 'telegram down' },
  )
  expect(status).toBe('failed')
})

it('retryEntry: rewinds a failed(structure) entry to transcribed, clears failure fields, and re-runs', async () => {
  const failed = baseEntry({ status: 'failed', failedAtStage: 'structure' })
  const rewound = baseEntry({ status: 'transcribed', rawTranscript: 'raw' })
  // First load = inside retryEntry (failed row); second load = inside advanceEntry (rewound row).
  getEntryById.mockResolvedValueOnce(failed).mockResolvedValueOnce(rewound)
  transition
    .mockResolvedValueOnce(rewound)                          // the rewind transition
    .mockResolvedValueOnce(baseEntry({ status: 'structured' })) // the structure stage transition
  structureEntry.mockResolvedValue(validStructured)
  dbSelectLimit.mockResolvedValue([{ id: 'x' }])

  const status = await retryEntry('entry-1')

  expect(transition).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'failed' }),
    'transcribed',
    { errorMessage: null, failedAtStage: null },
  )
  // Proof the pipeline actually re-ran the structure stage after the rewind.
  expect(structureEntry).toHaveBeenCalledWith('raw')
  expect(status).toBe('structured')
})

it('retryEntry: throws when the entry is not in a failed state', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'structured' }))
  await expect(retryEntry('entry-1')).rejects.toThrow()
})

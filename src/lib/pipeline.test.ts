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
const { getEntryById, transition, transcribe, structureEntry, sendTelegramMessage, notifyAdmin, dbSelectLimit, dbSelectFrom } =
  vi.hoisted(() => ({
    getEntryById: vi.fn(), transition: vi.fn(), transcribe: vi.fn(), structureEntry: vi.fn(),
    sendTelegramMessage: vi.fn(), notifyAdmin: vi.fn(), dbSelectLimit: vi.fn(), dbSelectFrom: vi.fn(),
  }))

vi.mock('./entries', () => ({ getEntryById, transition }))
vi.mock('./adapters/transcriber', () => ({ transcribe }))
vi.mock('./adapters/structurer', () => ({ structureEntry }))
vi.mock('./telegram', () => ({ sendTelegramMessage, notifyAdmin }))
// The structure stage runs three queries: `select().from()` (all poets, awaited
// directly) then two `select().from().where().limit()` (poet + maqam resolve).
// So from() returns a thenable (resolves via dbSelectFrom for the awaited case)
// that ALSO carries .where().limit() for the resolve queries.
vi.mock('./db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: dbSelectLimit }),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(dbSelectFrom()).then(resolve, reject),
      }),
    }),
  },
}))

import { advanceEntry, rewindFailedEntry } from './pipeline'

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
  dbSelectFrom.mockResolvedValue([{ name: 'Baba Farid' }]) // the known-poets query
  // First lookup = poets, second = maqamat (that is the order pipeline.ts queries).
  dbSelectLimit.mockResolvedValueOnce([{ id: 'poet-1' }]).mockResolvedValueOnce([{ id: 'maqam-1' }])
  transition.mockResolvedValue(baseEntry({ status: 'structured' }))

  const status = await advanceEntry('entry-1')

  expect(structureEntry).toHaveBeenCalledWith('raw', ['Baba Farid'])
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
  dbSelectFrom.mockResolvedValue([{ name: 'Baba Farid' }]) // the known-poets query
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

it('structure stage: null rawTranscript fails loudly at structure without calling structureEntry', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'transcribed', rawTranscript: null }))
  transition.mockResolvedValue(baseEntry({ status: 'failed' }))

  const status = await advanceEntry('entry-1')

  expect(structureEntry).not.toHaveBeenCalled()
  expect(transition).toHaveBeenCalledWith(
    expect.anything(),
    'failed',
    { failedAtStage: 'structure', errorMessage: 'Cannot structure an entry with no transcript' },
  )
  expect(status).toBe('failed')
})

it('captures a stage failure: truncates an oversized error message to exactly MAX_ERROR_LENGTH chars', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'received' }))
  transcribe.mockRejectedValue(new Error('x'.repeat(600)))
  transition.mockResolvedValue(baseEntry({ status: 'failed' }))

  await advanceEntry('entry-1')

  const patch = transition.mock.calls[0][2]
  expect(patch.errorMessage).toHaveLength(500)
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

it('rewindFailedEntry: rewinds a failed(structure) entry to transcribed, clears failure fields, and does NOT run the stage', async () => {
  const failed = baseEntry({ status: 'failed', failedAtStage: 'structure' })
  const rewound = baseEntry({ status: 'transcribed', rawTranscript: 'raw' })
  getEntryById.mockResolvedValue(failed)
  transition.mockResolvedValue(rewound)

  const entry = await rewindFailedEntry('entry-1')

  expect(transition).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'failed' }),
    'transcribed',
    { errorMessage: null, failedAtStage: null },
  )
  // The rewind returns the row at the rewound status. Re-running the stage is the
  // advance ROUTE's job (the caller kicks it via triggerAdvance) — never in-process.
  expect(entry.status).toBe('transcribed')
  expect(structureEntry).not.toHaveBeenCalled()
  expect(transcribe).not.toHaveBeenCalled()
})

it('rewindFailedEntry: a failed(transcribe) entry rewinds to received', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'failed', failedAtStage: 'transcribe' }))
  transition.mockResolvedValue(baseEntry({ status: 'received' }))

  const entry = await rewindFailedEntry('entry-1')

  expect(transition).toHaveBeenCalledWith(
    expect.anything(), 'received', { errorMessage: null, failedAtStage: null },
  )
  expect(entry.status).toBe('received')
})

it('rewindFailedEntry: throws when the entry is not in a failed state', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'structured' }))
  await expect(rewindFailedEntry('entry-1')).rejects.toThrow()
  expect(transition).not.toHaveBeenCalled()
})

it('rewindFailedEntry: throws when status is failed but failedAtStage is null', async () => {
  getEntryById.mockResolvedValue(baseEntry({ status: 'failed', failedAtStage: null }))
  await expect(rewindFailedEntry('entry-1')).rejects.toThrow()
  expect(transition).not.toHaveBeenCalled()
})

it('rewindFailedEntry: throws when the entry does not exist', async () => {
  getEntryById.mockResolvedValue(undefined)
  await expect(rewindFailedEntry('missing')).rejects.toThrow()
})

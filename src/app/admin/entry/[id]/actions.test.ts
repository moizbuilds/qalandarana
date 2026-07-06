// Tests for the admin detail-page server actions — the buttons/forms Moiz uses
// to fix, retry, advance, resend, and force-publish an entry from the workbench.
//
// These actions are the ONLY writers the admin detail page reaches, and every
// one of them mutates real data (edits fields, rewinds the pipeline, publishes).
// So the contract we pin here is mostly about GUARDS: auth is re-checked first,
// a smuggled `status` never reaches the repository, and status-gated actions
// refuse to run from the wrong status.
//
// CONCEPT: we mock every collaborator (entries repo, pipeline, telegram,
// require-admin, next/cache, env) so the tests exercise the actions' DECISIONS —
// which fields, which transition, whether to send — with no database, network,
// or Next runtime in the loop.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entry } from '@/lib/schema'

// vi.hoisted: these mock fns must exist BEFORE the vi.mock factories run (vitest
// hoists vi.mock to the top of the file), so we create them up here.
const {
  requireAdmin, getEntryById, updateEntryFields, transition,
  rewindFailedEntry, triggerAdvance, waitUntil,
  sendTelegramMessage, getEnv, revalidatePath,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getEntryById: vi.fn(),
  updateEntryFields: vi.fn(),
  transition: vi.fn(),
  rewindFailedEntry: vi.fn(),
  triggerAdvance: vi.fn(),
  waitUntil: vi.fn(),
  sendTelegramMessage: vi.fn(),
  getEnv: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/require-admin', () => ({ requireAdmin }))
vi.mock('@/lib/entries', () => ({ getEntryById, updateEntryFields, transition }))
vi.mock('@/lib/pipeline', () => ({ rewindFailedEntry }))
vi.mock('@/lib/advance-call', () => ({ triggerAdvance }))
vi.mock('@vercel/functions', () => ({ waitUntil }))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage }))
vi.mock('@/lib/env', () => ({ getEnv }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { saveEntry, retryAction, advanceAction, resendReviewAction, publishNowAction } from './actions'

const ID = 'e1'

// A minimal entry; tests fill only the fields the action under test reads.
function entryWith(overrides: Partial<Entry>): Entry {
  return { id: ID, status: 'in_review', title: 'Man Kunto Maula', ...overrides } as Entry
}

// Build a FormData with the given string fields set.
function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.resetAllMocks()
  requireAdmin.mockResolvedValue('moiz@example.com')
  getEnv.mockReturnValue({ APP_URL: 'https://qalandarana.vercel.app' })
})

describe('saveEntry', () => {
  it('passes ONLY the 8 allowlisted fields — a smuggled status/audioUrl never reaches updateEntryFields', async () => {
    // The form tries to smuggle two forbidden keys. The action allowlists, so
    // they must never appear in the patch (defense in depth: the action filters
    // here, and updateEntryFields strips again downstream).
    await saveEntry(ID, form({
      title: 'New title',
      kalamOriginal: 'k-orig',
      status: 'published',      // smuggled — must be ignored
      audioUrl: 'https://evil', // smuggled — must be ignored
      rawTranscript: 'tamper',  // smuggled — must be ignored
    }))

    expect(updateEntryFields).toHaveBeenCalledOnce()
    const [id, patch] = updateEntryFields.mock.calls[0]
    expect(id).toBe(ID)
    expect(patch).not.toHaveProperty('status')
    expect(patch).not.toHaveProperty('audioUrl')
    expect(patch).not.toHaveProperty('rawTranscript')
    // Only allowlisted keys survive.
    const allowed = ['title', 'kalamOriginal', 'kalamRoman', 'kalamEnglish',
      'explanationOriginal', 'explanationEnglish', 'poetId', 'maqamId']
    expect(Object.keys(patch).every((k) => allowed.includes(k))).toBe(true)
    expect(patch.title).toBe('New title')
    expect(patch.kalamOriginal).toBe('k-orig')
  })

  it('maps empty-string fields to null (uniform empty → null rule)', async () => {
    await saveEntry(ID, form({
      title: '',        // cleared text field
      poetId: '',       // "—" select option
      maqamId: '',      // "—" select option
      kalamRoman: 'x',
    }))

    const [, patch] = updateEntryFields.mock.calls[0]
    expect(patch.title).toBeNull()
    expect(patch.poetId).toBeNull()
    expect(patch.maqamId).toBeNull()
    expect(patch.kalamRoman).toBe('x')
  })

  it('rejects when requireAdmin throws — nothing is written', async () => {
    requireAdmin.mockRejectedValue(new Error('Unauthorized'))

    await expect(saveEntry(ID, form({ title: 'x' }))).rejects.toThrow('Unauthorized')
    expect(updateEntryFields).not.toHaveBeenCalled()
  })
})

describe('retryAction', () => {
  it('rewinds a failed entry, then kicks the advance route via waitUntil (no in-process stage run)', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'failed' }))
    rewindFailedEntry.mockResolvedValue(entryWith({ status: 'transcribed' }))
    const kickPromise = Promise.resolve()
    triggerAdvance.mockReturnValue(kickPromise)

    await retryAction(ID)

    expect(rewindFailedEntry).toHaveBeenCalledWith(ID)
    // The re-run is handed to the advance ROUTE (which owns the 300s budget and
    // chains stages to completion) as a background kick — never run in-process.
    expect(triggerAdvance).toHaveBeenCalledWith(ID)
    expect(waitUntil).toHaveBeenCalledWith(kickPromise)
    // Rewind must complete before the kick, or the route would advance the stale row.
    expect(rewindFailedEntry.mock.invocationCallOrder[0])
      .toBeLessThan(triggerAdvance.mock.invocationCallOrder[0])
    expect(revalidatePath).toHaveBeenCalledWith('/admin/entry/' + ID)
  })

  it('throws and does NOT rewind or kick when the entry is not failed', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'in_review' }))

    await expect(retryAction(ID)).rejects.toThrow()
    expect(rewindFailedEntry).not.toHaveBeenCalled()
    expect(triggerAdvance).not.toHaveBeenCalled()
  })

  it('throws when the entry does not exist', async () => {
    getEntryById.mockResolvedValue(undefined)

    await expect(retryAction(ID)).rejects.toThrow()
    expect(rewindFailedEntry).not.toHaveBeenCalled()
    expect(triggerAdvance).not.toHaveBeenCalled()
  })

  it('rejects when requireAdmin throws — no rewind, no kick', async () => {
    requireAdmin.mockRejectedValue(new Error('Unauthorized'))

    await expect(retryAction(ID)).rejects.toThrow('Unauthorized')
    expect(rewindFailedEntry).not.toHaveBeenCalled()
    expect(triggerAdvance).not.toHaveBeenCalled()
  })
})

describe('advanceAction', () => {
  it.each(['received', 'transcribed', 'structured'] as const)(
    'kicks the advance route for a %s entry',
    async (status) => {
      getEntryById.mockResolvedValue(entryWith({ status }))
      const kickPromise = Promise.resolve()
      triggerAdvance.mockReturnValue(kickPromise)

      await advanceAction(ID)

      expect(triggerAdvance).toHaveBeenCalledWith(ID)
      expect(waitUntil).toHaveBeenCalledWith(kickPromise)
      expect(revalidatePath).toHaveBeenCalledWith('/admin/entry/' + ID)
    },
  )

  it.each(['in_review', 'needs_fix', 'published', 'failed'] as const)(
    'throws and does NOT kick for a %s entry (not mid-pipeline)',
    async (status) => {
      getEntryById.mockResolvedValue(entryWith({ status }))

      await expect(advanceAction(ID)).rejects.toThrow()
      expect(triggerAdvance).not.toHaveBeenCalled()
    },
  )

  it('throws when the entry does not exist', async () => {
    getEntryById.mockResolvedValue(undefined)

    await expect(advanceAction(ID)).rejects.toThrow()
    expect(triggerAdvance).not.toHaveBeenCalled()
  })

  it('rejects when requireAdmin throws — no kick', async () => {
    requireAdmin.mockRejectedValue(new Error('Unauthorized'))

    await expect(advanceAction(ID)).rejects.toThrow('Unauthorized')
    expect(getEntryById).not.toHaveBeenCalled()
    expect(triggerAdvance).not.toHaveBeenCalled()
  })
})

describe('publishNowAction', () => {
  it('transitions in_review → published and stamps BOTH timestamps', async () => {
    const entry = entryWith({ status: 'in_review' })
    getEntryById.mockResolvedValue(entry)

    await publishNowAction(ID)

    expect(transition).toHaveBeenCalledOnce()
    const [passedEntry, to, patch] = transition.mock.calls[0]
    expect(passedEntry).toBe(entry)
    expect(to).toBe('published')
    expect(patch.approvedAt).toBeInstanceOf(Date)
    expect(patch.publishedAt).toBeInstanceOf(Date)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/entry/' + ID)
  })

  it('publishes from needs_fix too', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'needs_fix' }))

    await publishNowAction(ID)

    expect(transition.mock.calls[0][1]).toBe('published')
  })

  it('throws on a not-yet-reviewable status (e.g. received) and does not transition', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'received' }))

    await expect(publishNowAction(ID)).rejects.toThrow()
    expect(transition).not.toHaveBeenCalled()
  })
})

describe('resendReviewAction', () => {
  it('sends the Telegram message BEFORE transitioning, then re-opens review', async () => {
    getEntryById.mockResolvedValue(entryWith({
      status: 'needs_fix', reviewToken: 'tok-123', telegramChatId: 555, title: 'My Kalam',
    }))

    await resendReviewAction(ID)

    expect(transition).toHaveBeenCalledOnce()
    expect(transition.mock.calls[0][1]).toBe('in_review')
    expect(sendTelegramMessage).toHaveBeenCalledOnce()
    const [chatId, text] = sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe(555)
    expect(text).toContain('tok-123') // the existing token rides in the link
    // Order matters (mirrors pipeline.ts's send_review stage): a send failure
    // must leave the entry at needs_fix, not stranded at in_review, so send
    // must happen strictly before transition.
    expect(sendTelegramMessage.mock.invocationCallOrder[0])
      .toBeLessThan(transition.mock.invocationCallOrder[0])
    expect(revalidatePath).toHaveBeenCalledWith('/admin/entry/' + ID)
  })

  it('a Telegram send failure leaves the entry retryable — no transition happens', async () => {
    getEntryById.mockResolvedValue(entryWith({
      status: 'needs_fix', reviewToken: 'tok-123', telegramChatId: 555, title: 'My Kalam',
    }))
    sendTelegramMessage.mockRejectedValue(new Error('telegram down'))

    await expect(resendReviewAction(ID)).rejects.toThrow('telegram down')

    expect(sendTelegramMessage).toHaveBeenCalledOnce()
    expect(transition).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('throws when the entry is not needs_fix', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'in_review', reviewToken: 'tok-123' }))

    await expect(resendReviewAction(ID)).rejects.toThrow()
    expect(transition).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('throws when needs_fix but the reviewToken is missing', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'needs_fix', reviewToken: null }))

    await expect(resendReviewAction(ID)).rejects.toThrow()
    expect(transition).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('rejects when requireAdmin throws — no lookup, no send', async () => {
    requireAdmin.mockRejectedValue(new Error('Unauthorized'))

    await expect(resendReviewAction(ID)).rejects.toThrow('Unauthorized')
    expect(getEntryById).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })
})

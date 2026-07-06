// Tests for the admin detail-page server actions — the four buttons/forms Moiz
// uses to fix, retry, resend, and force-publish an entry from the workbench.
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
  retryEntry, sendTelegramMessage, getEnv, revalidatePath,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getEntryById: vi.fn(),
  updateEntryFields: vi.fn(),
  transition: vi.fn(),
  retryEntry: vi.fn(),
  sendTelegramMessage: vi.fn(),
  getEnv: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/require-admin', () => ({ requireAdmin }))
vi.mock('@/lib/entries', () => ({ getEntryById, updateEntryFields, transition }))
vi.mock('@/lib/pipeline', () => ({ retryEntry }))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage }))
vi.mock('@/lib/env', () => ({ getEnv }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { saveEntry, retryAction, resendReviewAction, publishNowAction } from './actions'

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
  it('retries a failed entry', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'failed' }))

    await retryAction(ID)

    expect(retryEntry).toHaveBeenCalledWith(ID)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/entry/' + ID)
  })

  it('throws and does NOT retry when the entry is not failed', async () => {
    getEntryById.mockResolvedValue(entryWith({ status: 'in_review' }))

    await expect(retryAction(ID)).rejects.toThrow()
    expect(retryEntry).not.toHaveBeenCalled()
  })

  it('throws when the entry does not exist', async () => {
    getEntryById.mockResolvedValue(undefined)

    await expect(retryAction(ID)).rejects.toThrow()
    expect(retryEntry).not.toHaveBeenCalled()
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
  it('re-opens review and sends a Telegram message containing the existing token', async () => {
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
    expect(revalidatePath).toHaveBeenCalledWith('/admin/entry/' + ID)
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

// Tests for the review-page server actions — the two buttons on father's phone.
//
// approveEntry and flagEntry are the ONLY writers the review page reaches. They
// wrap the entries repository's transition() and (for flag) notifyAdmin(), and
// they must be idempotent: the review link lives in Telegram, so father can tap
// a button twice, reload, and re-tap. A second tap must never double-stamp
// timestamps or fire a second admin ping. These tests pin that contract down.
//
// CONCEPT: we mock the three collaborators (entries repo, telegram, next/cache)
// so the tests exercise the actions' DECISIONS — which transition, whether to
// stamp, whether to notify — without a real database, network, or Next runtime.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entry } from '@/lib/schema'

// vi.hoisted: these mock fns must exist BEFORE the vi.mock factories below run
// (vitest hoists vi.mock to the top of the file), so we create them up here.
const { getEntryByReviewToken, transition, notifyAdmin, revalidatePath } = vi.hoisted(() => ({
  getEntryByReviewToken: vi.fn(),
  transition: vi.fn(),
  notifyAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/entries', () => ({ getEntryByReviewToken, transition }))
vi.mock('@/lib/telegram', () => ({ notifyAdmin }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { approveEntry, flagEntry } from './actions'

const TOKEN = 'secret-token'

// A minimal in_review entry. We only fill the fields the actions read; the rest
// are cast away because the actions never touch them.
function entryWith(overrides: Partial<Entry>): Entry {
  return { id: 'e1', status: 'in_review', title: 'Man Kunto Maula', ...overrides } as Entry
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('approveEntry', () => {
  it('publishes an in_review entry and stamps BOTH timestamps', async () => {
    const entry = entryWith({ status: 'in_review' })
    getEntryByReviewToken.mockResolvedValue(entry)

    await approveEntry(TOKEN)

    expect(transition).toHaveBeenCalledOnce()
    const [passedEntry, to, patch] = transition.mock.calls[0]
    expect(passedEntry).toBe(entry)
    expect(to).toBe('published')
    expect(patch.approvedAt).toBeInstanceOf(Date)
    expect(patch.publishedAt).toBeInstanceOf(Date)
    expect(revalidatePath).toHaveBeenCalledWith('/review/[token]', 'page')
  })

  it('publishes from needs_fix too (both moves are legal)', async () => {
    getEntryByReviewToken.mockResolvedValue(entryWith({ status: 'needs_fix' }))

    await approveEntry(TOKEN)

    expect(transition).toHaveBeenCalledOnce()
    expect(transition.mock.calls[0][1]).toBe('published')
  })

  it('is idempotent on an already-published entry: no transition, no double-stamp', async () => {
    getEntryByReviewToken.mockResolvedValue(entryWith({ status: 'published' }))

    await approveEntry(TOKEN)

    expect(transition).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('throws Not found on a bad token', async () => {
    getEntryByReviewToken.mockResolvedValue(undefined)

    await expect(approveEntry(TOKEN)).rejects.toThrow('Not found')
    expect(transition).not.toHaveBeenCalled()
  })
})

describe('flagEntry', () => {
  it('moves in_review → needs_fix and notifies the admin with the title', async () => {
    getEntryByReviewToken.mockResolvedValue(entryWith({ status: 'in_review', title: 'Man Kunto Maula' }))

    await flagEntry(TOKEN)

    expect(transition).toHaveBeenCalledOnce()
    expect(transition.mock.calls[0][1]).toBe('needs_fix')
    expect(notifyAdmin).toHaveBeenCalledWith('"Man Kunto Maula" flagged by reviewer')
    expect(revalidatePath).toHaveBeenCalledWith('/review/[token]', 'page')
  })

  it('falls back to "Untitled" when the entry has no title', async () => {
    getEntryByReviewToken.mockResolvedValue(entryWith({ status: 'in_review', title: null }))

    await flagEntry(TOKEN)

    expect(notifyAdmin).toHaveBeenCalledWith('"Untitled" flagged by reviewer')
  })

  it('is idempotent on an already-published entry: no transition, no notify', async () => {
    getEntryByReviewToken.mockResolvedValue(entryWith({ status: 'published' }))

    await flagEntry(TOKEN)

    expect(transition).not.toHaveBeenCalled()
    expect(notifyAdmin).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('is idempotent on an already-needs_fix entry: no transition, no notify', async () => {
    getEntryByReviewToken.mockResolvedValue(entryWith({ status: 'needs_fix' }))

    await flagEntry(TOKEN)

    expect(transition).not.toHaveBeenCalled()
    expect(notifyAdmin).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('throws Not found on a bad token', async () => {
    getEntryByReviewToken.mockResolvedValue(undefined)

    await expect(flagEntry(TOKEN)).rejects.toThrow('Not found')
    expect(transition).not.toHaveBeenCalled()
    expect(notifyAdmin).not.toHaveBeenCalled()
  })
})

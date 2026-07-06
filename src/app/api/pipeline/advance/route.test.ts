// Tests for the pipeline advance route — the self-chaining stage runner.
//
// One HTTP call = one pipeline stage. When advanceEntry returns a status that
// still has a next stage, the route fires a fresh call to ITSELF (via waitUntil)
// so the next stage runs in its own serverless invocation. These tests verify
// the auth gate, the chaining decision (chain vs stop), and that infrastructure
// failures degrade to a 200 + admin ping rather than a retry-triggering 500.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyValidEnv } from '@/lib/test-fixtures'

const { advanceEntry, stageForStatus, notifyAdmin, waitUntil } = vi.hoisted(() => ({
  advanceEntry: vi.fn(), stageForStatus: vi.fn(), notifyAdmin: vi.fn(), waitUntil: vi.fn(),
}))

vi.mock('@/lib/pipeline', () => ({ advanceEntry }))
vi.mock('@/lib/status', () => ({ stageForStatus }))
vi.mock('@/lib/telegram', () => ({ notifyAdmin }))
vi.mock('@vercel/functions', () => ({ waitUntil }))

import { POST } from './route'

const VALID_SECRET = 'b'.repeat(16) // applyValidEnv() loads this as INTERNAL_API_SECRET

function advanceRequest(body: unknown, secret: string = VALID_SECRET): Request {
  return new Request('https://qalandarana.vercel.app/api/pipeline/advance', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  applyValidEnv()
})

describe('POST /api/pipeline/advance', () => {
  it('rejects a wrong internal secret with 401', async () => {
    const res = await POST(advanceRequest({ entryId: 'e1' }, 'nope'))
    expect(res.status).toBe(401)
    expect(advanceEntry).not.toHaveBeenCalled()
  })

  it('rejects an invalid body with 400', async () => {
    const res = await POST(advanceRequest({ notEntryId: true }))
    expect(res.status).toBe(400)
    expect(advanceEntry).not.toHaveBeenCalled()
  })

  it('advances a stage and CHAINS when a next stage remains', async () => {
    advanceEntry.mockResolvedValue('transcribed')
    stageForStatus.mockReturnValue('structure') // transcribed still has a next stage
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(advanceRequest({ entryId: 'e1' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'transcribed' })
    expect(advanceEntry).toHaveBeenCalledWith('e1')
    // Chained: a self-call was scheduled with the same entryId + internal secret.
    expect(waitUntil).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://qalandarana.vercel.app/api/pipeline/advance')
    expect(init.headers['x-internal-secret']).toBe(VALID_SECRET)
    expect(JSON.parse(init.body)).toEqual({ entryId: 'e1' })
  })

  it('does NOT chain when the returned status has no next stage', async () => {
    advanceEntry.mockResolvedValue('in_review')
    stageForStatus.mockReturnValue(null) // in_review is terminal for the pipeline
    const res = await POST(advanceRequest({ entryId: 'e1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'in_review' })
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('degrades an infrastructure failure to 200 {status:error} + notifyAdmin', async () => {
    advanceEntry.mockRejectedValue(new Error('DB unreachable'))
    const res = await POST(advanceRequest({ entryId: 'ghost' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'error' })
    expect(notifyAdmin).toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
  })
})

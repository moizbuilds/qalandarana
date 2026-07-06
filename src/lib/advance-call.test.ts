// Tests for the pipeline kick — the one shared "call the advance route" helper.
//
// triggerAdvance runs INSIDE waitUntil, where a rejected promise vanishes
// silently. So its contract is: NEVER throw, and turn every failure mode (non-OK
// response, fetch rejection) into a notifyAdmin message. These tests pin exactly
// that: a silent kick failure is the bug class this helper exists to retire.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyValidEnv } from './test-fixtures'

const { notifyAdmin } = vi.hoisted(() => ({ notifyAdmin: vi.fn() }))
vi.mock('./telegram', () => ({ notifyAdmin }))

import { triggerAdvance } from './advance-call'

beforeEach(() => {
  vi.resetAllMocks()
  applyValidEnv()
})

describe('triggerAdvance', () => {
  it('POSTs the entry id to the advance route with the internal secret', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'transcribed' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await triggerAdvance('entry-1')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }]
    expect(url).toBe('https://qalandarana.vercel.app/api/pipeline/advance')
    expect(init.method).toBe('POST')
    expect(init.headers['x-internal-secret']).toBe('b'.repeat(16))
    expect(JSON.parse(init.body)).toEqual({ entryId: 'entry-1' })
    // Happy path: nothing to report.
    expect(notifyAdmin).not.toHaveBeenCalled()
  })

  it('a non-OK response (401) → notifyAdmin with the entry id and status, no throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))

    await expect(triggerAdvance('entry-1')).resolves.toBeUndefined()

    expect(notifyAdmin).toHaveBeenCalledWith('Qalandarana: pipeline kick failed for entry entry-1: 401')
  })

  it('a fetch rejection (network down) → notifyAdmin, no throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    await expect(triggerAdvance('entry-1')).resolves.toBeUndefined()

    expect(notifyAdmin).toHaveBeenCalledWith(expect.stringContaining('pipeline kick failed for entry entry-1'))
    expect(notifyAdmin).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'))
  })
})

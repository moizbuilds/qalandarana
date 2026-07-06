import { describe, it, expect } from 'vitest'
import { assertTransition, stageForStatus, retryStatusFor } from './status'

describe('assertTransition', () => {
  it.each([
    ['received', 'transcribed'], ['transcribed', 'structured'], ['structured', 'in_review'],
    ['in_review', 'published'], ['in_review', 'needs_fix'], ['needs_fix', 'published'],
    ['received', 'failed'], ['failed', 'received'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow()
  })
  it.each([
    ['received', 'structured'], ['received', 'published'], ['published', 'received'],
    ['transcribed', 'published'], ['published', 'failed'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(() => assertTransition(from, to)).toThrowError(/Illegal/)
  })
})

describe('stage mapping', () => {
  it('maps statuses to their next stage', () => {
    expect(stageForStatus('received')).toBe('transcribe')
    expect(stageForStatus('transcribed')).toBe('structure')
    expect(stageForStatus('structured')).toBe('send_review')
    expect(stageForStatus('in_review')).toBeNull()
    expect(stageForStatus('published')).toBeNull()
  })
  it('maps a failed stage back to its input status', () => {
    expect(retryStatusFor('transcribe')).toBe('received')
    expect(retryStatusFor('structure')).toBe('transcribed')
    expect(retryStatusFor('send_review')).toBe('structured')
  })
})

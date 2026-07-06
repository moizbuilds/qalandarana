import { describe, it, expect } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [65, '1:05'],
    [600, '10:00'],
  ])('formats %i seconds as %s', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected)
  })
})

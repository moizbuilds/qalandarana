// Two guarantees for the design tokens, checked on every `npm test`:
//   1. Parity — valley-colors.ts (the JS mirror Satori uses) must match the hex
//      values in globals.css (what the browser paints). They're two copies of
//      the same truth; this test fails if they ever drift.
//   2. Contrast — moon ivory on every night valley, and ink on the Fana light,
//      must clear WCAG AA so the text is always readable.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INK, IVORY, GOLD, GOLD_FANA, VALLEY_HEX } from './valley-colors'

// --- WCAG contrast math (sRGB relative luminance → contrast ratio) ---
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// --- Pull the hex tokens straight out of globals.css :root ---
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
function cssVar(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --${name} not found in globals.css`)
  return m[1].toLowerCase()
}

const SLUGS = ['talab', 'ishq', 'marifat', 'istighna', 'tawhid', 'hairat', 'fana'] as const
const NIGHT_VALLEYS = SLUGS.filter((s) => s !== 'fana')

describe('token parity: valley-colors.ts mirrors globals.css', () => {
  it('base tokens match', () => {
    expect(INK).toBe(cssVar('ink'))
    expect(IVORY).toBe(cssVar('ivory'))
    expect(GOLD).toBe(cssVar('gold'))
  })
  it.each(SLUGS)('valley %s matches', (slug) => {
    expect(VALLEY_HEX[slug]).toBe(cssVar(`valley-${slug}`))
  })
})

describe('contrast: text is readable on every ground (WCAG AA)', () => {
  it.each(NIGHT_VALLEYS)('ivory on %s ≥ 4.5:1', (slug) => {
    expect(contrast(IVORY, VALLEY_HEX[slug])).toBeGreaterThanOrEqual(4.5)
  })
  it('ivory on ink ≥ 4.5:1', () => {
    expect(contrast(IVORY, INK)).toBeGreaterThanOrEqual(4.5)
  })
  it('ink on the Fana light ≥ 4.5:1 (the inversion stays legible)', () => {
    expect(contrast(INK, VALLEY_HEX.fana)).toBeGreaterThanOrEqual(4.5)
  })
  it('gold accents clear AA on every night valley', () => {
    for (const slug of NIGHT_VALLEYS) {
      expect(contrast(GOLD, VALLEY_HEX[slug])).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('the deepened gold clears AA on the Fana light ground', () => {
    // bright GOLD is only ~2:1 on ivory; GOLD_FANA is what actually renders there
    expect(contrast(GOLD_FANA, VALLEY_HEX.fana)).toBeGreaterThanOrEqual(4.5)
  })
  it('GOLD_FANA mirrors --gold-fana in globals.css', () => {
    expect(GOLD_FANA).toBe(cssVar('gold-fana'))
  })
})

// Tests for the dual-provider structurer adapter.
//
// We mock BOTH SDKs so these tests never hit a network or need a real key. Each
// test picks a provider via STRUCTURER_PROVIDER and asserts (a) the right SDK is
// called, (b) the other is NOT, and (c) bad model output is rejected loudly by zod
// rather than leaking undefined fields downstream.

import { it, expect, vi, beforeEach } from 'vitest'
import { applyValidEnv } from '../test-fixtures'
import { _resetEnvCache } from '../env'

// CONCEPT: vi.mock replaces the real module with a fake for this whole file. The
// factory is hoisted above imports, so we declare the spies first and reference
// them from inside the fake SDK classes.
const anthropicCreate = vi.fn()
const openaiCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: anthropicCreate } } }))
vi.mock('openai', () => ({ default: class { chat = { completions: { create: openaiCreate } } } }))

import { structureEntry } from './structurer'

// A complete, schema-valid payload the model might return.
const GOOD = {
  title: 'Ki Jaana Main Kaun', poet_name: 'Bulleh Shah', maqam_slug: 'hairat',
  kalam_original: 'بلھا کیہ جاناں میں کون', kalam_roman: 'Bulleya ki jaana main kaun',
  kalam_english: 'Bulleh! Who knows who I am?', explanation_original: '...', explanation_english: '...',
  corrections: [{ heard: 'کی جانا', restored: 'کیہ جاناں' }],
}

// applyValidEnv() loads a full valid env and resets getEnv()'s cache; each test
// then overrides STRUCTURER_PROVIDER and re-resets so the override is read fresh.
beforeEach(() => { anthropicCreate.mockReset(); openaiCreate.mockReset(); applyValidEnv() })

it('uses Claude when STRUCTURER_PROVIDER=claude and parses JSON', async () => {
  process.env.STRUCTURER_PROVIDER = 'claude'
  _resetEnvCache()
  anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(GOOD) }] })
  const out = await structureEntry('raw transcript here')
  expect(out.poet_name).toBe('Bulleh Shah')
  expect(openaiCreate).not.toHaveBeenCalled()
})

it('uses OpenAI when STRUCTURER_PROVIDER=openai', async () => {
  process.env.STRUCTURER_PROVIDER = 'openai'
  _resetEnvCache()
  openaiCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(GOOD) } }] })
  const out = await structureEntry('raw')
  expect(out.maqam_slug).toBe('hairat')
  expect(anthropicCreate).not.toHaveBeenCalled()
})

it('rejects malformed model output', async () => {
  process.env.STRUCTURER_PROVIDER = 'claude'
  _resetEnvCache()
  anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"title": "only a title"}' }] })
  await expect(structureEntry('raw')).rejects.toThrow()
})

// A real model often wraps JSON in a ```json markdown fence. Our slice-between-braces
// extraction must survive that; this guards the happy path against fenced output.
it('parses GOOD payload wrapped in ```json fences', async () => {
  process.env.STRUCTURER_PROVIDER = 'claude'
  _resetEnvCache()
  const fenced = '```json\n' + JSON.stringify(GOOD) + '\n```'
  anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: fenced }] })
  const out = await structureEntry('raw')
  expect(out.title).toBe('Ki Jaana Main Kaun')
})

// Claude's extended thinking can emit a 'thinking' block before the 'text' block;
// this guards the find-by-type behavior (must not assume text is content[0]).
it('parses GOOD payload when a thinking block precedes the text block', async () => {
  process.env.STRUCTURER_PROVIDER = 'claude'
  _resetEnvCache()
  anthropicCreate.mockResolvedValue({
    content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: JSON.stringify(GOOD) }],
  })
  const out = await structureEntry('raw')
  expect(out.poet_name).toBe('Bulleh Shah')
})

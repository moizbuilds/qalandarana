// structurer.ts — the ONLY file in the app that talks to a text LLM.
//
// It turns a raw speech-to-text transcript into a validated StructuredEntry.
// Claude and GPT implementations sit side by side; STRUCTURER_PROVIDER picks the
// live one so the father's taste test (Task 15) can compare them on real notes.
// Both `viaClaude` and `viaOpenAI` are exported for that script to call directly.
//
// CONCEPT: adapter pattern — the rest of the app calls structureEntry(text) and
// depends on OUR shape (transcript -> StructuredEntry), never on an SDK. Swapping
// or re-tuning providers is a change here and nowhere else.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getEnv } from '../env'
import { getOpenAIClient } from './openai-client'
import { SYSTEM_PROMPT } from './structurer-prompt'

// Model IDs as named constants: the taste test edits these in one place, and it's
// obvious what to re-check. verify current IDs at deploy time (Task 15).
// Exported so scripts/taste-test.ts can print exactly which model produced each
// block — one source of truth for the model name here and in the taste-test header.
export const CLAUDE_MODEL = 'claude-sonnet-4-5'
export const OPENAI_MODEL = 'gpt-5'

// CONCEPT: zod schema = one source of truth for both the runtime shape check AND
// the TypeScript type (via z.infer). The pipeline and DB layer import this type,
// so the validated fields and the compile-time type can never drift apart.
export const StructuredEntrySchema = z.object({
  title: z.string().min(1),
  poet_name: z.string().min(1), // "Unknown" is allowed — it's still a non-empty string
  maqam_slug: z.enum(['talab', 'ishq', 'marifat', 'istighna', 'tawhid', 'hairat', 'fana']),
  kalam_original: z.string().min(1),
  kalam_roman: z.string().min(1),
  kalam_english: z.string().min(1),
  explanation_original: z.string(),
  explanation_english: z.string(),
  corrections: z.array(z.object({ heard: z.string(), restored: z.string() })),
})
export type StructuredEntry = z.infer<typeof StructuredEntrySchema>

const USER_PREFIX = 'Raw transcript of the voice note:\n\n'

// One Anthropic client per process, same pattern as getOpenAIClient(): lazy so
// importing this file never reads env, memoized so connections are pooled.
let anthropic: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (anthropic) return anthropic
  // timeout in MILLISECONDS (TS SDK convention); bounded retries for transient 5xx/429.
  anthropic = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 })
  return anthropic
}

// Ask Claude and return its raw text. Exported for the Task 15 taste test.
export async function viaClaude(raw: string): Promise<string> {
  const msg = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL, max_tokens: 4096, system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PREFIX + raw }],
  })
  // CONCEPT: never assume the response shape. Claude returns an array of content
  // blocks; a thinking block can come FIRST, so we find the text block by type
  // rather than reading content[0]. If there's no text block at all, fail loudly.
  const block = msg.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Claude returned no text')
  return block.text
}

// Ask GPT and return its raw text. Exported for the Task 15 taste test.
export async function viaOpenAI(raw: string): Promise<string> {
  const res = await getOpenAIClient().chat.completions.create({
    model: OPENAI_MODEL, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: USER_PREFIX + raw }],
  })
  // Same discipline: don't trust the shape — guard the nullable content field.
  const text = res.choices[0]?.message?.content
  if (!text) throw new Error('OpenAI returned no text')
  return text
}

// Public entry point the pipeline's structure stage (Task 9) calls.
export async function structureEntry(rawTranscript: string): Promise<StructuredEntry> {
  const provider = getEnv().STRUCTURER_PROVIDER
  const text = provider === 'claude' ? await viaClaude(rawTranscript) : await viaOpenAI(rawTranscript)
  // CONCEPT: never trust LLM output shape — parse it through zod so bad JSON fails
  // loudly HERE, not as undefined fields on the review page. Slicing between the
  // first '{' and last '}' also survives ```json markdown fences the model may add.
  const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return StructuredEntrySchema.parse(JSON.parse(jsonText))
}

// openai-client.ts — the single OpenAI SDK client for the whole process.
//
// Two adapters need an OpenAI client: transcriber.ts (Whisper) and structurer.ts
// (GPT). If each `new OpenAI()`d its own, we'd hold two independent connection
// pools and duplicate the timeout/retry config in two places — a classic
// "one fact written twice" drift risk. Instead both import getOpenAIClient() from
// here: one definition, one client per process.
//
// CONCEPT: module-level memoization — we build ONE client and reuse it, so the
// underlying HTTP connections are pooled instead of re-dialed on every call. We
// build it lazily inside the function on first use — NOT at module load — because
// importing this file must not read env yet: tests import the adapters before
// applyValidEnv() runs, and reading getEnv() at the top level would throw on a
// not-yet-populated environment.
import OpenAI from 'openai'
import { getEnv } from '../env'

let client: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (client) return client
  // timeout: LLM + Whisper calls on long input are slow, so we give a generous
  // 2 minutes rather than let the SDK's short default abort a legitimate request.
  // NOTE: the TypeScript SDK's timeout is in MILLISECONDS (Python/Ruby use seconds).
  // maxRetries: retry transient 5xx/429 a bounded number of times — never unbounded,
  // which could hammer the API and rack up cost on a persistent outage.
  client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 })
  return client
}

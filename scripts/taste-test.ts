// taste-test.ts — the "which LLM structures our kalam better?" harness.
//
// Task 15's decision point: run the SAME real transcript through Claude and GPT,
// print both structured results side by side, and let the father judge which
// reads truer. Whatever he picks becomes STRUCTURER_PROVIDER in the live env.
//
// Usage:
//   npm run taste-test -- <transcript-file> [--provider both|claude|openai]
// The transcript file is a plain-text file holding one voice note's
// raw_transcript (copy it out of /admin for the first real entries). --provider
// defaults to `both`.
//
// NOTE: RELATIVE imports (../src/lib/...), not the '@/' alias — tsx does not read
// tsconfig `paths` at runtime. Same convention as scripts/seed.ts.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import {
  viaClaude,
  viaOpenAI,
  StructuredEntrySchema,
  CLAUDE_MODEL,
  OPENAI_MODEL,
} from '../src/lib/adapters/structurer'

type Provider = 'both' | 'claude' | 'openai'

// Tiny hand-rolled arg parse — one positional (the file) and one --provider flag.
// A dependency-free parser is right here: the surface is two arguments, and a
// CLI-parsing library would be more setup than the whole script.
function parseArgs(argv: string[]): { file: string; provider: Provider } {
  let file = ''
  let provider: Provider = 'both'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--provider') {
      const v = argv[++i]
      if (v !== 'both' && v !== 'claude' && v !== 'openai') {
        throw new Error(`--provider must be both|claude|openai (got "${v}")`)
      }
      provider = v
    } else if (!file) {
      file = argv[i]
    }
  }
  if (!file) {
    throw new Error('Usage: npm run taste-test -- <transcript-file> [--provider both|claude|openai]')
  }
  return { file, provider }
}

// Same slice-and-parse discipline structureEntry() uses: the model may wrap its
// JSON in ```json fences or prose, so we take everything between the first '{'
// and last '}' before parsing, then validate through zod. We DON'T reuse
// structureEntry() itself because it reads STRUCTURER_PROVIDER — the whole point
// here is to call each provider explicitly, ignoring which one is "live".
function parseStructured(raw: string) {
  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  return StructuredEntrySchema.parse(JSON.parse(jsonText))
}

// Run ONE provider and print its labeled block. Wrapped so a thrown error (API
// down, bad JSON, zod mismatch) is caught and printed for THIS provider only —
// one provider failing must never hide the other's output. Returns whether this
// provider succeeded, so the caller can decide the process exit code.
async function runProvider(label: string, model: string, call: (raw: string) => Promise<string>, transcript: string): Promise<boolean> {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`  ${label}  (${model})`)
  console.log('='.repeat(70))
  try {
    const structured = parseStructured(await call(transcript))
    console.log(JSON.stringify(structured, null, 2))
    return true
  } catch (err) {
    console.error(`  ${label} FAILED:`, err instanceof Error ? err.message : err)
    return false
  }
}

async function main(): Promise<boolean> {
  const { file, provider } = parseArgs(process.argv.slice(2))
  const transcript = readFileSync(file, 'utf8').trim()
  if (!transcript) throw new Error(`Transcript file is empty: ${file}`)

  console.log(`Taste test on: ${file}  (${transcript.length} chars)`)

  // Track per-provider success so a run where EVERY attempted provider fails
  // can exit non-zero (a CI/script caller relying on the exit code shouldn't
  // see "success" when there's no usable output). One provider failing must
  // still never hide the other's output — that isolation stays in runProvider.
  const results: boolean[] = []

  // Providers run sequentially, not in parallel: the output is meant to be read
  // top-to-bottom by a person, and one failing shouldn't abort the other. Order
  // matters less than legibility here.
  if (provider === 'both' || provider === 'claude') {
    results.push(await runProvider('CLAUDE', CLAUDE_MODEL, viaClaude, transcript))
  }
  if (provider === 'both' || provider === 'openai') {
    results.push(await runProvider('OPENAI', OPENAI_MODEL, viaOpenAI, transcript))
  }

  return results.some((ok) => ok)
}

main()
  .then((anySucceeded) => {
    if (!anySucceeded) {
      console.error('\nTaste test failed: every attempted provider errored — no output to compare.')
      process.exit(1)
    }
    process.exit(0)
  })
  .catch((e) => { console.error(e); process.exit(1) })

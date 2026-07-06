// env.ts — the single configuration gate for Qalandarana.
//
// Every later file that needs a secret or setting (database URL, API keys,
// Telegram tokens) reads it through getEnv() here, never from process.env
// directly. Centralizing it means we validate ALL config in one place.
//
// CONCEPT: environment variables ("env vars") are key/value settings that live
// OUTSIDE the code — in the shell, a .env file, or the hosting platform (Vercel).
// They hold secrets and per-environment config so we never hard-code them.
//
// CONCEPT: "fail closed" — if any required var is missing or malformed, the app
// refuses to start (we throw) instead of booting half-configured and crashing
// later with a confusing error deep in some request. Better a loud, early death
// naming exactly what's wrong than a silent one that limps along.
import { z } from 'zod'

// The shape of a valid environment. Zod validates each var AND coerces/derives
// typed values (e.g. the comma string of user IDs becomes number[]).
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  // Comma-separated allow-list ("111,222") → validated number[] ([111, 222]).
  // .transform reshapes the string; .pipe re-validates the transformed result.
  TELEGRAM_ALLOWED_USER_IDS: z.string().min(1)
    .transform((s) => s.split(',').map((id) => Number(id.trim())))
    .pipe(z.array(z.number().int().positive())),
  TELEGRAM_ADMIN_CHAT_ID: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  STRUCTURER_PROVIDER: z.enum(['claude', 'openai']),
  INTERNAL_API_SECRET: z.string().min(16),
  AUTH_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  APP_URL: z.string().url(),
  FAMILY_PASSPHRASE: z.string().min(1),
  PUBLIC_MODE: z.enum(['true', 'false']).default('false'),
})

// CONCEPT: z.infer derives the TypeScript type FROM the schema, so the runtime
// validation and the compile-time type can never drift apart (one source of truth).
export type Env = z.infer<typeof EnvSchema>

// CONCEPT: memoization — cache the result of the first successful parse so we
// validate once, then hand back the same object on every later call (cheap + stable).
let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  // safeParse returns { success, data|error } instead of throwing, so we can
  // gather EVERY problem and report them together rather than one at a time.
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid/missing environment variables: ${missing}`)
  }
  cached = parsed.data
  return cached
}

// Test hook only: lets tests reset the memoized cache between cases so each one
// starts from a clean slate. Not for use in application code.
export function _resetEnvCache() { cached = null }

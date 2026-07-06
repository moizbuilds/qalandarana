// Shared test helpers — the single source of truth for a "valid environment".
//
// getEnv() (src/lib/env.ts) validates process.env and refuses to boot if a var
// is missing. Every test that touches code behind getEnv() therefore needs a
// complete, valid set of env vars. Rather than redeclare that map in each test
// file (and let the copies drift as the schema grows), we define it once here.
//
// CONCEPT: a "test fixture" is a fixed, known-good chunk of setup data that many
// tests share. Centralizing it means adding a new required env var is a one-line
// change here instead of a hunt through every test file.

import { _resetEnvCache } from './env'

// A minimal environment that satisfies EnvSchema. Values are throwaway but
// shaped to pass validation (URLs are URLs, secrets meet min-length rules).
export const VALID_ENV: Record<string, string> = {
  DATABASE_URL: 'postgres://u:p@h/db', BLOB_READ_WRITE_TOKEN: 'x',
  TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(16),
  TELEGRAM_ALLOWED_USER_IDS: '111,222', TELEGRAM_ADMIN_CHAT_ID: '111',
  OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'x', STRUCTURER_PROVIDER: 'claude',
  INTERNAL_API_SECRET: 'b'.repeat(16), AUTH_SECRET: 'c'.repeat(32),
  ADMIN_EMAIL: 'moiz@example.com', ADMIN_PASSWORD_HASH: 'x',
  APP_URL: 'https://qalandarana.vercel.app', FAMILY_PASSPHRASE: 'x', PUBLIC_MODE: 'false',
}

// Load the valid env into process.env and clear getEnv()'s memoized cache, so the
// next getEnv() call re-reads these values. Call from a test's beforeEach.
export function applyValidEnv(): void {
  Object.assign(process.env, VALID_ENV)
  _resetEnvCache()
}

import { describe, it, expect, beforeEach } from 'vitest'
import { getEnv, _resetEnvCache } from './env'

const VALID: Record<string, string> = {
  DATABASE_URL: 'postgres://u:p@h/db', BLOB_READ_WRITE_TOKEN: 'x',
  TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(16),
  TELEGRAM_ALLOWED_USER_IDS: '111,222', TELEGRAM_ADMIN_CHAT_ID: '111',
  OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'x', STRUCTURER_PROVIDER: 'claude',
  INTERNAL_API_SECRET: 'b'.repeat(16), AUTH_SECRET: 'c'.repeat(32),
  ADMIN_EMAIL: 'moiz@example.com', ADMIN_PASSWORD_HASH: 'x',
  APP_URL: 'https://qalandarana.vercel.app', FAMILY_PASSPHRASE: 'x', PUBLIC_MODE: 'false',
}

beforeEach(() => { _resetEnvCache(); for (const k of Object.keys(VALID)) delete process.env[k] })

describe('getEnv', () => {
  it('throws naming every missing var', () => {
    process.env.DATABASE_URL = VALID.DATABASE_URL
    expect(() => getEnv()).toThrowError(/TELEGRAM_BOT_TOKEN/)
    expect(() => getEnv()).toThrowError(/ANTHROPIC_API_KEY/)
  })
  it('parses a valid environment', () => {
    Object.assign(process.env, VALID)
    const env = getEnv()
    expect(env.STRUCTURER_PROVIDER).toBe('claude')
    expect(env.TELEGRAM_ALLOWED_USER_IDS).toEqual([111, 222])
  })
  it('rejects unknown STRUCTURER_PROVIDER', () => {
    Object.assign(process.env, VALID, { STRUCTURER_PROVIDER: 'gemini' })
    expect(() => getEnv()).toThrowError(/STRUCTURER_PROVIDER/)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { getEnv, _resetEnvCache } from './env'
import { VALID_ENV as VALID } from './test-fixtures'

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
  it('rejects a non-numeric TELEGRAM_ADMIN_CHAT_ID', () => {
    Object.assign(process.env, VALID, { TELEGRAM_ADMIN_CHAT_ID: '@moizbuilds' })
    expect(() => getEnv()).toThrowError(/TELEGRAM_ADMIN_CHAT_ID/)
  })
  it('accepts a negative TELEGRAM_ADMIN_CHAT_ID (group/channel ids are negative)', () => {
    Object.assign(process.env, VALID, { TELEGRAM_ADMIN_CHAT_ID: '-1001234567890' })
    expect(getEnv().TELEGRAM_ADMIN_CHAT_ID).toBe('-1001234567890')
  })
})

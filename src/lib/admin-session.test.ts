// admin-session.test.ts — the TDD core of Task 13 (admin auth).
//
// The session library is the trust boundary: it mints a signed JWT for a
// logged-in admin and, crucially, decides whether an INCOMING cookie is
// genuine. A cookie is attacker-controlled, so verification must reject
// anything it can't cryptographically vouch for — tampered, expired, or plain
// garbage — and it must do so by returning null, never by throwing (a thrown
// error in the proxy/boundary layer would crash the request instead of just
// bouncing the visitor to /login).
//
// These four cases pin exactly that contract. The login page, action, and proxy
// are deliberately NOT unit-tested here (they're thin glue; Task 15 drives the
// real flow with Playwright) — this file is where the security-critical logic lives.

import { describe, it, expect, beforeEach } from 'vitest'
import { applyValidEnv } from './test-fixtures'
import { createSessionJwt, verifySessionJwt } from './admin-session'

// applyValidEnv() loads a complete, valid env (including AUTH_SECRET) and clears
// getEnv()'s cache, so each case signs/verifies against a known secret.
beforeEach(() => {
  applyValidEnv()
})

describe('admin session JWT', () => {
  it('round-trips: a freshly signed token verifies back to its email', async () => {
    const token = await createSessionJwt('moiz@example.com')
    expect(await verifySessionJwt(token)).toBe('moiz@example.com')
  })

  it('returns null for a tampered token', async () => {
    const token = await createSessionJwt('moiz@example.com')
    // Flip the last character of the signature segment — any change breaks the
    // HMAC, so verification must fail rather than trust the altered payload.
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(await verifySessionJwt(tampered)).toBeNull()
  })

  it('returns null for an expired token', async () => {
    // Sign with an exp already in the past (test-only opts param) so jose's
    // built-in expiry check rejects it.
    const token = await createSessionJwt('moiz@example.com', {
      expiresAt: new Date(Date.now() - 1000),
    })
    expect(await verifySessionJwt(token)).toBeNull()
  })

  it('returns null for a garbage string', async () => {
    expect(await verifySessionJwt('not-a-jwt')).toBeNull()
  })
})

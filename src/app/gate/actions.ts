// actions.ts — the server handler for the family gate.
//
// One shared passphrase, checked in constant time, exchanged for a signed
// 90-day cookie. On success the visitor is sent to the journey; on any failure
// they see one generic message.
'use server'

import { createHash, timingSafeEqual } from 'node:crypto'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getEnv } from '@/lib/env'
import { createFamilyJwt } from '@/lib/family-session'

export type GateState = { error: string } | null

const GENERIC_ERROR = 'That’s not the phrase. Try again.'

// Compare two secrets without leaking their length or first-difference position
// through timing. We hash both to a fixed 32 bytes first so timingSafeEqual
// (which requires equal-length buffers) always gets matching sizes.
//
// CONCEPT: timing attack — a naive `a === b` on strings can return faster when
// the first characters already differ, which over many tries leaks the secret.
// Hashing to equal length + timingSafeEqual removes both the length and the
// early-exit signals.
function passphraseMatches(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function enterGate(
  _prevState: GateState,
  formData: FormData,
): Promise<GateState> {
  const passphrase = formData.get('passphrase')

  // Presence + type guard, server-side (never trust the client's `required`).
  if (typeof passphrase !== 'string' || !passphrase) {
    return { error: GENERIC_ERROR }
  }

  if (!passphraseMatches(passphrase, getEnv().FAMILY_PASSPHRASE)) {
    // Never log the attempt — a leaked log line is a leaked passphrase.
    return { error: GENERIC_ERROR }
  }

  const token = await createFamilyJwt()
  const cookieStore = await cookies()
  cookieStore.set('qalandarana_family', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 90 * 24 * 60 * 60, // 90 days, matches the JWT's exp
  })

  redirect('/journey')
}

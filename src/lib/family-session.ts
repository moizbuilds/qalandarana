// family-session.ts — the gate cookie for the family archive.
//
// Phase 1 has no public gate; Phase 2 adds a shared-passphrase threshold in
// front of the journey while the archive is family-only. This is a LOWER bar
// than admin auth by design: there is no per-person identity, just one shared
// secret the family knows, so a valid token carries no subject — only the fact
// that someone passed the gate.
//
// CONCEPT: same JWT mechanism as admin-session (HMAC-signed with AUTH_SECRET so
// the cookie can't be forged), but the "claim" is simply presence. When the
// archive goes public (PUBLIC_MODE=true), the proxy skips this gate entirely.
import { SignJWT, jwtVerify } from 'jose'
import { getEnv } from './env'

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET)
}

const ALG = 'HS256'
const SUBJECT = 'family' // fixed — there is no per-person family identity

// Mint a 90-day gate token. The family types the passphrase rarely, so the
// window is generous; it's a threshold, not a security-critical login.
export async function createFamilyJwt(opts?: { expiresAt?: Date }): Promise<string> {
  const expiresAt = opts?.expiresAt ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  return new SignJWT()
    .setProtectedHeader({ alg: ALG })
    .setSubject(SUBJECT)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey())
}

// True only for a signature-valid, unexpired token minted by createFamilyJwt.
// Never throws — the proxy only asks "passed the gate or not?"
export async function verifyFamilyJwt(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] })
    return payload.sub === SUBJECT
  } catch {
    return false
  }
}

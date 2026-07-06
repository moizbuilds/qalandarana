// admin-session.ts — the cryptographic trust boundary for the admin workbench.
//
// One job, two directions:
//   - createSessionJwt(email) mints a signed token that proves "this browser is
//     the admin", which the login action stores in an httpOnly cookie.
//   - verifySessionJwt(token) is the gatekeeper: it takes the cookie value BACK
//     off an incoming request and decides whether to trust it. Because a cookie
//     is fully attacker-controlled, this function trusts nothing it can't verify
//     with the secret, and it NEVER throws — any failure just returns null so the
//     proxy layer can quietly bounce the visitor to /login.
//
// CONCEPT: a JWT ("JSON Web Token") is a string with three dot-separated parts —
// header.payload.signature. The payload is readable by anyone (it's just base64,
// not encrypted), so a JWT is NOT for hiding data. Its value is the signature:
// an HMAC computed over header+payload using AUTH_SECRET. Without the secret you
// cannot forge a valid signature, so the server can hand a token to the browser,
// get it back later, and know it wasn't altered. The naive alternative — storing
// the raw email in a plain cookie — would let anyone edit the cookie to any email
// and walk straight in.
import { SignJWT, jwtVerify } from 'jose'
import { getEnv } from './env'

// jose works with raw bytes, not the string secret. We encode AUTH_SECRET once
// per call (it's cheap) rather than caching, keeping this module free of hidden
// module-level state — matters because the proxy layer may run it per request.
function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET)
}

// HS256 = HMAC-SHA256, the symmetric algorithm keyed by AUTH_SECRET. We pin it
// explicitly on BOTH sign and verify: pinning on verify is a security must, so a
// forged token can't downgrade to "alg: none" and skip signature checking.
const ALG = 'HS256'

// Mint a 7-day session token for a logged-in admin. The email rides in the
// standard `sub` (subject) claim, and jose stamps `exp` from expiresAt.
//
// The `opts` param is TEST-ONLY: production always calls createSessionJwt(email)
// and gets the default 7-day expiry. Tests pass a past expiresAt to forge an
// already-expired token so they can prove verifySessionJwt rejects it.
export async function createSessionJwt(
  email: string,
  opts?: { expiresAt?: Date },
): Promise<string> {
  const expiresAt =
    opts?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return new SignJWT()
    .setProtectedHeader({ alg: ALG })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey())
}

// The gatekeeper. Returns the admin's email on a valid token, or null on ANY
// failure — bad signature, expired, malformed, wrong algorithm, empty string.
// jwtVerify THROWS on all of those, so we catch and normalize to null: callers
// (the proxy) only ever ask "trusted or not?", and a redirect is the answer to
// "not", not a 500.
export async function verifySessionJwt(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALG], // reject anything not HS256 (blocks alg-confusion forgery)
    })
    // A signature-valid token with no subject is still not a usable session.
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

// require-admin.ts — the per-action authentication re-check for the admin workbench.
//
// The proxy (src/proxy.ts) already turns away visitors with no valid session
// cookie, but that is a COARSE first filter only. Next 16's proxy runs before a
// route renders and checks just the cookie signature — it does not (and should
// not) hit the database on every request. So the real trust decision has to be
// made AGAIN inside every server action that mutates data. This function is that
// second gate.
//
// CONCEPT: "defense in depth" — never rely on a single upstream check to protect
// a sensitive operation. If the proxy config regressed (a bad matcher, a renamed
// path), or a future server action got wired up in a way that bypasses the proxy
// entirely, this re-check is what still stops an unauthenticated write. Each
// action calls requireAdmin() FIRST, before it reads or writes anything.
import { cookies } from 'next/headers'
import { verifySessionJwt } from './admin-session'

// Read the session cookie, verify its signature, and return the admin's email —
// or throw 'Unauthorized' on any failure (missing/tampered/expired token). We
// throw rather than return null so a caller can't accidentally proceed by
// forgetting to check a nullable return; an unhandled throw fails the action.
//
// CONCEPT: in Next 16 `cookies()` is async (it returns a Promise), so we await
// it before reading the cookie value.
export async function requireAdmin(): Promise<string> {
  const cookieStore = await cookies()
  const token = cookieStore.get('qalandarana_admin')?.value
  const email = token ? await verifySessionJwt(token) : null
  if (!email) throw new Error('Unauthorized')
  return email
}

// proxy.ts — the gate in front of the admin workbench.
//
// It runs before any /admin route renders: it reads the session cookie, verifies
// the JWT, and redirects unauthenticated visitors to /admin/login. The login
// page itself is allowed through (else you could never reach the form).
//
// FILE NAME NOTE: in older Next this file was `middleware.ts` with an exported
// `middleware` function. As of Next 16 that convention is DEPRECATED and renamed
// to `proxy` (a proxy.ts at the src/ root, exporting `proxy`). AGENTS.md tells us
// to heed deprecation notices, so we use the current name. Behavior is the same.
//
// CONCEPT: this layer is a coarse FIRST filter, not the whole security story. It
// only checks the cookie's signature — it does NOT hit the database. Two reasons:
// (1) keep it fast, since it runs on every matched request; (2) the real pages/
// actions behind it re-check auth themselves, so a valid-but-revoked session is
// caught there. The proxy just turns away the obviously-unauthenticated early.
// Deliberately no db/bcrypt imports here.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionJwt } from '@/lib/admin-session'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The login page must stay reachable without a session, or there's no way in.
  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  // The cookie is attacker-controlled, so its presence proves nothing — only a
  // successful signature check does. verifySessionJwt returns null on missing,
  // tampered, expired, or garbage tokens; all of those mean "not signed in".
  const token = request.cookies.get('qalandarana_admin')?.value
  const email = token ? await verifySessionJwt(token) : null

  if (!email) {
    return NextResponse.redirect(new URL('/admin/login', request.nextUrl))
  }

  return NextResponse.next()
}

// Only run on /admin and everything beneath it — the workbench. Public pages,
// the review link, and API routes are untouched.
export const config = {
  matcher: ['/admin/:path*'],
}

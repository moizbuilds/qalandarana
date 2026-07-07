// proxy.ts — the gate in front of BOTH the admin workbench and (while the
// archive is family-only) the public journey.
//
// Two independent gates, chosen by path:
//   - /admin/*      → admin session cookie, else /admin/login
//   - /journey,     → family passphrase cookie, else /gate
//     /entry/*,        ...unless PUBLIC_MODE=true, when the whole family gate
//     /poets/*         is lifted and these become open to the world.
//
// Deliberately NOT gated: /gate and /admin/login (you must be able to reach the
// forms), /review/[token] (father's tokenized link needs no login), and /api/*
// (the Telegram webhook). Those simply aren't in the matcher below.
//
// FILE NAME NOTE: Next 16 renamed the `middleware` convention to `proxy`
// (proxy.ts at src/ root, exporting `proxy`); AGENTS.md says heed deprecations.
//
// CONCEPT: this layer is a coarse FIRST filter — it only checks a cookie's
// signature, never the database, so it stays fast and imports no db/bcrypt. The
// pages and actions behind it re-check auth themselves.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionJwt } from '@/lib/admin-session'
import { verifyFamilyJwt } from '@/lib/family-session'
import { getEnv } from '@/lib/env'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- Admin gate ---
  if (pathname.startsWith('/admin')) {
    // The login page must stay reachable without a session.
    if (pathname === '/admin/login') return NextResponse.next()

    const token = request.cookies.get('qalandarana_admin')?.value
    const email = token ? await verifySessionJwt(token) : null
    if (!email) {
      return NextResponse.redirect(new URL('/admin/login', request.nextUrl))
    }
    return NextResponse.next()
  }

  // --- Family gate (public journey while private) ---
  // When the archive goes public, the passphrase is lifted with one env flip.
  if (getEnv().PUBLIC_MODE === 'true') return NextResponse.next()

  const token = request.cookies.get('qalandarana_family')?.value
  const passed = token ? await verifyFamilyJwt(token) : false
  if (!passed) {
    return NextResponse.redirect(new URL('/gate', request.nextUrl))
  }
  return NextResponse.next()
}

// The admin workbench AND the public reading surfaces. Everything else — /gate,
// /review/[token], /api/* — is intentionally left open here and guarded (or not)
// by its own logic.
export const config = {
  matcher: ['/admin/:path*', '/journey', '/entry/:path*', '/poets/:path*'],
}

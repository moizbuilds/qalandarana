// actions.ts — the server-side login handler for the admin workbench.
//
// This is the ONE place a password is ever checked. The form in page.tsx posts
// straight here (no API route, no fetch). On success it plants the signed
// session cookie and redirects to /admin; on any failure it returns a single
// generic message that the form re-renders.
//
// CONCEPT: a Server Action is a function marked 'use server' that a <form> can
// call directly. Next compiles it into a POST endpoint and wires the form's
// submit to it, so we get a server round-trip with no client-side JS plumbing.
'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { admins } from '@/lib/schema'
import { createSessionJwt } from '@/lib/admin-session'

// The action returns this shape so the form (via useActionState) can show an
// error. There is intentionally only ONE error string, never a field-specific
// one — see the generic-error note below.
export type LoginState = { error: string } | null

// A real-looking but useless bcrypt hash. When the email matches no admin row we
// still run bcrypt.compare against THIS, so a request for a non-existent account
// takes the same time as one for a real account with a wrong password.
//
// CONCEPT: timing attack — if "no such user" returned instantly but "wrong
// password" took ~100ms (bcrypt is deliberately slow), an attacker could measure
// response time to discover which emails are real accounts. Doing equal work in
// both branches closes that side channel. Real, well-formed bcrypt hash (cost
// 10) so the compare does its full slow work; the plaintext behind it is unused.
const DUMMY_HASH = '$2b$10$mqEJDAICe9MMxEUEZ6wvgeZupJ4lgL0LotiZbOm0qGCkEYAaZwH0y'

// The one message the user ever sees on failure. It never reveals WHICH part was
// wrong (unknown email vs. bad password vs. empty field) — telling an attacker
// "that email exists, wrong password" is a free account-enumeration oracle.
const GENERIC_ERROR = 'Incorrect email or password.'

// login(prevState, formData) — useActionState-compatible signature. prevState is
// the previous LoginState (unused here; React passes it automatically). We read
// the two fields, validate presence SERVER-side (never trust the client's
// `required` attribute), verify the password, and either set the cookie +
// redirect or return the generic error.
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get('email')
  const password = formData.get('password')

  // Presence + type guard. `formData.get` returns string | File | null, so we
  // check for actual non-empty strings. Bailing here also means we never call
  // bcrypt.compare(undefined, ...), which would throw. Empty input → same
  // generic error, no hint that the fields were simply blank.
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return { error: GENERIC_ERROR }
  }

  // Look up the single admin by email. If none, we deliberately fall through to
  // a dummy compare below rather than returning early (constant-time behavior).
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1)

  const passwordOk = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH)

  // Only a real, matching admin gets in. `admin &&` guards the case where the
  // dummy compare somehow returned true for a missing row (it can't for a random
  // password, but the guard makes the invariant explicit and safe).
  if (!admin || !passwordOk) {
    // NOTE: we never log `password` or `admin.passwordHash` — a leaked log line
    // is a leaked credential.
    return { error: GENERIC_ERROR }
  }

  // Success: mint the session and store it httpOnly so client JS can't read it.
  const token = await createSessionJwt(admin.email)
  const cookieStore = await cookies()
  cookieStore.set('qalandarana_admin', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // http on localhost, https in prod
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days, matches the JWT's exp
  })

  // redirect() throws a special control-flow signal Next catches, so nothing
  // after it runs. It must live OUTSIDE the try-free path above with no catch
  // swallowing it — here it's top-level, so it propagates correctly.
  redirect('/admin')
}

// page.tsx — the admin login screen. The only unauthenticated page under
// /admin; the proxy (src/proxy.ts) lets this one through and gates everything
// else. It's a plain email + password form that posts to the login server action.
//
// CONCEPT: 'use client' marks this a Client Component — it runs in the browser,
// which is required to use the useActionState hook (hooks need React's client
// runtime). The action it calls, though, still executes on the server.
//
// Phase 1 styling is deliberately plain; clarity is the design. Phase 2 restyles.
'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'

export default function AdminLoginPage() {
  // CONCEPT: useActionState wires a server action to a form and hands back the
  // action's latest return value (`state`) plus a `formAction` to put on the
  // form. When the action returns { error }, that shows up in `state` and the
  // page re-renders with the message — no manual fetch/state plumbing. `pending`
  // is true while the action is in flight, so we can disable the button.
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-semibold">Admin sign in</h1>
      <form action={formAction} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="w-full rounded border border-gray-300 p-3"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded border border-gray-300 p-3"
          />
        </div>
        {/* One generic message for every failure — never reveals which field was wrong. */}
        {state?.error ? (
          <p role="alert" className="text-sm text-red-700">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-black p-3 text-white disabled:opacity-50"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

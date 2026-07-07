// gate/page.tsx — the threshold. While the archive is family-only, this is the
// first thing a visitor meets: the khatam mark, one line of Bulleh Shah, and a
// single passphrase field styled as a ruled manuscript line. A threshold, not a
// form. When PUBLIC_MODE=true the proxy stops routing here at all.
'use client'

import { useActionState } from 'react'
import { enterGate, type GateState } from './actions'
import { Khatam } from '@/components/ornament/Khatam'

export default function GatePage() {
  // CONCEPT: useActionState wires a <form> to a Server Action and hands back the
  // action's returned value (here, an optional error) plus a pending flag — no
  // manual fetch, no client-side state plumbing.
  const [state, formAction, pending] = useActionState<GateState, FormData>(enterGate, null)

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <Khatam size={44} className="animate-breathe text-gold" />

        <div className="space-y-3">
          <p className="urdu" style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)' }}>
            علموں بس کریں او یار
          </p>
          <p className="whisper" style={{ fontSize: '1rem' }}>
            Enough of learning, my friend
          </p>
        </div>

        <form action={formAction} className="w-full space-y-6">
          <div className="space-y-2">
            <label htmlFor="passphrase" className="eyebrow block text-gold" style={{ opacity: 0.7 }}>
              The family phrase
            </label>
            <input
              id="passphrase"
              name="passphrase"
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              required
              aria-describedby={state?.error ? 'gate-error' : undefined}
              className="w-full bg-transparent pb-2 text-center font-body text-lg text-ivory outline-none"
              style={{
                border: 'none',
                borderBottom: '1px solid color-mix(in srgb, var(--gold) 45%, transparent)',
                borderRadius: 0,
              }}
            />
          </div>

          {state?.error ? (
            <p id="gate-error" role="alert" className="font-body text-sm" style={{ color: 'var(--gold)' }}>
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="eyebrow text-gold transition-opacity disabled:opacity-40"
          >
            {pending ? 'Entering…' : 'Enter →'}
          </button>
        </form>
      </div>
    </main>
  )
}

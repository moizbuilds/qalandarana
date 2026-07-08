// A submit button that actually feels clicked: it presses in on tap and shows a
// live "Saving…/Publishing…" label while the server action runs.
//
// CONCEPT: useFormStatus reads the pending state of the <form> this button sits
// inside, with zero wiring — no useState, no prop threading. It only works in a
// CLIENT component rendered inside the form, which is the whole reason this file
// is its own 'use client' island in an otherwise server-rendered admin page.
'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({
  children,
  pendingLabel,
  className = '',
}: {
  children: React.ReactNode
  pendingLabel?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        'rounded px-4 py-2 text-white transition-transform duration-75 ' +
        'hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ' +
        className
      }
    >
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  )
}

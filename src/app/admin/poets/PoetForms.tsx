// Client forms for poet management. Kept out of the page so the page can stay a
// server component; these need useActionState for inline error/success feedback.
'use client'

import { useActionState } from 'react'
import { createPoet, updatePoet, type PoetFormState } from './actions'

type Poet = { id: string; nameEnglish: string; nameOriginal: string; era: string; bio: string; count: number }

const inputClass = 'w-full rounded border border-gray-300 p-2 text-sm'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

function Fields({ poet }: { poet?: Poet }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Name (English)</span>
        <input name="nameEnglish" defaultValue={poet?.nameEnglish} required className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Name (original script)</span>
        <input name="nameOriginal" defaultValue={poet?.nameOriginal} dir="rtl" required className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Era</span>
        <input name="era" defaultValue={poet?.era} placeholder="1680–1757" required className={inputClass} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Life (one line)</span>
        <textarea name="bio" defaultValue={poet?.bio} rows={2} required className={inputClass} />
      </label>
    </div>
  )
}

function Feedback({ state }: { state: PoetFormState }) {
  if (!state) return null
  if ('ok' in state) return <p className="text-sm text-green-700">Saved.</p>
  return <p className="text-sm text-red-700">{state.error}</p>
}

export function CreatePoetForm() {
  const [state, action, pending] = useActionState<PoetFormState, FormData>(createPoet, null)
  return (
    <form action={action} className="space-y-3 rounded border border-gray-200 p-4">
      <h2 className="font-semibold">Add a poet</h2>
      <Fields />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {pending ? 'Adding…' : 'Add poet'}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  )
}

export function EditPoetForm({ poet }: { poet: Poet }) {
  // Bind the id so the action's (id, prevState, formData) matches useActionState's
  // (prevState, formData) call — the id is fixed per row, not user input.
  const [state, action, pending] = useActionState<PoetFormState, FormData>(updatePoet.bind(null, poet.id), null)
  return (
    <form action={action} className="space-y-3 rounded border border-gray-200 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">{poet.nameEnglish}</h3>
        <span className="text-xs text-gray-500">{poet.count} {poet.count === 1 ? 'entry' : 'entries'}</span>
      </div>
      <Fields poet={poet} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  )
}

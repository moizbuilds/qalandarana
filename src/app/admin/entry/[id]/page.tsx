// admin/entry/[id]/page.tsx — the workbench detail view for one entry: the
// read-only record (audio, raw transcript, provenance, status) plus the editable
// form and the status-gated action buttons.
//
// CONCEPT: server component — it awaits the entry and the poet/maqam option
// lists straight from the DB and returns finished HTML. The edit form and each
// button post to the server actions in ./actions.ts, which re-check auth
// themselves; this read-side page relies on the proxy gate for access.
//
// Phase 1 styling is deliberately plain — a utilitarian workbench by design.
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { poets, maqamat } from '@/lib/schema'
import { getEntryById } from '@/lib/entries'
import { saveEntry, retryAction, advanceAction, resendReviewAction, publishNowAction } from './actions'

// Mid-pipeline statuses that have a next stage but no other action button. The
// "Advance pipeline" button re-kicks the advance route for these (mirrors the
// server-side guard in actions.ts — one source of truth would be nice, but a
// shared const across a server-action file and a server component adds an import
// dance for a three-element list; kept in sync by the matching comment instead).
const ADVANCEABLE = ['received', 'transcribed', 'structured']

// The id comes from the URL, so it's untrusted. Postgres' uuid type throws on a
// malformed value (a 500); we validate the shape first and 404 on non-uuids.
const idSchema = z.string().uuid()

// A labelled textarea used for every editable text field. Urdu fields pass
// dir="rtl" so the original script renders right-to-left.
function Field({ name, label, value, dir, rows = 3 }: {
  name: string; label: string; value: string | null; dir?: 'rtl' | 'ltr'; rows?: number
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        id={name}
        name={name}
        dir={dir}
        rows={rows}
        defaultValue={value ?? ''}
        className="w-full rounded border border-gray-300 p-2 font-mono text-sm"
      />
    </div>
  )
}

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function AdminEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()

  // Entry plus the two option lists for the selects — fired together (independent
  // reads). poets/maqamat are ordered so the dropdowns are stable and scannable.
  const [entry, allPoets, allMaqamat] = await Promise.all([
    getEntryById(id),
    db.select().from(poets).orderBy(asc(poets.nameEnglish)),
    db.select().from(maqamat).orderBy(asc(maqamat.orderIndex)),
  ])
  if (!entry) notFound()

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <header className="space-y-1">
        <a href="/admin" className="text-sm text-blue-700 underline">← All entries</a>
        <h1 className="text-2xl font-semibold">{entry.title ?? '—'}</h1>
      </header>

      {/* ── Read-only record ─────────────────────────────────────────────── */}
      <section className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
          <span>Status: <strong className="text-gray-900">{entry.status}</strong></span>
          {entry.failedAtStage ? <span>Failed at: <strong className="text-red-700">{entry.failedAtStage}</strong></span> : null}
          <span>Telegram msg: {entry.telegramMessageId}</span>
          <span>Chat: {entry.telegramChatId}</span>
        </div>
        {entry.errorMessage ? (
          <p className="rounded bg-red-50 p-2 text-sm text-red-700">{entry.errorMessage}</p>
        ) : null}
        <audio controls src={entry.audioUrl} className="w-full" preload="metadata" />
        <details>
          <summary className="cursor-pointer text-sm font-medium text-gray-700">Raw transcript</summary>
          <p className="mt-2 whitespace-pre-wrap rounded border border-gray-200 bg-white p-3 text-sm">
            {entry.rawTranscript ?? '(none)'}
          </p>
        </details>
      </section>

      {/* ── Editable form ────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Edit</h2>
        <form action={saveEntry.bind(null, id)} className="space-y-4">
          <Field name="title" label="Title" value={entry.title} rows={1} />
          <Field name="kalamOriginal" label="Kalam (Urdu)" value={entry.kalamOriginal} dir="rtl" rows={4} />
          <Field name="kalamRoman" label="Kalam (Roman)" value={entry.kalamRoman} rows={4} />
          <Field name="kalamEnglish" label="Kalam (English)" value={entry.kalamEnglish} rows={4} />
          <Field name="explanationOriginal" label="Explanation (Urdu)" value={entry.explanationOriginal} dir="rtl" rows={5} />
          <Field name="explanationEnglish" label="Explanation (English)" value={entry.explanationEnglish} rows={5} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="poetId" className="block text-sm font-medium text-gray-700">Poet</label>
              <select id="poetId" name="poetId" defaultValue={entry.poetId ?? ''} className="w-full rounded border border-gray-300 p-2">
                <option value="">—</option>
                {allPoets.map((p) => <option key={p.id} value={p.id}>{p.nameEnglish}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="maqamId" className="block text-sm font-medium text-gray-700">Maqam</label>
              <select id="maqamId" name="maqamId" defaultValue={entry.maqamId ?? ''} className="w-full rounded border border-gray-300 p-2">
                <option value="">—</option>
                {allMaqamat.map((m) => <option key={m.id} value={m.id}>{m.nameEnglish}</option>)}
              </select>
            </div>
          </div>

          <button type="submit" className="rounded bg-black px-4 py-2 text-white">Save changes</button>
        </form>
      </section>

      {/* ── Status actions ───────────────────────────────────────────────── */}
      {/* Each button is its own <form> because it posts to a different action.
          They appear ONLY for the statuses where they're legal, mirroring the
          server-side status guards in actions.ts. */}
      <section className="flex flex-wrap gap-3 border-t border-gray-200 pt-6">
        {entry.status === 'failed' ? (
          <form action={retryAction.bind(null, id)}>
            <button className="rounded bg-amber-600 px-4 py-2 text-white">Retry</button>
          </form>
        ) : null}
        {ADVANCEABLE.includes(entry.status) ? (
          <form action={advanceAction.bind(null, id)}>
            <button className="rounded bg-indigo-600 px-4 py-2 text-white">Advance pipeline</button>
          </form>
        ) : null}
        {entry.status === 'needs_fix' ? (
          <form action={resendReviewAction.bind(null, id)}>
            <button className="rounded bg-blue-700 px-4 py-2 text-white">Resend review link</button>
          </form>
        ) : null}
        {entry.status === 'in_review' || entry.status === 'needs_fix' ? (
          <form action={publishNowAction.bind(null, id)}>
            <button className="rounded bg-green-700 px-4 py-2 text-white">Publish now</button>
          </form>
        ) : null}
      </section>
    </main>
  )
}

// page.tsx — Father's review screen. Reached only via the secret link the bot
// sends him in Telegram; the unguessable token in the URL is the only "auth".
//
// This is a server component: it runs on the server, awaits the entry straight
// from the repository, and streams finished HTML. No client JS, no loading
// spinner — the whole page arrives rendered.
//
// CONCEPT: dynamic route segment — the folder name `[token]` captures whatever
// is in that URL position, and Next hands it to us via `params`. In Next 16
// `params` is a Promise, so we await it before reading `token`.
//
// Phase 1 styling is deliberately plain; clarity is the design. Phase 2 restyles.
import { notFound } from 'next/navigation'
import { getEntryByReviewToken } from '@/lib/entries'
import { approveEntry, flagEntry } from './actions'

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const entry = await getEntryByReviewToken(token)
  if (!entry) notFound()
  const published = entry.status === 'published'
  return (
    <main className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">{entry.title ?? 'Untitled'}</h1>
      <audio controls src={entry.audioUrl} className="w-full" preload="metadata" />
      <section dir="rtl" className="text-2xl leading-loose whitespace-pre-line">{entry.kalamOriginal}</section>
      <section className="italic whitespace-pre-line">{entry.kalamRoman}</section>
      <section className="whitespace-pre-line">{entry.kalamEnglish}</section>
      {entry.corrections?.length ? (
        <section className="rounded border border-amber-400 bg-amber-50 p-4 space-y-1">
          <h2 className="font-semibold">Corrections made to the verses — please check</h2>
          {entry.corrections.map((c, i) => (
            <p key={i} dir="rtl"><s>{c.heard}</s> ← {c.restored}</p>
          ))}
        </section>
      ) : null}
      <section dir="rtl" className="leading-loose whitespace-pre-line">{entry.explanationOriginal}</section>
      <section className="whitespace-pre-line">{entry.explanationEnglish}</section>
      {published ? (
        <p className="text-green-700 font-semibold">✓ Published</p>
      ) : (
        <div className="flex gap-4">
          <form action={approveEntry.bind(null, token)} className="flex-1">
            <button className="w-full rounded bg-green-700 p-4 text-white text-lg">Approve &amp; publish</button>
          </form>
          <form action={flagEntry.bind(null, token)} className="flex-1">
            <button className="w-full rounded bg-red-700 p-4 text-white text-lg">Something’s wrong</button>
          </form>
        </div>
      )}
    </main>
  )
}

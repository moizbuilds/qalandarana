// entry/[id]/page.tsx — the public reading page for a single published entry:
// audio, the three kalam layers (Urdu / Roman / English), the explanation, and
// who wrote it. Only PUBLISHED entries are visible here; anything else 404s.
//
// CONCEPT: a server component fetches on the server. It awaits the entry, the
// poet, and the maqam directly from the database and returns finished HTML —
// no client-side data fetching. CONCEPT: notFound() throws a special signal
// that makes Next render the nearest 404 page instead of this one; we use it
// for missing, unpublished, or malformed-id requests.
//
// CONCEPT: dynamic route segment — the folder `[id]` captures the id from the
// URL. In Next 16 `params` is a Promise, so we await it before reading `id`.
//
// Phase 1 styling is deliberately plain; Phase 2 restyles.
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { poets, maqamat } from '@/lib/schema'
import { getEntryById } from '@/lib/entries'

// The id comes from the URL, so it's untrusted. Postgres' uuid type throws on a
// malformed value — that would surface as a 500. We validate the shape FIRST and
// 404 on anything that isn't a uuid, so a garbage id can never reach the query.
const idSchema = z.string().uuid()

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()

  const entry = await getEntryById(id)
  // Guard both existence AND status here: the public page must never leak an
  // entry that's still mid-pipeline. Anything not 'published' is a 404.
  if (!entry || entry.status !== 'published') notFound()

  // Poet and maqam are one-off reads for this page, so we query them directly
  // rather than growing the entries repository with lookups nothing else needs.
  // Both fire together; both tolerate a null foreign key with a fallback.
  const [poet, maqam] = await Promise.all([
    entry.poetId
      ? db.select().from(poets).where(eq(poets.id, entry.poetId)).limit(1).then((r) => r[0])
      : undefined,
    entry.maqamId
      ? db.select().from(maqamat).where(eq(maqamat.id, entry.maqamId)).limit(1).then((r) => r[0])
      : undefined,
  ])

  return (
    <main className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">{entry.title ?? 'Untitled'}</h1>

      <audio controls src={entry.audioUrl} className="w-full" preload="metadata" />

      <section dir="rtl" lang="ur" className="text-2xl leading-loose whitespace-pre-line">
        {entry.kalamOriginal}
      </section>
      <section className="italic whitespace-pre-line">{entry.kalamRoman}</section>
      <section className="whitespace-pre-line">{entry.kalamEnglish}</section>

      <section dir="rtl" lang="ur" className="leading-loose whitespace-pre-line">
        {entry.explanationOriginal}
      </section>
      <section className="whitespace-pre-line">{entry.explanationEnglish}</section>

      <footer className="border-t border-zinc-200 pt-4 text-zinc-600 space-y-1">
        <p>{poet ? `${poet.nameEnglish} · ${poet.era}` : 'Unknown'}</p>
        {maqam ? <p>{maqam.nameEnglish}</p> : null}
      </footer>
    </main>
  )
}

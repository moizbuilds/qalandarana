// journey/page.tsx — the public journey: Attar's seven valleys (maqamat) in
// order, each showing its published entries as links. This is the heart of the
// public site.
//
// CONCEPT: server components fetch on the server. This function is `async` and
// awaits the database directly — there is no useEffect/useState/fetch dance and
// no loading spinner. React renders it to finished HTML on the server and sends
// that; the browser gets a complete page.
//
// Phase 1 styling is deliberately plain — clarity is the only goal. Phase 2
// restyles this into the full "Night Journey" design.
import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { maqamat, poets } from '@/lib/schema'
import { listPublishedByMaqam } from '@/lib/entries'
import { formatDuration } from '@/lib/format'
import type { Entry } from '@/lib/schema'

// A published maqam row can carry no entries; we still want to show the valley
// with a quiet placeholder, so the render loop tolerates an empty list.

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function JourneyPage() {
  // Three reads, fired together — they don't depend on each other, so we await
  // them as one Promise.all rather than one-after-another (fewer round trips).
  const [valleys, byMaqam, allPoets] = await Promise.all([
    db.select().from(maqamat).orderBy(asc(maqamat.orderIndex)),
    listPublishedByMaqam(),
    db.select().from(poets),
  ])

  // A lookup from poetId → English name, built once so each entry render is a
  // cheap map read instead of another query. Entries with no poet fall back to
  // a plain 'Unknown' at render time.
  const poetName = new Map(allPoets.map((p) => [p.id, p.nameEnglish]))

  // Entries whose maqam is still null land under the 'unassigned' key; we only
  // render that final "Unplaced" section if at least one such entry exists.
  const unplaced = byMaqam.get('unassigned') ?? []

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-12">
      <h1 className="text-3xl font-semibold">The Journey</h1>

      {valleys.map((valley) => {
        const valleyEntries = byMaqam.get(valley.id) ?? []
        return (
          <section key={valley.id} className="space-y-4">
            <header className="space-y-1">
              <h2 className="text-2xl" dir="rtl" lang="ur">{valley.nameOriginal}</h2>
              <p className="text-lg text-zinc-600">{valley.nameEnglish}</p>
              <p className="text-zinc-500">{valley.description}</p>
            </header>
            <EntryList entries={valleyEntries} poetName={poetName} />
          </section>
        )
      })}

      {unplaced.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-2xl">Unplaced</h2>
          <EntryList entries={unplaced} poetName={poetName} />
        </section>
      ) : null}
    </main>
  )
}

// One valley's list of entries (or a quiet note when the valley is empty).
// Extracted so the maqam loop and the "Unplaced" section render entries the
// same way — one source of truth for what an entry link looks like.
function EntryList({ entries, poetName }: { entries: Entry[]; poetName: Map<string, string> }) {
  if (entries.length === 0) {
    return <p className="text-zinc-400 italic">No entries yet</p>
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link href={`/entry/${entry.id}`} className="text-blue-700 underline">
            {entry.title ?? 'Untitled'}
          </Link>
          <span className="text-zinc-500">
            {' — '}
            {entry.poetId ? poetName.get(entry.poetId) ?? 'Unknown' : 'Unknown'}
            {' · '}
            {formatDuration(entry.durationSec)}
          </span>
        </li>
      ))}
    </ul>
  )
}

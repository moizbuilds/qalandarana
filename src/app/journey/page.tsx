// The Journey — the heart of the public site and its signature. Attar's seven
// valleys become full-viewport stations along the silsila thread; the page
// background transmutes valley by valley as the seeker scrolls, ending in the
// light of Fana. Entries hang beside each station as hairline rows, never cards.
//
// CONCEPT: this is a server component — it awaits the database directly and
// renders finished HTML. Only the two interactive pieces (the observer that
// drives the color pilgrimage, the thread that draws itself in) are client
// components, kept as small as possible.
import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { maqamat, poets } from '@/lib/schema'
import { listPublishedByMaqam } from '@/lib/entries'
import { formatDuration } from '@/lib/format'
import type { Entry } from '@/lib/schema'
import { PilgrimageObserver } from '@/components/journey/PilgrimageObserver'
import { SilsilaThread } from '@/components/journey/SilsilaThread'
import { Lamp } from '@/components/ornament/Lamp'
import { Khatam } from '@/components/ornament/Khatam'

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function JourneyPage() {
  const [valleys, byMaqam, allPoets] = await Promise.all([
    db.select().from(maqamat).orderBy(asc(maqamat.orderIndex)),
    listPublishedByMaqam(),
    db.select().from(poets),
  ])

  const poetName = new Map(allPoets.map((p) => [p.id, p.nameEnglish]))
  const unplaced = byMaqam.get('unassigned') ?? []

  return (
    <>
      <PilgrimageObserver />
      <main
        className="relative"
        style={{ ['--thread-x' as string]: 'clamp(1.25rem, 8vw, 7rem)' }}
      >
        <SilsilaThread />

        {/* The gateway crown of the scroll — the mark and the invitation. */}
        <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
          <Khatam size={40} className="text-gold" />
          <p className="eyebrow text-gold">The Seven Valleys</p>
          <h1 className="font-display text-ivory" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 500, lineHeight: 1.1 }}>
            A journey through the kalam
          </h1>
          <p className="font-body text-ivory/70" style={{ maxWidth: '38ch', fontSize: '1.125rem' }}>
            The path from seeking to annihilation, walked one recitation at a time.
            Scroll, and the night changes around you.
          </p>
        </section>

        {valleys.map((valley, i) => {
          const valleyEntries = byMaqam.get(valley.id) ?? []
          return (
            <ValleyStation
              key={valley.id}
              slug={valley.slug}
              nameOriginal={valley.nameOriginal}
              nameEnglish={valley.nameEnglish}
              description={valley.description}
              index={i + 1}
              entries={valleyEntries}
              poetName={poetName}
            />
          )
        })}

        {unplaced.length > 0 ? (
          <ValleyStation
            slug="unplaced"
            nameOriginal="—"
            nameEnglish="Unplaced"
            description="Recitations not yet set upon the path."
            index={0}
            entries={unplaced}
            poetName={poetName}
          />
        ) : null}

        <footer className="flex flex-col items-center gap-3 px-6 py-24 text-center">
          <Khatam size={20} className="text-gold" />
          <p className="eyebrow text-gold/70">Qalandarana</p>
        </footer>
      </main>
    </>
  )
}

// One valley: a full-viewport station on the thread. The lamp sits on the thread
// at the station's vertical center (lit if father has placed any kalam here).
function ValleyStation({
  slug,
  nameOriginal,
  nameEnglish,
  description,
  index,
  entries,
  poetName,
}: {
  slug: string
  nameOriginal: string
  nameEnglish: string
  description: string
  index: number
  entries: Entry[]
  poetName: Map<string, string>
}) {
  const lit = entries.length > 0
  return (
    <section
      data-valley-section={slug}
      className="relative flex min-h-screen flex-col justify-center py-24"
      style={{ paddingLeft: 'calc(var(--thread-x) + clamp(1.5rem, 5vw, 4rem))', paddingRight: 'clamp(1.5rem, 5vw, 4rem)' }}
    >
      {/* the lamp, centered on the thread line */}
      <span
        className="absolute"
        style={{ left: 'var(--thread-x)', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <Lamp lit={lit} size={16} />
      </span>

      <div className="max-w-2xl">
        {index > 0 ? (
          <p className="eyebrow mb-4" style={{ opacity: 0.55 }}>
            {romanNumeral(index)} of the valleys
          </p>
        ) : null}
        <h2 className="urdu" style={{ fontSize: 'clamp(2.75rem, 6vw, 4.5rem)', lineHeight: 2.1 }}>
          {nameOriginal}
        </h2>
        <p className="font-display mt-1" style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', fontWeight: 500, letterSpacing: '-0.01em' }}>
          {nameEnglish}
        </p>
        <p className="font-body mt-4" style={{ fontSize: '1.1875rem', lineHeight: 1.75, maxWidth: '52ch', opacity: 0.85 }}>
          {description}
        </p>

        <div className="mt-10">
          {entries.length === 0 ? (
            <p className="font-body italic" style={{ opacity: 0.5 }}>
              No lamp lit here yet.
            </p>
          ) : (
            <ul>
              {entries.map((entry) => (
                <li key={entry.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--gold) 22%, transparent)' }}>
                  <Link
                    href={`/entry/${entry.id}`}
                    className="group flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <span
                      className="font-display"
                      style={{ fontSize: '1.5rem', fontWeight: 500 }}
                    >
                      <span className="bg-gradient-to-r from-current to-current bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-500 group-hover:bg-[length:100%_1px]">
                        {entry.title ?? 'Untitled'}
                      </span>
                    </span>
                    <span className="eyebrow whitespace-nowrap" style={{ opacity: 0.6 }}>
                      {entry.poetId ? poetName.get(entry.poetId) ?? 'Unknown' : 'Unknown'}
                      {'  ·  '}
                      {formatDuration(entry.durationSec)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

// Small roman numerals for the seven stations (i–vii) — the path is a sequence,
// so numbering it carries real meaning rather than decoration.
function romanNumeral(n: number): string {
  const numerals = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']
  return numerals[n] ?? String(n)
}

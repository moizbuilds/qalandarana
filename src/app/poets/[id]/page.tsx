// poets/[id]/page.tsx — one poet's room: their name, era, a short life, and
// every kalam of theirs father has recorded, as hairline rows that lead into
// the folio. Study, not journey — so no valley tint, just the night ground.
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { getPoetWithEntries } from '@/lib/entries'
import { formatDuration } from '@/lib/format'
import { Khatam } from '@/components/ornament/Khatam'
import { GoldRule } from '@/components/ornament/GoldRule'

const idSchema = z.string().uuid()

export const dynamic = 'force-dynamic'

export default async function PoetRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()

  const room = await getPoetWithEntries(id)
  if (!room) notFound()
  const { poet, entries } = room

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
      <Link href="/poets" className="eyebrow text-gold" style={{ opacity: 0.7 }}>
        ← The Poets
      </Link>

      <header className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="urdu" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)' }}>{poet.nameOriginal}</p>
        <h1 className="font-display" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 500 }}>
          {poet.nameEnglish}
        </h1>
        <p className="eyebrow text-gold" style={{ opacity: 0.8 }}>{poet.era}</p>
        <p className="font-body mt-3" style={{ fontSize: '1.1875rem', lineHeight: 1.8, opacity: 0.85, maxWidth: '52ch' }}>
          {poet.bio}
        </p>
      </header>

      <GoldRule className="my-12" />

      {entries.length === 0 ? (
        <p className="text-center font-body italic" style={{ opacity: 0.5 }}>
          No kalam of {poet.nameEnglish} recorded yet.
        </p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--gold) 22%, transparent)' }}>
              <Link href={`/entry/${entry.id}`} className="group flex items-baseline justify-between gap-6 py-5">
                <span className="font-display" style={{ fontSize: '1.5rem', fontWeight: 500 }}>
                  <span className="bg-gradient-to-r from-current to-current bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-500 group-hover:bg-[length:100%_1px]">
                    {entry.title ?? 'Untitled'}
                  </span>
                </span>
                <span className="eyebrow whitespace-nowrap" style={{ opacity: 0.6 }}>
                  {formatDuration(entry.durationSec)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-16 flex justify-center">
        <Khatam size={18} className="text-gold" />
      </div>
    </main>
  )
}

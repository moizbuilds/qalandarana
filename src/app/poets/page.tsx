// poets/page.tsx — the study index. Quieter grandeur than the journey: a plain
// night ground (no valley tint), each poet a hairline-separated entry with their
// name in Nastaliq and Cormorant, era, and how many of their kalam father has
// recorded. The door for people who came to study one voice rather than walk.
import Link from 'next/link'
import { listPoetsWithCounts } from '@/lib/entries'
import { Khatam } from '@/components/ornament/Khatam'

export const dynamic = 'force-dynamic'

export default async function PoetsPage() {
  const poets = await listPoetsWithCounts()

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <header className="mb-16 flex flex-col items-center gap-4 text-center">
        <Khatam size={28} className="text-gold" />
        <p className="eyebrow text-gold">The Poets</p>
        <h1 className="font-display" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', fontWeight: 500 }}>
          The voices he carries
        </h1>
      </header>

      <ul>
        {poets.map((poet) => (
          <li key={poet.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--gold) 22%, transparent)' }}>
            <Link
              href={`/poets/${poet.id}`}
              className="group flex items-baseline justify-between gap-6 py-7"
            >
              <div className="flex items-baseline gap-5">
                <span className="urdu" style={{ fontSize: '1.75rem' }}>{poet.nameOriginal}</span>
                <span className="font-display" style={{ fontSize: '1.75rem', fontWeight: 500 }}>
                  <span className="bg-gradient-to-r from-current to-current bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-500 group-hover:bg-[length:100%_1px]">
                    {poet.nameEnglish}
                  </span>
                </span>
              </div>
              <span className="eyebrow whitespace-nowrap" style={{ opacity: 0.6 }}>
                {poet.era}
                {poet.count > 0 ? `  ·  ${poet.count} kalam` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}

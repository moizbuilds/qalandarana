// entry/[id]/page.tsx — the illuminated folio: one published entry, read like a
// leaf from a Mughal manuscript. His voice first (the Medallion), then the kalam
// in three stacked layers, then his explanation, then the poet. The page wears
// its own valley's tone; a Fana entry inverts to light.
//
// CONCEPT: a server component fetches on the server — it awaits the entry, poet,
// and maqam directly and returns finished HTML. notFound() renders the 404 page
// for missing, unpublished, or malformed-id requests. In Next 16 `params` is a
// Promise, so we await it before reading `id`.
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { poets, maqamat } from '@/lib/schema'
import { getEntryById } from '@/lib/entries'
import { Medallion } from '@/components/Medallion'
import { KalamLayers } from '@/components/KalamLayers'
import { GoldRule } from '@/components/ornament/GoldRule'
import { Khatam } from '@/components/ornament/Khatam'
import { SetBodyValley } from '@/components/SetBodyValley'

// The id is untrusted (it's from the URL). Postgres' uuid type throws on a
// malformed value, which would surface as a 500, so we validate the shape first
// and 404 on anything that isn't a uuid — a garbage id never reaches the query.
const idSchema = z.string().uuid()

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()

  const entry = await getEntryById(id)
  // Guard existence AND status: the public page must never leak an entry still
  // mid-pipeline. Anything not 'published' is a 404.
  if (!entry || entry.status !== 'published') notFound()

  const [poet, maqam] = await Promise.all([
    entry.poetId
      ? db.select().from(poets).where(eq(poets.id, entry.poetId)).limit(1).then((r) => r[0])
      : undefined,
    entry.maqamId
      ? db.select().from(maqamat).where(eq(maqamat.id, entry.maqamId)).limit(1).then((r) => r[0])
      : undefined,
  ])

  const hasExplanation = entry.explanationOriginal || entry.explanationEnglish

  return (
    <>
      <SetBodyValley slug={maqam?.slug ?? null} />
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-20">
        {/* the manuscript leaf: a gold hairline frame with generous inset */}
        <article
          className="mx-auto flex flex-col items-center gap-12"
          style={{
            maxWidth: '42rem',
            padding: 'clamp(1.5rem, 5vw, 3.5rem)',
            border: '1px solid color-mix(in srgb, var(--gold) 35%, transparent)',
          }}
        >
          <Link href="/journey" className="eyebrow self-start text-gold" style={{ opacity: 0.7 }}>
            ← The Journey
          </Link>

          {/* his voice comes first; the text is its shadow */}
          <Medallion src={entry.audioUrl} title={entry.title ?? 'this recitation'} />

          <header className="text-center">
            {maqam ? <p className="eyebrow text-gold mb-3" style={{ opacity: 0.8 }}>{maqam.nameEnglish}</p> : null}
            <h1 className="font-display" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 500 }}>
              {entry.title ?? 'Untitled'}
            </h1>
          </header>

          <KalamLayers
            kalamOriginal={entry.kalamOriginal}
            kalamRoman={entry.kalamRoman}
            kalamEnglish={entry.kalamEnglish}
          />

          {hasExplanation ? (
            <>
              <GoldRule className="w-full" />
              <section className="w-full space-y-4">
                <p className="eyebrow text-center" style={{ opacity: 0.55 }}>His explanation</p>
                {entry.explanationOriginal ? (
                  <p className="urdu" style={{ fontSize: '1.375rem', lineHeight: 2.2 }}>
                    {entry.explanationOriginal}
                  </p>
                ) : null}
                {entry.explanationEnglish ? (
                  <p className="font-body" style={{ fontSize: '1.1875rem', lineHeight: 1.8, opacity: 0.9 }}>
                    {entry.explanationEnglish}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}

          <footer className="flex flex-col items-center gap-4 pt-4">
            <Khatam size={18} className="text-gold" />
            {poet ? (
              <Link href={`/poets/${poet.id}`} className="eyebrow text-gold">
                {poet.nameEnglish} · {poet.era}
              </Link>
            ) : (
              <p className="eyebrow" style={{ opacity: 0.6 }}>Unknown</p>
            )}
          </footer>
        </article>
      </main>
    </>
  )
}

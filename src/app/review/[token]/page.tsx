// page.tsx — Father's review screen, reached only via the secret link the bot
// sends him in Telegram; the unguessable token in the URL is the only "auth".
//
// A server component: it awaits the entry from the repository and streams
// finished HTML — no client JS, no spinner. In Next 16 `params` is a Promise,
// so we await it before reading `token`.
//
// Phase 2 gives this the archive's palette and type, but clarity still wins over
// grandeur here: his voice up top, the verses plainly, corrections flagged in
// gold, and two big thumb-height buttons. This is a decision screen, not a folio.
import { notFound } from 'next/navigation'
import { getEntryByReviewToken } from '@/lib/entries'
import { approveEntry, flagEntry } from './actions'
import { Medallion } from '@/components/Medallion'
import { KalamLayers } from '@/components/KalamLayers'
import { GoldRule } from '@/components/ornament/GoldRule'

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const entry = await getEntryByReviewToken(token)
  if (!entry) notFound()
  const published = entry.status === 'published'
  const hasExplanation = entry.explanationOriginal || entry.explanationEnglish

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-10 px-5 py-12">
      <header className="text-center">
        <p className="eyebrow text-gold mb-2" style={{ opacity: 0.7 }}>For your blessing</p>
        <h1 className="font-display" style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 500 }}>
          {entry.title ?? 'Untitled'}
        </h1>
      </header>

      <Medallion src={entry.audioUrl} title={entry.title ?? 'this recitation'} />

      <KalamLayers
        kalamOriginal={entry.kalamOriginal}
        kalamRoman={entry.kalamRoman}
        kalamEnglish={entry.kalamEnglish}
      />

      {entry.corrections?.length ? (
        <section
          className="w-full space-y-3 p-5"
          style={{ border: '1px solid color-mix(in srgb, var(--gold) 50%, transparent)' }}
        >
          <h2 className="eyebrow text-gold">Verses I corrected — please check</h2>
          {entry.corrections.map((c, i) => (
            <p key={i} dir="rtl" lang="ur" className="urdu" style={{ fontSize: '1.25rem' }}>
              <s style={{ opacity: 0.5 }}>{c.heard}</s>
              {'  ←  '}
              {c.restored}
            </p>
          ))}
        </section>
      ) : null}

      {hasExplanation ? (
        <>
          <GoldRule className="w-full" />
          <section className="w-full space-y-4">
            <p className="eyebrow text-center" style={{ opacity: 0.55 }}>Your explanation</p>
            {entry.explanationOriginal ? (
              <p dir="rtl" lang="ur" className="urdu" style={{ fontSize: '1.25rem', lineHeight: 2.2 }}>{entry.explanationOriginal}</p>
            ) : null}
            {entry.explanationEnglish ? (
              <p className="font-body" style={{ fontSize: '1.125rem', lineHeight: 1.8, opacity: 0.9 }}>
                {entry.explanationEnglish}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {published ? (
        <p className="eyebrow text-gold">✓ Published — thank you</p>
      ) : (
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <form action={approveEntry.bind(null, token)} className="flex-1">
            <button
              className="w-full p-5 font-body text-lg"
              style={{ backgroundColor: 'var(--gold)', color: 'var(--ink)' }}
            >
              Approve &amp; publish
            </button>
          </form>
          <form action={flagEntry.bind(null, token)} className="flex-1">
            <button
              className="w-full p-5 font-body text-lg text-ivory"
              style={{ border: '1px solid color-mix(in srgb, var(--ivory) 40%, transparent)' }}
            >
              Something’s wrong
            </button>
          </form>
        </div>
      )}
    </main>
  )
}

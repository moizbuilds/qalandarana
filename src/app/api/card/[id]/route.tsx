// /api/card/[id] — the shareable image for an entry: the verse in Roman
// transliteration (which carries the sound of the kalam), the English line, the
// poet, the khatam mark and QALANDARANA wordmark, on the entry's valley tone
// with a gold hairline frame. Used as the link-unfurl OG image and as a
// standalone card people can save.
//
// CONCEPT: OG image generation. Social apps fetch an `og:image` URL when a link
// is shared and show it in the preview. next/og's ImageResponse renders JSX to a
// PNG on the server so each entry gets its own branded card.
//
// Latin-only by necessity: Satori (the engine behind ImageResponse) can't shape
// Nastaliq — see design-notes.md "Satori Nastaliq verdict". The Roman line keeps
// the card evocative; the full-script card is deferred to Phase 3.
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { getEntryById } from '@/lib/entries'
import { db } from '@/lib/db'
import { poets } from '@/lib/schema'
import { INK, IVORY, GOLD, VALLEY_HEX, DEFAULT_CARD_BG } from '@/lib/valley-colors'
import { maqamat } from '@/lib/schema'

export const dynamic = 'force-dynamic'

// Three canonical social sizes; default to the wide OG ratio.
const SIZES: Record<string, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
  wide: { w: 1600, h: 900 },
}

// First line only — the card is a taste, not the whole poem.
function firstLine(text: string | null): string {
  if (!text) return ''
  return text.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? ''
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const format = new URL(request.url).searchParams.get('format') ?? 'wide'
  const size = SIZES[format] ?? SIZES.wide

  const entry = await getEntryById(id)
  // Published only — the card route is not behind the family gate, so it must
  // never render an entry that isn't public yet.
  if (!entry || entry.status !== 'published') {
    return new Response('Not found', { status: 404 })
  }

  const [poet, maqam] = await Promise.all([
    entry.poetId ? db.select().from(poets).where(eq(poets.id, entry.poetId)).limit(1).then((r) => r[0]) : undefined,
    entry.maqamId ? db.select().from(maqamat).where(eq(maqamat.id, entry.maqamId)).limit(1).then((r) => r[0]) : undefined,
  ])

  const bg = maqam ? VALLEY_HEX[maqam.slug] ?? DEFAULT_CARD_BG : DEFAULT_CARD_BG
  const isLight = maqam?.slug === 'fana'
  const fg = isLight ? INK : IVORY

  const cormorant = await readFile(join(process.cwd(), 'src/assets/Cormorant-Medium.ttf'))

  const roman = firstLine(entry.kalamRoman)
  const english = firstLine(entry.kalamEnglish)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          color: fg,
          fontFamily: 'Cormorant',
          padding: 64,
        }}
      >
        {/* gold hairline frame — the manuscript margin */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 40,
            right: 40,
            bottom: 40,
            border: `1px solid ${GOLD}66`,
          }}
        />

        {/* khatam mark */}
        <svg width="46" height="46" viewBox="0 0 100 100" fill="none" stroke={GOLD} strokeWidth="2" style={{ marginBottom: 48 }}>
          <rect x="20" y="20" width="60" height="60" />
          <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" />
        </svg>

        {roman ? (
          <div style={{ fontSize: format === 'wide' ? 58 : 64, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.3, marginBottom: 28, maxWidth: '80%' }}>
            {roman}
          </div>
        ) : null}
        {english ? (
          <div style={{ fontSize: format === 'wide' ? 38 : 42, textAlign: 'center', opacity: 0.85, lineHeight: 1.35, maxWidth: '78%' }}>
            {english}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 64, gap: 10 }}>
          {poet ? (
            <div style={{ fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: GOLD }}>
              {poet.nameEnglish}
            </div>
          ) : null}
          <div style={{ fontSize: 20, letterSpacing: 8, textTransform: 'uppercase', opacity: 0.6 }}>
            Qalandarana
          </div>
        </div>
      </div>
    ),
    {
      width: size.w,
      height: size.h,
      fonts: [{ name: 'Cormorant', data: cormorant, style: 'normal', weight: 500 }],
      // The kalam is immutable once published; cache the card hard. Admin edits
      // are rare — the ?v=updatedAt param on share links busts it when needed.
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  )
}

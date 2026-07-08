// KalamLayers — renders the recited verse in its three stacked layers, never
// tabbed: the Nastaliq original, the Roman transliteration as a whisper, and the
// English. When the three layers split cleanly into the same number of couplet
// blocks, we interleave them couplet-by-couplet with air between; otherwise we
// fall back to three whole blocks so misaligned data still reads correctly.
//
// The gentle stagger (animation-delay per couplet) makes the verse rise into
// place like it's being unveiled; reduced-motion users get it all at once.

// Split a field into couplet blocks on blank lines, trimming empties.
function toBlocks(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
}

export function KalamLayers({
  kalamOriginal,
  kalamRoman,
  kalamEnglish,
}: {
  kalamOriginal: string | null
  kalamRoman: string | null
  kalamEnglish: string | null
}) {
  const orig = toBlocks(kalamOriginal)
  const roman = toBlocks(kalamRoman)
  const eng = toBlocks(kalamEnglish)

  // Couplet-by-couplet only when all three align into the same count > 1.
  const aligned =
    orig.length > 1 && orig.length === roman.length && orig.length === eng.length

  const couplets = aligned
    ? orig.map((o, i) => ({ o, r: roman[i], e: eng[i] }))
    : [{ o: kalamOriginal ?? '', r: kalamRoman ?? '', e: kalamEnglish ?? '' }]

  return (
    <div className="space-y-11">
      {couplets.map((c, i) => (
        <div
          key={i}
          className="animate-fade-up space-y-3 text-center"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <p dir="rtl" lang="ur" className="urdu whitespace-pre-line" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}>
            {c.o}
          </p>
          <p className="whisper whitespace-pre-line" style={{ fontSize: '1.0625rem', lineHeight: 1.6 }}>
            {c.r}
          </p>
          <p className="font-body whitespace-pre-line" style={{ fontSize: '1.1875rem', lineHeight: 1.7 }}>
            {c.e}
          </p>
        </div>
      ))}
    </div>
  )
}
